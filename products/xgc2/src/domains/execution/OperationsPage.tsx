import { RefreshCw,ScrollText,Search,Skull,Square } from 'lucide-react';
import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { SortableDataTable } from '../../components/SortableDataTable';
import {
  Input,
  Notice,
  OperatorWorkspace,
  Pagination,
  StatusText,
  Toolbar,
  useConfirmationDialog,
  type DataTableColumn,
  type DataTableSort,
} from '@xgc2/ui-react';
import { useExecutionText } from './executionMessages';
import { ExecutionLogStreams } from './ExecutionLogStreams';
import type { ProcessAction,ProcessDefinition,ProcessInstance } from './executionModel';
import {
  DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE,
  filterAuditProcesses,
  measureOperationsAuditPageSize,
  processAuditProvenance,
  processHandleLabel,
  processHasLiveUptime,
  sliceAuditPage,
  sortAuditProcesses,
} from './operationsModel';
import { useExecutionActions,useExecutionTarget } from './useExecutionTarget';

type AuditAction = Extract<ProcessAction,'stop' | 'kill'>;

export function OperationsPage({ targetId }: { targetId: string }) {
  const confirmation = useConfirmationDialog();
  const t = useExecutionText();
  const snapshot = useExecutionTarget(targetId, false);
  const actions = useExecutionActions(targetId, false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_OPERATIONS_AUDIT_PAGE_SIZE);
  const [sort, setSort] = useState<DataTableSort>();
  const auditRegionRef = useRef<HTMLDivElement>(null);
  const busyActionRef = useRef('');
  const mountedRef = useRef(true);
  const definitions = useMemo(
    () => new Map(snapshot.processDefinitions.map((definition) => [definition.id, definition])),
    [snapshot.processDefinitions],
  );
  const instances = snapshot.processInstances;
  const visibleInstances = useMemo(
    () => filterAuditProcesses(instances, definitions, query),
    [definitions,instances,query],
  );
  const sortedInstances = useMemo(
    () => sortAuditProcesses(visibleInstances, definitions, sort),
    [definitions,sort,visibleInstances],
  );
  const paged = useMemo(
    () => sliceAuditPage(sortedInstances, page, pageSize),
    [page,pageSize,sortedInstances],
  );
  const killableInstances = useMemo(() => instances.filter(canKillProcess), [instances]);
  const detailInstance = instances.find((instance) => instance.id === detailId);
  const killAllBusy = busyAction === 'kill-all';
  const now = Date.now();
  const auditColumns: DataTableColumn<ProcessInstance>[] = [
    {
      id: 'process',
      header: t('Process / Definition'),
      sortable: true,
      sortValue: (instance) => `${instance.id}\n${definitions.get(instance.definitionId)?.label || instance.definitionId}`,
      cellProps: (instance) => ({
        className: 'operations-audit-process',
        'data-xgc-role': 'process-instance-identity',
        'data-xgc-id': instance.id,
      }),
      cell: (instance) => {
        const definition = definitions.get(instance.definitionId);
        return <>
          <span className="operations-audit-primary" title={definition?.label || instance.definitionId}>{definition?.label || instance.definitionId}</span>
          <span title={instance.id}>{instance.id}</span>
          <code title={`${instance.definitionId}@${instance.definitionVersion}`}>{instance.definitionId}@{instance.definitionVersion}</code>
        </>;
      },
    },
    {
      id: 'runtime',
      header: t('Runtime'),
      sortable: true,
      sortValue: processHandleLabel,
      cellProps: (instance) => ({ 'data-xgc-role': 'process-instance-runtime','data-xgc-id': instance.id }),
      cell: (instance) => <><span className="operations-audit-primary">{processHandleLabel(instance)}</span><span>{instance.driver || '—'} · {instance.targetId || '—'}</span></>,
    },
    {
      id: 'state',
      header: t('State / Health'),
      sortable: true,
      sortValue: (instance) => `${instance.observedState}\n${instance.desiredState}\n${healthLabel(instance)}`,
      cellProps: (instance) => ({ 'data-xgc-role': 'process-instance-state','data-xgc-id': instance.id }),
      cell: (instance) => <>
        <div className="operations-audit-state-line">
          <StatusText status={instance.observedState} />
          <span className="operations-audit-desired">desired {instance.desiredState}</span>
        </div>
        <StatusText status={healthTone(instance)}>{healthLabel(instance)}</StatusText>
        {(instance.transitionReason || instance.lastError) && (
          <small title={instance.lastError || instance.transitionReason}>{instance.lastError || instance.transitionReason}</small>
        )}
      </>,
    },
    {
      id: 'provenance',
      header: t('Automation / Run / Node'),
      sortable: true,
      sortValue: (instance) => {
        const provenance = processAuditProvenance(instance);
        return `${provenance.automation}\n${provenance.run}\n${provenance.node}\n${provenance.owner}`;
      },
      cellProps: (instance) => ({ 'data-xgc-role': 'process-instance-provenance','data-xgc-id': instance.id }),
      cell: (instance) => {
        const provenance = processAuditProvenance(instance);
        return <>
          <AuditValue label="Automation" value={provenance.automation} />
          <AuditValue label="Run" value={provenance.run} />
          <AuditValue label="Node" value={provenance.node} />
          <AuditValue label="Owner" value={provenance.owner} />
        </>;
      },
    },
    {
      id: 'started',
      header: t('Started / Uptime'),
      sortable: true,
      sortValue: (instance) => Date.parse(instance.startedAt ?? '') || 0,
      cellProps: (instance) => ({ 'data-xgc-role': 'process-instance-timing','data-xgc-id': instance.id }),
      cell: (instance) => <>
        <span className="operations-audit-primary" title={instance.startedAt}>{formatTimestamp(instance.startedAt)}</span>
        <span>{processUptime(instance, now)}</span>
        <small>{instance.restartCount} restart{instance.restartCount === 1 ? '' : 's'}</small>
      </>,
    },
    {
      id: 'actions',
      header: t('Actions'),
      headerClassName: 'operations-audit-actions-heading',
      cell: (instance) => {
        const definition = definitions.get(instance.definitionId);
        const label = definition?.label || instance.definitionId;
        const rowBusy = killAllBusy || busyAction === `${instance.id}:stop` || busyAction === `${instance.id}:kill`;
        return (
          <div className="operations-audit-actions" data-xgc-role="process-instance-actions" data-xgc-id={instance.id}>
            <ControlButton
              className="operations-audit-action"
              size="compact"
              iconOnly
              dataXgcRole="process-instance-logs"
              dataXgcId={instance.id}
              aria-label={t('View logs for {label}', { label })}
              title={t('Logs and runtime details')}
              onClick={() => setDetailId(instance.id)}
            >
              <ScrollText size={14} />
            </ControlButton>
            <ControlButton
              className="operations-audit-action"
              size="compact"
              iconOnly
              dataXgcRole="process-instance-stop"
              dataXgcId={instance.id}
              aria-label={t('Stop {label}', { label })}
              title={t('Stop')}
              disabled={rowBusy || !canStopProcess(instance)}
              aria-busy={busyAction === `${instance.id}:stop` || undefined}
              onClick={() => void operateProcess(instance, 'stop', label)}
            >
              <Square size={14} />
            </ControlButton>
            <ControlButton
              className="operations-audit-action"
              size="compact"
              tone="danger"
              iconOnly
              dataXgcRole="process-instance-kill"
              dataXgcId={instance.id}
              aria-label={t('Kill {label}', { label })}
              title={t('Kill')}
              disabled={rowBusy || !canKillProcess(instance)}
              aria-busy={busyAction === `${instance.id}:kill` || undefined}
              onClick={() => void operateProcess(instance, 'kill', label)}
            >
              <Skull size={14} />
            </ControlButton>
          </div>
        );
      },
    },
  ];

  useEffect(() => {
    if (detailId && !detailInstance) setDetailId('');
  }, [detailId,detailInstance]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (paged.page !== page) setPage(paged.page);
  }, [page,paged.page]);

  useLayoutEffect(() => {
    const region = auditRegionRef.current;
    if (!region) return undefined;
    const apply = () => {
      const next = measureOperationsAuditPageSize(region);
      setPageSize((current) => current === next ? current : next);
    };
    apply();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    const observer = new ResizeObserver(apply);
    observer.observe(region);
    return () => observer.disconnect();
  }, [visibleInstances.length]);

  useEffect(() => () => {
    mountedRef.current = false;
    busyActionRef.current = '';
  }, []);

  async function operateProcess(instance: ProcessInstance, operation: AuditAction, label: string) {
    if (!await confirmation.confirm({
      title: t(operation === 'kill' ? 'Kill process' : 'Stop process'),
      message: t('{operation} {label}?', { operation: t(operation),label }),
      confirmLabel: t(operation),
    })) return;
    const actionKey = `${instance.id}:${operation}`;
    if (!mountedRef.current || busyActionRef.current) return;
    busyActionRef.current = actionKey;
    setMessage('');
    setBusyAction(actionKey);
    try {
      await actions.operateProcess(instance, operation);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (mountedRef.current && busyActionRef.current === actionKey) {
        busyActionRef.current = '';
        setBusyAction('');
      }
    }
  }

  async function killAllProcesses() {
    if (busyActionRef.current || snapshot.loading || killableInstances.length === 0) return;
    const processLabel = killableInstances.length === 1 ? 'process' : 'processes';
    if (!await confirmation.confirm({
      title: t('Kill all supervised processes'),
      message: `Kill all ${killableInstances.length} supervised ${processLabel} on ${targetId}?`,
      confirmLabel: t('Kill all'),
    })) return;
    if (!mountedRef.current || busyActionRef.current) return;
    busyActionRef.current = 'kill-all';
    setMessage('');
    setBusyAction('kill-all');
    try {
      const failures: string[] = [];
      for (const instance of killableInstances) {
        if (!mountedRef.current || busyActionRef.current !== 'kill-all') break;
        try {
          await actions.operateProcess(instance, 'kill', 'operator requested kill all');
        } catch (cause) {
          failures.push(`${instance.id}: ${messageOf(cause)}`);
        }
      }
      if (mountedRef.current && busyActionRef.current === 'kill-all' && failures.length > 0) {
        const failureLabel = failures.length === 1 ? 'failure' : 'failures';
        setMessage(`Kill all completed with ${failures.length}/${killableInstances.length} ${failureLabel}: ${failures.join('; ')}`);
      }
    } finally {
      if (mountedRef.current && busyActionRef.current === 'kill-all') {
        busyActionRef.current = '';
        setBusyAction('');
      }
    }
  }

  return (
    <OperatorWorkspace className="operations-page xgc-workspace-full-span" padding="none" data-xgc-role="operations-page" data-xgc-id={targetId}>
      {/* Flat list-page layout: one single-line toolbar above the content,
       * no wrapping panel chrome (see DESIGN_CONTRACT flat-vs-framed rule). */}
      <section
        className="operations-section"
        data-xgc-role="operations-header"
        data-xgc-id={targetId}
      >
        <Toolbar className="operations-toolbar" data-xgc-role="operations-toolbar" data-xgc-id={targetId}>
          <Input
            aria-label={t('Search supervised processes')}
            className="operations-search"
            containerProps={{ 'data-xgc-role': 'operations-search','data-xgc-id': 'operations-search' }}
            icon={<Search size={14} aria-hidden="true" />}
            placeholder={t('Search supervised processes')}
            type="search"
            uiSize="compact"
            data-xgc-role="operations-search-input"
            data-xgc-id="operations-search"
            value={query}
            onValueChange={setQuery}
          />
          <div className="operations-toolbar-actions" data-xgc-role="operations-toolbar-actions" data-xgc-id={targetId}>
            <ControlButton
              size="compact"
              tone="danger"
              dataXgcRole="operations-kill-all"
              dataXgcId={targetId}
              aria-label={t('Kill all supervised processes')}
              aria-busy={killAllBusy || undefined}
              disabled={snapshot.loading || Boolean(busyAction) || killableInstances.length === 0}
              onClick={() => void killAllProcesses()}
            >
              <Skull size={14} />{t('Kill all')}
            </ControlButton>
            <ControlButton
              size="compact"
              aria-busy={snapshot.loading || undefined}
              dataXgcRole="operations-refresh"
              dataXgcId={targetId}
              disabled={snapshot.loading || Boolean(busyAction)}
              onClick={() => void actions.refresh()}
            >
              <RefreshCw size={14} />{t('Refresh')}
            </ControlButton>
          </div>
        </Toolbar>
        {(message || snapshot.error) && (
          <Notice tone="danger" data-xgc-role="operations-message" data-xgc-id="operations-message">{message || snapshot.error}</Notice>
        )}
        <div
          ref={auditRegionRef}
          className="operations-audit-region"
          data-xgc-role="execution-process-list" data-xgc-id="execution-process-list"
        >
          <SortableDataTable
            data-xgc-id={`operations:${targetId}`}
            bodyScrollLabel={t('Table rows')}
            className="operations-audit-table-shell"
            columns={auditColumns.map((column) => ({
              ...column,
              headerProps: {
                'data-xgc-role': 'process-audit-column',
                'data-xgc-id': `${targetId}:${column.id}`,
              },
              sortButtonProps: {
                'data-xgc-role': 'process-audit-sort',
                'data-xgc-id': `${targetId}:${column.id}`,
              },
            }))}
            emptyMode="table"
            getRowProps={(instance) => ({
              'data-xgc-role': 'process-instance-row',
              'data-xgc-id': instance.id,
            })}
            manualSort
            onSortChange={setSort}
            rowKey={(instance) => instance.id}
            rows={paged.rows}
            sort={sort}
            tableProps={{
              className: 'operations-audit-table',
              'data-xgc-role': 'process-audit-table',
              'data-xgc-id': targetId,
            }}
          />
          <AuditPagination
            page={paged.page}
            pageSize={paged.pageSize}
            recent={snapshot.processInstancesTruncated}
            total={paged.total}
            onPageChange={setPage}
          />
        </div>
      </section>
      {detailInstance && (
        <ProcessAuditDrawer
          instance={detailInstance}
          definition={definitions.get(detailInstance.definitionId)}
          now={now}
          onClose={() => setDetailId('')}
        />
      )}
      {confirmation.dialog}
    </OperatorWorkspace>
  );
}

