import { request,requestBlob,uploadRequest,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { clampLimit,queryString,segment } from '../../shared/url';
import type {
  ContainerComposeOperation,
  ContainerOperation,
  ContainerRuntimeStatus,
  DockerComposeProject,
  DockerContainerInfo,
  DockerImageInfo,
  DockerNetworkConnectRequest,
  DockerNetworkCreateRequest,
  DockerNetworkDisconnectRequest,
  DockerNetworkInfo,
  DockerVolumeCreateBody,
  DockerVolumeInfo,
} from './containerModel';
import { normalizeDockerComposeProject } from './containerModel';

export type ContainerCreateRequest = {
  name: string;
  image: string;
  ports: string[];
  env: string[];
  volumes: string[];
  command: string;
  restartPolicy: string;
  privileged: boolean;
};

export type ContainerComposeCreateRequest = { name: string; path: string; file: string; env: string; forcePull: boolean };
export type ContainerComposeOperationRequest = { name: string; path: string; operation: ContainerComposeOperation; force?: boolean };
export type ContainerCommandResult = { output: string; path?: string };

export function getContainerStatus(options?: ApiTargetOptions): Promise<ContainerRuntimeStatus> {
  return request<ContainerRuntimeStatus>('/containers/status', undefined, withTerminalAuth(options));
}

export function listContainers(options?: ApiTargetOptions): Promise<DockerContainerInfo[]> {
  return request<DockerContainerInfo[]>('/containers', undefined, withTerminalAuth(options));
}

export function createContainer(body: ContainerCreateRequest, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/containers', { method: 'POST', body: JSON.stringify(body) }, withTerminalAuth(options));
}

export function inspectContainer(id: string, options?: ApiTargetOptions): Promise<{ content: string }> {
  return request<{ content: string }>(`/containers/${segment(id)}/inspect`, undefined, withTerminalAuth(options));
}

export function getContainerLogs(id: string, tail = 200, options?: ApiTargetOptions): Promise<{ content: string }> {
  return request<{ content: string }>(`/containers/${segment(id)}/logs${queryString({ tail: clampLimit(tail) })}`, undefined, withTerminalAuth(options));
}

export function operateContainer(id: string, operation: ContainerOperation, force = false, options?: ApiTargetOptions): Promise<{ operation: string; output: string }> {
  return request<{ operation: string; output: string }>(`/containers/${segment(id)}/op`, {
    method: 'POST',
    body: JSON.stringify({ operation, force }),
  }, withTerminalAuth(options));
}

export type ContainerComposeConfig = { path: string; content: string };

export async function listContainerComposeProjects(options?: ApiTargetOptions): Promise<DockerComposeProject[]> {
  const items = await request<Array<Parameters<typeof normalizeDockerComposeProject>[0]>>(
    '/container-compose',
    undefined,
    withTerminalAuth(options),
  );
  return (Array.isArray(items) ? items : []).map((item) => normalizeDockerComposeProject(item ?? {}));
}

export function getContainerComposeConfig(path: string, options?: ApiTargetOptions): Promise<ContainerComposeConfig> {
  return request<ContainerComposeConfig>(
    `/container-compose/config${queryString({ path })}`,
    undefined,
    withTerminalAuth(options),
  );
}

export function createContainerComposeProject(body: ContainerComposeCreateRequest, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-compose', { method: 'POST', body: JSON.stringify(body) }, withTerminalAuth(options));
}

export function operateContainerComposeProject(body: ContainerComposeOperationRequest, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-compose/op', { method: 'POST', body: JSON.stringify(body) }, withTerminalAuth(options));
}

export function listContainerImages(options?: ApiTargetOptions): Promise<DockerImageInfo[]> {
  return request<DockerImageInfo[]>('/container-images', undefined, withTerminalAuth(options));
}

export function pullContainerImage(image: string, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/pull', { method: 'POST', body: JSON.stringify({ image }) }, withTerminalAuth(options));
}

export function removeContainerImages(names: string[], force = false, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/remove', { method: 'POST', body: JSON.stringify({ names, force }) }, withTerminalAuth(options));
}

export function pruneContainerImages(all = false, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/prune', {
    method: 'POST',
    body: JSON.stringify({ all }),
  }, withTerminalAuth(options));
}

export function pruneContainerBuildCache(options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/builder-prune', {
    method: 'POST',
    body: JSON.stringify({}),
  }, withTerminalAuth(options));
}

