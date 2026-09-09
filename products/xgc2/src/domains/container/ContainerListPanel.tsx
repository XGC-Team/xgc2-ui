import { Info,Play,Plus,RefreshCw,RotateCcw,ScrollText,Search,Square,Trash2 } from 'lucide-react';
import { Input,Panel,SortableDataTable,Toolbar } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { ContainerOperation,DockerContainerInfo } from './containerModel';
import { ContainerCreateDrawer } from './ContainerCreateDrawer';
import { ContainerStatusText } from './ContainerStatusText';
import {
  containerDisplayName,
  containerStateFilterLabel,
  containerStateFilters,
  filterContainers,
  type ContainerDraft,
  type ContainerStateFilter,
} from './containerViewModel';

export function ContainerListPanel({
  containers,
  query,
  stateFilter,
  draft,
  drawerOpen,
  busy,
  onQueryChange,
  onStateFilterChange,
  onDraftChange,
  onOpenDrawer,
  onCloseDrawer,
  onCreate,
  onOperate,
  onInspect,
  onLogs,
  onRefresh,
}: {
  containers: DockerContainerInfo[];
  query: string;
  stateFilter: ContainerStateFilter;
  draft: ContainerDraft;
  drawerOpen: boolean;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onStateFilterChange: (value: ContainerStateFilter) => void;
  onDraftChange: (draft: ContainerDraft) => void;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onCreate: () => void;
  onOperate: (container: DockerContainerInfo,operation: ContainerOperation,force?: boolean) => void;
  onInspect: (container: DockerContainerInfo) => void;
  onLogs: (container: DockerContainerInfo) => void;
  onRefresh: () => void;
}) {
  const filteredContainers = filterContainers(containers,stateFilter,query);
  const filterOptions = containerStateFilters.map((state) => ({
    value: state,
    label: containerStateFilterLabel(state),
  }));

  return (
    <Panel bodyLayout="column" className="container-section" data-xgc-role="container-list" data-xgc-id="container-list" fill padding="none">
      <div className="container-section-content">
      <Toolbar className="container-table-toolbar" data-xgc-role="container-list-toolbar" data-xgc-id="container-list-toolbar">
        <div className="container-toolbar-left">
          <SegmentedControl
            ariaLabel="Filter containers by state"
            className="container-state-filter"
            dataXgcRole="container-state-filter" dataXgcId="container-state-filter"
            options={filterOptions}
            value={stateFilter}
            onChange={onStateFilterChange}
          />
        </div>
        <div className="container-toolbar-right">
          <Input
            aria-label="Search containers"
            className="container-search"
            icon={<Search size={14} aria-hidden="true" />}
            placeholder="Search containers"
            type="search"
            value={query}
            onValueChange={onQueryChange}
          />
          <ControlButton aria-label="Refresh" disabled={busy} iconOnly onClick={onRefresh} dataXgcRole="container-list-refresh" dataXgcId="container-list-refresh">
            <RefreshCw size={15} aria-hidden="true" />
          </ControlButton>
          <ControlButton aria-label="Create" disabled={busy} iconOnly tone="primary" onClick={onOpenDrawer} dataXgcRole="container-list-create" dataXgcId="container-list-create">
            <Plus size={15} aria-hidden="true" />
          </ControlButton>
        </div>
      </Toolbar>

      <SortableDataTable
        className="container-data-table-shell"
        columns={[
          {
            id: 'name',
            header: 'Name',
            cell: (container) => containerDisplayName(container),
          },
          {
            id: 'image',
            header: 'Image',
            cell: (container) => container.image,
          },
          {
            id: 'state',
            header: 'State',
            cell: (container) => <ContainerStatusText status={container.state} />,
          },
          {
            id: 'ports',
            header: 'Ports',
            cell: (container) => container.ports || '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (container) => container.created,
          },
          {
            id: 'operation',
            header: 'Operation',
            cell: (container) => (
              <ContainerRowActions
                busy={busy}
                container={container}
                onInspect={onInspect}
                onLogs={onLogs}
                onOperate={onOperate}
              />
            ),
          },
        ]}
        emptyMessage="No matching containers"
        getRowProps={(container) => ({ 'data-xgc-role': 'container-row','data-xgc-id': container.id })}
        rowKey={(container) => container.id}
        rows={filteredContainers}
        tableProps={{ className: 'container-data-table','data-xgc-role': 'container-data-table','data-xgc-id': 'container-data-table' }}
      />

      {drawerOpen && (
        <ContainerCreateDrawer
          busy={busy}
          draft={draft}
          onClose={onCloseDrawer}
          onCreate={onCreate}
          onDraftChange={onDraftChange}
        />
      )}
      </div>
    </Panel>
  );
}

function ContainerRowActions({
  busy,
  container,
  onOperate,
  onLogs,
  onInspect,
}: {
  busy: boolean;
  container: DockerContainerInfo;
  onOperate: (container: DockerContainerInfo,operation: ContainerOperation,force?: boolean) => void;
  onLogs: (container: DockerContainerInfo) => void;
  onInspect: (container: DockerContainerInfo) => void;
}) {
  const displayName = containerDisplayName(container);
  const running = container.state === 'running';
  return (
    <div className="container-actions">
      {/* State controls left → inspect mid → remove right. Icon-only for density. */}
      <ControlButton
        aria-label={running ? `Stop ${displayName}` : `Start ${displayName}`}
        dataXgcId={container.id}
        dataXgcRole="container-start-stop"
        disabled={busy}
        iconOnly
        size="compact"
        tone={running ? 'danger' : 'success'}
        onClick={() => onOperate(container, running ? 'stop' : 'start')}
      >
        {running ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
      </ControlButton>
      <ControlButton
        aria-label={`Restart ${displayName}`}
        dataXgcId={container.id}
        dataXgcRole="container-restart"
        disabled={busy}
        iconOnly
        size="compact"
        tone="primary"
        onClick={() => onOperate(container,'restart')}
      >
        <RotateCcw size={13} aria-hidden="true" />
      </ControlButton>
      <ControlButton
        aria-label="Logs"
        dataXgcId={container.id}
        dataXgcRole="container-logs"
        disabled={busy}
        iconOnly
        size="compact"
        onClick={() => onLogs(container)}
      >
        <ScrollText size={13} aria-hidden="true" />
      </ControlButton>
      <ControlButton
        dataXgcId={container.id}
        dataXgcRole="container-inspect"
        disabled={busy}
        iconOnly
        size="compact"
        title="View status, ports, mounts, network, and environment"
        aria-label={`Inspect ${displayName} details`}
        onClick={() => onInspect(container)}
      >
        <Info size={13} aria-hidden="true" />
      </ControlButton>
      <ControlButton
        aria-label={`Remove ${displayName}`}
        dataXgcId={container.id}
        dataXgcRole="container-remove"
        disabled={busy}
        iconOnly
        size="compact"
        tone="danger"
        onClick={() => onOperate(container,'remove')}
      >
        <Trash2 size={13} aria-hidden="true" />
      </ControlButton>
    </div>
  );
}
