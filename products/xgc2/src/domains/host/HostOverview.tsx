import { ChevronLeft,ChevronRight,RefreshCw } from 'lucide-react';
import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import {
  Button,
  DescriptionItem,
  DescriptionList,
  EmptyState,
  Notice,
  OperatorWorkspace,
  Panel,
  ResourceMeter,
  Toolbar,
} from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { SystemTrendPoint } from '../../shared/systemTrend';
import type { HostNetworkIfaceStat,HostOverview as HostOverviewData,HostOverviewProcessStat } from './hostModel';
import { formatByteRate,formatBytes } from './hostFormatting';
import {
  appendTrendPoint,
  hostLoadPercent,
  hostLoadPressure,
  hostOverviewRefreshOptions,
  hostResourcePressure,
  isHostOverviewRefreshInterval,
  parseLoadAverage,
  withNetworkRates,
  type HostOverviewRefreshInterval,
  type HostResourcePressure,
} from './hostOverviewModel';
import { getHostOverview } from './hostOverviewActions';
import { useHostOverviewRefresh } from './hostStore';
import type { HostRuntimeProcessRequest } from './hostSystemComposition';
import { useHostTask } from './useHostTask';
import { useProductRouteVisible } from '../../shared/routeReady';
import { useDeferSystemTabReady } from './hostSystemTabSurface';
import { SystemIOTrend } from '../../components/SystemIOTrend';
import './HostOverview.css';

/** Host identity list is 8 rows. Network body is header + 6 slots + last-row pager. */
const HOST_INFO_ROW_COUNT = 8;
const NIC_PAGE_SIZE = HOST_INFO_ROW_COUNT - 2;
const PROCESS_PAGE_SIZE = 3;

export function HostOverview({
  targetCoreId,
  managedHostId,
  requestsAllowed = true,
  actionsEnabled = true,
  isRemote = false,
  onInspectProcess,
}: {
  targetCoreId?: string;
  managedHostId?: string;
  requestsAllowed?: boolean;
  actionsEnabled?: boolean;
  isRemote?: boolean;
  onInspectProcess?: (request: HostRuntimeProcessRequest) => void;
}) {
  const apiTarget = useMemo(() => ({
    ...(targetCoreId ? { targetCoreId } : {}),
    ...(managedHostId ? { managedHostId } : {}),
  }), [managedHostId,targetCoreId]);
  const [overview,setOverview] = useState<HostOverviewData | null>(null);
  const [initialSettled,setInitialSettled] = useState(false);
  const overviewRef = useRef<HostOverviewData | null>(null);
  const [trendPoints,setTrendPoints] = useState<SystemTrendPoint[]>([]);
  // Shared preference for Core and Agent — both may interval-refresh.
  const [refreshInterval,setRefreshInterval] = usePersistentState<HostOverviewRefreshInterval>(
    'xgc.system.overviewRefreshInterval',
    'off',
    isHostOverviewRefreshInterval,
  );
  const task = useHostTask();
  const { run,setMessage } = task;
  const autoRefreshEnabled = refreshInterval !== 'off';
  const surfaceVisible = useProductRouteVisible();
  const waitingForOverview = requestsAllowed && !initialSettled;
  useDeferSystemTabReady(waitingForOverview);

  const applyOverview = useCallback((next: HostOverviewData) => {
    const rated = withNetworkRates(overviewRef.current,next);
    setTrendPoints((points) => appendTrendPoint(points,overviewRef.current,rated));
    overviewRef.current = rated;
    setOverview(rated);
  }, []);

  const loadOverview = useCallback(async () => {
    if (!requestsAllowed) return;
    await run('refresh',async () => {
      try {
        applyOverview(await getHostOverview(apiTarget));
      } finally {
        setInitialSettled(true);
      }
    });
  }, [apiTarget,applyOverview,requestsAllowed,run]);

  useEffect(() => {
    if (!requestsAllowed) return;
    void loadOverview();
  }, [loadOverview,requestsAllowed]);

  useHostOverviewRefresh({
    enabled: autoRefreshEnabled && requestsAllowed && surfaceVisible,
    intervalMs: Number(refreshInterval),
    options: apiTarget,
    onOverview: applyOverview,
    onError: (error) => setMessage(error instanceof Error ? error.message : String(error)),
  });

  if (!requestsAllowed) {
    return (
      <div className="xgc-host-overview" data-xgc-role="system-overview" data-xgc-id="system-overview" data-xgc-offline="true">
        <EmptyState
          title="Overview offline"
          description="Overview membership is enabled, but the Agent connection is not ready for automatic requests."
          density="compact"
          data-xgc-role="system-overview-offline" data-xgc-id="system-overview-offline"
        />
      </div>
    );
  }

  return (
    <div
      className="xgc-host-overview"
      data-xgc-role="system-overview" data-xgc-id="system-overview"
      data-xgc-remote={isRemote ? 'true' : undefined}
    >
      <HostOverviewToolbar
        refreshInterval={refreshInterval}
        busy={task.isBusy('refresh')}
        actionsEnabled={actionsEnabled}
        onRefresh={loadOverview}
        onRefreshInterval={(value) => setRefreshInterval(value as HostOverviewRefreshInterval)}
      />
      {task.message && <Notice tone={task.messageTone} density="compact" onDismiss={task.clearMessage}>{task.message}</Notice>}
      {overview ? (
        <HostOverviewContent
          overview={overview}
          trendPoints={trendPoints}
          onInspectProcess={onInspectProcess}
        />
      ) : null}
    </div>
  );
}

