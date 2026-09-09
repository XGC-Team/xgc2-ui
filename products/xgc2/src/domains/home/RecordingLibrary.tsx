import { Loader2,Square,Trash2 } from 'lucide-react';
import { useEffect,useState,type ComponentType } from 'react';
import { Button,EmptyState,Notice,Panel } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SearchControl } from '../../components/controls/TextControls';
import type { HomeCardProps, HomeRuntimePort } from '../../shared/productWebComposition';
import { useDeferRouteReady } from '../../shared/routeReady';
import { WorkspaceBusyOverlay } from '../../shared/WorkspaceBusyOverlay';
import { formatBytes,formatDuration,formatTimestamp } from './homeFormat';
import { recordingLibraryCopy } from './recordingLibraryCopy';
import { groupRecordings, type RecordingFolderId } from './recordingLibraryFolders';
import type { RecordingLibrary as RecordingLibraryState } from './useRecordingLibrary';

export type RecordingLibraryActionContribution = {
  id: string;
  component: ComponentType<HomeCardProps>;
};

export function RecordingLibrary({ library,runtime,actions }: {
  library: RecordingLibraryState;
  runtime: HomeRuntimePort;
  actions?: readonly RecordingLibraryActionContribution[];
}) {
  const language = runtime.language;
  const copy = recordingLibraryCopy[language];
  useDeferRouteReady(library.loading && library.recordings.length === 0 && !library.error);

  return (
    <Panel
      className="home-library-panel home-gallery-card"
      fill
      bodyLayout="column"
      title={(
        <span data-xgc-role="recording-library-title" data-xgc-id="recording-library">
          {copy.title}
        </span>
      )}
      headerProps={{
        'data-xgc-role': 'recording-library-header',
        'data-xgc-id': 'recording-library',
      }}
      actions={(
        <SearchControl
          className="home-library-search"
          dataXgcRole="recording-search" dataXgcId="recording-search"
          value={library.query}
          placeholder={copy.searchPlaceholder}
          onChange={library.setQuery}
        />
      )}
      data-xgc-role="recording-library"
      data-xgc-id="recording-library"
      aria-busy={library.loading}
      data-xgc-columns="full"
      data-xgc-rows="feature"
    >
      {renderBody(library, runtime, actions)}
    </Panel>
  );
}

function renderBody(
  library: RecordingLibraryState,
  runtime: HomeRuntimePort,
  actions: readonly RecordingLibraryActionContribution[] | undefined,
) {
  const language = runtime.language;
  const copy = recordingLibraryCopy[language];

  if (library.error && library.recordings.length === 0) {
    return (
      <Notice
        tone="danger"
        density="compact"
        actions={(
          <ControlButton
            size="compact"
            onClick={() => { void library.refresh(); }}
            data-xgc-role="recording-retry" data-xgc-id="recording-retry"
          >{copy.retry}</ControlButton>
        )}
      >{library.error || copy.loadError}</Notice>
    );
  }
  if (library.recordings.length === 0) {
    return (
      <EmptyState
        appearance="plain"
        className="home-library-empty"
        fill
        title={(
          <span data-xgc-role="recording-library-empty-title" data-xgc-id="recording-library-empty">
            {copy.empty}
          </span>
        )}
        description={(
          <span data-xgc-role="recording-library-empty-description" data-xgc-id="recording-library-empty">
            {copy.emptyHint}
          </span>
        )}
        data-xgc-role="recording-library-empty" data-xgc-id="recording-library-empty"
      />
    );
  }

  return (
    <div className="home-library-body">
      <RecordingFolderList library={library} language={language} />
      <RecordingPlayer library={library} runtime={runtime} actions={actions} />
    </div>
  );
}

