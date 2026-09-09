import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';

export type HostProcessTerminateSignal = 'term' | 'kill';

export function killHostProcess(
  pid: number,
  options?: ApiTargetOptions & { startTicks?: number;signal?: HostProcessTerminateSignal },
): Promise<{ pid: number }> {
  if (options?.managedHostId) {
    return request<{ identity?: { pid: number };terminated?: boolean }>(
      `/managed-hosts/${segment(options.managedHostId)}/processes/${segment(pid)}/terminate`,
      {
        method: 'POST',
        body: JSON.stringify({
          startTicks: options.startTicks ?? 0,
          signal: options.signal ?? 'term',
        }),
      },
      withTerminalAuth(options),
    ).then(() => ({ pid }));
  }
  return request<{ pid: number }>(
    `/host/processes/${segment(pid)}/kill`,
    { method: 'POST' },
    withTerminalAuth(options),
  );
}
