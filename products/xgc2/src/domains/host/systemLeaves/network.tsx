import { Activity,List,MonitorUp,RefreshCw,Route,Search,Settings2 } from 'lucide-react';
import { useCallback,useMemo,useState,type ReactNode } from 'react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { Input,Notice,Panel,SidebarNavItem,StatCard,StatusText,Toolbar } from '@xgc2/ui-react';
import { SortableDataTable } from '../../../components/SortableDataTable';
import { formatBytes,formatDateTime } from '../hostFormatting';
import type {
  HostListeningPort,
  HostNetworkInterface,
  HostNetworkRoute,
  HostNetworkSnapshot,
  HostRemoteAccessEndpoint,
} from '../hostModel';
import { getHostNetworkSnapshot } from '../hostNetworkActions';
import {
  hostNetworkHealthChecks,
  hostNetworkPathChecks,
  remoteAccessLabel,
} from '../hostNetworkDiagnosticsModel';
import { useHostText } from '../hostMessages';
import { useHostRuntimeChrome } from '../hostRuntimeChrome';
import type { HostSystemLeafProps } from '../hostSystemComposition';
import { useHostRuntimeResource } from '../useHostRuntimeResource';
import { NetworkProfileEditor } from './networkProfileEditor';
import { useDeferSystemTabReady } from '../hostSystemTabSurface';
import '../HostRuntime.css';
import './network.css';

type HostNetworkView = 'profiles' | 'health' | 'path' | 'routes' | 'listeners' | 'remote-access';

const networkGroups: { id:string;label:string;views:{ value:HostNetworkView;label:string;icon:ReactNode }[] }[] = [
  { id:'status',label:'Status',views:[
    { value:'health' as const,label:'Health',icon:<Activity size={14} /> },
    { value:'remote-access' as const,label:'Remote access',icon:<MonitorUp size={14} /> },
  ] },
  { id:'diagnostics',label:'Diagnostics',views:[
    { value:'path' as const,label:'Path',icon:<Search size={14} /> },
    { value:'routes' as const,label:'Routes',icon:<Route size={14} /> },
    { value:'listeners' as const,label:'Listeners',icon:<List size={14} /> },
  ] },
  { id:'configuration',label:'Configuration',views:[
    { value:'profiles' as const,label:'Profiles',icon:<Settings2 size={14} /> },
  ] },
];
const networkViews = networkGroups.flatMap((group) => group.views);

const emptyNetworkSnapshot: HostNetworkSnapshot = {
  interfaces: [],
  routes: [],
  listeners: [],
  diagnostics: {
    dns: { nameServers: [],searchDomains: [],options: [],source: '' },
    proxy: { httpProxy: '',httpsProxy: '',allProxy: '',noProxy: [],source: '' },
    assignments: [],
    remoteAccess: [],
    collectedAt: '',
  },
};

