import { request, withTerminalAuth, type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';
import type { PlaceUserScriptRequest,PlaceUserScriptResult,TerminalHost,TerminalSetting } from './terminalModel';

export function listTerminalHosts(options?: ApiTargetOptions): Promise<TerminalHost[]> {
  return request<TerminalHost[]>('/terminal/hosts', undefined, withTerminalAuth(options));
}

export function saveTerminalHost(host: TerminalHost, options?: ApiTargetOptions): Promise<TerminalHost> {
  if (host.id) {
    return request<TerminalHost>(`/terminal/hosts/${segment(host.id)}`, {
      method: 'PUT',
      body: JSON.stringify(host),
    }, withTerminalAuth(options));
  }

  return request<TerminalHost>('/terminal/hosts', {
    method: 'POST',
    body: JSON.stringify(host),
  }, withTerminalAuth(options));
}

export function deleteTerminalHost(id: string, options?: ApiTargetOptions): Promise<{ deleted: string }> {
  return request<{ deleted: string }>(`/terminal/hosts/${segment(id)}`, { method: 'DELETE' }, withTerminalAuth(options));
}

export function getTerminalSetting(options?: ApiTargetOptions): Promise<TerminalSetting> {
  return request<TerminalSetting>('/terminal/settings', undefined, withTerminalAuth(options));
}

export type TerminalWebSocketTicketRequest = {
  hostId?: string;
  /** One-time connect password; bound to the ticket, never stored on the Host. */
  password?: string;
  /** When set, Core opens the session as this Agent identity. */
  managedHostId?: string;
};

/** Place the public file onto the current terminal home. Dispatch is server-side. */
export function placeUserScript(
  body: PlaceUserScriptRequest,
  options?: ApiTargetOptions,
): Promise<PlaceUserScriptResult> {
  return request<PlaceUserScriptResult>(
    '/terminal/user-scripts',
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId: body.sessionId,
        hostId: body.hostId,
        path: body.path,
        managedHostId: body.managedHostId ?? '',
      }),
    },
    withTerminalAuth(options),
  );
}

export function getTerminalWebSocketTicket(
  options?: ApiTargetOptions,
  body?: TerminalWebSocketTicketRequest,
): Promise<{ ticket: string; expiresAt: number }> {
  return request<{ ticket: string; expiresAt: number }>(
    '/terminal/ws-ticket',
    {
      method: 'POST',
      body: JSON.stringify({
        hostId: body?.hostId ?? '',
        password: body?.password ?? '',
        managedHostId: body?.managedHostId ?? options?.managedHostId ?? '',
      }),
    },
    withTerminalAuth(options),
  );
}
