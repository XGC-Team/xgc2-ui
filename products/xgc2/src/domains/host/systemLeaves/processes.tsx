import { RefreshCw,Search,X } from 'lucide-react';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { Input,Notice,Toolbar,useConfirmationDialog } from '@xgc2/ui-react';
import { SortableDataTable } from '../../../components/SortableDataTable';
import { ControlButton } from '../../../components/controls/ControlButton';
import { formatBytes,formatDateTime } from '../hostFormatting';
import type { HostProcess } from '../hostModel';
import {
  DEFAULT_HOST_PROCESS_SORT,
  nextHostProcessSort,
  sortHostProcesses,
  type HostProcessSort,
  type HostProcessSortKey,
} from '../hostProcessListModel';
import { getHostProcesses,killHostProcess } from '../hostProcessActions';
import { useHostText } from '../hostMessages';
import { useHostRuntimeChrome } from '../hostRuntimeChrome';
import type { HostRuntimeProcessMetric,HostSystemLeafProps } from '../hostSystemComposition';
import { useHostRuntimeResource } from '../useHostRuntimeResource';
import { useHostTask } from '../useHostTask';
import { useDeferSystemTabReady } from '../hostSystemTabSurface';
import '../HostRuntime.css';
import './processes.css';

export function HostProcessesSystemLeaf(context: HostSystemLeafProps<'Processes'>) {
  const t = useHostText();
  const { viewSwitcher } = useHostRuntimeChrome();
  const confirmation = useConfirmationDialog();
  const apiTarget = useMemo(() => ({
    ...(context.targetCoreId ? { targetCoreId: context.targetCoreId } : {}),
    ...(context.managedHostId ? { managedHostId: context.managedHostId } : {}),
  }),[context.managedHostId,context.targetCoreId]);
  const [query,setQuery] = useState(() => context.runtimeProcessFocus
    ? String(context.runtimeProcessFocus.pid)
    : '');
  const [focusedPid,setFocusedPid] = useState<number | undefined>(context.runtimeProcessFocus?.pid);
  const [sort,setSort] = useState<HostProcessSort>(() => processFocusSort(context.runtimeProcessFocus?.metric));
  const resourceIdentity = `${context.targetCoreId ?? 'local'}:${context.managedHostId ?? 'local'}:processes`;
  const task = useHostTask(resourceIdentity);
  const { run } = task;
  const loadProcesses = useCallback(() => getHostProcesses(apiTarget),[apiTarget]);
  const processes = useHostRuntimeResource(
    resourceIdentity,
    loadProcesses,
    [] as HostProcess[],
    t('Failed to load host processes.'),
    { enabled: context.requestsAllowed },
  );
  const waitingForProcesses = context.requestsAllowed && !processes.settled;
  useDeferSystemTabReady(waitingForProcesses);
  useEffect(() => {
    const focus = context.runtimeProcessFocus;
    if (!focus) return;
    setQuery(String(focus.pid));
    setFocusedPid(focus.pid);
    setSort(processFocusSort(focus.metric));
  },[context.runtimeProcessFocus]);
  const visibleProcesses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = Array.isArray(processes.items) ? processes.items : [];
    const filtered = items.filter((process) => {
      if (focusedPid !== undefined && normalized === String(focusedPid)) {
        return process.pid === focusedPid;
      }
      if (!normalized) return true;
      return String(process.pid ?? '').includes(normalized)
        || (process.name || '').toLowerCase().includes(normalized)
        || (process.user || '').toLowerCase().includes(normalized)
        || (process.command || '').toLowerCase().includes(normalized);
    });
    // Cap after sort so the top of the list is the important end for the active key.
    return sortHostProcesses(filtered,sort).slice(0,200);
  },[focusedPid,processes.items,query,sort]);

  const clearProcessFocus = () => {
    const requestId = context.runtimeProcessFocus?.requestId;
    if (requestId !== undefined) context.onClearRuntimeProcessFocus?.(requestId);
    setFocusedPid(undefined);
    setQuery('');
  };

  const endProcess = async (pid: number,label: string,startTicks?: number) => {
    if (!context.actionsEnabled || !context.requestsAllowed) return;
    if (context.isRemote && startTicks === undefined) {
      task.setMessage(t('Remote terminate requires process startTicks identity.'));
      return;
    }
    const intentIsCurrent = processes.beginIdentityIntent();
    if (!await confirmation.confirm({
      title: t('End host process'),
      message: t('End process {pid}{label}?', {
        pid,
        label: label ? ` (${label})` : '',
      }),
      confirmLabel: t('End process'),
    })) return;
    if (!intentIsCurrent()) return;
    const killed = await run(`kill:${pid}`,async () => {
      await killHostProcess(pid,{
        ...apiTarget,
        ...(context.isRemote ? { startTicks: startTicks ?? 0,signal: 'term' as const } : {}),
      });
      return true;
    });
    if (killed && intentIsCurrent()) {
      if (focusedPid === pid) clearProcessFocus();
      await processes.refresh();
    }
  };

  return (
    <>
      {task.message && (
        <Notice tone={task.messageTone} density="compact" onDismiss={task.clearMessage}>
          {task.message}
        </Notice>
      )}
      {processes.error && <Notice tone="danger" density="compact">{processes.error}</Notice>}
      {/* Flat single-view layout: standalone toolbar above the table, no
       * wrapping panel chrome (DESIGN_CONTRACT flat-vs-framed rule). */}
      <div
        className="xgc-host-runtime-section"
        data-xgc-role="host-runtime-section" data-xgc-id="processes"
      >
        <Toolbar className="xgc-host-runtime-toolbar" data-xgc-role="host-runtime-toolbar" data-xgc-id="processes">
          <div className="xgc-host-runtime-toolbar-left" data-xgc-role="host-runtime-search-group" data-xgc-id="processes">
            <Input
              aria-label={t('Search PID, user, process')}
              className="xgc-host-runtime-search"
              uiSize="compact"
              containerProps={{ 'data-xgc-role': 'host-runtime-search','data-xgc-id': 'processes' }}
              icon={<Search size={14} aria-hidden="true" />}
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                if (focusedPid !== undefined && value.trim() !== String(focusedPid)) {
                  const requestId = context.runtimeProcessFocus?.requestId;
                  if (requestId !== undefined) context.onClearRuntimeProcessFocus?.(requestId);
                  setFocusedPid(undefined);
                }
              }}
              placeholder={t('Search PID, user, process')}
              type="search"
            />
          </div>
          <div className="xgc-host-runtime-toolbar-right" data-xgc-role="host-runtime-actions" data-xgc-id="processes">
            {viewSwitcher}
            {focusedPid !== undefined && (
              <ControlButton
                size="compact"
                dataXgcRole="host-runtime-process-focus-clear" dataXgcId="processes"
                title={`Clear Overview focus for PID ${focusedPid}`}
                onClick={clearProcessFocus}
              >
                <X size={13} aria-hidden="true" />PID {focusedPid}
              </ControlButton>
            )}
            <ControlButton
              size="compact"
              disabled={!context.actionsEnabled || processes.busy}
              dataXgcRole="host-runtime-refresh" dataXgcId="processes"
              onClick={() => void processes.refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />{t('Refresh')}
            </ControlButton>
          </div>
        </Toolbar>
        <HostProcessTable
          processes={visibleProcesses}
          sort={sort}
          onSortChange={(key) => setSort((current) => nextHostProcessSort(current,key))}
          disabled={!context.actionsEnabled || task.isBusy() || processes.busy}
          isRemote={context.isRemote}
          focusedPid={focusedPid}
          onEnd={endProcess}
        />
      </div>
      {confirmation.dialog}
    </>
  );
}

