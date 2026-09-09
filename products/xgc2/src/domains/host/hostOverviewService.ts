import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';
import { formatUptime } from './hostFormatting';
import type {
  HostListeningPort,
  HostNetworkIfaceStat,
  HostOverview,
  HostOverviewProcessStat,
  HostProcess,
} from './hostModel';
import { getHostNetworkInterfaces,getHostListeningPorts,getHostProcesses } from './hostTelemetryService';

type ManagedHostOverview = {
  hostId: string;
  hostname: string;
  os: string;
  arch: string;
  cpuCount: number;
  load1: number;
  load5: number;
  load15: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  uptimeSeconds: number;
  collectedAt: string;
  kernel: string;
  rootDiskTotalBytes: number;
  rootDiskAvailableBytes: number;
};

const TOP_N = 5;

/**
 * Load Overview for Core (local /host/overview) or Agent (managed overview),
 * then best-effort enrich with Network interfaces + process tops.
 * Enrichment failures never fail the whole Overview — fields stay empty/zero.
 */
export async function getHostOverview(options?: ApiTargetOptions): Promise<HostOverview> {
  const base = options?.managedHostId
    ? await request<ManagedHostOverview>(
      `/managed-hosts/${segment(options.managedHostId)}/overview`,
      undefined,
      withTerminalAuth(options),
    ).then(managedOverviewToHostOverview)
    : await request<HostOverview>('/host/overview',undefined,withTerminalAuth(options)).then(normalizeLocalOverview);

  const [interfaces,processes,ports] = await Promise.all([
    getHostNetworkInterfaces(options).catch(() => [] as HostNetworkIfaceStat[]),
    // Agent process pages are PID-ordered; first page is mostly kernel threads.
    // Walk all pages for Overview tops so we rank real userspace workloads.
    getHostProcesses({ ...options,pageSize: 200,allPages: Boolean(options?.managedHostId) })
      .catch(() => [] as HostProcess[]),
    getHostListeningPorts(options).catch(() => [] as HostListeningPort[]),
  ]);

  return enrichOverview(base,interfaces,processes,ports);
}

function normalizeLocalOverview(overview: HostOverview): HostOverview {
  const os = String(overview.os ?? '').trim();
  const arch = String((overview as { arch?: string }).arch ?? '').trim();
  return {
    ...overview,
    distro: overview.distro || prettyDistro(os,arch,overview.kernel),
    os: os || 'linux',
    arch,
    uptime: formatUptime(overview.uptime),
    networkInterfaces: overview.networkInterfaces ?? [],
    topCpuProcesses: overview.topCpuProcesses ?? [],
    topMemoryProcesses: overview.topMemoryProcesses ?? [],
    topNetworkProcesses: overview.topNetworkProcesses ?? [],
    io: overview.io ?? emptyIo(),
    commands: overview.commands ?? {},
  };
}

function managedOverviewToHostOverview(overview: ManagedHostOverview): HostOverview {
  const freeMemory = overview.availableMemoryBytes;
  const usedBytes = Math.max(0,overview.totalMemoryBytes - freeMemory);
  const usedPercent = overview.totalMemoryBytes > 0
    ? (usedBytes / overview.totalMemoryBytes) * 100
    : 0;
  const diskTotal = overview.rootDiskTotalBytes;
  const diskFree = overview.rootDiskAvailableBytes;
  const diskUsed = Math.max(0,diskTotal - diskFree);
  const os = String(overview.os ?? '').trim() || 'linux';
  const arch = String(overview.arch ?? '').trim();
  return {
    hostname: overview.hostname,
    distro: prettyDistro(os,arch,overview.kernel),
    os,
    arch,
    kernel: overview.kernel,
    uptime: formatUptime(overview.uptimeSeconds),
    loadAverage: [overview.load1,overview.load5,overview.load15]
      .map((value) => Number(value || 0).toFixed(2))
      .join(' '),
    cpu: `${overview.cpuCount} CPUs`,
    cpuCount: overview.cpuCount,
    memory: {
      totalBytes: overview.totalMemoryBytes,
      availableBytes: freeMemory,
      usedBytes,
      usedPercent,
    },
    disk: {
      path: '/',
      totalBytes: diskTotal,
      freeBytes: diskFree,
      usedBytes: diskUsed,
      usedPercent: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
      filesystem: 'root',
      mountOptions: '',
    },
    io: emptyIo(),
    networkInterfaces: [],
    topCpuProcesses: [],
    topMemoryProcesses: [],
    topNetworkProcesses: [],
    collectedAt: overview.collectedAt,
    commands: {},
  };
}

