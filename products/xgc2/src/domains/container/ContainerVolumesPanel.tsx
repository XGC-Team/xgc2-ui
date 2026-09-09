import { Info,Search,Trash2 } from 'lucide-react';
import { Input,Pagination,Panel,SortableDataTable,Toolbar } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { CheckboxControl } from '../../components/FormPrimitives';
import type { DockerVolumeInfo } from './containerModel';
import { containerTableRangeSummary } from './containerTableRangeSummary';
import { VOLUME_PAGE_SIZE_OPTIONS,type VolumeDraft } from './containerViewModel';
import { VolumeCreateDrawer } from './VolumeCreateDrawer';

export function ContainerVolumesPanel({
  volumes,
  draft,
  busy,
  query,
  page,
  pageSize,
  total,
  selected,
  drawerOpen,
  createError,
  onDraftChange,
  onQueryChange,
  onPageChange,
  onPageSizeChange,
  onOpenCreate,
  onCloseCreate,
  onCreate,
  onRemove,
  onRemoveSelected,
  onPrune,
  onRefresh,
  onInspect,
  onToggleSelected,
  onToggleSelectAll,
}: {
  volumes: DockerVolumeInfo[];
  draft: VolumeDraft;
  busy: boolean;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  selected: readonly string[];
  drawerOpen: boolean;
  createError?: string;
  onDraftChange: (draft: VolumeDraft) => void;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onCreate: () => void;
  onRemove: (name: string) => void;
  onRemoveSelected: () => void;
  onPrune: () => void;
  onRefresh: () => void;
  onInspect: (name: string) => void;
  onToggleSelected: (name: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
}) {
  const selectedSet = new Set(selected);
  const allVisibleSelected = volumes.length > 0 && volumes.every((volume) => selectedSet.has(volume.name));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <Panel bodyLayout="column" className="container-section" data-xgc-role="container-volumes" data-xgc-id="container-volumes" fill padding="none">
      <div className="container-section-content">
      <Toolbar className="container-table-toolbar container-table-toolbar-multi" data-xgc-role="container-volume-toolbar" data-xgc-id="container-volume-toolbar">
        <div className="container-toolbar-left container-inline-fields">
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy}
            tone="primary"
            onClick={onOpenCreate}
            dataXgcRole="container-volume-create"
            dataXgcId="container-volume-create"
          >
            Create
          </ControlButton>
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy || selected.length === 0}
            tone="danger"
            onClick={onRemoveSelected}
            dataXgcRole="container-volume-remove-selected"
            dataXgcId="container-volume-remove-selected"
          >
            Delete selected
          </ControlButton>
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy}
            title="Remove unused Docker volumes"
            onClick={onPrune}
            dataXgcRole="container-volume-prune"
            dataXgcId="container-volume-prune"
          >
            Prune unused
          </ControlButton>
        </div>
        <div className="container-toolbar-right">
          <Input
            aria-label="Search volumes"
            className="container-search"
            icon={<Search size={14} aria-hidden="true" />}
            placeholder="Search volumes"
            type="search"
            value={query}
            onValueChange={onQueryChange}
          />
          <ControlButton className="container-toolbar-text-action" disabled={busy} onClick={onRefresh} dataXgcRole="container-volume-refresh" dataXgcId="container-volume-refresh">
            Refresh
          </ControlButton>
        </div>
      </Toolbar>

      <div className="container-table-panel" data-xgc-role="container-volume-table-panel" data-xgc-id="container-volume-table-panel">
        <SortableDataTable
          className="container-data-table-shell"
          columns={[
            {
              id: 'select',
              header: (
                <CheckboxControl
                  ariaLabel="Select all visible volumes"
                  checked={allVisibleSelected}
                  disabled={busy || volumes.length === 0}
                  onChange={onToggleSelectAll}
                />
              ),
              cell: (volume) => (
                <CheckboxControl
                  ariaLabel={`Select ${volume.name}`}
                  checked={selectedSet.has(volume.name)}
                  disabled={busy}
                  onChange={(checked) => onToggleSelected(volume.name, checked)}
                />
              ),
            },
            {
              id: 'name',
              header: 'Name',
              cell: (volume) => (
                <ControlButton
                  appearance="ghost"
                  className="container-row-open-button"
                  dataXgcRole="container-volume-open"
                  dataXgcId={volume.name}
                  onClick={() => onInspect(volume.name)}
                >
                  {volume.name}
                </ControlButton>
              ),
            },
            {
              id: 'status',
              header: 'Status',
              cell: (volume) => (
                <span
                  className="container-image-status"
                  data-xgc-status={volume.inUse ? 'used' : 'unused'}
                >
                  {volume.inUse ? 'In use' : 'Unused'}
                </span>
              ),
            },
            {
              id: 'driver',
              header: 'Driver',
              cell: (volume) => volume.driver,
            },
            {
              id: 'scope',
              header: 'Scope',
              cell: (volume) => volume.scope,
            },
            {
              id: 'mountpoint',
              header: 'Mountpoint',
              className: 'container-code-cell',
              cell: (volume) => volume.mountpoint || '-',
            },
            {
              id: 'size',
              header: 'Size',
              cell: (volume) => volume.size || '-',
            },
            {
              id: 'links',
              header: 'Links',
              cell: (volume) => (volume.links != null ? String(volume.links) : '-'),
            },
            {
              id: 'createdAt',
              header: 'Created',
              cell: (volume) => formatCreated(volume.createdAt),
            },
            {
              id: 'options',
              header: 'Options',
              className: 'container-code-cell',
              cell: (volume) => formatMap(volume.options),
            },
            {
              id: 'labels',
              header: 'Labels',
              className: 'container-code-cell',
              cell: (volume) => formatMap(volume.labels),
            },
            {
              id: 'operation',
              header: 'Operation',
              cell: (volume) => (
                <div className="container-actions">
                  <ControlButton
                    aria-label={`Inspect ${volume.name}`}
                    dataXgcId={volume.name}
                    dataXgcRole="container-volume-inspect"
                    disabled={busy}
                    iconOnly
                    size="compact"
                    title={`Inspect ${volume.name}`}
                    onClick={() => onInspect(volume.name)}
                  >
                    <Info size={13} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    aria-label={`Remove ${volume.name}`}
                    dataXgcId={volume.name}
                    dataXgcRole="container-volume-remove"
                    disabled={busy}
                    iconOnly
                    size="compact"
                    tone="danger"
                    title={volume.inUse ? `${volume.name} is in use — force remove available` : `Remove ${volume.name}`}
                    onClick={() => onRemove(volume.name)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </ControlButton>
                </div>
              ),
            },
          ]}
          emptyMessage="No volumes"
          getRowProps={(volume) => ({ 'data-xgc-role': 'container-volume-row','data-xgc-id': volume.name })}
          rowKey={(volume) => volume.name}
          rows={volumes}
          tableProps={{ className: 'container-data-table','data-xgc-role': 'container-data-table','data-xgc-id': 'container-data-table' }}
        />
        <Toolbar className="container-image-footer" data-xgc-role="container-volume-pagination" data-xgc-id="container-volume-pagination" aria-busy={busy || undefined}>
          <span className="container-image-footer-summary">{containerTableRangeSummary({
            total,
            rangeStart,
            rangeEnd,
            selectedCount: selected.length,
            emptyLabel: '0 volumes',
          })}</span>
          <fieldset className="container-image-footer-pagination" disabled={busy}>
            <Pagination labels={{ pageSizeSuffix: '/ page',rowsPerPage: 'Volumes per page' }} page={page} pageSize={pageSize} pageSizeOptions={VOLUME_PAGE_SIZE_OPTIONS} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
          </fieldset>
        </Toolbar>
      </div>

      {drawerOpen && (
        <VolumeCreateDrawer
          busy={busy}
          draft={draft}
          error={createError}
          onClose={onCloseCreate}
          onCreate={onCreate}
          onDraftChange={onDraftChange}
        />
      )}
      </div>
    </Panel>
  );
}

function formatCreated(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMap(map?: Record<string,string>): string {
  if (!map) return '-';
  const entries = Object.entries(map);
  if (entries.length === 0) return '-';
  return entries.map(([key,value]) => `${key}=${value}`).join(', ');
}