function HostProcessTable({
  processes,
  sort,
  onSortChange,
  disabled,
  isRemote,
  focusedPid,
  onEnd,
}: {
  processes: HostProcess[];
  sort: HostProcessSort;
  onSortChange: (key: HostProcessSortKey) => void;
  disabled: boolean;
  isRemote: boolean;
  focusedPid?: number;
  onEnd: (pid: number,label: string,startTicks?: number) => void;
}) {
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-process-table" data-xgc-id="host-process-table">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-process-table"
        columns={[
          { id: 'pid',header: 'PID',sortable: true,cell: (process) => process.pid },
          { id: 'name',header: 'Name',sortable: true,cell: (process) => <span title={process.name || undefined}>{process.name || '-'}</span> },
          { id: 'ppid',header: 'Parent PID',sortable: true,cell: (process) => <em>{process.ppid || '-'}</em> },
          { id: 'threads',header: 'Threads',sortable: true,cell: (process) => <em>{process.threads || '-'}</em> },
          { id: 'user',header: 'User',sortable: true,cell: (process) => <em>{process.user || '-'}</em> },
          { id: 'cpu',header: 'CPU',sortable: true,cell: (process) => `${process.cpuPercent.toFixed(2)}%` },
          { id: 'memory',header: 'Memory',sortable: true,cell: (process) => formatBytes(process.memory) },
          { id: 'connections',header: 'Connections',sortable: true,cell: (process) => <em>{process.connections}</em> },
          { id: 'state',header: 'State',sortable: true,cell: (process) => <em>{process.state}</em> },
          { id: 'startTime',header: 'Start time',sortable: true,cell: (process) => <em>{formatDateTime(process.startTime)}</em> },
          { id: 'command',header: 'Command',sortable: true,cell: (process) => <span title={process.command || undefined}>{process.command || '-'}</span> },
          { id: 'operations',header: 'Operations',cell: (process) => {
            const canTerminate = !isRemote || process.startTicks !== undefined;
            return <div className="xgc-host-process-ops"><ControlButton
                  className="xgc-host-end-process"
                  size="compact"
                  tone="danger"
                  disabled={disabled || !canTerminate}
                  dataXgcRole="host-process-end" dataXgcId={String(process.pid)}
                  onClick={() => onEnd(process.pid,process.command,process.startTicks)}
                >End</ControlButton></div>;
          } },
        ]}
        getRowProps={(process) => ({
          'data-xgc-role': 'host-process-row',
          'data-xgc-id': String(process.pid),
          'data-xgc-focused': focusedPid === process.pid ? 'true' : undefined,
          'aria-current': focusedPid === process.pid ? 'true' : undefined,
        })}
        manualSort
        onSortChange={({ columnId }) => onSortChange(columnId as HostProcessSortKey)}
        rowKey={(process) => `${process.pid}:${process.startTicks ?? 'local'}`}
        rows={processes}
        sort={{ columnId: sort.key,direction: sort.direction === 'asc' ? 'ascending' : 'descending' }}
      />
    </div>
  );
}

function processFocusSort(metric?: HostRuntimeProcessMetric): HostProcessSort {
  if (!metric) return DEFAULT_HOST_PROCESS_SORT;
  return { key: metric,direction: 'desc' };
}
