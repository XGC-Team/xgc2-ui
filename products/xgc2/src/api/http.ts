import { API_BASE,REQUEST_TIMEOUT_MS } from '../config/apiBase';
import {
  beginCoreRequestTrace,
  completeCoreRequestTrace,
  type CoreRequestTrace,
} from './requestTrace';

export type ApiTargetOptions = {
  targetCoreId?: string;
  managedHostId?: string;
  auth?: 'none' | 'terminal';
  timeoutMs?: number;
};

export type ExternalRequestOptions = {
  timeoutMs?: number;
};

type ResponseMode = 'json' | 'blob';

export class HTTPError<T = unknown> extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: T | undefined;

  constructor(status: number, statusText: string, body?: T) {
    const detail = errorMessage(body);
    super(`${status} ${statusText}${detail ? `: ${detail}` : ''}`.trim());
    this.name = 'HTTPError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export function terminalToken() {
  const envToken = import.meta.env.VITE_XGC_TERMINAL_TOKEN;
  if (envToken) return envToken;
  try {
    return window.localStorage.getItem('xgcTerminalToken') || '';
  } catch {
    return '';
  }
}

export function stationToken() {
  try {
    return window.localStorage.getItem('xgcStationToken') || '';
  } catch {
    return '';
  }
}

/** Same-station transport for protocol clients that own response decoding. */
export function requestStationResponse(path: string,init?: RequestInit): Promise<Response> {
  const url = new URL(path,window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('Station transport requires a current-station API path.');
  }
  const headers = new Headers(init?.headers);
  const token = stationToken();
  if (token) headers.set('X-XGC-Station-Token',token);
  return fetch(`${url.pathname}${url.search}`,{ ...init,credentials: 'include',headers });
}

export function withTerminalAuth(options?: ApiTargetOptions): ApiTargetOptions {
  return { ...options, auth: 'terminal' };
}

export function routedPath(path: string, options?: ApiTargetOptions) {
  const normalized = normalizePath(path);
  const targetCoreId = options?.targetCoreId?.trim();
  if (!targetCoreId) return normalized;
  return `/cores/${encodeURIComponent(targetCoreId)}/proxy${normalized}`;
}

export function apiUrl(path: string, options?: ApiTargetOptions) {
  return `${API_BASE}${routedPath(path, options)}`;
}

export async function request<T>(path: string, init?: RequestInit, options?: ApiTargetOptions): Promise<T> {
  return (await send(path, init, options, 'json', readJson<T>)).value;
}

export type CoreRequestResult<T> = {
  value: T;
  trace: CoreRequestTrace;
};

// Callers that freeze evidence must receive the trace produced by this exact
// request. Reading the global recent-request ring after the fact can select an
// older request with the same route and falsely imply request-level linkage.
export async function requestWithTrace<T>(
  path: string,
  init?: RequestInit,
  options?: ApiTargetOptions,
): Promise<CoreRequestResult<T>> {
  return send(path, init, options, 'json', readJson<T>);
}

// External JSON transport is deliberately separate from Core API routing. It
// never forwards XGC browser credentials, even when a caller supplies them.
export async function requestExternalJSON<T>(
  url: string,
  init?: RequestInit,
  options?: ExternalRequestOptions,
): Promise<T> {
  return sendExternal(url, init, options, readJson<T>);
}

export async function requestBlob(path: string, init?: RequestInit, options?: ApiTargetOptions): Promise<Blob> {
  return (await send(path, init, options, 'blob', (res) => res.blob())).value;
}

export async function uploadRequest<T>(path: string, formData: FormData, options?: ApiTargetOptions): Promise<T> {
  return (await send(path, { method: 'POST', body: formData }, options, 'blob', readJson<T>)).value;
}

export async function uploadBinaryRequest<T>(path: string, body: Blob, options?: ApiTargetOptions): Promise<T> {
  return (await send(path, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
  }, options, 'blob', readJson<T>)).value;
}

export function waitForTransportRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, delayMs)));
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildHeaders(initHeaders: RequestInit['headers'], options?: ApiTargetOptions, contentType?: string) {
  const headers = new Headers(initHeaders);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (contentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', contentType);
  }

  if (options?.auth === 'terminal') {
    const token = terminalToken();
    if (token) {
      headers.set('X-XGC-Terminal-Token', token);
    } else {
      headers.delete('X-XGC-Terminal-Token');
    }
  }

  const station = stationToken();
  if (station) {
    headers.set('X-XGC-Station-Token', station);
  }

  return headers;
}

