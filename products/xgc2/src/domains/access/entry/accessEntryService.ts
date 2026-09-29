import { consumeSSEBody, HTTPError, requestCookieResponse } from '../../../api/http';
import type { SharedSurfaceClient, SharedSurfaceProjection } from '../../../shared/sharedSurface';
import { decodeSharedSurfaceProjection } from './sharedSurfaceDecoder';
import { sharedSurfaceErrorBody } from './sharedSurfaceService';

const ENTRY_API = '/api/access/entry';

/** Anonymous one-time exchange; station/terminal credentials never join the guest cookie. */
export async function bootstrapAccessEntry(token: string, signal?: AbortSignal): Promise<SharedSurfaceProjection> {
  return entryProjection(`${ENTRY_API}/bootstrap`, {
    method: 'POST', body: JSON.stringify({ token }), signal,
  });
}

export async function getAccessEntryProjection(signal?: AbortSignal): Promise<SharedSurfaceProjection> {
  return entryProjection(ENTRY_API, { signal, cache: 'no-store' });
}

export type AccessEntryEvents = { close: () => void };

/** A projected SSE connection is terminal on denial/end; it never retries or changes identity. */
export function openAccessEntryEvents(client: SharedSurfaceClient, handlers: {
  onProjection: (projection: SharedSurfaceProjection) => void;
  onClosed: (reason: 'ended' | 'error') => void;
}): AccessEntryEvents {
  const controller = new AbortController();
  let closed = false;
  const terminate = (reason: 'ended' | 'error') => {
    if (closed) return;
    closed = true;
    controller.abort();
    handlers.onClosed(reason);
  };
  void (async () => {
    try {
      const response = await client.request('surface.events', { signal: controller.signal });
      if (!response.body) {
        terminate('error');
        return;
      }
      await consumeSSEBody(response.body, (message) => {
        if (closed || message.event !== 'state') return;
        try {
          handlers.onProjection(decodeSharedSurfaceProjection(JSON.parse(message.data)));
        } catch {
          terminate('error');
        }
      }, controller.signal);
      terminate('ended');
    } catch (error) {
      if (closed || (error instanceof DOMException && error.name === 'AbortError')) return;
      terminate(error instanceof HTTPError && [401, 403].includes(error.status) ? 'ended' : 'error');
    }
  })();
  return {
    close: () => {
      if (closed) return;
      closed = true;
      controller.abort();
    },
  };
}

/** Strip the fragment immediately, including empty/malformed credentials; never persist it. */
export function takeAccessEntryFragmentToken(): string {
  const hash = window.location.hash;
  const token = (new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('token') ?? '').trim();
  if (hash) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

async function entryProjection(path: string, init?: RequestInit): Promise<SharedSurfaceProjection> {
  const headers = new Headers({ Accept: 'application/json' });
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await requestCookieResponse(path, { ...init, headers });
  if (!response.ok) {
    throw new HTTPError(response.status, response.statusText, await sharedSurfaceErrorBody(response));
  }
  return decodeSharedSurfaceProjection(await response.json());
}
