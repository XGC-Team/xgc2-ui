import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';
import type {
  HostNetworkDiagnostics,
  HostNetworkRoute,
  HostNetworkSnapshot,
} from './hostModel';
import { getHostListeningPorts,getHostNetworkInterfaces } from './hostTelemetryService';

type NetworkDiagnosticsWire = Omit<
  Partial<HostNetworkDiagnostics>,
  'dns' | 'proxy' | 'assignments' | 'remoteAccess'
> & {
  dns?: Partial<HostNetworkDiagnostics['dns']> | null;
  proxy?: Partial<HostNetworkDiagnostics['proxy']> | null;
  assignments?: HostNetworkDiagnostics['assignments'] | null;
  remoteAccess?: HostNetworkDiagnostics['remoteAccess'] | null;
};

export function getHostNetworkRoutes(options?: ApiTargetOptions): Promise<HostNetworkRoute[]> {
  if (options?.managedHostId) {
    return request<HostNetworkRoute[]>(
      `/managed-hosts/${segment(options.managedHostId)}/network/routes`,
      undefined,
      withTerminalAuth(options),
    ).then((routes) => Array.isArray(routes) ? routes : []);
  }
  return request<HostNetworkRoute[]>('/host/network/routes',undefined,withTerminalAuth(options))
    .then((routes) => Array.isArray(routes) ? routes : []);
}

export function getHostNetworkDiagnostics(options?: ApiTargetOptions): Promise<HostNetworkDiagnostics> {
  if (options?.managedHostId) {
    return request<NetworkDiagnosticsWire>(
      `/managed-hosts/${segment(options.managedHostId)}/network/diagnostics`,
      undefined,
      withTerminalAuth(options),
    ).then(normalizeNetworkDiagnostics);
  }
  return request<NetworkDiagnosticsWire>('/host/network/diagnostics',undefined,withTerminalAuth(options))
    .then(normalizeNetworkDiagnostics);
}

export async function getHostNetworkSnapshot(options?: ApiTargetOptions): Promise<HostNetworkSnapshot> {
  const [interfaces,routes,listeners,diagnostics] = await Promise.all([
    getHostNetworkInterfaces(options),
    getHostNetworkRoutes(options),
    getHostListeningPorts(options),
    getHostNetworkDiagnostics(options),
  ]);
  return { interfaces,routes,listeners,diagnostics };
}

function normalizeNetworkDiagnostics(value: NetworkDiagnosticsWire | null | undefined): HostNetworkDiagnostics {
  const dns = value?.dns ?? {};
  const proxy = value?.proxy ?? {};
  return {
    dns: {
      nameServers: stringArray(dns.nameServers),
      searchDomains: stringArray(dns.searchDomains),
      options: stringArray(dns.options),
      source: typeof dns.source === 'string' ? dns.source : '',
    },
    proxy: {
      httpProxy: typeof proxy.httpProxy === 'string' ? proxy.httpProxy : '',
      httpsProxy: typeof proxy.httpsProxy === 'string' ? proxy.httpsProxy : '',
      allProxy: typeof proxy.allProxy === 'string' ? proxy.allProxy : '',
      noProxy: stringArray(proxy.noProxy),
      source: typeof proxy.source === 'string' ? proxy.source : '',
    },
    assignments: Array.isArray(value?.assignments) ? value.assignments : [],
    remoteAccess: Array.isArray(value?.remoteAccess)
      ? value.remoteAccess.map((endpoint) => ({
        ...endpoint,
        protocol: endpoint.protocol || '',
        localAddress: endpoint.localAddress || '',
        localPort: Number(endpoint.localPort) || 0,
        remoteAddress: endpoint.remoteAddress || '',
        remotePort: Number(endpoint.remotePort) || 0,
        pid: Number(endpoint.pid) || 0,
        processStartTicks: Number(endpoint.processStartTicks) || 0,
        processName: endpoint.processName || '',
        user: endpoint.user || '',
        cpuPercent: Number(endpoint.cpuPercent) || 0,
        memoryBytes: Number(endpoint.memoryBytes) || 0,
        processCount: Number(endpoint.processCount) || 0,
        startedAt: endpoint.startedAt || '',
        detectedBy: endpoint.detectedBy || '',
      }))
      : [],
    collectedAt: typeof value?.collectedAt === 'string' ? value.collectedAt : '',
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
