import type {
  DockerComposeProject,
  DockerContainerInfo,
  DockerNetworkCreateRequest,
  DockerNetworkInfo,
  DockerNetworkKV,
  DockerVolumeInfo,
} from './containerModel';

export const containerStateFilters = [
  'all',
  'running',
  'exited',
  'paused',
  'restarting',
  'dead',
] as const;

export type ContainerStateFilter = (typeof containerStateFilters)[number];

export function containerStateLabel(state: string): string {
  if (!state) return 'Unknown';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function containerStateFilterLabel(state: ContainerStateFilter): string {
  if (state === 'all') return 'All';
  return containerStateLabel(state);
}

/** Docker compose `ps` status may be "running(1)", "exited(2)", etc. */
export function composeProjectIsRunning(status: string): boolean {
  return /^\s*running\b/i.test(status.trim());
}

/** Normalize status for theme tokens (running(1) → running). */
export function containerStatusToken(status: string): string {
  const value = status.trim().toLowerCase();
  if (!value) return 'unknown';
  const head = value.match(/^[a-z]+/)?.[0];
  return head || value;
}

export type ContainerDraft = {
  name: string;
  image: string;
  ports: string;
  env: string;
  volumes: string;
  command: string;
  restartPolicy: string;
  privileged: boolean;
};

export type ComposeDraft = {
  name: string;
  path: string;
  file: string;
  env: string;
  forcePull: boolean;
};

export type VolumeDraft = {
  name: string;
  driver: string;
  /** Newline-separated KEY=value labels. */
  labelsText: string;
  /** Newline-separated key=value driver options. */
  optionsText: string;
  nfsEnabled: boolean;
  nfsAddress: string;
  nfsVersion: 'v3' | 'v4';
  nfsMount: string;
  nfsOption: string;
};

export function createVolumeDraft(): VolumeDraft {
  return {
    name: '',
    driver: 'local',
    labelsText: '',
    optionsText: '',
    nfsEnabled: false,
    nfsAddress: '',
    nfsVersion: 'v4',
    nfsMount: '',
    nfsOption: 'rw,noatime,rsize=8192,wsize=8192,tcp,timeo=14',
  };
}

export function volumeDraftToCreateBody(draft: VolumeDraft): {
  name: string;
  driver: string;
  labels: string[];
  options: string[];
} {
  const labels = draft.labelsText.split('\n').map((line) => line.trim()).filter(Boolean);
  const options = draft.optionsText.split('\n').map((line) => line.trim()).filter(Boolean);
  if (draft.nfsEnabled) {
    const type = draft.nfsVersion === 'v4' ? 'nfs4' : 'nfs';
    options.push(`type=${type}`);
    options.push(`o=addr=${draft.nfsAddress.trim()},${draft.nfsOption.trim()}`);
    const mount = draft.nfsMount.trim().startsWith(':')
      ? draft.nfsMount.trim()
      : `:${draft.nfsMount.trim()}`;
    options.push(`device=${mount}`);
  }
  return {
    name: draft.name.trim(),
    driver: draft.driver.trim() || 'local',
    labels,
    options,
  };
}

export function filterDockerVolumes(volumes: DockerVolumeInfo[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return volumes;
  return volumes.filter((volume) => {
    const labels = volume.labels ? Object.entries(volume.labels).map(([k,v]) => `${k}=${v}`).join(' ') : '';
    const options = volume.options ? Object.entries(volume.options).map(([k,v]) => `${k}=${v}`).join(' ') : '';
    const haystack = [
      volume.name,
      volume.driver,
      volume.scope,
      volume.mountpoint,
      volume.createdAt,
      volume.size,
      volume.links != null ? String(volume.links) : '',
      volume.inUse ? 'in use used' : 'unused',
      labels,
      options,
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function volumeDraftIsValid(draft: VolumeDraft): boolean {
  if (!draft.name.trim()) return false;
  if (!draft.nfsEnabled) return true;
  return Boolean(draft.nfsAddress.trim() && draft.nfsMount.trim());
}

export const dockerNetworkDrivers = ['bridge', 'ipvlan', 'macvlan', 'overlay'] as const;
export type DockerNetworkDriver = (typeof dockerNetworkDrivers)[number];

export type NetworkCreateDraft = {
  name: string;
  driver: DockerNetworkDriver;
  ipv4: boolean;
  subnet: string;
  gateway: string;
  ipRange: string;
  auxAddressText: string;
  ipv6: boolean;
  subnetV6: string;
  gatewayV6: string;
  ipRangeV6: string;
  auxAddressV6Text: string;
  optionsText: string;
  labelsText: string;
  parent: string;
  internal: boolean;
  attachable: boolean;
};

export function createNetworkDraft(): NetworkCreateDraft {
  return {
    name: '',
    driver: 'bridge',
    ipv4: true,
    subnet: '',
    gateway: '',
    ipRange: '',
    auxAddressText: '',
    ipv6: false,
    subnetV6: '',
    gatewayV6: '',
    ipRangeV6: '',
    auxAddressV6Text: '',
    optionsText: '',
    labelsText: '',
    parent: '',
    internal: false,
    attachable: false,
  };
}

export function networkCreateDisabledReason(draft: NetworkCreateDraft): string {
  if (!draft.name.trim()) return 'Network name is required.';
  if ((draft.driver === 'macvlan' || draft.driver === 'ipvlan') && !draft.parent.trim()) {
    return `${draft.driver} networks require a parent interface.`;
  }
  if (draft.ipv6 && !draft.subnetV6.trim()) {
    return 'IPv6 subnet is required when IPv6 is enabled.';
  }
  return '';
}

export function parseNetworkKVLines(value: string): DockerNetworkKV[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.indexOf('=');
      if (split <= 0) return { key: line,value: '' };
      return { key: line.slice(0, split).trim(),value: line.slice(split + 1).trim() };
    })
    .filter((item) => item.key && item.value);
}

export function networkCreateRequestFromDraft(draft: NetworkCreateDraft): DockerNetworkCreateRequest {
  return {
    name: draft.name.trim(),
    driver: draft.driver,
    ipv4: draft.ipv4,
    subnet: draft.subnet.trim(),
    gateway: draft.gateway.trim(),
    ipRange: draft.ipRange.trim(),
    auxAddress: parseNetworkKVLines(draft.auxAddressText),
    ipv6: draft.ipv6,
    subnetV6: draft.subnetV6.trim(),
    gatewayV6: draft.gatewayV6.trim(),
    ipRangeV6: draft.ipRangeV6.trim(),
    auxAddressV6: parseNetworkKVLines(draft.auxAddressV6Text),
    options: draft.optionsText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.includes('=')),
    labels: draft.labelsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
    parent: draft.parent.trim(),
    internal: draft.internal,
    attachable: draft.attachable,
  };
}

export function filterDockerNetworks(networks: DockerNetworkInfo[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return networks;
  return networks.filter((network) => {
    const searchableText = [
      network.name,
      network.driver,
      network.scope,
      network.subnet,
      network.gateway,
      network.subnetV6,
      network.gatewayV6,
      network.parent,
      network.id,
      network.internal ? 'internal' : '',
      network.attachable ? 'attachable' : '',
      ...(network.labels ?? []),
    ].join(' ').toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export const NETWORK_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const VOLUME_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function paginateItems<T>(items: readonly T[], page: number, pageSize: number) {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    total,
    page: current,
    pageSize: safePageSize,
    pages,
  };
}

export function isSystemDockerNetwork(name: string) {
  return name === 'bridge' || name === 'host' || name === 'none';
}

export function createContainerDraft(): ContainerDraft {
  return {
    name: '',
    image: '',
    ports: '',
    env: '',
    volumes: '',
    command: '',
    restartPolicy: 'unless-stopped',
    privileged: false,
  };
}

export function createComposeDraft(): ComposeDraft {
  return {
    name: '',
    path: '',
    file: 'services:\n  app:\n    image: nginx:alpine\n    restart: unless-stopped\n',
    env: '',
    forcePull: false,
  };
}

export function filterContainers(
  containers: DockerContainerInfo[],
  stateFilter: ContainerStateFilter,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return containers.filter((container) => {
    const matchesState = stateFilter === 'all' || container.state === stateFilter;
    if (!matchesState) return false;
    if (!normalizedQuery) return true;
    const searchableText = [
      container.names,
      container.name,
      container.image,
      container.state,
      container.status,
    ].join(' ').toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export function filterComposeProjects(projects: DockerComposeProject[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return projects;
  return projects.filter((project) => {
    const searchableText = [
      project.name,
      project.status,
      project.configFiles,
    ].join(' ').toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export function countContainerStates(containers: DockerContainerInfo[]) {
  return containers.reduce<Record<string,number>>((counts,container) => {
    counts.all = (counts.all ?? 0) + 1;
    counts[container.state] = (counts[container.state] ?? 0) + 1;
    return counts;
  }, { all: 0 });
}

export function parseContainerListField(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function containerDisplayName(container: DockerContainerInfo) {
  return container.names || container.name || container.id.slice(0,12);
}
