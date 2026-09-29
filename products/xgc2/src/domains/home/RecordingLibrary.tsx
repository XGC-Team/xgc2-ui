import '../../styles/home.css';
import { Square,Trash2 } from 'lucide-react';
import { useEffect,useRef,useState,type ComponentType } from 'react';
import { Button,EmptyState,Notice,Panel,useConfirmationDialog } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SearchControl } from '../../components/controls/TextControls';
import type { HomeCardProps, HomeRuntimePort } from '../../shared/productWebComposition';
import { useDeferRouteReady } from '../../shared/routeReady';
import { WorkspaceBusyOverlay } from '../../shared/WorkspaceBusyOverlay';
import { fetchRecordingThumbnail } from '../recording/recordingPublic';
import { formatBytes,formatDuration,formatTimestamp } from './homeFormat';
import { recordingLibraryCopy } from './recordingLibraryCopy';
import { groupRecordings, recentArchivedRecordings, type RecordingFolderGroup } from './recordingLibraryFolders';
import type { RecordingLibrary as RecordingLibraryState } from './useRecordingLibrary';

export type RecordingLibraryActionContribution = {
  id: string;
  component: ComponentType<HomeCardProps>;
};

export type RecordingPlaybackActions = {
  recordingId: string;
  removing: boolean;
  stopLabel: string;
  removeLabel: string;
  onStop: () => void;
  onDelete: () => void;
};

export function RecordingLibrary({ library,runtime,actions,embedded = false,onProvideSearch,onProvidePlayback }: {
  library: RecordingLibraryState;
  runtime: HomeRuntimePort;
  actions?: readonly RecordingLibraryActionContribution[];
  embedded?: boolean;
  onProvideSearch?: (search: { query: string; placeholder: string; onChange: (query: string) => void } | null) => void;
  onProvidePlayback?: (actions: RecordingPlaybackActions | null) => void;
}) {
  const language = runtime.language;
  const copy = recordingLibraryCopy[language];
  useDeferRouteReady(!embedded && library.loading && library.recordings.length === 0 && !library.error);
  useEffect(() => {
    if (!embedded || !onProvideSearch) return;
    onProvideSearch({ query:library.query,placeholder:copy.searchPlaceholder,onChange:library.setQuery });
  },[copy.searchPlaceholder,embedded,library.query,library.setQuery,onProvideSearch]);
  useEffect(() => {
    if (!embedded || !onProvideSearch) return undefined;
    return () => onProvideSearch(null);
  },[embedded,onProvideSearch]);

  if (embedded) {
    return (
      <div
        className="scientific-gallery-recordings"
        data-xgc-role="recording-library"
        data-xgc-id="recording-library"
        aria-busy={library.loading}
      >
        {renderBody(library, runtime, actions, onProvidePlayback)}
      </div>
    );
  }

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
      {renderBody(library, runtime, actions, onProvidePlayback)}
    </Panel>
  );
}

function renderBody(
  library: RecordingLibraryState,
  runtime: HomeRuntimePort,
  actions: readonly RecordingLibraryActionContribution[] | undefined,
  onProvidePlayback?: (actions: RecordingPlaybackActions | null) => void,
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
      <RecordingPlayer key={library.selectedId || 'none'} library={library} runtime={runtime} actions={actions} onProvidePlayback={onProvidePlayback} />
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
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const folders = groupRecordings(library.filtered);
  const toggle = (id: string) => setCollapsed((current) => (
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  ));

  return (
    <div className="home-recording-list" aria-label={copy.foldersLabel} data-xgc-role="recording-list" data-xgc-id="recording-list">
      {folders.map((folder) => (
        <RecordingFolder key={folder.id} folder={folder} library={library} language={language} collapsed={collapsed} toggle={toggle} />
      ))}
      {folders.length === 0 ? <p data-xgc-role="recording-search-empty" data-xgc-id="recording-search">{copy.noMatches}</p> : null}
    </div>
  );
}