function HostOverviewToolbar({
  refreshInterval,
  busy,
  actionsEnabled,
  onRefresh,
  onRefreshInterval,
}: {
  refreshInterval: HostOverviewRefreshInterval;
  busy: boolean;
  actionsEnabled: boolean;
  onRefresh: () => void;
  onRefreshInterval: (value: string) => void;
}) {
  return (
    <Toolbar className="xgc-host-overview-toolbar" data-xgc-role="system-overview-status" data-xgc-id="system-overview-status" data-xgc-align="end">
      <SelectControl
        className="xgc-host-overview-refresh-select"
        size="compact"
        value={refreshInterval}
        options={hostOverviewRefreshOptions}
        icon={<RefreshCw size={14} aria-hidden="true" />}
        ariaLabel="System auto refresh interval"
        dataXgcRole="system-auto-refresh" dataXgcId="system-auto-refresh"
        onChange={onRefreshInterval}
      />
      <ControlButton
        size="compact"
        disabled={busy || !actionsEnabled}
        aria-busy={busy || undefined}
        onClick={onRefresh}
        dataXgcRole="system-overview-refresh" dataXgcId="system-overview-refresh"
      >
        <RefreshCw size={14} aria-hidden="true" />Refresh
      </ControlButton>
    </Toolbar>
  );
}

