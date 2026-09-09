import { RotateCcw,Save } from 'lucide-react';
import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { TextareaControl } from '../../components/controls/TextControls';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { SortableDataTable } from '../../components/SortableDataTable';
import type { HostFileContent,HostRecycleItem } from './hostModel';
import { formatBytes,formatDateTime } from './hostFormatting';
import './HostFileDrawers.css';

export function HostFileEditorDrawer({ content,busy,onChange,onClose,onSave }: {
  content: HostFileContent;
  busy: boolean;
  onChange: (content: HostFileContent) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [baselineContent] = useState(content.content);
  const dirty = content.content !== baselineContent;
  const discardChanges = dirty
    ? [`File content: ${baselineContent.length} chars → ${content.content.length} chars`]
    : [];
  return (
    <ConfigDrawer
      title="Edit file"
      subtitle={content.path}
      className="config-drawer-wide xgc-host-file-drawer"
      bodyClassName="xgc-host-file-drawer-body"
      dataXgcRole="file-editor-drawer"
      dataXgcId={content.path}
      closeLabel="Close editor"
      onClose={onClose}
      dirty={dirty}
      discardChanges={discardChanges}
      actions={(
        <ControlButton size="compact" tone="primary" disabled={busy || !dirty} onClick={onSave} dataXgcRole="host-file-save" dataXgcId={content.path}>
          <Save size={14} aria-hidden="true" />Save
        </ControlButton>
      )}
    >
      <TextareaControl
        className="xgc-host-file-editor"
        value={content.content}
        aria-label={`Contents of ${content.path}`}
        onChange={(value) => onChange({ ...content,content: value })}
      />
    </ConfigDrawer>
  );
}

export function HostRecycleDrawer({ items,busy,onClose,onRestore }: {
  items: HostRecycleItem[];
  busy: boolean;
  onClose: () => void;
  onRestore: (item: HostRecycleItem) => void;
}) {
  return (
    <ConfigDrawer
      title="Recycle bin"
      subtitle="Deleted files are stored under the XGC recycle directory."
      className="config-drawer-wide xgc-host-file-drawer"
      bodyClassName="xgc-host-file-drawer-body"
      dataXgcRole="file-recycle-drawer" dataXgcId="file-recycle-drawer"
      closeLabel="Close recycle bin"
      onClose={onClose}
    >
      <SortableDataTable
        className="xgc-host-file-list xgc-host-recycle-list"
        data-xgc-id="host-recycle-table"
        data-xgc-role="host-recycle-table"
        columns={[
          { id: 'name',header: 'Name',cell: (item) => item.name },
          { id: 'path',header: 'Original path',cell: (item) => <em>{item.originalPath}</em> },
          { id: 'size',header: 'Size',cell: (item) => <strong>{item.isDir ? 'Folder' : formatBytes(item.size)}</strong> },
          { id: 'deleted',header: 'Deleted',cell: (item) => <em>{formatDateTime(item.deletedAt)}</em> },
          { id: 'restore',header: 'Operation',cell: (item) => <ControlButton size="compact" disabled={busy} onClick={() => onRestore(item)} dataXgcRole="host-recycle-restore" dataXgcId={item.id}><RotateCcw size={14} aria-hidden="true" />Restore</ControlButton> },
        ]}
        emptyMessage="Recycle bin is empty"
        getRowProps={(item) => ({ 'data-xgc-role': 'host-recycle-item','data-xgc-id': item.id })}
        rowKey={(item) => item.id}
        rows={items}
      />
    </ConfigDrawer>
  );
}
