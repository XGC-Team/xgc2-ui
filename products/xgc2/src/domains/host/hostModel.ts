/** One host NIC snapshot for Overview (compatible Core aggregate / Agent interface list). */
export type HostNetworkIfaceStat = {
  name: string;
  up: boolean;
  rxBytes: number;
  txBytes: number;
  /** Current receive rate derived from two consecutive counter samples. */
  rxRateBytesPerSecond?: number;
  /** Current transmit rate derived from two consecutive counter samples. */
  txRateBytesPerSecond?: number;
  /** Primary IPv4/IPv6 for display; may be empty. */
  address?: string;
};

/** Compact process row used by Overview top-N tables. */
export type HostOverviewProcessStat = {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  /** Best-effort connection/socket pressure; 0 when unavailable. */
  connections: number;
};

export type HostOverview = {
  hostname: string;
  /** Human distribution string when known (e.g. "Ubuntu 20.04.6 LTS"); may equal OS family. */
  distro: string;
  /** OS family token (linux/darwin/…) or full pretty OS from Core. */
  os: string;
  arch: string;
  kernel: string;
  uptime: string;
  loadAverage: string;
  cpu: string;
  /** Logical CPU count for load-average normalization (0/undefined → treat as 1). */
  cpuCount?: number;
  memory: { totalBytes: number; availableBytes: number; usedBytes: number; usedPercent: number };
  disk: { path: string; totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; filesystem: string; mountOptions: string };
  io: {
    diskReadBytes: number;
    diskWriteBytes: number;
    networkRxBytes: number;
    networkTxBytes: number;
    diskDeviceCount: number;
    networkIfaceCount: number;
    networkRxRateBytesPerSecond?: number;
    networkTxRateBytesPerSecond?: number;
  };
  /** Per-interface counters when the target exposes them (Agent Network leaf). */
  networkInterfaces: HostNetworkIfaceStat[];
  /** Top CPU consumers among userspace processes (kernel threads filtered). */
  topCpuProcesses: HostOverviewProcessStat[];
  /** Top RSS consumers among userspace processes. */
  topMemoryProcesses: HostOverviewProcessStat[];
  /** Top network/socket pressure processes (best-effort). */
  topNetworkProcesses: HostOverviewProcessStat[];
  collectedAt: string;
  commands: Record<string, boolean>;
};

export type HostFileInfo = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string;
  user: string;
  group: string;
  uid: string;
  gid: string;
  modTime: string;
  isSymlink: boolean;
  linkTarget?: string;
  canEdit: boolean;
  canDownload: boolean;
};

export type HostFileList = {
  path: string;
  parent: string;
  entries: HostFileInfo[];
};

export type HostFileContent = {
  path: string;
  content: string;
  size: number;
};

export type HostRecycleItem = {
  id: string;
  name: string;
  originalPath: string;
  recyclePath: string;
  isDir: boolean;
  size: number;
  deletedAt: string;
};

export type HostProcess = {
  pid: number;
  /** Required for remote Agent process identity revalidation. */
  startTicks?: number;
  name: string;
  ppid: number;
  threads: number;
  user: string;
  cpuPercent: number;
  state: string;
  cpuTime: string;
  memory: number;
  connections: number;
  startTime: string;
  command: string;
};

export type HostListeningPort = {
  type: string;
  protocol: string;
  pid: number;
  process: string;
  local: string;
  remote: string;
  state: string;
};

export type HostNetworkInterface = HostNetworkIfaceStat & {
  macAddress: string;
  mtu: number;
  addresses: Array<{ address: string;prefixLength: number;family: string }>;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
};

export type HostNetworkRoute = {
  destination: string;
  prefixLength: number;
  gateway: string;
  interfaceName: string;
  metric: number;
  table: string;
};

export type HostAddressAssignment = {
  interfaceName: string;
  address: string;
  mode: 'unknown' | 'static' | 'dynamic';
  source: string;
};

export type HostRemoteAccessEndpoint = {
  kind: 'ssh' | 'rdp' | 'vnc' | 'remoteDesktop';
  state: 'listening' | 'active';
  protocol: string;
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  pid: number;
  processStartTicks: number;
  processName: string;
  user: string;
  cpuPercent: number;
  memoryBytes: number;
  processCount: number;
  startedAt: string;
  detectedBy: string;
};

export type HostNetworkDiagnostics = {
  dns: {
    nameServers: string[];
    searchDomains: string[];
    options: string[];
    source: string;
  };
  proxy: {
    httpProxy: string;
    httpsProxy: string;
    allProxy: string;
    noProxy: string[];
    source: string;
  };
  assignments: HostAddressAssignment[];
  remoteAccess: HostRemoteAccessEndpoint[];
  collectedAt: string;
};

export type HostNetworkSnapshot = {
  interfaces: HostNetworkInterface[];
  routes: HostNetworkRoute[];
  listeners: HostListeningPort[];
  diagnostics: HostNetworkDiagnostics;
};

export type HostSSHInfo = {
  exists: boolean;
  active: boolean;
  autoStart: boolean;
  serviceName: string;
  configPath: string;
  port: string;
  listenAddress: string;
  passwordAuthentication: string;
  pubkeyAuthentication: string;
  permitRootLogin: string;
  useDNS: string;
  raw: Record<string, string>;
  /** Remote typed config path is not a Files-backed full document. */
  remoteTyped?: boolean;
};

export type HostFirewallStatus = {
  enabled: boolean;
  backend: string;
  exists?: boolean;
  active?: boolean;
  name?: string;
  output?: string;
};

export type HostFirewallRule = {
  id: string;
  direction: string;
  protocol: string;
  port: number;
  source: string;
  action: string;
  description: string;
};

export type HostLogSource = {
  id: string;
  path: string;
  size: number;
  modTime: string;
};

export type HostLogChunk = {
  sourceId: string;
  content: string;
  nextOffset: number;
};