function enrichOverview(
  base: HostOverview,
  interfaces: HostNetworkIfaceStat[],
  processes: HostProcess[],
  ports: HostListeningPort[],
): HostOverview {
  const sourceIfaces = interfaces.length > 0 ? interfaces : (base.networkInterfaces ?? []);
  const usableIfaces = sourceIfaces.filter((iface) => iface.name && iface.name !== 'lo');
  let io = { ...base.io };
  if (usableIfaces.length > 0) {
    const rx = usableIfaces.reduce((sum,iface) => sum + (iface.rxBytes || 0),0);
    const tx = usableIfaces.reduce((sum,iface) => sum + (iface.txBytes || 0),0);
    io = {
      ...io,
      networkRxBytes: rx,
      networkTxBytes: tx,
      networkIfaceCount: usableIfaces.length,
    };
  }

  // Userspace only — kernel threads dominate low PIDs / lifetime CPU share noise.
  const userspace = processes.filter((process) => process && !isKernelLikeProcess(process));
  const byPid = new Map<number,HostProcess>();
  for (const process of userspace) {
    if (process.pid) byPid.set(process.pid,process);
  }

  const topCpuProcesses = [...userspace]
    .sort((a,b) => (b.cpuPercent || 0) - (a.cpuPercent || 0) || (b.memory || 0) - (a.memory || 0))
    .slice(0,TOP_N)
    .map(processToOverviewStat);

  const topMemoryProcesses = [...userspace]
    .filter((process) => (process.memory || 0) > 0)
    .sort((a,b) => (b.memory || 0) - (a.memory || 0))
    .slice(0,TOP_N)
    .map(processToOverviewStat);

  // Best-effort network pressure: process.connection counts or listening-socket fan-in.
  const byKey = new Map<string,HostOverviewProcessStat>();
  for (const process of userspace) {
    const connections = Number(process.connections) || 0;
    if (connections <= 0) continue;
    const key = process.pid ? `pid:${process.pid}` : `name:${process.name}`;
    byKey.set(key,processToOverviewStat(process));
    byKey.get(key)!.connections = connections;
  }
  for (const port of ports) {
    const pid = Number(port.pid) || 0;
    const name = (port.process || '').trim() || (pid ? `pid-${pid}` : 'unknown');
    if (!pid && name === 'unknown') continue;
    const key = pid ? `pid:${pid}` : `name:${name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.connections += 1;
    } else {
      const process = (pid && byPid.get(pid))
        || userspace.find((item) => item.name === name);
      byKey.set(key,{
        pid,
        name: process?.name || name,
        cpuPercent: process?.cpuPercent || 0,
        memoryBytes: process?.memory || 0,
        connections: 1,
      });
    }
  }
  const topNetworkProcesses = [...byKey.values()]
    .sort((a,b) => b.connections - a.connections || b.memoryBytes - a.memoryBytes)
    .slice(0,TOP_N);

  // Prefer non-lo interfaces sorted by total traffic for display.
  const networkInterfaces = [...usableIfaces]
    .sort((a,b) => (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes));

  return {
    ...base,
    io,
    networkInterfaces,
    topCpuProcesses,
    topMemoryProcesses,
    topNetworkProcesses,
  };
}

/**
 * Drop Linux kernel threads / softirqs so Overview tops show real workloads.
 * Agent pages are PID-ordered; low PIDs are almost all kthreadd children.
 */
export function isKernelLikeProcess(process: HostProcess): boolean {
  const pid = Number(process.pid) || 0;
  const ppid = Number(process.ppid) || 0;
  if (pid === 2 || ppid === 2) return true;
  const name = (process.name || '').trim();
  if (!name) return true;
  if (name.startsWith('[') && name.endsWith(']')) return true;
  if (/^(kworker|ksoftirqd|ktimers|kthreadd|kswapd|khungtaskd|kauditd|kintegrityd|kblockd|kdevtmpfs|kstrp|khugepaged|ksmd|kcompactd|migration\/|cpuhp\/|rcu_|rcuc\/|idle_inject|irq\/|scsi_eh|scsi_tmf|jbd2\/|ext4-|loop[0-9]|nvgpu|nvhost|tegra-|dcs-write|crtc_)/i.test(name)) {
    return true;
  }
  const cmd = (process.command || '').trim();
  const mem = Number(process.memory) || 0;
  // Pure kernel threads: no userspace cmdline and no RSS.
  if (mem === 0 && (!cmd || cmd === name) && ppid <= 2) return true;
  return false;
}

function processToOverviewStat(process: HostProcess): HostOverviewProcessStat {
  return {
    pid: process.pid || 0,
    name: process.name || 'process',
    cpuPercent: process.cpuPercent || 0,
    memoryBytes: process.memory || 0,
    connections: process.connections || 0,
  };
}

function emptyIo(): HostOverview['io'] {
  return {
    diskReadBytes: 0,
    diskWriteBytes: 0,
    networkRxBytes: 0,
    networkTxBytes: 0,
    diskDeviceCount: 0,
    networkIfaceCount: 0,
  };
}

/**
 * Prefer pretty distro strings already provided by Core.
 * Agent often reports GOOS ("linux") only — surface a clear Linux + arch label.
 */
export function prettyDistro(os: string,arch: string,kernel?: string) {
  const family = (os || '').trim();
  const cpu = (arch || '').trim();
  if (!family) {
    return cpu ? `Linux · ${cpu}` : 'Linux';
  }
  // Core returns pretty names like "Ubuntu 20.04.6 LTS".
  if (/[A-Z]/.test(family[0]!) || /\d/.test(family) || family.includes(' ')) {
    return cpu ? `${family} · ${cpu}` : family;
  }
  const prettyFamily = family.toLowerCase() === 'linux'
    ? 'Linux'
    : family.charAt(0).toUpperCase() + family.slice(1);
  if (cpu) return `${prettyFamily} · ${cpu}`;
  if (kernel) return `${prettyFamily} (${kernel})`;
  return prettyFamily;
}