function ProcessAuditDrawer({ instance,definition,now,onClose }: {
  instance: ProcessInstance;
  definition?: ProcessDefinition;
  now: number;
  onClose: () => void;
}) {
  const t = useExecutionText();
  const provenance = processAuditProvenance(instance);
  return (
    <ConfigDrawer
      className="config-drawer-wide operations-audit-drawer"
      open
      onClose={onClose}
      closeOnBackdrop
      title={instance.id}
      subtitle={t('Process runtime')}
      ariaLabel={t('Runtime details for {id}', { id: instance.id })}
      closeLabel={t('Close process runtime details')}
      closeDataXgcRole="process-audit-detail-close"
      closeDataXgcId={instance.id}
      dataXgcRole="process-audit-detail"
      dataXgcId={instance.id}
      footer={({ requestClose }) => (
        <ControlButton onClick={requestClose} dataXgcRole="process-audit-detail-close" dataXgcId={instance.id}>{t('Close')}</ControlButton>
      )}
    >
      <dl className="operations-audit-detail-grid">
        <AuditDetail label="Definition" value={`${definition?.label || instance.definitionId} · ${instance.definitionId}@${instance.definitionVersion}`} />
        <AuditDetail label="Definition digest" value={instance.definitionDigest || '—'} mono />
        <AuditDetail label="Runtime" value={`${processHandleLabel(instance)} · ${instance.driver || '—'} · ${instance.targetId || '—'}`} />
        <AuditDetail label="State" value={`desired ${instance.desiredState} · observed ${instance.observedState}`} />
        <AuditDetail label="Health" value={healthLabel(instance)} />
        <AuditDetail label="Owner" value={`${provenance.owner} · scope ${instance.scope || '—'}`} />
        <AuditDetail label="Automation" value={provenance.automation} />
        <AuditDetail label="Run / Node" value={`${provenance.run} / ${provenance.node}`} />
        <AuditDetail label="Started / Uptime" value={`${formatTimestamp(instance.startedAt)} · ${processUptime(instance, now)}`} />
        <AuditDetail label="Restarts / Revision" value={`${instance.restartCount} / ${instance.revision}`} />
        {(instance.lastError || instance.transitionReason) && (
          <AuditDetail label="Last transition" value={instance.lastError || instance.transitionReason || '—'} wide />
        )}
      </dl>
      <ExecutionLogStreams targetId={instance.targetId} entityType="process-instance" entityId={instance.id} follow={instance.desiredState === 'running'} />
    </ConfigDrawer>
  );
}

