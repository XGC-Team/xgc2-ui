export type ContainerOperation = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill' | 'remove';
export type ContainerComposeOperation = 'up' | 'restart' | 'stop' | 'down' | 'delete' | 'pull' | 'logs';

export type ContainerRuntimeStatus = {
  dockerAvailable: boolean;
  serverVersion: string;
  containerCount: number;
  runningCount: number;
  imageCount: number;
  networkCount: number;
  volumeCount: number;
  message: string;
  collectedAt: string;
};

export type DockerContainerInfo = {
  id: string;
  name: string;
  image: string;
  command: string;
  created: string;
  status: string;
  state: string;
  ports: string;
  names: string;
  labels: string[];
};

export type DockerComposeProject = {
  name: string;
  status: string;
  configFiles: string;
};

/** docker compose ls may emit camelCase or PascalCase depending on path. */
export function normalizeDockerComposeProject(raw: Partial<DockerComposeProject> & {
  Name?: string;
  Status?: string;
  ConfigFiles?: string;
}): DockerComposeProject {
  return {
    name: String(raw.name ?? raw.Name ?? '').trim(),
    status: String(raw.status ?? raw.Status ?? '').trim(),
    configFiles: String(raw.configFiles ?? raw.ConfigFiles ?? '').trim(),
  };
}

export function composeProjectConfigPath(project: DockerComposeProject): string {
  return project.configFiles.trim();
}

export type DockerImageInfo = {
  id: string;
  repository: string;
  tag: string;
  createdAt: string;
  size: string;
  /** True when at least one container references this image. */
  inUse?: boolean;
};

export type DockerNetworkInfo = {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipv4: boolean;
  ipv6: boolean;
  internal: boolean;
  attachable: boolean;
  subnet: string;
  gateway: string;
  ipRange: string;
  subnetV6: string;
  gatewayV6: string;
  ipRangeV6: string;
  parent: string;
  labels: string[];
  createdAt: string;
  isSystem: boolean;
  containers: number;
};

export type DockerNetworkKV = { key: string; value: string };

export type DockerNetworkCreateRequest = {
  name: string;
  driver: string;
  ipv4: boolean;
  subnet: string;
  gateway: string;
  ipRange: string;
  auxAddress: DockerNetworkKV[];
  ipv6: boolean;
  subnetV6: string;
  gatewayV6: string;
  ipRangeV6: string;
  auxAddressV6: DockerNetworkKV[];
  options: string[];
  labels: string[];
  parent: string;
  internal: boolean;
  attachable: boolean;
};

export type DockerNetworkConnectRequest = {
  container: string;
  ipv4: string;
  ipv6: string;
  aliases: string[];
};

export type DockerNetworkDisconnectRequest = {
  container: string;
  force?: boolean;
};

export type DockerVolumeInfo = {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  createdAt?: string;
  labels?: Record<string,string>;
  options?: Record<string,string>;
  /** Human-readable size from `docker system df -v`. */
  size?: string;
  /** Container reference count from `docker system df -v`. */
  links?: number;
  /** True when Links > 0 or a container mounts this volume. */
  inUse?: boolean;
};

export type DockerVolumeCreateBody = {
  name: string;
  driver: string;
  labels?: string[];
  options?: string[];
};