export function saveContainerImage(name: string, options?: ApiTargetOptions): Promise<Blob> {
  return requestBlob('/container-images/save', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  }, withTerminalAuth({ ...options,timeoutMs: options?.timeoutMs ?? 30 * 60_000 }));
}

export function loadContainerImage(file: File, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  const body = new FormData();
  body.append('file', file);
  return uploadRequest<ContainerCommandResult>(
    '/container-images/load',
    body,
    withTerminalAuth({ ...options,timeoutMs: options?.timeoutMs ?? 30 * 60_000 }),
  );
}

export function tagContainerImage(source: string, target: string, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/tag', {
    method: 'POST',
    body: JSON.stringify({ source, target }),
  }, withTerminalAuth(options));
}

export function pushContainerImage(name: string, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/push', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, withTerminalAuth({ ...options,timeoutMs: options?.timeoutMs ?? 30 * 60_000 }));
}

export function buildContainerImage(body: {
  name: string;
  dockerfile?: string;
  path?: string;
}, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-images/build', {
    method: 'POST',
    body: JSON.stringify(body),
  }, withTerminalAuth({ ...options,timeoutMs: options?.timeoutMs ?? 45 * 60_000 }));
}

export function inspectContainerImage(name: string, options?: ApiTargetOptions): Promise<{ content: string }> {
  return request<{ content: string }>('/container-images/inspect', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, withTerminalAuth(options));
}

export function listContainerNetworks(options?: ApiTargetOptions): Promise<DockerNetworkInfo[]> {
  return request<DockerNetworkInfo[]>('/container-networks', undefined, withTerminalAuth(options));
}

export function createContainerNetwork(body: DockerNetworkCreateRequest, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-networks', { method: 'POST', body: JSON.stringify(body) }, withTerminalAuth(options));
}

export function removeContainerNetwork(name: string, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>(`/container-networks/${segment(name)}`, { method: 'DELETE' }, withTerminalAuth(options));
}

export function removeContainerNetworks(names: string[], options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-networks/remove', {
    method: 'POST',
    body: JSON.stringify({ names }),
  }, withTerminalAuth(options));
}

export function pruneContainerNetworks(options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-networks/prune', { method: 'POST', body: '{}' }, withTerminalAuth(options));
}

export function inspectContainerNetwork(name: string, options?: ApiTargetOptions): Promise<{ content: string }> {
  return request<{ content: string }>(`/container-networks/${segment(name)}/inspect`, undefined, withTerminalAuth(options));
}

export function listContainerNetworkInterfaces(options?: ApiTargetOptions): Promise<string[]> {
  return request<string[]>('/container-networks/interfaces', undefined, withTerminalAuth(options));
}

export function connectContainerNetwork(
  name: string,
  body: DockerNetworkConnectRequest,
  options?: ApiTargetOptions,
): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>(`/container-networks/${segment(name)}/connect`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, withTerminalAuth(options));
}

export function disconnectContainerNetwork(
  name: string,
  body: DockerNetworkDisconnectRequest,
  options?: ApiTargetOptions,
): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>(`/container-networks/${segment(name)}/disconnect`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, withTerminalAuth(options));
}

export function listContainerVolumes(options?: ApiTargetOptions): Promise<DockerVolumeInfo[]> {
  return request<DockerVolumeInfo[]>('/container-volumes', undefined, withTerminalAuth(options));
}

export function createContainerVolume(body: DockerVolumeCreateBody, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-volumes', { method: 'POST', body: JSON.stringify(body) }, withTerminalAuth(options));
}

export function removeContainerVolume(name: string, options?: ApiTargetOptions & { force?: boolean }): Promise<ContainerCommandResult> {
  const force = options?.force ? '?force=true' : '';
  return request<ContainerCommandResult>(`/container-volumes/${segment(name)}${force}`, { method: 'DELETE' }, withTerminalAuth(options));
}

export function removeContainerVolumes(names: string[], force = false, options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-volumes/delete', {
    method: 'POST',
    body: JSON.stringify({ names, force }),
  }, withTerminalAuth(options));
}

export function inspectContainerVolume(name: string, options?: ApiTargetOptions): Promise<{ content: string }> {
  return request<{ content: string }>(`/container-volumes/${segment(name)}/inspect`, undefined, withTerminalAuth(options));
}

export function pruneContainerVolumes(options?: ApiTargetOptions): Promise<ContainerCommandResult> {
  return request<ContainerCommandResult>('/container-volumes/prune', {
    method: 'POST',
    body: JSON.stringify({}),
  }, withTerminalAuth(options));
}