export function HostNetworkSystemLeaf(context: HostSystemLeafProps<'Network'>) {
  const t = useHostText();
  const { viewSwitcher } = useHostRuntimeChrome();
  const apiTarget = useMemo(() => ({
    ...(context.targetCoreId ? { targetCoreId: context.targetCoreId } : {}),
    ...(context.managedHostId ? { managedHostId: context.managedHostId } : {}),
  }),[context.managedHostId,context.targetCoreId]);
  const [queries,setQueries] = useState<Partial<Record<HostNetworkView,string>>>({});
  const [activeView,setActiveView] = useState<HostNetworkView>('health');
  const [visitedViews,setVisitedViews] = useState<HostNetworkView[]>(['health']);
  const query = queries[activeView] ?? '';
  const selectView = (view:HostNetworkView) => {
    setActiveView(view);
    setVisitedViews((current) => current.includes(view) ? current : [...current,view]);
  };
  const resourceIdentity = `${context.targetCoreId ?? 'local'}:${context.managedHostId ?? 'local'}:network`;
  const loadSnapshot = useCallback(() => getHostNetworkSnapshot(apiTarget),[apiTarget]);
  const network = useHostRuntimeResource(
    resourceIdentity,
    loadSnapshot,
    emptyNetworkSnapshot,
    t('Failed to load host network diagnostics.'),
    { enabled: context.requestsAllowed },
  );
  const waitingForNetwork = context.requestsAllowed && !network.settled;
  useDeferSystemTabReady(waitingForNetwork);

  return (
    <>
      {network.error && <Notice tone="danger" density="compact">{network.error}</Notice>}
      <Panel
        bodyLayout="column"
        chrome="flat"
        className="xgc-host-runtime-section"
        data-xgc-role="host-runtime-section" data-xgc-id="network"
        fill
        padding="none"
      >
        <Toolbar className="xgc-host-runtime-toolbar" data-xgc-role="host-runtime-toolbar" data-xgc-id="network">
          <div className="xgc-host-runtime-toolbar-left" data-xgc-role="host-runtime-search-group" data-xgc-id="network">
            {viewSwitcher}
          </div>
          <div className="xgc-host-runtime-toolbar-right" data-xgc-role="host-runtime-actions" data-xgc-id="network">
            <ControlButton
              size="compact"
              disabled={!context.actionsEnabled || network.busy}
              dataXgcRole="host-runtime-refresh" dataXgcId="network"
              onClick={() => void network.refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />{t('Refresh')}
            </ControlButton>
          </div>
        </Toolbar>
        <div className="xgc-host-network-workspace">
          <nav className="xgc-host-network-navigation" aria-label={t('Network views')}
            data-xgc-role="host-network-view-switcher" data-xgc-id="host-network-view-switcher">
            {networkGroups.map((group) => (
              <div className="xgc-host-network-navigation-group" key={group.id}
                data-xgc-role="host-network-navigation-group" data-xgc-id={group.id}>
                <span className="xgc-host-network-navigation-heading"
                  data-xgc-role="host-network-navigation-heading" data-xgc-id={group.id}>{t(group.label)}</span>
                {group.views.map((view) => (
                  <SidebarNavItem key={view.value} active={activeView === view.value}
                    icon={view.icon} label={t(view.label)} onSelect={() => selectView(view.value)}
                    dataAttributes={{ 'data-xgc-role':'host-network-view','data-xgc-id':view.value }} />
                ))}
              </div>
            ))}
          </nav>
          <div className="xgc-host-network-content">
            <Toolbar className="xgc-host-network-content-toolbar">
              <span className="xgc-host-network-content-title"
                data-xgc-role="host-network-content-title" data-xgc-id={activeView}>
                {t(networkViews.find((view) => view.value === activeView)!.label)}
              </span>
              {activeView !== 'profiles' && (
                <Input aria-label={networkSearchPlaceholder(activeView,t)}
                  uiSize="compact"
                  containerProps={{ 'data-xgc-role': 'host-network-search','data-xgc-id': activeView }}
                  className="xgc-host-runtime-search" icon={<Search size={14} aria-hidden="true" />}
                  value={query} onValueChange={(value) => setQueries((current) => ({ ...current,[activeView]:value }))}
                  placeholder={networkSearchPlaceholder(activeView,t)} type="search" />
              )}
            </Toolbar>
            {visitedViews.map((view) => (
              <div key={view} hidden={view !== activeView} inert={view !== activeView || undefined}
                className="xgc-host-network-view-surface"
                data-xgc-role="host-network-view-surface" data-xgc-id={view}>
                <NetworkView view={view} query={queries[view] ?? ''} snapshot={network.items}
                  onInspectProcess={context.onInspectRuntimeProcess}
                  profileRole={context.managedHostId ? 'agent-egress' : 'core-router'}
                  actionsEnabled={context.actionsEnabled} targetCoreId={context.targetCoreId} />
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  );
}

function NetworkView({
  view,
  query,
  snapshot,
  onInspectProcess,
  profileRole,
  actionsEnabled,
  targetCoreId,
}: {
  view: HostNetworkView;
  query: string;
  snapshot: HostNetworkSnapshot;
  onInspectProcess: HostSystemLeafProps<'Network'>['onInspectRuntimeProcess'];
  profileRole: 'core-router' | 'agent-egress';
  actionsEnabled: boolean;
  targetCoreId?: string;
}) {
  switch (view) {
  case 'profiles':
    return (
      <NetworkProfileEditor
        role={profileRole}
        interfaces={snapshot.interfaces}
        actionsEnabled={actionsEnabled}
        targetCoreId={targetCoreId}
      />
    );
  case 'path':
    return <NetworkPathCheck snapshot={snapshot} target={query} />;
  case 'routes':
    return <RouteTable routes={filterRoutes(snapshot.routes,query)} />;
  case 'listeners':
    return <ListenerTable listeners={filterListeners(snapshot.listeners,query)} />;
  case 'remote-access':
    return (
      <RemoteAccessTable
        endpoints={filterRemoteAccess(snapshot.diagnostics.remoteAccess,query)}
        onInspectProcess={onInspectProcess}
      />
    );
  case 'health':
  default:
    return <NetworkHealth snapshot={snapshot} interfaces={filterInterfaces(snapshot.interfaces,query)} />;
  }
}

function NetworkPathCheck({ snapshot,target }: { snapshot: HostNetworkSnapshot;target: string }) {
  const checks = hostNetworkPathChecks(snapshot,target);
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-network-path-check" data-xgc-id="host-network-path-check">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-network-path-check"
        columns={[
          { id: 'check',header: 'Check',cell: (check) => <strong>{check.label}</strong> },
          { id: 'result',header: 'Result',cell: (check) => <em>{check.value}</em> },
          { id: 'detail',header: 'Observed path',cell: (check) => check.detail },
        ]}
        emptyMessage="Enter a URL, hostname, or IP in the filter above."
        getRowProps={(check) => ({ 'data-xgc-role': 'host-network-path-row','data-xgc-id': check.id,'data-xgc-tone': check.tone })}
        rowKey={(check) => check.id}
        rows={checks}
      />
    </div>
  );
}

function NetworkHealth({
  snapshot,
  interfaces,
}: {
  snapshot: HostNetworkSnapshot;
  interfaces: HostNetworkInterface[];
}) {
  const checks = hostNetworkHealthChecks(snapshot);
  return (
    <div className="xgc-host-network-health" data-xgc-role="host-network-health" data-xgc-id="host-network-health">
      <div className="xgc-host-network-health-grid">
        {checks.map((check) => (
          <StatCard
            label={check.label}
            value={<StatusText
              status={check.tone}
              tone={check.tone === 'critical' ? 'danger' : check.tone === 'warning' ? 'warning' : 'neutral'}
            >{check.value}</StatusText>}
            detail={check.detail}
            data-xgc-role="host-network-health-check"
            data-xgc-id={check.id}
            key={check.id}
          />
        ))}
      </div>
      <InterfaceTable
        interfaces={interfaces}
        routes={snapshot.routes}
        assignments={snapshot.diagnostics.assignments}
      />
    </div>
  );
}

function InterfaceTable({
  interfaces,
  routes,
  assignments,
}: {
  interfaces: HostNetworkInterface[];
  routes: HostNetworkRoute[];
  assignments: HostNetworkSnapshot['diagnostics']['assignments'];
}) {
  const rows = interfaces.map((iface) => ({
    iface,
    assignment: assignments.find((item) => item.interfaceName === iface.name),
    route: routes
      .filter((item) => item.prefixLength === 0 && item.interfaceName === iface.name)
      .sort((left,right) => left.metric - right.metric)[0],
  }));
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-interface-table" data-xgc-id="host-interface-table">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-interface-table"
        columns={[
          { id: 'interface',header: 'Interface',cell: ({ iface }) => <strong>{iface.name}</strong> },
          { id: 'state',header: 'State',cell: ({ iface }) => <em data-xgc-up={iface.up ? 'true' : 'false'}>{iface.up ? 'up' : 'down'}</em> },
          { id: 'address',header: 'Address / mode',cell: ({ iface,assignment }) => <span title={assignment?.source || 'Assignment source unavailable'}>{iface.address || '—'} · {assignment?.mode || 'unknown'}</span> },
          { id: 'gateway',header: 'Gateway',cell: ({ route }) => route?.gateway && route.gateway !== '0.0.0.0' ? route.gateway : route ? 'direct' : '—' },
          { id: 'rx',header: 'RX errors',cell: ({ iface }) => <em data-xgc-errors={iface.rxErrors > 0 ? 'true' : undefined}>{iface.rxErrors}</em> },
          { id: 'tx',header: 'TX errors',cell: ({ iface }) => <em data-xgc-errors={iface.txErrors > 0 ? 'true' : undefined}>{iface.txErrors}</em> },
          { id: 'mtu',header: 'MTU',cell: ({ iface }) => iface.mtu || '—' },
        ]}
        getRowProps={({ iface }) => ({ 'data-xgc-role': 'host-interface-row','data-xgc-id': iface.name })}
        rowKey={({ iface }) => iface.name}
        rows={rows}
      />
    </div>
  );
}

function RouteTable({ routes }: { routes: HostNetworkRoute[] }) {
  const rows = routes.map((route,index) => ({ route,index }));
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-route-table" data-xgc-id="host-route-table">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-route-table"
        columns={[
          { id: 'destination',header: 'Destination',cell: ({ route }) => <strong>{route.destination}/{route.prefixLength}</strong> },
          { id: 'gateway',header: 'Gateway',cell: ({ route }) => route.gateway === '0.0.0.0' || route.gateway === '::' ? 'direct' : route.gateway || 'direct' },
          { id: 'interface',header: 'Interface',cell: ({ route }) => <em>{route.interfaceName || '—'}</em> },
          { id: 'metric',header: 'Metric',cell: ({ route }) => route.metric },
          { id: 'table',header: 'Table',cell: ({ route }) => <em>{route.table || 'main'}</em> },
        ]}
        getRowProps={({ route }) => ({ 'data-xgc-role': 'host-route-row','data-xgc-id': `${route.destination}/${route.prefixLength}` })}
        rowKey={({ route,index }) => `${route.table}-${route.destination}-${route.prefixLength}-${route.interfaceName}-${index}`}
        rows={rows}
      />
    </div>
  );
}

function ListenerTable({ listeners }: { listeners: HostListeningPort[] }) {
  const rows = listeners.map((port,index) => ({ port,index }));
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-port-table" data-xgc-id="host-port-table">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-port-table"
        columns={[
          { id: 'type',header: 'Type',cell: ({ port }) => port.type || port.protocol },
          { id: 'pid',header: 'PID',cell: ({ port }) => <em>{port.pid || '—'}</em> },
          { id: 'process',header: 'Process',cell: ({ port }) => <em>{port.process || '—'}</em> },
          { id: 'local',header: 'Local address / port',cell: ({ port }) => <strong>{port.local}</strong> },
          { id: 'remote',header: 'Remote address / port',cell: ({ port }) => <strong>{port.remote || '—'}</strong> },
          { id: 'state',header: 'Status',cell: ({ port }) => <em>{port.state || '—'}</em> },
        ]}
        getRowProps={({ port,index }) => ({
          'data-xgc-role': 'host-port-row',
          'data-xgc-id': `${port.type}-${port.local}-${port.remote}-${index}`,
        })}
        rowKey={({ port,index }) => `${port.type}-${port.local}-${port.remote}-${index}`}
        rows={rows}
      />
    </div>
  );
}

