import { apiUrl,type ApiTargetOptions } from './http';

type WebSocketQueryValue = string | number | boolean | null | undefined;

export type WebSocketQuery = Record<string, WebSocketQueryValue>;

export type WebSocketUrlOptions = ApiTargetOptions & {
  query?: WebSocketQuery;
};

export type WebSocketTargetOptions = ApiTargetOptions & {
  protocols?: string | string[];
  query?: WebSocketQuery;
};

export function webSocketUrl(path: string, options?: WebSocketUrlOptions): string {
  const url = new URL(apiUrl(path, options));
  appendQuery(url, options?.query);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function openWebSocket(path: string, options?: WebSocketTargetOptions): WebSocket {
  const { protocols,...targetOptions } = options ?? {};
  const url = webSocketUrl(path, targetOptions);
  return protocols ? new WebSocket(url, protocols) : new WebSocket(url);
}

export function isWebSocketOpen(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN;
}

function appendQuery(url: URL, query?: WebSocketQuery) {
  if (!query) return;

  for (const [key,value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
}
