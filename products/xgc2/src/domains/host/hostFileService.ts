import {
  request,
  requestBlob,
  uploadRequest,
  withTerminalAuth,
  type ApiTargetOptions,
} from '../../api/http';
import { queryString,segment } from '../../shared/url';
import {
  executionRequestId,
  executionTargetResourceId,
  type JobActionResponse,
} from '../execution/executionPublic';
import type { HostFileContent,HostFileList,HostRecycleItem } from './hostModel';
import { filterHostFileEntries } from './hostFilesModel';

export async function getHostFiles(
  path: string,
  hidden = false,
  search = '',
  options?: ApiTargetOptions,
): Promise<HostFileList> {
  const list = options?.managedHostId
    ? await request<HostFileList>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/list${queryString({ path,hidden,search })}`,
      undefined,
      withTerminalAuth(options),
    )
    : await request<HostFileList>(
      `/host/files${queryString({ path,hidden,search })}`,
      undefined,
      withTerminalAuth(options),
    );
  // Proto/JSON may omit an empty managed root as entries:null — normalize for the table.
  // Agent list historically ignored hidden/search; always re-apply client-side so .H works.
  const entries = filterHostFileEntries(
    Array.isArray(list.entries) ? list.entries : [],
    { showHidden: hidden,search },
  );
  return {
    ...list,
    path: list.path || path,
    parent: list.parent || list.path || path,
    entries,
  };
}

export function getHostFileContent(path: string,options?: ApiTargetOptions): Promise<HostFileContent> {
  if (options?.managedHostId) {
    return request<HostFileContent>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/read${queryString({ path })}`,
      undefined,
      withTerminalAuth(options),
    );
  }
  return request<HostFileContent>(
    `/host/files/content${queryString({ path })}`,
    undefined,
    withTerminalAuth(options),
  );
}

export function saveHostFileContent(
  path: string,
  content: string,
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/write`,
      { method: 'PUT',body: JSON.stringify({ path,content }) },
      withTerminalAuth(options),
    );
  }
  return request<{ path: string }>(
    '/host/files/content',
    { method: 'PUT',body: JSON.stringify({ path,content }) },
    withTerminalAuth(options),
  );
}

export function createHostFile(
  path: string,
  isDir: boolean,
  content = '',
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    if (isDir) {
      return request<{ path: string }>(
        `/managed-hosts/${segment(options.managedHostId)}/fs/mkdir`,
        { method: 'POST',body: JSON.stringify({ path }) },
        withTerminalAuth(options),
      );
    }
    return saveHostFileContent(path, content, options);
  }
  return request<{ path: string }>(
    '/host/files/create',
    { method: 'POST',body: JSON.stringify({ path,isDir,content }) },
    withTerminalAuth(options),
  );
}

export async function uploadHostFile(path: string,file: File,options?: ApiTargetOptions): Promise<{ path: string }> {
  if (options?.managedHostId) {
    const dest = `${path.replace(/\/+$/, '')}/${file.name}`;
    const text = await file.text();
    return saveHostFileContent(dest, text, options);
  }
  const formData = new FormData();
  formData.append('path',path);
  formData.append('file',file);
  return uploadRequest<{ path: string }>('/host/files/upload',formData,withTerminalAuth(options));
}

export async function downloadHostFile(path: string,options?: ApiTargetOptions): Promise<Blob> {
  // Remote Agent: no dedicated download RPC — reuse fs/read within payload bounds.
  if (options?.managedHostId) {
    const file = await getHostFileContent(path, options);
    return new Blob([file.content ?? ''], { type: 'application/octet-stream' });
  }
  return requestBlob(
    `/host/files/download${queryString({ path })}`,
    undefined,
    withTerminalAuth(options),
  );
}

export function copyHostFile(
  paths: string[],
  destination: string,
  options?: ApiTargetOptions,
  targetId = 'local',
): Promise<JobActionResponse | { path: string }> {
  // Agent: synchronous fs/copy RPC (no Core job plane).
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/copy`,
      { method: 'POST',body: JSON.stringify({ paths,destination,overwrite: false }) },
      withTerminalAuth(options),
    );
  }
  const requestId = executionRequestId('host.copy',destination);
  const body = {
    targetId: executionTargetResourceId(targetId),
    sources: paths,
    destination,
    overwrite: false,
    requestId,
    idempotencyKey: requestId,
    reason: 'operator host copy',
  };
  return request<JobActionResponse>('/host/files/actions/copy', {
    method: 'POST',
    headers: { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey },
    body: JSON.stringify(body),
  },withTerminalAuth(options));
}

export function moveHostFile(
  paths: string[],
  destination: string,
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/move`,
      { method: 'POST',body: JSON.stringify({ paths,destination }) },
      withTerminalAuth(options),
    );
  }
  return request<{ path: string }>(
    '/host/files/move',
    { method: 'POST',body: JSON.stringify({ paths,destination }) },
    withTerminalAuth(options),
  );
}

export function compressHostFile(
  paths: string[],
  destination: string,
  name: string,
  options?: ApiTargetOptions,
  targetId = 'local',
): Promise<JobActionResponse> {
  const archiveName = name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`;
  const archivePath = `${destination.replace(/\/+$/, '')}/${archiveName.replace(/^\/+/, '')}`;
  const requestId = executionRequestId('host.compress',archivePath);
  const body = {
    targetId: executionTargetResourceId(targetId),
    sources: paths,
    destination: archivePath,
    overwrite: false,
    requestId,
    idempotencyKey: requestId,
    reason: 'operator host compress',
  };
  return request<JobActionResponse>('/host/files/actions/compress', {
    method: 'POST',
    headers: { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey },
    body: JSON.stringify(body),
  },withTerminalAuth(options));
}

export function chmodHostFile(
  path: string,
  mode: string,
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/chmod`,
      { method: 'POST',body: JSON.stringify({ path,mode }) },
      withTerminalAuth(options),
    );
  }
  return request<{ path: string }>(
    '/host/files/chmod',
    { method: 'POST',body: JSON.stringify({ path,mode }) },
    withTerminalAuth(options),
  );
}

export function chownHostFile(
  path: string,
  user: string,
  group: string,
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs/chown`,
      { method: 'POST',body: JSON.stringify({ path,user,group }) },
      withTerminalAuth(options),
    );
  }
  return request<{ path: string }>(
    '/host/files/chown',
    { method: 'POST',body: JSON.stringify({ path,user,group }) },
    withTerminalAuth(options),
  );
}

export function deleteHostFile(path: string,options?: ApiTargetOptions): Promise<HostRecycleItem | { path: string }> {
  // Agent: permanent delete (no recycle bin RPCs yet).
  if (options?.managedHostId) {
    return request<{ path: string }>(
      `/managed-hosts/${segment(options.managedHostId)}/fs${queryString({ path })}`,
      { method: 'DELETE' },
      withTerminalAuth(options),
    );
  }
  return request<HostRecycleItem>(
    `/host/files${queryString({ path })}`,
    { method: 'DELETE' },
    withTerminalAuth(options),
  );
}

export function getHostRecycle(options?: ApiTargetOptions): Promise<HostRecycleItem[]> {
  return request<HostRecycleItem[]>('/host/files/recycle',undefined,withTerminalAuth(options));
}

export function restoreHostRecycle(id: string,options?: ApiTargetOptions): Promise<HostRecycleItem> {
  return request<HostRecycleItem>(
    '/host/files/recycle/restore',
    { method: 'POST',body: JSON.stringify({ path: id }) },
    withTerminalAuth(options),
  );
}
