import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import type { HostListeningPort,HostNetworkInterface,HostProcess } from './hostModel';

type ManagedListeningSocket = {
  protocol: string;
  localAddress: string;
  localPort: number;
  pid: number;
  processName: string;
  state: string;
};

type ManagedNetworkInterface = {
  name: string;
  macAddress?: string;
  up: boolean;
  mtu?: number;
  addresses?: Array<{ address?: string;prefixLength?: number;family?: string }>;
  counters?: {
    rxBytes?: number;
    txBytes?: number;
    rxPackets?: number;
    txPackets?: number;
    rxErrors?: number;
    txErrors?: number;
  };
};

type ManagedProcessPage = {
  processes: Array<{
    identity: { pid: number;startTicks: number };
    name: string;
    user: string;
    state: string;
    ppid: number;
    cpuPercent: number;
    memoryBytes: number;
    command: string;
  }>;
  nextPageToken: string;
};

const DEFAULT_PROCESS_PAGE = 200;
const MAX_PROCESS_PAGES = 16;

export function getHostListeningPorts(options?: ApiTargetOptions): Promise<HostListeningPort[]> {
  if (options?.managedHostId) {
    return request<ManagedListeningSocket[]>(
      `/managed-hosts/${segment(options.managedHostId)}/network/listening-sockets`,
      undefined,
      withTerminalAuth(options),
    ).then((sockets) => sockets.map(managedSocketToListeningPort));
  }
  return request<HostListeningPort[]>('/host/processes/listening',undefined,withTerminalAuth(options));
}

export function getHostNetworkInterfaces(options?: ApiTargetOptions): Promise<HostNetworkInterface[]> {
  if (options?.managedHostId) {
    return request<ManagedNetworkInterface[]>(
      `/managed-hosts/${segment(options.managedHostId)}/network/interfaces`,
      undefined,
      withTerminalAuth(options),
    ).then((items) => (Array.isArray(items) ? items.map(managedInterfaceToStat) : []));
  }
  return request<ManagedNetworkInterface[]>('/host/network/interfaces',undefined,withTerminalAuth(options))
    .then((items) => (Array.isArray(items) ? items.map(managedInterfaceToStat) : []));
}

export function getHostProcesses(
  options?: ApiTargetOptions & { pageToken?: string;pageSize?: number;allPages?: boolean },
): Promise<HostProcess[]> {
  if (!options?.managedHostId) {
    return request<HostProcess[]>('/host/processes',undefined,withTerminalAuth(options));
  }
  if (options.allPages) return listAllManagedProcesses(options);
  return request<ManagedProcessPage>(
    `/managed-hosts/${segment(options.managedHostId)}/processes${queryString({
      pageToken: options.pageToken,
      pageSize: options.pageSize ?? DEFAULT_PROCESS_PAGE,
    })}`,
    undefined,
    withTerminalAuth(options),
  ).then((page) => (page.processes ?? []).map(managedProcessToHostProcess));
}

async function listAllManagedProcesses(
  options: ApiTargetOptions & { pageSize?: number },
): Promise<HostProcess[]> {
  const pageSize = options.pageSize ?? DEFAULT_PROCESS_PAGE;
  const all: HostProcess[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PROCESS_PAGES; page += 1) {
    const result = await request<ManagedProcessPage>(
      `/managed-hosts/${segment(options.managedHostId!)}/processes${queryString({ pageToken,pageSize })}`,
      undefined,
      withTerminalAuth(options),
    );
    const batch = (result.processes ?? []).map(managedProcessToHostProcess);
    all.push(...batch);
    const next = (result.nextPageToken || '').trim();
    if (!next || batch.length === 0) break;
    pageToken = next;
  }
  return all;
}

function managedInterfaceToStat(iface: ManagedNetworkInterface): HostNetworkInterface {
  const counters = iface.counters ?? {};
  const addresses = Array.isArray(iface.addresses) ? iface.addresses : [];
  const primary = addresses.find((entry) => entry.address && !entry.address.includes(':'))
    ?? addresses.find((entry) => entry.address);
  return {
    name: iface.name || 'unknown',
    up: Boolean(iface.up),
    rxBytes: Number(counters.rxBytes) || 0,
    txBytes: Number(counters.txBytes) || 0,
    address: primary?.address || '',
    macAddress: iface.macAddress || '',
    mtu: Number(iface.mtu) || 0,
    addresses: addresses.map((entry) => ({
      address: entry.address || '',
      prefixLength: Number(entry.prefixLength) || 0,
      family: entry.family || '',
    })).filter((entry) => entry.address !== ''),
    rxPackets: Number(counters.rxPackets) || 0,
    txPackets: Number(counters.txPackets) || 0,
    rxErrors: Number(counters.rxErrors) || 0,
    txErrors: Number(counters.txErrors) || 0,
  };
}

function managedSocketToListeningPort(socket: ManagedListeningSocket): HostListeningPort {
  return {
    type: socket.protocol,
    protocol: socket.protocol,
    pid: socket.pid,
    process: socket.processName,
    local: `${socket.localAddress || '*'}:${socket.localPort}`,
    remote: '',
    state: socket.state,
  };
}

function managedProcessToHostProcess(process: ManagedProcessPage['processes'][number]): HostProcess {
  return {
    pid: process.identity.pid,
    startTicks: process.identity.startTicks,
    name: process.name,
    ppid: process.ppid,
    threads: 0,
    user: process.user,
    cpuPercent: process.cpuPercent,
    state: process.state,
    cpuTime: '',
    memory: process.memoryBytes,
    connections: 0,
    startTime: '',
    command: process.command,
  };
}