function RemoteAccessTable({
  endpoints,
  onInspectProcess,
}: {
  endpoints: HostRemoteAccessEndpoint[];
  onInspectProcess: HostSystemLeafProps<'Network'>['onInspectRuntimeProcess'];
}) {
  const rows = endpoints.map((endpoint,index) => ({ endpoint,index }));
  return (
    <div className="xgc-host-runtime-list-wrap" data-xgc-role="host-remote-access-table" data-xgc-id="host-remote-access-table">
      <SortableDataTable
        className="xgc-host-runtime-list"
        bodyScroll
        data-xgc-id="host-remote-access-table"
        columns={[
          { id: 'access',header: 'Access',cell: ({ endpoint }) => <strong title={endpoint.detectedBy}>{remoteAccessLabel(endpoint)}</strong> },
          { id: 'state',header: 'State',cell: ({ endpoint }) => <em>{endpoint.state}</em> },
          { id: 'source',header: 'User / source',cell: ({ endpoint }) => <span title={endpoint.remoteAddress || undefined}>{endpoint.user || '—'} · {endpoint.remoteAddress || 'listener'}</span> },
          { id: 'process',header: 'PID / process',cell: ({ endpoint }) => <span>{endpoint.pid || '—'} · {endpoint.processName || 'unknown'}</span> },
          { id: 'cpu',header: 'CPU',cell: ({ endpoint }) => <strong>{endpoint.cpuPercent.toFixed(2)}%</strong> },
          { id: 'memory',header: 'Memory',cell: ({ endpoint }) => <strong>{formatBytes(endpoint.memoryBytes)}</strong> },
          { id: 'tree',header: 'Tree',cell: ({ endpoint }) => <em>{endpoint.processCount || '—'}</em> },
          { id: 'since',header: 'Since',cell: ({ endpoint }) => <em>{endpoint.startedAt ? formatDateTime(endpoint.startedAt) : '—'}</em> },
          { id: 'operations',header: 'Operations',cell: ({ endpoint,index }) => <div className="xgc-host-remote-access-ops"><ControlButton
                size="compact"
                disabled={!onInspectProcess || endpoint.pid <= 0}
                dataXgcRole="host-remote-access-inspect" dataXgcId={`${endpoint.kind}-${endpoint.state}-${endpoint.pid}-${endpoint.remoteAddress}-${index}`}
                onClick={() => onInspectProcess?.({
                  pid: endpoint.pid,
                  name: endpoint.processName,
                  metric: 'cpu',
                })}
              >Inspect</ControlButton></div> },
        ]}
        getRowProps={({ endpoint,index }) => ({
          'data-xgc-role': 'host-remote-access-row',
          'data-xgc-id': `${endpoint.kind}-${endpoint.pid}-${index}`,
          'data-xgc-state': endpoint.state,
        })}
        rowKey={({ endpoint,index }) => `${endpoint.kind}-${endpoint.state}-${endpoint.pid}-${endpoint.remoteAddress}-${index}`}
        rows={rows}
      />
    </div>
  );
}

