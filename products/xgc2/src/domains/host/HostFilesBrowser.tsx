import { Folder,Plus,RefreshCw,Search,Trash2,Upload } from 'lucide-react';
import { useRef } from 'react';
import { EmptyState,Input,Panel,Toolbar,useTextPromptDialog } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import type { HostFileList } from './hostModel';
import { useHostText } from './hostMessages';
import { HostFileTable,type HostFileEntryActions } from './HostFileTable';
import './HostFilesBrowser.css';

export function HostFilesBrowser({
  files,
  listingError = null,
  listingPending = false,
  appliedSearch = '',
  directoryActionsDisabled = false,
  path,
  search,
  showHidden,
  executionTargetId,
  remoteManagedHost = false,
  disabled,
  entryActions,
  onPathChange,
  onLoad,
  onSearchChange,
  onToggleHidden,
  onCreate,
  onUpload,
  onOpenRecycle,
}: {
  files: HostFileList | null;
  listingError?: string | null;
  listingPending?: boolean;
  appliedSearch?: string;
  directoryActionsDisabled?: boolean;
  path: string;
  search: string;
  showHidden: boolean;
  executionTargetId: string;
  /** Agent targets permanently delete and do not expose Core's recycle APIs. */
  remoteManagedHost?: boolean;
  disabled: boolean;
  entryActions: HostFileEntryActions;
  onPathChange: (path: string) => void;
  onLoad: (path: string) => void;
  onSearchChange: (query: string) => void;
  onToggleHidden: (show: boolean) => void;
  onCreate: (directory: boolean,name: string) => void;
  onUpload: (file: File) => void;
  onOpenRecycle: () => void;
}) {
  const t = useHostText();
  const promptDialog = useTextPromptDialog();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const createEntry = async (directory: boolean) => {
    const label = directory ? 'Folder name' : 'File name';
    const name = await promptDialog.prompt({
      title: directory ? 'Create folder' : 'Create file',
      label,
      submitLabel: 'Create',
    });
    if (name) onCreate(directory,name);
  };

  // At the files home (`~` or legacy `/managed`) the API reports parent===path.
  const currentPath = files?.path ?? path;
  const parentPath = files?.parent ?? '';
  const canGoUp = Boolean(parentPath && parentPath !== currentPath);

  return (
    <Panel
      bodyLayout="column"
      chrome="flat"
      className="xgc-host-files-section"
      data-xgc-role="host-files-section" data-xgc-id="host-files-section"
      fill
      padding="none"
    >
      <Toolbar className="xgc-host-file-toolbar" data-xgc-role="host-files-path-toolbar" data-xgc-id="host-files-path-toolbar">
        <div className="xgc-host-file-nav">
          {canGoUp && (
            <ControlButton size="compact" iconOnly aria-label={t('Open parent folder')} title="Up" dataXgcRole="host-files-up" dataXgcId="host-files-up" disabled={disabled} onClick={() => onLoad(parentPath)}>..</ControlButton>
          )}
          <ControlButton size="compact" iconOnly aria-label={t('Refresh files')} title="Refresh" dataXgcRole="host-files-refresh" dataXgcId="host-files-refresh" disabled={disabled} onClick={() => onLoad(path)}>
            <RefreshCw size={14} aria-hidden="true" />
          </ControlButton>
          <ControlButton
            className="xgc-host-hidden-toggle"
            size="compact"
            iconOnly
            tone={showHidden ? 'primary' : 'default'}
            aria-label={showHidden ? 'Hide dotfiles' : 'Show hidden (dot) files'}
            aria-pressed={showHidden}
            title={showHidden ? 'Hide files whose names start with .' : 'Show hidden files (names starting with .)'}
            dataXgcRole="host-files-hidden-toggle" dataXgcId="host-files-hidden-toggle"
            data-xgc-pressed={showHidden ? 'true' : 'false'}
            disabled={disabled}
            onClick={() => onToggleHidden(!showHidden)}
          >
            {showHidden ? 'H' : '.H'}
          </ControlButton>
        </div>
        <div className="xgc-host-path-row">
          <InputControl
            className="xgc-host-path-control"
            size="compact"
            value={path}
            aria-label={t('Host file path')}
            dataXgcRole="host-files-path" dataXgcId="host-files-path"
            readOnly={disabled}
            aria-busy={disabled || undefined}
            onChange={onPathChange}
            onKeyDown={(event) => { if (event.key === 'Enter' && !disabled) onLoad(path); }}
          />
          <ControlButton size="compact" disabled={disabled} onClick={() => onLoad(path)} dataXgcRole="host-files-open" dataXgcId="host-files-open">Open</ControlButton>
        </div>
      </Toolbar>

      <Toolbar className="xgc-host-file-actions" data-xgc-role="host-files-actions" data-xgc-id="host-files-actions">
        <div className="xgc-host-file-search-group" data-xgc-role="host-files-search-group" data-xgc-id="host-files-search-group">
          <Input
            aria-label={t('Find in current directory')}
            className="xgc-host-file-search"
            uiSize="compact"
            containerProps={{ 'data-xgc-role': 'host-files-search','data-xgc-id': 'host-files' }}
            icon={<Search size={14} aria-hidden="true" />}
            value={search}
            readOnly={disabled}
            aria-busy={disabled || undefined}
            placeholder={t('Find in current directory')}
            type="search"
            onValueChange={onSearchChange}
            onKeyDown={(event) => { if (event.key === 'Enter' && !disabled) onLoad(path); }}
          />
        </div>
        <div className="xgc-host-file-action-buttons" data-xgc-role="host-files-action-buttons" data-xgc-id="host-files-action-buttons">
          <ControlButton
            size="compact"
            tone="primary"
            dataXgcRole="host-files-create-file" dataXgcId="host-files-create-file"
            disabled={disabled || directoryActionsDisabled}
            onClick={() => void createEntry(false)}
          >
            <Plus size={14} aria-hidden="true" />File
          </ControlButton>
          <ControlButton
            size="compact"
            tone="primary"
            dataXgcRole="host-files-create-folder" dataXgcId="host-files-create-folder"
            disabled={disabled || directoryActionsDisabled}
            onClick={() => void createEntry(true)}
          >
            <Folder size={14} aria-hidden="true" />Folder
          </ControlButton>
          <ControlButton
            size="compact"
            dataXgcRole="host-files-upload" dataXgcId="host-files-upload"
            disabled={disabled || directoryActionsDisabled}
            title={remoteManagedHost ? 'Uploaded via Agent fs write (text/small files)' : undefined}
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload size={14} aria-hidden="true" />Upload
          </ControlButton>
          {!remoteManagedHost && (
            <ControlButton size="compact" dataXgcRole="host-files-recycle" dataXgcId="host-files-recycle" disabled={disabled} onClick={onOpenRecycle}>
              <Trash2 size={14} aria-hidden="true" />Recycle bin
            </ControlButton>
          )}
          <input
            ref={uploadInputRef}
            type="file"
            className="xgc-host-upload-input"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </Toolbar>

      <HostFileTable
        entries={listingError !== null ? [] : files?.entries ?? []}
        emptyMessage={listingError !== null ? (
          <EmptyState
            title={t('Unable to load files')}
            description={listingError || undefined}
            density="compact"
            data-xgc-role="host-files-error" data-xgc-id="host-files"
          />
        ) : files === null || listingPending ? null : appliedSearch.trim() ? (
          <EmptyState
            title={t('No matching files')}
            density="compact"
            data-xgc-role="host-files-search-empty" data-xgc-id="host-files"
          />
        ) : undefined}
        directory={files?.path ?? path}
        executionTargetId={executionTargetId}
        remoteManagedHost={remoteManagedHost}
        disabled={disabled || directoryActionsDisabled}
        actions={entryActions}
      />
      {promptDialog.dialog}
    </Panel>
  );
}
