import { Plus,RefreshCw,Search,Trash2 } from 'lucide-react';
import { Input,Pagination,Panel,SortableDataTable,StatusText,Toolbar } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { CheckboxControl } from '../../components/FormPrimitives';
import type { DockerNetworkInfo } from './containerModel';
import { containerTableRangeSummary } from './containerTableRangeSummary';
import { NetworkCreateDrawer } from './NetworkCreateDrawer';
import {
  isSystemDockerNetwork,
  NETWORK_PAGE_SIZE_OPTIONS,
  type NetworkCreateDraft,
} from './containerViewModel';

export function ContainerNetworksPanel({
  networks,
  draft,
  busy,
  query,
  page,
  pageSize,
  total,
  selectedNames,
  drawerOpen,
  parentInterfaces,
  onDraftChange,
  onQueryChange,
  onPageChange,
  onPageSizeChange,
  onOpenCreate,
  onCloseCreate,
  onCreate,
  onRemove,
  onPrune,
  onRefresh,
  onInspect,
  onToggleSelected,
  onToggleSelectAllVisible,
}: {
  networks: DockerNetworkInfo[];
  draft: NetworkCreateDraft;
  busy: boolean;
  query: string;
  page: number;
  pageSize: number;
  total: number;
  selectedNames: readonly string[];
  drawerOpen: boolean;
  parentInterfaces: readonly string[];
  onDraftChange: (draft: NetworkCreateDraft) => void;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onCreate: () => void;
  onRemove: (names: string[]) => void;
  onPrune: () => void;
  onRefresh: () => void;
  onInspect: (network: DockerNetworkInfo) => void;
  onToggleSelected: (name: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
}) {
  const selectedSet = new Set(selectedNames);
  const visibleSelectable = networks.filter((network) => !isSystem(network));
  const allVisibleSelected = visibleSelectable.length > 0
    && visibleSelectable.every((network) => selectedSet.has(network.name));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <Panel bodyLayout="column" className="container-section" data-xgc-role="container-networks" data-xgc-id="container-networks" fill padding="none">
      <div className="container-section-content">
      {/*
        Single toolbar row: primary actions left, search + icon refresh right.
        Matches Containers list density (no multi-wrap toolbar).
      */}
      <Toolbar className="container-table-toolbar" data-xgc-role="container-network-toolbar" data-xgc-id="container-network-toolbar">
        <div className="container-toolbar-left container-inline-fields">
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy}
            tone="primary"
            onClick={onOpenCreate}
            dataXgcRole="container-network-create"
            dataXgcId="container-network-create"
          >
            <Plus size={14} aria-hidden="true" />
            Create
          </ControlButton>
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy || selectedNames.length === 0}
            tone="danger"
            onClick={() => onRemove([...selectedNames])}
            dataXgcRole="container-network-remove-selected"
            dataXgcId="container-network-remove-selected"
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete selected
          </ControlButton>
          <ControlButton
            className="container-toolbar-text-action"
            disabled={busy}
            title="Remove unused Docker networks"
            onClick={onPrune}
            dataXgcRole="container-network-prune"
            dataXgcId="container-network-prune"
          >
            Prune unused
          </ControlButton>
        </div>
        <div className="container-toolbar-right">
          <Input
            aria-label="Search networks"
            className="container-search"
            icon={<Search size={14} aria-hidden="true" />}
            placeholder="Search networks"
            type="search"
            value={query}
            onValueChange={onQueryChange}
          />
          <ControlButton aria-label="Refresh" disabled={busy} iconOnly onClick={onRefresh} dataXgcRole="container-network-refresh" dataXgcId="container-network-refresh">
            <RefreshCw size={15} aria-hidden="true" />
          </ControlButton>
        </div>
      </Toolbar>

      {/*
        Core region: table + pagination share one bordered panel so the footer
        summary lines up with column text (not floating outside table chrome).
      */}
      <div className="container-table-panel" data-xgc-role="container-network-table-panel" data-xgc-id="container-network-table-panel">
        <SortableDataTable
          className="container-data-table-shell"
          columns={[
            {
              id: 'select',
              header: (
                <CheckboxControl
                  ariaLabel="Select all visible networks"
                  checked={allVisibleSelected}
                  disabled={busy || visibleSelectable.length === 0}
                  onChange={onToggleSelectAllVisible}
                />
              ),
              cell: (network) => (
                <CheckboxControl
                  ariaLabel={`Select ${network.name}`}
                  checked={selectedSet.has(network.name)}
                  disabled={busy || isSystem(network)}
                  onChange={(checked) => onToggleSelected(network.name, checked)}
                />
              ),
            },
            {
              id: 'name',
              header: 'Name',
              cell: (network) => (
                <div className="container-network-name-cell">
                  <ControlButton
                    appearance="ghost"
                    className="container-row-open-button"
                    dataXgcRole="container-network-open"
                    dataXgcId={network.name}
                    onClick={() => onInspect(network)}
                  >
                    {network.name}
                  </ControlButton>
                  {isSystem(network) && (
                    <span className="container-network-system-tag" data-xgc-role="container-network-system-tag" data-xgc-id={network.name}>
                      system
                    </span>
                  )}
                </div>
              ),
            },
            {
              id: 'driver',
              header: 'Driver',
              cell: (network) => network.driver || '-',
            },
            {
              id: 'subnet',
              header: 'Subnet',
              className: 'container-code-cell',
              cell: (network) => network.subnet || network.subnetV6 || '-',
            },
            {
              id: 'gateway',
              header: 'Gateway',
              className: 'container-code-cell',
              cell: (network) => network.gateway || network.gatewayV6 || '-',
            },
            {
              id: 'ipv6',
              header: 'IPv6',
              cell: (network) => (
                <StatusText status={network.ipv6 ? 'enabled' : 'disabled'}>
                  {network.ipv6 ? 'Enabled' : 'Disabled'}
                </StatusText>
              ),
            },
            {
              id: 'containers',
              header: 'Containers',
              cell: (network) => String(network.containers ?? 0),
            },
            {
              id: 'labels',
              header: 'Labels',
              cell: (network) => {
                const labels = network.labels ?? [];
                if (labels.length === 0) return '-';
                const preview = labels.slice(0, 2).join(', ');
                return (
                  <span className="container-network-labels" title={labels.join('\n')}>
                    {preview}{labels.length > 2 ? ` +${labels.length - 2}` : ''}
                  </span>
                );
              },
            },
            {
              id: 'createdAt',
              header: 'Created',
              cell: (network) => formatCreated(network.createdAt),
            },
            {
              id: 'operation',
              header: 'Operation',
              cell: (network) => (
                <div className="container-actions">
                  <ControlButton
                    aria-label={`Remove ${network.name}`}
                    dataXgcId={network.name}
                    dataXgcRole="container-network-remove"
                    disabled={busy || isSystem(network)}
                    iconOnly
                    size="compact"
                    tone="danger"
                    title={isSystem(network) ? 'System networks cannot be removed' : `Remove ${network.name}`}
                    onClick={() => onRemove([network.name])}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </ControlButton>
                </div>
              ),
            },
          ]}
          emptyMessage="No networks"
          getRowProps={(network) => ({ 'data-xgc-role': 'container-network-row','data-xgc-id': network.name })}
          rowKey={(network) => network.name}
          rows={networks}
          tableProps={{ className: 'container-data-table','data-xgc-role': 'container-data-table','data-xgc-id': 'container-data-table' }}
        />

        <Toolbar className="container-image-footer" data-xgc-role="container-network-pagination" data-xgc-id="container-network-pagination" aria-busy={busy || undefined}>
          <span className="container-image-footer-summary">{containerTableRangeSummary({
            total,
            rangeStart,
            rangeEnd,
            selectedCount: selectedNames.length,
            emptyLabel: '0 networks',
          })}</span>
          <fieldset className="container-image-footer-pagination" disabled={busy}>
            <Pagination labels={{ pageSizeSuffix: '/ page',rowsPerPage: 'Networks per page' }} page={page} pageSize={pageSize} pageSizeOptions={NETWORK_PAGE_SIZE_OPTIONS} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
          </fieldset>
        </Toolbar>
      </div>

      {drawerOpen && (
        <NetworkCreateDrawer
          busy={busy}
          draft={draft}
          parentInterfaces={parentInterfaces}
          onClose={onCloseCreate}
          onCreate={onCreate}
          onDraftChange={onDraftChange}
        />
      )}
      </div>
    </Panel>
  );
}

function isSystem(network: DockerNetworkInfo) {
  return network.isSystem || isSystemDockerNetwork(network.name);
}

function formatCreated(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