function RecordingFolderList({
  library,
  language,
}: {
  library: RecordingLibraryState;
  language: HomeRuntimePort['language'];
}) {
  const copy = recordingLibraryCopy[language];
  const [collapsed, setCollapsed] = useState<RecordingFolderId[]>(['system']);
  const folders = groupRecordings(library.filtered).map((folder) => ({
    ...folder,
    title: folder.id === 'system' ? copy.systemFolder : copy.xgcFolder,
  }));

  return (
    <div className="home-recording-list" aria-label={copy.foldersLabel} data-xgc-role="recording-list" data-xgc-id="recording-list">
      {folders.map((folder) => {
        const isCollapsed = collapsed.includes(folder.id);
        return (
          <section
            key={folder.id}
            className="xgc-list-folder"
            data-xgc-role="recording-folder"
            data-xgc-id={folder.id}
            data-xgc-collapsed={isCollapsed || undefined}
          >
            <div className="xgc-list-folder-header">
              <button
                className="xgc-list-folder-title"
                type="button"
                data-xgc-role="recording-folder-toggle"
                data-xgc-id={folder.id}
                onClick={() => setCollapsed((current) => (
                  current.includes(folder.id)
                    ? current.filter((id) => id !== folder.id)
                    : [...current, folder.id]
                ))}
              >
                <FolderChevron collapsed={isCollapsed} />
                <strong
                  className="home-recording-folder-title"
                  data-xgc-role="recording-folder-title"
                  data-xgc-id={folder.id}
                >{folder.title}</strong>
                <span data-xgc-role="recording-folder-count" data-xgc-id={folder.id}>{folder.items.length}</span>
              </button>
            </div>
            {isCollapsed ? null : (
              <ul className="xgc-list-folder-items">
                {folder.items.map((item) => (
                  <li key={item.id}>
                    <Button
                      appearance="ghost"
                      type="button"
                      className="home-recording-row"
                      aria-pressed={item.id === library.selectedId}
                      data-xgc-role="recording-row"
                      data-xgc-id={item.id}
                      onClick={() => library.select(item.id)}
                    >
                      <span className="home-recording-main">
                        <span
                          className="home-recording-name"
                          data-xgc-role="recording-row-name"
                          data-xgc-id={item.id}
                        >{item.name}</span>
                        <span
                          className="home-recording-meta"
                          data-xgc-role="recording-row-meta"
                          data-xgc-id={item.id}
                        >
                          <span>{formatTimestamp(item.createdAt, language)}</span>
                          <span>{formatDuration(item.durationMs)}</span>
                          <span>{formatBytes(item.size)}</span>
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FolderChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-xgc-collapsed={collapsed || undefined}
      fill="none"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function RecordingPlayer({ library,runtime,actions }: {
  library: RecordingLibraryState;
  runtime: HomeRuntimePort;
  actions: readonly RecordingLibraryActionContribution[] | undefined;
}) {
  const language = runtime.language;
  const copy = recordingLibraryCopy[language];
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [library.selectedId]);

  if (!library.selected) {
    return (
      <EmptyState
        appearance="plain"
        className="home-player home-player--empty"
        fill
        title={(
          <span data-xgc-role="recording-player-title" data-xgc-id="recording-player">
            {copy.selectTitle}
          </span>
        )}
        description={(
          <span data-xgc-role="recording-player-description" data-xgc-id="recording-player">
            {copy.selectHint}
          </span>
        )}
        data-xgc-role="recording-player" data-xgc-id="recording-player"
      />
    );
  }

  const recording = library.selected;
  const removing = library.removingId === recording.id;

  return (
    <div className="home-player" data-xgc-role="recording-player" data-xgc-id={recording.id}>
      <div className="home-player-stage">
        {library.playbackError ? (
          <p className="home-player-message" role="alert">{copy.playbackError}</p>
        ) : library.playbackUrl ? (
          <video className="home-player-video" src={library.playbackUrl} controls autoPlay data-xgc-role="recording-video" data-xgc-id={recording.id} />
        ) : (
          <WorkspaceBusyOverlay id={`recording-playback:${recording.id}`} label={copy.playbackLoading} />
        )}
      </div>
      <div className="home-player-footer">
        <div className="home-player-actions" data-xgc-role="recording-actions" data-xgc-id={recording.id}>
          <ControlButton
            size="compact"
            onClick={library.stopPlayback}
            data-xgc-role="recording-stop" data-xgc-id={recording.id}
          >
            <Square size={13} aria-hidden="true" />
            {copy.stop}
          </ControlButton>
          {actions?.map((action) => {
            const Action = action.component;
            return <Action key={action.id} runtime={runtime} />;
          })}
          {confirming ? (
            <span className="home-player-confirm">
              <ControlButton
                size="compact"
                tone="danger"
                disabled={removing}
                onClick={() => { void library.remove(recording.id); }}
                data-xgc-role="recording-remove-confirm" data-xgc-id={recording.id}
              >
                {removing ? copy.removing : copy.confirmRemove}
              </ControlButton>
              <ControlButton
                size="compact"
                disabled={removing}
                onClick={() => setConfirming(false)}
                data-xgc-role="recording-remove-cancel" data-xgc-id={recording.id}
              >
                {copy.cancel}
              </ControlButton>
            </span>
          ) : (
            <ControlButton
              size="compact"
              tone="danger"
              onClick={() => setConfirming(true)}
              data-xgc-role="recording-remove" data-xgc-id={recording.id}
            >
              {removing ? <Loader2 size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
              {copy.remove}
            </ControlButton>
          )}
        </div>
      </div>
    </div>
  );
}
