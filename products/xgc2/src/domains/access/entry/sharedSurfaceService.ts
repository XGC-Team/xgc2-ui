import { HTTPError, requestCookieResponse } from '../../../api/http';
import type { SharedSurfaceClient, SharedSurfaceProjection } from '../../../shared/sharedSurface';
import { decodeSharedSurfaceProjection, encodeSharedSurfaceParameter, sharedSurfacePathParameters } from './sharedSurfaceDecoder';

/**
 * A fixed projected capability. No owner can choose a URL, method, auth header or upstream.
 * Non-success responses reject with HTTPError, including parsed backend error details.
 * React teardown does not revoke this capability: owner hooks must close their queues/media
 * and may send their final release through it. The server remains the revocation authority.
 */
export function createSharedSurfaceClient(value: SharedSurfaceProjection): SharedSurfaceClient {
  const projection = decodeSharedSurfaceProjection(value);
  const endpoints = new Map(projection.endpoints.map((endpoint) => [endpoint.id, endpoint]));
  return Object.freeze({
    async request(endpointId, options = {}) {
      if (Object.keys(options).some((key) => !['params', 'body', 'signal'].includes(key))) {
        throw new Error('Shared surface request contains unsupported options.');
      }
      const endpoint = endpoints.get(endpointId);
      if (!endpoint || !projection.actions.includes(endpoint.action)) {
        throw new Error('This shared surface action is not granted.');
      }
      const names = sharedSurfacePathParameters(endpoint.path);
      const params = options.params ?? {};
      if (Object.keys(params).length !== names.length || names.some((name) => !Object.hasOwn(params, name))) {
        throw new Error('Shared surface path parameters do not match the endpoint.');
      }
      let path = endpoint.path;
      for (const name of names) {
        path = path.replace(`:${name}`, encodeSharedSurfaceParameter(params[name]));
      }
      const headers = new Headers({ Accept: endpoint.protocol === 'sse' ? 'text/event-stream' : 'application/json' });
      let body: string | undefined;
      if (options.body !== undefined) {
        if (endpoint.method === 'GET') throw new Error('Shared surface reads cannot contain a body.');
        body = JSON.stringify(options.body);
        if (body === undefined) throw new Error('Shared surface body must be JSON.');
        headers.set('Content-Type', 'application/json');
      }
      const response = await requestCookieResponse(path, {
        method: endpoint.method, headers, body, signal: options.signal, cache: 'no-store',
      });
      if (!response.ok) {
        throw new HTTPError(response.status, response.statusText, await sharedSurfaceErrorBody(response));
      }
      return response;
    },
  } satisfies SharedSurfaceClient);
}

export async function sharedSurfaceErrorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
