import { useState,type ReactNode } from 'react';
import { Archive,Copy,Download,FileText,Folder,KeyRound,MoreHorizontal,Scissors,Trash2,UserRound } from 'lucide-react';
import { ActionMenu,Button,EmptyState,useConfirmationDialog,useTextPromptDialog } from '@xgc2/ui-react';
import { SortableDataTable } from '../../components/SortableDataTable';
import { ControlButton } from '../../components/controls/ControlButton';
import { AutomationPathPicker } from '../automation/automationPublic';
import type { HostFileInfo } from './hostModel';
import { formatBytes,formatDateTime } from './hostFormatting';
import { useHostText } from './hostMessages';
import {
  canDownloadHostFileEntry,
  hostFileCompressConfirm,
  hostFileDestinationConfirm,
  hostFileDownloadConfirm,
  modeToOctal,
} from './hostFilesModel';
import './HostFileTable.css';

type DestinationPicker = {
  item: HostFileInfo;
  mode: 'copy' | 'move';
};

export type HostFileEntryActions = {
  open: (item: HostFileInfo) => void;
  download: (item: HostFileInfo) => void;
  copy: (item: HostFileInfo,destination: string) => void;
  move: (item: HostFileInfo,destination: string) => void;
  compress: (item: HostFileInfo,name: string) => void;
  chmod: (item: HostFileInfo,mode: string) => void;
  chown: (item: HostFileInfo,user: string,group: string) => void;
  delete: (item: HostFileInfo) => void;
};

export function HostFileTable({
  entries,
  emptyMessage,
  directory,
  executionTargetId,
  remoteManagedHost = false,
  disabled,
  actions,
}: {
  entries: HostFileInfo[];
  emptyMessage?: ReactNode;
  directory: string;
  /** Execution target for the shared host directory picker (local Core or Agent). */
  executionTargetId: string;
  /** Agent target: permanent delete copy, download-ZIP compress. */
  remoteManagedHost?: boolean;
  disabled: boolean;
  actions: HostFileEntryActions;
}) {
  const t = useHostText();
  const confirmation = useConfirmationDialog();
  const promptDialog = useTextPromptDialog();
  const [openMenuPath,setOpenMenuPath] = useState<string | null>(null);
  const [destinationPicker,setDestinationPicker] = useState<DestinationPicker | null>(null);

  async function deleteEntry(item: HostFileInfo) {
    // Label stays "Delete"; dialog copy differs for Agent (permanent) vs Core (recycle).
    if (!await confirmation.confirm({
      title: 'Delete',
      message: remoteManagedHost
        ? `Delete ${item.name}? This cannot be undone.`
        : `Delete ${item.name}? It will be moved to the recycle bin.`,
      confirmLabel: 'Delete',
    })) return;
    actions.delete(item);
  }
  async function confirmDownload(item: HostFileInfo) {
    if (!await confirmation.confirm({ ...hostFileDownloadConfirm(item),tone: 'primary' })) return;
    actions.download(item);
  }
  async function confirmDestination(item: HostFileInfo,destination: string,mode: 'copy' | 'move') {
    if (!await confirmation.confirm({ ...hostFileDestinationConfirm(mode,item,destination),tone: 'primary' })) return;
    if (mode === 'move') actions.move(item,destination);
    else actions.copy(item,destination);
  }
  async function confirmCompress(item: HostFileInfo,name: string) {
    if (!await confirmation.confirm({
      ...hostFileCompressConfirm(item,name,remoteManagedHost),
      tone: 'primary',
    })) return;
    actions.compress(item,name);
  }
  async function promptText(label: string,initialValue: string,onSubmit: (value: string) => void) {
    const value = await promptDialog.prompt({ title: label,label,initialValue,submitLabel: 'Apply' });
    if (value) onSubmit(value);
  }
  async function promptOwner(item: HostFileInfo) {
    const owner = await promptDialog.prompt({
      title: 'Change owner',
      label: 'Owner and group',
      initialValue: `${item.user}:${item.group}`,
      submitLabel: 'Apply',
    });
    if (!owner) return;
    const [user,group = ''] = owner.split(':');
    actions.chown(item,user.trim(),group.trim());
  }

  function runAndClose(path: string,fn: () => void) {
    setOpenMenuPath(null);
    fn();
  }

  function columnIdentity(column: string) {
    return {
      headerProps: { 'data-xgc-role': 'host-file-column', 'data-xgc-id': `${executionTargetId}:${column}` },
      sortButtonProps: { 'data-xgc-role': 'host-file-sort', 'data-xgc-id': `${executionTargetId}:${column}` },
    };
  }

  return (
    <>
      <SortableDataTable
        className="xgc-host-file-list"
        bodyScroll
        data-xgc-id="host-files"
        data-xgc-role="host-file-table"
        defaultSort={{ columnId: 'name',direction: 'ascending' }}
        emptyMode="table"
        columns={[
          { id: 'name',header: 'Name',...columnIdentity('name'),sortable: true,sortValue: (item) => item.name,cell: (item) => (
            <Button appearance="ghost" className="xgc-host-file-name" type="button" disabled={disabled} data-xgc-role="host-file-open" data-xgc-id={item.path} title={item.isDir ? `Open ${item.name}` : `Edit ${item.name}`} onClick={() => actions.open(item)}>
              {item.isDir ? <Folder size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}<span>{item.name}</span>
            </Button>
          ) },
          { id: 'mode',header: 'Permissions',...columnIdentity('mode'),sortable: true,sortValue: (item) => Number.parseInt(modeToOctal(item.mode),8),cell: (item) => <span>{item.mode}</span> },
          { id: 'user',header: 'User',...columnIdentity('user'),sortable: true,sortValue: (item) => item.user || item.uid,cell: (item) => <span>{item.user || item.uid || '-'}</span> },
          { id: 'group',header: 'Group',...columnIdentity('group'),sortable: true,sortValue: (item) => item.group || item.gid,cell: (item) => <span>{item.group || item.gid || '-'}</span> },
          { id: 'size',header: 'Size',...columnIdentity('size'),sortable: true,sortValue: (item) => item.isDir ? null : item.size,cell: (item) => <span>{item.isDir ? '-' : formatBytes(item.size)}</span> },
          { id: 'modified',header: 'Modified',...columnIdentity('modified'),sortable: true,sortValue: (item) => Number.isFinite(Date.parse(item.modTime)) ? Date.parse(item.modTime) : null,cell: (item) => <span>{formatDateTime(item.modTime)}</span> },
          { id: 'operations',header: 'Operations',...columnIdentity('operations'),cell: (item) => (
            <div className="xgc-host-file-ops">
              <ControlButton size="compact" iconOnly dataXgcRole="host-file-download" dataXgcId={item.path} aria-label={item.isDir ? `Compress and download ${item.name}` : `Download ${item.name}`} title={item.isDir ? 'Download folder as ZIP' : 'Download'} disabled={disabled || !canDownloadHostFileEntry(item)} onClick={() => void confirmDownload(item)}>
                <Download size={14} aria-hidden="true" />
              </ControlButton>
              <FileMoreMenu
                item={item} open={openMenuPath === item.path} disabled={disabled} remoteManagedHost={remoteManagedHost}
                onOpenChange={(next) => setOpenMenuPath(next ? item.path : null)}
                onCopy={() => runAndClose(item.path, () => setDestinationPicker({ item,mode: 'copy' }))}
                onCompress={() => runAndClose(item.path, () => void promptText('Archive name',`${item.name}.zip`,(name) => void confirmCompress(item,name)))}
                onMove={() => runAndClose(item.path, () => setDestinationPicker({ item,mode: 'move' }))}
                onChmod={() => runAndClose(item.path, () => void promptText('Permission mode',modeToOctal(item.mode),(mode) => actions.chmod(item,mode)))}
                onChown={() => runAndClose(item.path, () => void promptOwner(item))}
                onDelete={() => runAndClose(item.path, () => void deleteEntry(item))}
              />
            </div>
          ) },
        ]}
        emptyMessage={emptyMessage !== undefined ? emptyMessage : <EmptyState title={t('No files')} density="compact" data-xgc-role="host-files-empty" data-xgc-id="host-files-empty" data-xgc-remote={remoteManagedHost ? 'true' : undefined} />}
        getRowProps={(item) => ({ 'data-xgc-role': 'host-file-row','data-xgc-id': item.path })}
        rowKey={(item) => item.path}
        rows={entries}
        tableProps={{ className: 'xgc-host-file-table' }}
      />
      {confirmation.dialog}
      {promptDialog.dialog}
      {destinationPicker && (
        <div data-xgc-role="host-file-destination-picker" data-xgc-id={destinationPicker.mode}>
          <AutomationPathPicker
            targetId={executionTargetId}
            kind="directory"
            value={directory}
            onSelect={(destination) => {
              const selected = destinationPicker;
              setDestinationPicker(null);
              if (selected) void confirmDestination(selected.item,destination,selected.mode);
            }}
            onClose={() => setDestinationPicker(null)}
          />
        </div>
      )}
    </>
  );
}