function HostOverviewContent({
  overview,
  trendPoints,
  onInspectProcess,
}: {
  overview: HostOverviewData;
  trendPoints: SystemTrendPoint[];
  onInspectProcess?: (request: HostRuntimeProcessRequest) => void;
}) {
  const [nicPage,setNicPage] = useState(0);
  const load = parseLoadAverage(overview.loadAverage);
  const load1 = Number(load[0]) || 0;
  const loadPercent = hostLoadPercent(load1, overview.cpuCount);
  const cpuLabel = overview.cpuCount && overview.cpuCount > 0
    ? `${overview.cpuCount} CPU${overview.cpuCount === 1 ? '' : 's'}`
    : 'system load average';
  const diskLabel = overview.disk?.filesystem && overview.disk.filesystem !== 'root'
    ? `Disk / (${overview.disk.filesystem})`
    : 'Disk /';
  const networkInterfaces = overview.networkInterfaces ?? [];
  const topCpuProcesses = overview.topCpuProcesses ?? [];
  const topMemoryProcesses = overview.topMemoryProcesses ?? [];
  const topNetworkProcesses = overview.topNetworkProcesses ?? [];
  const ifaceCount = networkInterfaces.length > 0
    ? networkInterfaces.length
    : (overview.io?.networkIfaceCount ?? 0);
  const nicPageCount = Math.max(1,Math.ceil(networkInterfaces.length / NIC_PAGE_SIZE));
  const safeNicPage = Math.min(nicPage,nicPageCount - 1);
  const visibleNetworkInterfaces = networkInterfaces.slice(
    safeNicPage * NIC_PAGE_SIZE,
    (safeNicPage + 1) * NIC_PAGE_SIZE,
  );

  return (
    <OperatorWorkspace className="xgc-host-overview-board" padding="none">
      <Panel
        bodyLayout="column"
        title={overviewPanelTitle('system-overview-resources-title','system-overview-resources','Resource activity')}
        data-xgc-role="system-overview-resources" data-xgc-id="system-overview-resources"
      >
      <div className="xgc-host-resource-grid" data-xgc-role="system-overview-trend" data-xgc-id="system-overview-trend">
        <HostTrendCard dataXgcRole="system-overview-trend-network" dataXgcId="network" kind="network" points={trendPoints} />
        <HostTrendCard dataXgcRole="system-overview-trend-disk" dataXgcId="disk" kind="disk" points={trendPoints} />
        <HostTrendCard dataXgcRole="system-overview-trend-load" dataXgcId="load" kind="load" points={trendPoints} />
      </div>

      <div className="xgc-host-resource-grid" data-xgc-role="system-overview-monitor" data-xgc-id="system-overview-monitor">
        <HostResourceCard
          pressure={hostResourcePressure(overview.memory.usedPercent)}
          dataXgcRole="system-overview-memory"
          dataXgcId="system-overview-memory"
        >
          <OverviewResourceMeter
            entityId="system-overview-memory"
            label="Memory"
            percent={overview.memory.usedPercent}
            detail={`${formatBytes(overview.memory.usedBytes)} / ${formatBytes(overview.memory.totalBytes)} · ${formatBytes(overview.memory.availableBytes)} free`}
          />
        </HostResourceCard>
        <HostResourceCard
          pressure={hostResourcePressure(overview.disk.usedPercent)}
          dataXgcRole="system-overview-disk"
          dataXgcId="system-overview-disk"
        >
          <OverviewResourceMeter
            entityId="system-overview-disk"
            label={diskLabel}
            percent={overview.disk.usedPercent}
            detail={overview.disk.totalBytes > 0
              ? `${formatBytes(overview.disk.usedBytes)} / ${formatBytes(overview.disk.totalBytes)} · ${formatBytes(overview.disk.freeBytes)} free`
              : 'Disk metrics unavailable on this host'}
          />
        </HostResourceCard>
        <HostResourceCard
          pressure={hostLoadPressure(load1, overview.cpuCount)}
          dataXgcRole="system-overview-load"
          dataXgcId="system-overview-load"
        >
          <OverviewResourceMeter
            entityId="system-overview-load"
            label="Load · 1m"
            percent={loadPercent}
            detail={(
              <span data-xgc-role="system-overview-load-value" data-xgc-id="1m">
                {load[0]}
                {` · ${cpuLabel}`}
              </span>
            )}
          />
        </HostResourceCard>
      </div>

      </Panel>

      <div className="xgc-host-overview-split" data-xgc-role="system-overview-split" data-xgc-id="system-overview-split">
        <Panel
          bodyLayout="column"
          padding="none"
          data-xgc-role="system-overview-basic" data-xgc-id="system-overview-basic"
          title={overviewPanelTitle('system-overview-basic-title', 'system-overview-basic', 'Host')}
        >
          <DescriptionList className="info-table">
            <OverviewHostField id="hostname" label="Hostname" value={overview.hostname} />
            <OverviewHostField id="distro" label="Distro" value={overview.distro || overview.os || 'Linux'} />
            <OverviewHostField id="arch" label="Arch" value={overview.arch || '-'} />
            <OverviewHostField id="kernel" label="Kernel" value={overview.kernel || '-'} />
            <OverviewHostField id="cpu" label="CPU" value={overview.cpu} />
            <OverviewHostField id="uptime" label="Uptime" value={overview.uptime} />
            <OverviewHostField
              id="network"
              label="Network"
              value={`${ifaceCount} NIC${ifaceCount === 1 ? '' : 's'}`}
            />
            <OverviewHostField id="collected-at" label="Collected at" value={new Date(overview.collectedAt).toLocaleString()} />
          </DescriptionList>
        </Panel>

        <Panel
          bodyLayout="column"
          padding="none"
          data-xgc-role="system-overview-network" data-xgc-id="system-overview-network"
          title={overviewPanelTitle(
            'system-overview-network-title',
            'system-overview-network',
            ifaceCount > 0 ? `Network · ${ifaceCount} NIC${ifaceCount === 1 ? '' : 's'}` : 'Network',
          )}
        >
          <div
            className="xgc-host-overview-table-card"
            data-xgc-role="system-overview-network-card" data-xgc-id="system-overview-network-card"
            data-xgc-paginated="true"
          >
            <div className="xgc-host-overview-table" data-xgc-role="system-overview-nics" data-xgc-id="system-overview-nics">
              <div className="xgc-host-overview-table-head" aria-hidden="true">
                <span>Interface</span><span>State</span><span>Address</span>
                <span title="Current download rate · cumulative received data">Download ↓ · total</span>
                <span title="Current upload rate · cumulative sent data">Upload ↑ · total</span>
              </div>
              {visibleNetworkInterfaces.map((iface) => (
                <NetworkIfaceRow key={iface.name} iface={iface} />
              ))}
              {Array.from({ length: Math.max(0,NIC_PAGE_SIZE - visibleNetworkInterfaces.length) },(_,index) => (
                <div
                  className="xgc-host-overview-table-row xgc-host-overview-placeholder-row"
                  data-xgc-role="system-overview-nic-placeholder" data-xgc-id={`nic:${index}`}
                  key={`nic-placeholder-${index}`}
                  aria-hidden="true"
                >
                  <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
                </div>
              ))}
            </div>
            <OverviewTablePager
              always
              page={safeNicPage}
              pageCount={nicPageCount}
              ariaLabel="Network interface pages"
              previousAriaLabel="Previous network interface page"
              nextAriaLabel="Next network interface page"
              role="system-overview-nic-pagination"
              previousRole="system-overview-nic-page-previous"
              nextRole="system-overview-nic-page-next"
              labelRole="system-overview-nic-page-label"
              itemId="nics"
              onPrevious={() => setNicPage(Math.max(0,safeNicPage - 1))}
              onNext={() => setNicPage(Math.min(nicPageCount - 1,safeNicPage + 1))}
            />
          </div>
        </Panel>
      </div>

      <div className="xgc-host-overview-tops" data-xgc-role="system-overview-tops" data-xgc-id="system-overview-tops">
        <Panel
          bodyLayout="column"
          padding="none"
          data-xgc-role="system-overview-top-cpu"
          data-xgc-id="system-overview-top-cpu"
          title={overviewPanelTitle('system-overview-top-cpu-title', 'system-overview-top-cpu', 'Top CPU · 5')}
        >
          <ProcessStatTable rows={topCpuProcesses} metric="cpu" onInspectProcess={onInspectProcess} />
        </Panel>
        <Panel
          bodyLayout="column"
          padding="none"
          data-xgc-role="system-overview-top-mem"
          data-xgc-id="system-overview-top-mem"
          title={overviewPanelTitle('system-overview-top-mem-title', 'system-overview-top-mem', 'Top memory · 5')}
        >
          <ProcessStatTable rows={topMemoryProcesses} metric="mem" onInspectProcess={onInspectProcess} />
        </Panel>
        <Panel
          bodyLayout="column"
          padding="none"
          data-xgc-role="system-overview-top-net"
          data-xgc-id="system-overview-top-net"
          title={overviewPanelTitle('system-overview-top-net-title', 'system-overview-top-net', 'Top sockets · 5')}
        >
          <ProcessStatTable rows={topNetworkProcesses} metric="net" onInspectProcess={onInspectProcess} />
        </Panel>
      </div>
    </OperatorWorkspace>
  );
}