function buildExternalHeaders(initHeaders: RequestInit['headers'], contentType?: string) {
  const headers = new Headers(initHeaders);
  for (const name of [
    'Authorization',
    'Cookie',
    'X-XGC-Station-Token',
    'X-XGC-Terminal-Token',
  ]) {
    headers.delete(name);
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (contentType && !headers.has('Content-Type')) headers.set('Content-Type', contentType);
  return headers;
}

async function send<T>(
  path: string,
  init: RequestInit | undefined,
  options: ApiTargetOptions | undefined,
  mode: ResponseMode,
  read: (res: Response) => Promise<T>,
) {
  const { headers: initHeaders, signal: initSignal, ...restInit } = init ?? {};
  const controller = new AbortController();
  const timeoutMs = resolveTimeoutMs(options);
  const trace = beginCoreRequestTrace({
    method: restInit.method,
    path: routedPath(path, options),
    targetCoreId: options?.targetCoreId,
    managedHostId: options?.managedHostId,
  });
  let timedOut = false;
  let traceCompleted = false;
  let response: Response | undefined;

  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  if (initSignal) {
    if (initSignal.aborted) {
      controller.abort();
    } else {
      initSignal.addEventListener('abort', abort, { once: true });
    }
  }

  try {
    if (controller.signal.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    const hasJsonBody = mode === 'json' && restInit.body !== undefined && !(restInit.body instanceof FormData);
    const res = await fetch(apiUrl(path, options), {
      ...restInit,
      headers: buildHeaders(initHeaders, options, hasJsonBody ? 'application/json' : undefined),
      signal: controller.signal,
    });
    response = res;

    if (!res.ok) {
      completeCoreRequestTrace(trace, {
        outcome: 'failed',
        status: res.status,
        requestId: res.headers.get('X-Request-ID'),
        commandId: res.headers.get('X-XGC-Command-ID'),
      });
      traceCompleted = true;
      throw new HTTPError(res.status, res.statusText, await readErrorBody(res));
    }

    const value = await read(res);
    const completedTrace = completeCoreRequestTrace(trace, {
      outcome: 'succeeded',
      status: res.status,
      requestId: res.headers.get('X-Request-ID'),
      commandId: res.headers.get('X-XGC-Command-ID'),
    });
    traceCompleted = true;
    return { value,trace: completedTrace };
  } catch (error) {
    if (!traceCompleted) {
      completeCoreRequestTrace(trace, {
        outcome: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed',
        status: response?.status,
        requestId: response?.headers.get('X-Request-ID'),
        commandId: response?.headers.get('X-XGC-Command-ID'),
      });
      traceCompleted = true;
    }
    if (error instanceof DOMException && error.name === 'AbortError' && timedOut) {
      throw new Error(`request timeout after ${timeoutMs}ms: ${routedPath(path, options)}`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    initSignal?.removeEventListener('abort', abort);
  }
}

async function sendExternal<T>(
  url: string,
  init: RequestInit | undefined,
  options: ExternalRequestOptions | undefined,
  read: (res: Response) => Promise<T>,
) {
  const { headers: initHeaders, signal: initSignal, ...restInit } = init ?? {};
  const controller = new AbortController();
  const timeoutMs = resolveTimeoutMs(options);
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  if (initSignal) {
    if (initSignal.aborted) controller.abort();
    else initSignal.addEventListener('abort', abort, { once: true });
  }

  try {
    if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const hasJsonBody = restInit.body !== undefined && !(restInit.body instanceof FormData);
    const res = await fetch(url, {
      ...restInit,
      credentials: 'omit',
      headers: buildExternalHeaders(initHeaders, hasJsonBody ? 'application/json' : undefined),
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!res.ok) throw new HTTPError(res.status, res.statusText, await readErrorBody(res));
    return await read(res);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' && timedOut) {
      throw new Error(`request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    initSignal?.removeEventListener('abort', abort);
  }
}

function resolveTimeoutMs(options?: { timeoutMs?: number }) {
  const value = options?.timeoutMs;
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : REQUEST_TIMEOUT_MS;
}

async function readErrorBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const body = value as { error?: unknown;message?: unknown };
  if (typeof body.error === 'string') return body.error;
  return typeof body.message === 'string' ? body.message : '';
}

async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type ReplayJSONStream = { close: () => void };
export type SSEMessage = { id: string; event: string; data: string };

export class ReplayJSONStreamHTTPError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`event stream failed: ${status}`);
    this.name = 'ReplayJSONStreamHTTPError';
    this.status = status;
  }
}

export function openReplayJSONStream<T>({
  path,
  lastEventId,
  beforeConnect,
  dynamicHeaders,
  onValue,
  onConnecting,
  onOpen,
  onError,
  reconnectDelayMs,
}: {
  path: () => string;
  lastEventId: () => string;
  beforeConnect?: () => void | Promise<void>;
  dynamicHeaders?: () => HeadersInit | Promise<HeadersInit>;
  onValue: (value: T, message: SSEMessage) => void;
  onConnecting?: () => void;
  onOpen?: (response: Response) => void | boolean | Promise<void | boolean>;
  onError?: (error: unknown) => void;
  reconnectDelayMs: number;
}): ReplayJSONStream {
  const controller = new AbortController();
  let closed = false;
  let retryTimer: number | undefined;
  let reconnectAttempts = 0;

  const maxReconnectDelayMs = Math.max(reconnectDelayMs, 30_000);
  const scheduleReconnect = () => {
    // The first retry fires after exactly the configured base delay; repeated
    // failures back off exponentially (capped at 30s) with jitter so many
    // streams cannot hammer a recovering server in lockstep. A successful
    // connection resets the schedule.
    const exponential = Math.min(
      reconnectDelayMs * 2 ** Math.min(reconnectAttempts, 10),
      maxReconnectDelayMs,
    );
    const delayMs = reconnectAttempts === 0
      ? exponential
      : exponential / 2 + Math.random() * (exponential / 2);
    reconnectAttempts += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, delayMs);
  };

  const connect = async () => {
    onConnecting?.();
    let response: Response | undefined;
    try {
      await beforeConnect?.();
      if (closed || controller.signal.aborted) return;
      const headers = new Headers(await dynamicHeaders?.());
      headers.set('Accept', 'text/event-stream');
      const eventId = lastEventId();
      if (eventId) headers.set('Last-Event-ID', eventId);
      const station = stationToken();
      if (station) headers.set('X-XGC-Station-Token', station);
      response = await fetch(apiUrl(path()), {
        method: 'GET',
        credentials: 'include',
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new ReplayJSONStreamHTTPError(response.status);
      if (!response.body) throw new Error('event stream has no response body');
      reconnectAttempts = 0;
      const shouldConsume = await onOpen?.(response);
      if (shouldConsume === false) return;
      await consumeSSEBody(response.body, (message) => {
        onValue(JSON.parse(message.data) as T, message);
      }, controller.signal);
    } catch (error) {
      if (closed || controller.signal.aborted) return;
      if (!isAbortError(error)) onError?.(error);
    } finally {
      // Validation and decoding can fail while the server keeps sending. A
      // released reader lock leaves that response connected; cancel the body
      // before retrying so failed streams cannot exhaust the browser's sockets.
      try {
        await response?.body?.cancel();
      } catch {
        // Fetch may already have aborted or errored this response body.
      }
      if (!closed) scheduleReconnect();
    }
  };

  void connect();
  return {
    close: () => {
      closed = true;
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    },
  };
}

export async function consumeSSEBody(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: SSEMessage) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let skipLeadingLF = false;
  const append = (text: string) => {
    // A CR ends a line immediately. Suppress its optional LF even when the
    // pair straddles network chunks; empty UTF-8 decoder output keeps state.
    if (!text) return;
    if (skipLeadingLF && text.startsWith('\n')) text = text.slice(1);
    skipLeadingLF = text.endsWith('\r');
    buffer += text.replace(/\r\n|\r/g, '\n');
  };
  try {
    while (!signal?.aborted) {
      const { value,done } = await reader.read();
      if (signal?.aborted) return;
      if (done) break;
      append(decoder.decode(value, { stream: true }));
      const frames = buffer.split('\n\n');
      // String.split always returns at least one element.
      buffer = frames.pop()!;
      for (const frame of frames) {
        // A callback may close the stream while this chunk still has frames.
        if (signal?.aborted) return;
        const message = parseSSEFrame(frame);
        if (message) onMessage(message);
      }
    }
    if (signal?.aborted) return;
    append(decoder.decode());
    const finalMessage = parseSSEFrame(buffer);
    if (finalMessage) onMessage(finalMessage);
  } finally {
    reader.releaseLock();
  }
}

export function parseSSEFrame(frame: string): SSEMessage | null {
  const message: SSEMessage = { id: '',event: 'message',data: '' };
  const data: string[] = [];
  frame.split('\n').forEach((line) => {
    if (!line || line.startsWith(':')) return;
    const delimiter = line.indexOf(':');
    const field = delimiter >= 0 ? line.slice(0, delimiter) : line;
    const raw = delimiter >= 0 ? line.slice(delimiter + 1) : '';
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'id') message.id = value;
    if (field === 'event') message.event = value;
    if (field === 'data') data.push(value);
  });
  message.data = data.join('\n');
  return message.data ? message : null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
