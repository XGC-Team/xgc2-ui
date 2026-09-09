import type { ApiTargetOptions } from '../../api/http';
import { isWebSocketOpen,openWebSocket } from '../../api/ws';

export type TerminalWebSocketTicket = {
  ticket: string;
  expiresAt: number;
};

export type TerminalConnection = {
  sendCommand: (value: string) => void;
  sendClose: () => void;
  sendResize: (cols: number, rows: number) => void;
  close: () => void;
};

export async function connectTerminalTransport({
  hostId,
  sessionId,
  cols,
  rows,
  targetCoreId,
  managedHostId,
  resumeOnly = false,
  connectPassword,
  getTicket,
  onOpen,
  onData,
  onError,
  onClose,
  signal,
}: {
  hostId: string;
  sessionId: string;
  cols: number;
  rows: number;
  targetCoreId?: string;
  /** Selected Agent id — session dials as that Agent, not Core. */
  managedHostId?: string;
  resumeOnly?: boolean;
  /** One-time SSH password for hosts without a stored catalog secret. */
  connectPassword?: string;
  getTicket: (
    target?: ApiTargetOptions,
    body?: { hostId?: string;password?: string;managedHostId?: string },
  ) => Promise<TerminalWebSocketTicket>;
  onOpen: () => void;
  onData: (value: string) => void;
  onError: () => void;
  onClose: () => void;
  signal?: AbortSignal;
}): Promise<TerminalConnection> {
  const target: ApiTargetOptions | undefined = (() => {
    const core = targetCoreId?.trim();
    const host = managedHostId?.trim();
    if (!core && !host) return undefined;
    return {
      ...(core ? { targetCoreId: core } : {}),
      ...(host ? { managedHostId: host } : {}),
    };
  })();
  const result = await getTicket(target, {
    hostId,
    password: connectPassword,
    managedHostId: managedHostId?.trim() || undefined,
  });
  if (signal?.aborted) throw new DOMException('terminal connection aborted', 'AbortError');
  const socket = openWebSocket('/terminal/ws', {
    ...target,
    query: {
      hostId,
      sessionId,
      cols,
      rows,
      ticket: result.ticket,
      ...(managedHostId?.trim() ? { managedHostId: managedHostId.trim() } : {}),
      ...(resumeOnly ? { resume: '1' } : {}),
    },
  });
  const abort = () => socket.close();
  signal?.addEventListener('abort', abort, { once: true });

  socket.onopen = () => {
    onOpen();
  };
  socket.onmessage = (message) => {
    const payload = parseTerminalMessage(message.data);
    if (payload?.type === 'cmd') onData(payload.data);
  };
  socket.onerror = () => onError();
  socket.onclose = () => {
    onClose();
  };

  return {
    sendCommand(value: string) {
      if (isWebSocketOpen(socket)) socket.send(JSON.stringify({ type: 'cmd', data: encodeBase64(value) }));
    },
    sendClose() {
      if (isWebSocketOpen(socket)) socket.send(JSON.stringify({ type: 'close' }));
    },
    sendResize(nextCols: number, nextRows: number) {
      if (isWebSocketOpen(socket)) socket.send(JSON.stringify({ type: 'resize', cols: nextCols, rows: nextRows }));
    },
    close() {
      signal?.removeEventListener('abort', abort);
      socket.close();
    },
  };
}

export type TerminalMessage = { type: 'cmd'; data: string };

export function parseTerminalMessage(data: unknown): TerminalMessage | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;
  if (parsed.type === 'cmd') {
    if (typeof parsed.data !== 'string' || parsed.data === '') return null;
    const decoded = tryDecodeBase64(parsed.data);
    return decoded === null ? null : { type: 'cmd', data: decoded };
  }
  return null;
}

function encodeBase64(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value: string) {
  return decodeURIComponent(escape(atob(value)));
}

function tryDecodeBase64(value: string) {
  try {
    return decodeBase64(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
