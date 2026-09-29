// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTPError } from '../../../api/http';
import { createSharedSurfaceClient } from './sharedSurfaceService';
import { decodeSharedSurfaceProjection } from './sharedSurfaceDecoder';

const projection = () => decodeSharedSurfaceProjection({
  contractVersion: 1, entryId: 'entry-1', name: 'Preview', expiresAt: '2027-09-20T12:00:00Z',
  moduleId: 'preview', viewContractVersion: 1, actions: ['surface.read', 'preview.view'],
  endpoints: [
    { id: 'surface.events', method: 'GET', path: '/api/access/entry/events', protocol: 'sse', action: 'surface.read' },
    { id: 'preview.open', method: 'POST', path: '/api/access/entry/preview', protocol: 'webrtc', action: 'preview.view' },
    { id: 'preview.close', method: 'DELETE', path: '/api/access/entry/preview/:sessionId', protocol: 'webrtc', action: 'preview.view' },
  ],
});

describe('projected shared surface client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem('xgcStationToken', 'old-main-credential');
    window.localStorage.setItem('xgcTerminalToken', 'old-terminal-credential');
  });
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('uses only the projected method/path and cookie transport, with a JSON body', async () => {
    const client = createSharedSurfaceClient(projection());
    await client.request('preview.open', { body: { offer: 'fixture' } });
    await client.request('preview.close', { params: { sessionId: 'session-1' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/access/entry/preview');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', redirect: 'error', body: '{"offer":"fixture"}' });
    expect([...new Headers(init.headers).keys()]).toEqual(['accept', 'content-type']);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/access/entry/preview/session-1');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it.each(['../other', '..', '.', 'a/b', 'a\\b', '%2fother', 'a?upstream=x', 'a#other', 'a b'])(
    'rejects path parameter %s before any fetch', async (sessionId) => {
    await expect(createSharedSurfaceClient(projection()).request('preview.close', { params: { sessionId } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown endpoint IDs, missing/extra params and body on a read', async () => {
    const client = createSharedSurfaceClient(projection());
    await expect(client.request('/api/access/entry/preview')).rejects.toThrow(/not granted/);
    await expect(client.request('preview.close')).rejects.toThrow(/parameters/);
    await expect(client.request('preview.close', { params: { sessionId: 'a', target: 'other' } })).rejects.toThrow(/parameters/);
    await expect(client.request('surface.events', { body: {} })).rejects.toThrow(/body/);
    // A JS caller cannot sneak ordinary RequestInit options through the typed ABI.
    await expect(client.request('preview.open', { headers: { Authorization: 'other' } } as never)).rejects.toThrow(/options/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an endpoint whose action was not granted', () => {
    expect(() => createSharedSurfaceClient({ ...projection(), actions: ['surface.read'] })).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns typed HTTPError for owner cleanup/retry decisions', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"lease cleanup pending"}', { status: 503 }));
    const request = createSharedSurfaceClient(projection()).request('preview.close', { params: { sessionId: 'exact-session' } });
    await expect(request).rejects.toBeInstanceOf(HTTPError);
    await expect(request).rejects.toMatchObject({ status: 503, body: { error: 'lease cleanup pending' } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