function NetworkIfaceRow({ iface }: { iface: HostNetworkIfaceStat }) {
  const id = iface.name;
  return (
    <div className="xgc-host-overview-table-row" data-xgc-role="system-overview-nic" data-xgc-id={id}>
      <strong data-xgc-role="system-overview-nic-name" data-xgc-id={id}>{iface.name}</strong>
      <em data-xgc-role="system-overview-nic-state" data-xgc-id={id} data-xgc-up={iface.up ? 'true' : 'false'}>
        {iface.up ? 'up' : 'down'}
      </em>
      <span data-xgc-role="system-overview-nic-address" data-xgc-id={id}>{iface.address || '—'}</span>
      <span
        data-xgc-role="system-overview-nic-rx"
        data-xgc-id={id}
        title="Current download rate · cumulative received data"
      >
        {formatByteRate(iface.rxRateBytesPerSecond || 0)} · {formatBytes(iface.rxBytes)}
      </span>
      <span
        data-xgc-role="system-overview-nic-tx"
        data-xgc-id={id}
        title="Current upload rate · cumulative sent data"
      >
        {formatByteRate(iface.txRateBytesPerSecond || 0)} · {formatBytes(iface.txBytes)}
      </span>
    </div>
  );
}

function ProcessStatTable({
  rows,
  metric,
  onInspectProcess,
}: {
  rows: HostOverviewProcessStat[];
  metric: 'cpu' | 'mem' | 'net';
  onInspectProcess?: (request: HostRuntimeProcessRequest) => void;
}) {
  const [page,setPage] = useState(0);
  const pageCount = Math.max(1,Math.ceil(rows.length / PROCESS_PAGE_SIZE));
  const safePage = Math.min(page,pageCount - 1);
  const visibleRows = rows.slice(safePage * PROCESS_PAGE_SIZE,(safePage + 1) * PROCESS_PAGE_SIZE);
  const emptySlots = Math.max(0,PROCESS_PAGE_SIZE - visibleRows.length);
  const metricLabel = metric === 'cpu' ? 'CPU %' : metric === 'mem' ? 'RSS' : 'Sockets';
  const role = metric === 'cpu'
    ? 'system-overview-cpu-table'
    : metric === 'mem'
      ? 'system-overview-mem-table'
      : 'system-overview-net-table';
  const pageNoun = metric === 'cpu' ? 'CPU' : metric === 'mem' ? 'memory' : 'socket';
  return (
    <div
      className="xgc-host-overview-table-card"
      data-xgc-role="system-overview-process-card"
      data-xgc-id={metric}
      data-xgc-paginated="true"
    >
      <div className="xgc-host-overview-table" data-xgc-role={role} data-xgc-id={role}>
        <div className="xgc-host-overview-table-head" aria-hidden="true">
          <span>PID</span><span>Process</span><span>{metricLabel}</span><span>{metric === 'mem' ? 'CPU %' : 'Memory'}</span>
        </div>
        {visibleRows.map((row) => {
          const inspectable = Boolean(onInspectProcess && row.pid > 0);
          const rowId = row.pid > 0 ? `${metric}:${row.pid}` : `${metric}:empty:${row.name}`;
          const cells = (
            <>
              <span data-xgc-role="system-overview-process-pid" data-xgc-id={rowId}>{row.pid || '—'}</span>
              <strong data-xgc-role="system-overview-process-name" data-xgc-id={rowId} title={row.name}>{row.name}</strong>
              <em data-xgc-role="system-overview-process-primary" data-xgc-id={rowId}>
                {metric === 'cpu' && `${formatCpuPercent(row.cpuPercent)}`}
                {metric === 'mem' && formatBytes(row.memoryBytes)}
                {metric === 'net' && String(row.connections)}
              </em>
              <span data-xgc-role="system-overview-process-secondary" data-xgc-id={rowId}>
                {metric === 'mem'
                  ? formatCpuPercent(row.cpuPercent)
                  : formatBytes(row.memoryBytes)}
              </span>
            </>
          );
          return inspectable ? (
            <Button
              appearance="ghost"
              uiSize="compact"
              type="button"
              className="xgc-host-overview-table-row xgc-host-overview-process-link"
              data-xgc-role="system-overview-process-row"
              data-xgc-id={rowId}
              data-xgc-action="inspect-runtime"
              data-xgc-metric={metric}
              aria-label={`Inspect ${row.name || 'process'} PID ${row.pid} in Runtime`}
              title="Inspect this process in Runtime"
              key={`${metric}-${row.pid}-${row.name}`}
              onClick={() => onInspectProcess?.({
                pid: row.pid,
                name: row.name,
                metric: metric === 'mem' ? 'memory' : metric === 'net' ? 'connections' : 'cpu',
              })}
            >
              {cells}
            </Button>
          ) : (
            <div
              className="xgc-host-overview-table-row"
              data-xgc-role="system-overview-process-row"
              data-xgc-id={rowId}
              key={`${metric}-${row.pid}-${row.name}`}
            >
              {cells}
            </div>
          );
        })}
        {Array.from({ length: emptySlots },(_,index) => (
          <div
            className="xgc-host-overview-table-row xgc-host-overview-placeholder-row"
            data-xgc-role="system-overview-process-placeholder" data-xgc-id={`${metric}:${index}`}
            key={`${metric}-placeholder-${index}`}
            aria-hidden="true"
          >
            <span>—</span><span>—</span><span>—</span><span>—</span>
          </div>
        ))}
      </div>
      <OverviewTablePager
        always
        page={safePage}
        pageCount={pageCount}
        ariaLabel={`Top ${pageNoun} process pages`}
        previousAriaLabel={`Previous ${pageNoun} process page`}
        nextAriaLabel={`Next ${pageNoun} process page`}
        role="system-overview-process-pagination"
        previousRole="system-overview-process-page-previous"
        nextRole="system-overview-process-page-next"
        labelRole="system-overview-process-page-label"
        itemId={metric}
        onPrevious={() => setPage(Math.max(0,safePage - 1))}
        onNext={() => setPage(Math.min(pageCount - 1,safePage + 1))}
      />
    </div>
  );
}