function filterInterfaces(interfaces: HostNetworkInterface[],query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return interfaces;
  return interfaces.filter((iface) => [iface.name,iface.address,iface.macAddress,...iface.addresses.map((item) => item.address)]
    .some((value) => (value ?? '').toLowerCase().includes(normalized)));
}

function filterRoutes(routes: HostNetworkRoute[],query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return routes;
  return routes.filter((route) => [route.destination,route.gateway,route.interfaceName,route.table,String(route.metric)]
    .some((value) => value.toLowerCase().includes(normalized)));
}

function filterListeners(listeners: HostListeningPort[],query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return listeners;
  return listeners.filter((port) => [String(port.pid),port.local,port.remote,port.protocol,port.process,port.state]
    .some((value) => value.toLowerCase().includes(normalized)));
}

function filterRemoteAccess(endpoints: HostRemoteAccessEndpoint[],query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return endpoints;
  return endpoints.filter((endpoint) => [
    remoteAccessLabel(endpoint),endpoint.state,endpoint.user,endpoint.remoteAddress,
    endpoint.processName,String(endpoint.pid),
  ].some((value) => value.toLowerCase().includes(normalized)));
}

function networkSearchPlaceholder(view: HostNetworkView,t: ReturnType<typeof useHostText>) {
  switch (view) {
  case 'path': return t('Enter URL, hostname, or IP');
  case 'routes': return t('Search route, gateway, interface');
  case 'listeners': return t('Search PID, process, port');
  case 'remote-access': return t('Search user, source, process');
  case 'profiles': return '';
  case 'health':
  default: return t('Search interface or address');
  }
}
