import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import type { HostLogChunk,HostLogSource } from './hostModel';

export function listHostLogSources(options?: ApiTargetOptions): Promise<HostLogSource[]> {
  if (!options?.managedHostId) return Promise.resolve([]);
  return request<HostLogSource[]>(
    `/managed-hosts/${segment(options.managedHostId)}/log-sources`,
    undefined,
    withTerminalAuth(options),
  );
}

export function readHostLogChunk(
  sourceId: string,
  options?: ApiTargetOptions & { offset?: number;limitBytes?: number },
): Promise<HostLogChunk> {
  if (!options?.managedHostId) {
    return Promise.reject(new Error('Host log chunks are available on remote managed hosts.'));
  }
  return request<HostLogChunk>(
    `/managed-hosts/${segment(options.managedHostId)}/log${queryString({
      sourceId,
      offset: options.offset ?? 0,
      limitBytes: options.limitBytes ?? 65_536,
    })}`,
    undefined,
    withTerminalAuth(options),
  );
}