function OverviewTablePager({
  always = false,
  page,
  pageCount,
  ariaLabel,
  previousAriaLabel,
  nextAriaLabel,
  role,
  previousRole,
  nextRole,
  labelRole,
  itemId,
  onPrevious,
  onNext,
}: {
  always?: boolean;
  page: number;
  pageCount: number;
  ariaLabel: string;
  previousAriaLabel: string;
  nextAriaLabel: string;
  role: string;
  previousRole: string;
  nextRole: string;
  labelRole: string;
  itemId?: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (!always && pageCount <= 1) return null;
  return (
    <div
      className="xgc-host-overview-pagination"
      data-xgc-role={role}
      data-xgc-id={itemId}
      role="navigation"
      aria-label={ariaLabel}
    >
      <ControlButton
        className="xgc-host-overview-pagination-button"
        size="compact"
        appearance="ghost"
        iconOnly
        aria-label={previousAriaLabel}
        title="Previous page"
        dataXgcRole={previousRole}
        dataXgcId={itemId}
        disabled={page === 0}
        onClick={onPrevious}
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </ControlButton>
      <span
        className="xgc-host-overview-pagination-label"
        data-xgc-role={labelRole}
        data-xgc-id={itemId}
        aria-label={`Page ${page + 1} of ${pageCount}`}
        aria-live="polite"
      >
        <strong>{page + 1}</strong>
        <span aria-hidden="true">/</span>
        <span>{pageCount}</span>
      </span>
      <ControlButton
        className="xgc-host-overview-pagination-button"
        size="compact"
        appearance="ghost"
        iconOnly
        aria-label={nextAriaLabel}
        title="Next page"
        dataXgcRole={nextRole}
        dataXgcId={itemId}
        disabled={page >= pageCount - 1}
        onClick={onNext}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </ControlButton>
    </div>
  );
}

/** Agent reports lifetime share (often <<1%); show enough digits to compare tops. */
function formatCpuPercent(value: number) {
  const n = Number(value) || 0;
  if (n <= 0) return '0%';
  if (n < 0.01) return `${n.toFixed(4)}%`;
  if (n < 1) return `${n.toFixed(3)}%`;
  return `${n.toFixed(2)}%`;
}

function HostTrendCard({
  kind,
  points,
  dataXgcRole,
  dataXgcId,
}: {
  kind: 'network' | 'disk' | 'load';
  points: SystemTrendPoint[];
  dataXgcRole: string;
  dataXgcId: string;
}) {
  return (
    <Panel className="xgc-host-trend-card" chrome="flat" padding="none" data-xgc-role={dataXgcRole} data-xgc-id={dataXgcId}>
      <SystemIOTrend
        points={points}
        kind={kind}
        chartRole="system-overview-trend-chart"
        legendRole="system-overview-trend-legend"
        seriesRole="system-overview-trend-series"
      />
    </Panel>
  );
}

function HostResourceCard({
  pressure,
  children,
  dataXgcRole,
  dataXgcId,
}: {
  pressure: HostResourcePressure;
  children: ReactNode;
  dataXgcRole?: string;
  dataXgcId?: string;
}) {
  return (
    <Panel
      className="xgc-host-resource-card"
      chrome="flat"
      padding="none"
      data-xgc-pressure={pressure}
      data-xgc-role={dataXgcRole} data-xgc-id={dataXgcId ?? dataXgcRole}
    >
      {children}
    </Panel>
  );
}

function overviewPanelTitle(role: string, id: string, text: string) {
  return <span data-xgc-role={role} data-xgc-id={id}>{text}</span>;
}

function OverviewHostField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <DescriptionItem
      className="info-row"
      data-xgc-role="system-overview-host-row"
      data-xgc-id={id}
      label={<span data-xgc-role="system-overview-host-label" data-xgc-id={id}>{label}</span>}
      value={<span data-xgc-role="system-overview-host-value" data-xgc-id={id}>{value}</span>}
    />
  );
}

function OverviewResourceMeter({
  entityId,
  label,
  percent,
  detail,
}: {
  entityId: string;
  label: ReactNode;
  percent: number;
  detail?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const percentEl = hostRef.current?.querySelector<HTMLElement>(':scope > .resource-bar > .xgc-resource-meter-heading > span');
    if (!percentEl) return;
    percentEl.setAttribute('data-xgc-role', `${entityId}-percent`);
    percentEl.setAttribute('data-xgc-id', entityId);
  }, [entityId, percent]);
  const detailNode = detail == null || detail === ''
    ? detail
    : typeof detail === 'string' || typeof detail === 'number'
      ? <span data-xgc-role={`${entityId}-detail`} data-xgc-id={entityId}>{detail}</span>
      : detail;
  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      <ResourceMeter
        className="resource-bar"
        data-xgc-role={`${entityId}-meter`}
        data-xgc-id={entityId}
        label={<span data-xgc-role={`${entityId}-label`} data-xgc-id={entityId}>{label}</span>}
        percent={percent}
        detail={detailNode}
      />
    </div>
  );
}