function RecordingFolder({ folder,library,language,collapsed,toggle }: {
  folder: RecordingFolderGroup;
  library: RecordingLibraryState;
  language: HomeRuntimePort['language'];
  collapsed: readonly string[];
  toggle: (id: string) => void;
}) {
  // Search opens the matching ancestry without changing the user's fold state.
  const isCollapsed = !library.query.trim() && collapsed.includes(folder.id);
  const title = folder.name;
  return (
    <section className="xgc-list-folder" data-xgc-role="recording-folder" data-xgc-id={folder.id} data-xgc-collapsed={isCollapsed || undefined}>
      <div className="xgc-list-folder-header">
        <Button
          appearance="ghost"
          className="xgc-list-folder-title"
          type="button"
          aria-expanded={!isCollapsed}
          data-xgc-role="recording-folder-toggle"
          data-xgc-id={folder.id}
          onClick={() => toggle(folder.id)}
        >
          <FolderChevron collapsed={isCollapsed} />
          <strong className="home-recording-folder-title" data-xgc-role="recording-folder-title" data-xgc-id={folder.id}>{title}</strong>
          <span className="home-recording-folder-count" data-xgc-role="recording-folder-count" data-xgc-id={folder.id}>{folder.count}</span>
        </Button>
      </div>
      {isCollapsed ? null : (
        <div className="home-recording-folder-children">
          {folder.folders.map((child) => (
            <RecordingFolder key={child.id} folder={child} library={library} language={language} collapsed={collapsed} toggle={toggle} />
          ))}
          {folder.items.length ? (
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
                      <span className="home-recording-name" title={item.name} data-xgc-role="recording-row-name" data-xgc-id={item.id}>{item.name}</span>
                      <span className="home-recording-meta" data-xgc-role="recording-row-meta" data-xgc-id={item.id}>
                        <span>{formatTimestamp(item.createdAt, language)}</span>
                        <span>{formatDuration(item.durationMs)}</span>
                        <span>{formatBytes(item.size)}</span>
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
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

function RecordingRecentPoster({ recordingId }: { recordingId: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    void fetchRecordingThumbnail(recordingId).then((blob) => {
      if (cancelled) return;
      const next = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(next);
        return;
      }
      objectUrl = next;
      setUrl(next);
    }).catch(() => {
      if (!cancelled) setUrl('');
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingId]);

  return (
    <span className="home-player-recent-poster" aria-hidden="true">
      {url ? <img className="home-player-recent-poster-image" src={url} alt="" /> : null}
    </span>
  );
}

function RecordingPlayer({ library,runtime,actions,onProvidePlayback }: {
  library: RecordingLibraryState;
  runtime: HomeRuntimePort;
  actions: readonly RecordingLibraryActionContribution[] | undefined;
  onProvidePlayback?: (actions: RecordingPlaybackActions | null) => void;
}) {
  const language = runtime.language;
  const copy = recordingLibraryCopy[language];
  const confirmation = useConfirmationDialog();
  const stopRef = useRef(library.stopPlayback);
  stopRef.current = library.stopPlayback;
  const deleteRef = useRef<() => void>(() => {});
  const selected = library.selected;
  const removingSelected = Boolean(selected && library.removingId === selected.id);
  useEffect(() => {
    if (!onProvidePlayback) return undefined;
    if (!selected) {
      onProvidePlayback(null);
      return undefined;
    }
    onProvidePlayback({
      recordingId: selected.id,
      removing: removingSelected,
      stopLabel: copy.stop,
      removeLabel: copy.remove,
      onStop: () => stopRef.current(),
      onDelete: () => deleteRef.current(),
    });
    return () => onProvidePlayback(null);
  },[copy.remove,copy.stop,onProvidePlayback,removingSelected,selected]);

  if (!library.selected) {
    const recent = recentArchivedRecordings(library.recordings);
    if (recent.length > 0) {
      return (
        <div className="home-player home-player--recent" data-xgc-role="recording-player" data-xgc-id="recording-player">
          <div
            className="home-player-recent-grid"
            data-xgc-role="recording-recent-grid"
            data-xgc-id="recording-player"
            aria-label={copy.recentTitle}
          >
            {recent.map((item) => (
              <Button
                key={item.id}
                appearance="ghost"
                type="button"
                className="home-player-recent-tile"
                data-xgc-role="recording-recent-tile"
                data-xgc-id={item.id}
                onClick={() => library.select(item.id)}
              >
                <RecordingRecentPoster recordingId={item.id} />
                <span
                  className="home-player-recent-name"
                  title={item.name}
                  data-xgc-role="recording-recent-tile-name"
                  data-xgc-id={item.id}
                >
                  {item.name}
                </span>
                <span
                  className="home-player-recent-meta"
                  data-xgc-role="recording-recent-tile-meta"
                  data-xgc-id={item.id}
                >
                  <span>{formatTimestamp(item.createdAt, language)}</span>
                  {item.durationMs != null ? <span>{formatDuration(item.durationMs)}</span> : null}
                </span>
              </Button>
            ))}
          </div>
        </div>
      );
    }
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

  async function removeSelected() {
    if (!await confirmation.confirm({
      title: copy.removeTitle,
      message: copy.removeMessage(recording.name),
      confirmLabel: copy.remove,
      cancelLabel: copy.cancel,
    })) return;
    await library.remove(recording.id);
  }
  deleteRef.current = () => { void removeSelected(); };
  const liftActions = Boolean(onProvidePlayback);

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
      {liftActions && !actions?.length ? null : (
      <div className="home-player-footer">
        <div className="home-player-actions" data-xgc-role="recording-actions" data-xgc-id={recording.id}>
          {liftActions ? null : (
            <ControlButton
              size="compact"
              onClick={library.stopPlayback}
              data-xgc-role="recording-stop" data-xgc-id={recording.id}
            >
              <Square size={13} aria-hidden="true" />
              {copy.stop}
            </ControlButton>
          )}
          {actions?.map((action) => {
            const Action = action.component;
            return <Action key={action.id} runtime={runtime} />;
          })}
          {liftActions ? null : (
            <ControlButton
              size="compact"
              tone="danger"
              disabled={removing}
              aria-busy={removing || undefined}
              onClick={() => { void removeSelected(); }}
              data-xgc-role="recording-remove" data-xgc-id={recording.id}
            >
              <Trash2 size={14} aria-hidden="true" />
              {copy.remove}
            </ControlButton>
          )}
        </div>
      </div>
      )}
      {confirmation.dialog}
    </div>
  );
}