function AuditValue({ label,value }: { label: string; value: string }) {
  const t = useExecutionText();
  const empty = !value || value === '—';
  return (
    <span className="operations-audit-provenance-value">
      <em>{t(label)}</em>
      <span data-xgc-empty={empty ? 'true' : undefined} title={value}>{value}</span>
    </span>
  );
}

function AuditDetail({ label,value,mono = false,wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  const t = useExecutionText();
  return (
    <div className="operations-audit-detail" data-xgc-layout={wide ? 'wide' : undefined}>
      <dt>{t(label)}</dt>
      <dd className="operations-audit-detail-value" data-xgc-format={mono ? 'monospace' : undefined} title={value}>{value}</dd>
    </div>
  );
}

function AuditPagination({
  page,
  pageSize,
  recent,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  recent: boolean;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useExecutionText();
  return (
    <Pagination
      className="operations-audit-pagination"
      data-xgc-placement="bottom"
      data-xgc-role="operations-audit-pagination" data-xgc-id="operations-audit-pagination"
      hidePageSize
      labels={{
        next: t('Next page'),
        page: t('Page'),
        pageSizeSuffix: t('/ page'),
        previous: t('Previous page'),
        rowsPerPage: t('Processes per page'),
        total: t(recent ? 'Recent' : 'Total'),
      }}
      page={page}
      pageSize={pageSize}
      pageSizeOptions={[pageSize]}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
    />
  );
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function canStopProcess(instance: ProcessInstance) {
  return instance.desiredState === 'running'
    && instance.observedState !== 'stopped'
    && instance.observedState !== 'exited'
    && instance.observedState !== 'stopping';
}

function canKillProcess(instance: ProcessInstance) {
  return instance.handle !== null
    && instance.observedState !== 'stopped'
    && instance.observedState !== 'exited';
}

function healthLabel(instance: ProcessInstance) {
  return `ready ${instance.readiness.status || 'unknown'} · live ${instance.liveness.status || 'unknown'}`;
}

function healthTone(instance: ProcessInstance) {
  const states = [instance.readiness.status,instance.liveness.status];
  if (states.includes('failing')) return 'failing';
  if (states.every((state) => state === 'passing')) return 'passing';
  return 'unknown';
}

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  return new Date(timestamp).toISOString().replace('T', ' ').replace(/\.000Z$/, 'Z');
}

function processUptime(instance: ProcessInstance, now: number) {
  const started = Date.parse(instance.startedAt ?? '');
  if (!Number.isFinite(started)) return '—';
  let finished = now;
  if (!processHasLiveUptime(instance)) {
    finished = Date.parse(instance.stoppedAt ?? '');
    if (!Number.isFinite(finished)) return '—';
  }
  return formatDuration(Math.max(0, finished - started));
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}