function FileMoreMenu({
  item,
  open,
  disabled,
  remoteManagedHost = false,
  onOpenChange,
  onCopy,
  onCompress,
  onMove,
  onChmod,
  onChown,
  onDelete,
}: {
  item: HostFileInfo;
  open: boolean;
  disabled: boolean;
  remoteManagedHost?: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: () => void;
  onCompress: () => void;
  onMove: () => void;
  onChmod: () => void;
  onChown: () => void;
  onDelete: () => void;
}) {
  return (
    <ActionMenu
      ariaLabel={`More actions for ${item.name}`}
      dataXgcId={item.path}
      dataXgcRole="host-file-more-menu"
      disabled={disabled}
      items={[
        { id: 'copy',icon: <Copy size={14} />,label: 'Copy',onSelect: onCopy },
        {
          id: 'compress',
          icon: <Archive size={14} />,
          label: remoteManagedHost ? 'Download ZIP' : 'Compress',
          onSelect: onCompress,
        },
        { id: 'move',icon: <Scissors size={14} />,label: 'Move',onSelect: onMove },
        { id: 'permissions',icon: <KeyRound size={14} />,label: 'Permissions',onSelect: onChmod },
        { id: 'owner',icon: <UserRound size={14} />,label: 'Owner',onSelect: onChown },
        { id: 'delete',icon: <Trash2 size={14} />,label: 'Delete',onSelect: onDelete,tone: 'danger' },
      ]}
      onOpenChange={onOpenChange}
      open={open}
      trigger={<MoreHorizontal aria-hidden="true" size={16} />}
      triggerDataXgcRole="host-file-more-trigger"
    />
  );
}
