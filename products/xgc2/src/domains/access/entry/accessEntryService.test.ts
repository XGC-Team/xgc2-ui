// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapAccessEntry, getAccessEntryProjection, openAccessEntryEvents, takeAccessEntryFragmentToken } from './accessEntryService';
import { createSharedSurfaceClient } from './sharedSurfaceService';
import { decodeSharedSurfaceProjection } from './sharedSurfaceDecoder';

const projection = decodeSharedSurfaceProjection({
  contractVersion: 1, entryId: 'entry-1', name: 'Shared preview', expiresAt: '2027-09-20T12:00:00Z',
  moduleId: 'preview', viewContractVersion: 1, actions: ['surface.read'],
  endpoints: [{ id: 'surface.events', method: 'GET', path: '/api/access/entry/projected-events', protocol: 'sse', action: 'surface.read' }],
  scope: { resourceId: 'resource-1' },
});
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function sseStream() {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    send(value: unknown) { streamController.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(value)}\n\n`)); },
    end() { streamController.close(); },
  };
}

describe('guest exchange and projected stream transport', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('bootstraps anonymously even with old main credentials and validates the returned envelope', async () => {
    window.localStorage.setItem('xgcStationToken', 'old-main-credential');
    window.localStorage.setItem('xgcTerminalToken', 'old-terminal-credential');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, projection));
    await expect(bootstrapAccessEntry('token-1')).resolves.toEqual(projection);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/access/entry/bootstrap');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"token":"token-1"}' });
    expect([...new Headers(init.headers).keys()]).toEqual(['accept', 'content-type']);
  });

  it('reads an existing session once without any main-station API requests', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, projection));
    await expect(getAccessEntryProjection()).resolves.toEqual(projection);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/entry');
  });

  it.each([{ ...projection, contractVersion: 2 }, { entryId: 'old-version-entry' }])(
    'rejects malformed/unknown bootstrap payloads', async (body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
    await expect(bootstrapAccessEntry('token')).rejects.toThrow();
  });

  it('reports typed backend rejection without retrying identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'bootstrap expired' }));
    await expect(bootstrapAccessEntry('old')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses only the projected events endpoint and treats server end as terminal', async () => {
    const stream = sseStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    const onProjection = vi.fn(), onClosed = vi.fn();
    const events = openAccessEntryEvents(createSharedSurfaceClient(projection), { onProjection, onClosed });
    stream.send(projection);
    await vi.waitFor(() => expect(onProjection).toHaveBeenCalledWith(projection));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/access/entry/projected-events');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Accept')).toBe('text/event-stream');
    stream.end();
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith('ended'));
    events.close();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not forward malformed event envelopes to a mounted leaf', async () => {
    const stream = sseStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    const onProjection = vi.fn(), onClosed = vi.fn();
    openAccessEntryEvents(createSharedSurfaceClient(projection), { onProjection, onClosed });
    stream.send({ ...projection, contractVersion: 999 });
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith('error'));
    expect(onProjection).not.toHaveBeenCalled();
  });

  it.each([401, 403])('closes once on %i without automatic reconnect', async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: 'revoked' }));
    const onClosed = vi.fn();
    openAccessEntryEvents(createSharedSurfaceClient(projection), { onProjection: vi.fn(), onClosed });
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith('ended'));
    expect(onClosed).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('consumer teardown aborts the request without reporting a new server event', async () => {
    const stream = sseStream();
    fetchMock.mockResolvedValueOnce(stream.response);
    const onClosed = vi.fn();
    const events = openAccessEntryEvents(createSharedSurfaceClient(projection), { onProjection: vi.fn(), onClosed });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    events.close();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    stream.end();
    await Promise.resolve();
    expect(onClosed).not.toHaveBeenCalled();
  });
});

describe('fragment credential lifetime', () => {
  it('consumes the fragment once and removes it before any exchange', () => {
    window.history.replaceState(null, '', '/access-entry#token=tok%20en%2F1');
    expect(takeAccessEntryFragmentToken()).toBe('tok en/1');
    expect(window.location.hash).toBe('');
    expect(takeAccessEntryFragmentToken()).toBe('');
    expect(window.location.pathname).toBe('/access-entry');
  });
  it('also clears an empty/malformed fragment', () => {
    window.history.replaceState(null, '', '/access-entry#token=');
    expect(takeAccessEntryFragmentToken()).toBe('');
    expect(window.location.hash).toBe('');
  });
});
