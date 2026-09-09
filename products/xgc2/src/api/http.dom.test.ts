// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const defaultFetch = globalThis.fetch;

describe('api http transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    globalThis.fetch = defaultFetch;
  });

  it('normalizes routed paths', async () => {
    const { routedPath,withTerminalAuth } = await import('./http');

    expect(routedPath('x')).toBe('/x');
    expect(routedPath('/x')).toBe('/x');
    expect(routedPath('/x', { targetCoreId: '   ' })).toBe('/x');
    expect(routedPath('/x', { targetCoreId: 'core 1' })).toBe('/cores/core%201/proxy/x');
    expect(withTerminalAuth({ targetCoreId: 'core-a' })).toEqual({ targetCoreId: 'core-a', auth: 'terminal' });
  });

  it('normalizes api URLs without duplicate api segments or slashes', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://example.com/api/');
    const [{ API_BASE },{ apiUrl }] = await Promise.all([import('../config/apiBase'),import('./http')]);

    expect(API_BASE).toBe('https://example.com/api');
    expect(apiUrl('terminal/sessions')).toBe('https://example.com/api/terminal/sessions');
    expect(apiUrl('/terminal/sessions')).toBe('https://example.com/api/terminal/sessions');
    expect(apiUrl('/execution-targets/local/process-instances', { targetCoreId: 'core-a' })).toBe(
      'https://example.com/api/cores/core-a/proxy/execution-targets/local/process-instances',
    );
  });

  it('merges JSON headers without letting init.headers overwrite transport headers', async () => {
    vi.stubEnv('VITE_XGC_TERMINAL_TOKEN', 'secret-token');
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/terminal/hosts', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'X-Custom': 'abc',
      },
    }, { auth: 'terminal' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-XGC-Terminal-Token')).toBe('secret-token');
    expect(headers.get('X-Custom')).toBe('abc');
  });

  it('does not send JSON content type for bodyless GET requests', async () => {
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/terminal/hosts');

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('records bounded Core request correlation without query credentials', async () => {
    const fetchMock = mockResponse(() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'X-Request-ID': 'request-7',
        'X-XGC-Command-ID': 'command-7',
      },
    }));
    const [{ request },trace] = await Promise.all([import('./http'),import('./requestTrace')]);
    trace.clearCoreRequestTracesForTest();

    await request('/experiments/exp-7?token=must-not-leak', undefined, {
      targetCoreId: 'core-dev-lab',
      managedHostId: 'host-local',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(trace.recentCoreRequestTraces()).toEqual([expect.objectContaining({
      method: 'GET',
      path: '/cores/core-dev-lab/proxy/experiments/exp-7',
      status: 200,
      outcome: 'succeeded',
      requestId: 'request-7',
      commandId: 'command-7',
      targetCoreId: 'core-dev-lab',
      managedHostId: 'host-local',
    })]);
    expect(JSON.stringify(trace.recentCoreRequestTraces())).not.toContain('must-not-leak');
  });

  it('returns the trace produced by the exact Core request to evidence callers', async () => {
    mockResponse(() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'X-Request-ID': 'capture-exact-1' },
    }));
    const { requestWithTrace } = await import('./http');

    const result = await requestWithTrace<{ ok: boolean }>('/execution-targets/local/problem-snapshots', {
      method: 'POST',
      headers: { 'X-Request-ID': 'capture-exact-1' },
      body: '{}',
    });

    expect(result.value).toEqual({ ok: true });
    expect(result.trace).toMatchObject({
      method: 'POST',
      path: '/execution-targets/local/problem-snapshots',
      status: 200,
      outcome: 'succeeded',
      requestId: 'capture-exact-1',
    });
  });

  it('does not record credential-free external requests as Core traffic', async () => {
    mockJsonFetch({ ok: true });
    const [{ requestExternalJSON },trace] = await Promise.all([import('./http'),import('./requestTrace')]);
    trace.clearCoreRequestTracesForTest();

    await requestExternalJSON('https://agent.example.test/api/intake/work-items?token=must-not-leak');

    expect(trace.recentCoreRequestTraces()).toEqual([]);
  });

  it('sends external JSON directly without browser credentials', async () => {
    window.localStorage.setItem('xgcStationToken', 'station-secret');
    window.localStorage.setItem('xgcTerminalToken', 'terminal-secret');
    const fetchMock = mockJsonFetch({ ok: true });
    const { requestExternalJSON } = await import('./http');

    await requestExternalJSON('http://192.0.2.20:18090/api/v1/sources/front/sessions', {
      method: 'POST',
      body: JSON.stringify({ sdp: 'v=0' }),
      credentials: 'include',
      redirect: 'follow',
      referrerPolicy: 'origin',
      headers: {
        Authorization: 'Bearer supplied',
        Cookie: 'session=supplied',
        'X-XGC-Station-Token': 'supplied-station',
        'X-XGC-Terminal-Token': 'supplied-terminal',
      },
    });

    expect(fetchMock.mock.calls[0][0])
      .toBe('http://192.0.2.20:18090/api/v1/sources/front/sessions');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init).toMatchObject({
      credentials: 'omit',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Cookie')).toBe(false);
    expect(headers.has('X-XGC-Station-Token')).toBe(false);
    expect(headers.has('X-XGC-Terminal-Token')).toBe(false);
  });

  it('preserves caller accept headers', async () => {
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/terminal/hosts', { headers: { Accept: 'text/plain' } });

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Accept')).toBe('text/plain');
  });

  it('terminal auth owns the terminal token header', async () => {
    vi.stubEnv('VITE_XGC_TERMINAL_TOKEN', 'real-token');
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/terminal/hosts', {
      headers: {
        'X-XGC-Terminal-Token': 'fake-token',
      },
    }, { auth: 'terminal' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('X-XGC-Terminal-Token')).toBe('real-token');
  });

  it('reads terminal tokens from localStorage and tolerates storage errors', async () => {
    window.localStorage.setItem('xgcTerminalToken', 'stored-token');
    let fetchMock = mockJsonFetch({ ok: true });
    const { request, terminalToken } = await import('./http');

    expect(terminalToken()).toBe('stored-token');
    await request('/terminal/hosts', undefined, { auth: 'terminal' });
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('X-XGC-Terminal-Token')).toBe('stored-token');

    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    fetchMock = mockJsonFetch({ ok: true });
    expect(terminalToken()).toBe('');
    await request('/terminal/hosts', undefined, { auth: 'terminal' });
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).has('X-XGC-Terminal-Token')).toBe(false);
    if (originalLocalStorage) Object.defineProperty(window, 'localStorage', originalLocalStorage);
  });

  it('sends only an explicitly stored station token and never bootstraps from build-time variables', async () => {
    const labOrigin = `http://${'127.0.0.1'}:18787`;
    vi.stubEnv('VITE_API_BASE', `${labOrigin}/api`);
    vi.stubEnv('VITE_XGC_AUTO_STATION_SESSION', '1');
    vi.stubEnv('VITE_XGC_STATION_NAME', 'Main GCS');
    vi.stubEnv('VITE_XGC_STATION_FINGERPRINT', 'local-main');
    vi.stubEnv('VITE_XGC_STATION_INVITE_TOKEN', 'must-not-be-read-by-browser-transport');
    vi.stubEnv('VITE_XGC_STATION_CREDENTIAL', 'must-not-be-read-by-browser-transport');
    window.localStorage.setItem('xgcStationToken', 'existing-token');
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/cores');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${labOrigin}/api/cores`);
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('X-XGC-Station-Token')).toBe('existing-token');
  });

  it('does not renew, clear, or retry a rejected station token implicitly', async () => {
    const labOrigin = `http://${'127.0.0.1'}:18787`;
    vi.stubEnv('VITE_API_BASE', `${labOrigin}/api`);
    vi.stubEnv('VITE_XGC_AUTO_STATION_SESSION', '1');
    vi.stubEnv('VITE_XGC_STATION_INVITE_TOKEN', 'must-not-be-read-by-browser-transport');
    vi.stubEnv('VITE_XGC_STATION_CREDENTIAL', 'must-not-be-read-by-browser-transport');
    window.localStorage.setItem('xgcStationToken', 'stale-token');
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(
      JSON.stringify({ error: 'station grant is revoked' }),
      { status: 403,statusText: 'Forbidden' },
    )));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { request,stationToken } = await import('./http');

    await expect(request('/cores')).rejects.toThrow('403 Forbidden: station grant is revoked');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${labOrigin}/api/cores`);
    expect(stationToken()).toBe('stale-token');
  });

  it('accepts Headers, tuple arrays, and records as input headers', async () => {
    const fetchMock = mockJsonFetch({ ok: true });
    const { request } = await import('./http');

    await request('/a', { headers: new Headers({ 'X-A': '1' }) });
    await request('/b', { headers: [['X-B', '2']] });
    await request('/c', { headers: { 'X-C': '3' } });

    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('X-A')).toBe('1');
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Headers).get('X-B')).toBe('2');
    expect(((fetchMock.mock.calls[2][1] as RequestInit).headers as Headers).get('X-C')).toBe('3');
  });

  it('waits for transport retry delays and clamps negative delays to zero', async () => {
    vi.useFakeTimers();
    const { waitForTransportRetry } = await import('./http');
    let delayedResolved = false;
    const delayed = waitForTransportRetry(25).then(() => { delayedResolved = true; });
    const clamped = waitForTransportRetry(-5);

    await vi.advanceTimersByTimeAsync(0);
    await clamped;
    expect(delayedResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(25);
    await delayed;
    expect(delayedResolved).toBe(true);
  });

  it('times out and aborts requests', async () => {
    vi.useFakeTimers();
    const { request } = await import('./http');
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const promise = request('/slow', undefined, { timeoutMs: 25 });
    const expectation = expect(promise).rejects.toThrow('request timeout after 25ms: /slow');
    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('honors caller abort signals before and during requests', async () => {
    const { request } = await import('./http');

    const preAborted = new AbortController();
    preAborted.abort();
    const preAbortFetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    globalThis.fetch = preAbortFetchMock as unknown as typeof fetch;
    await expect(request('/pre-aborted', { signal: preAborted.signal })).rejects.toThrow('aborted');

    const controller = new AbortController();
    const callerAbortFetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    globalThis.fetch = callerAbortFetchMock as unknown as typeof fetch;
    const promise = request('/caller-abort', { signal: controller.signal }, { timeoutMs: 1000 });
    controller.abort();
    await expect(promise).rejects.toThrow('aborted');
    expect(callerAbortFetchMock).toHaveBeenCalledTimes(1);
    expect((callerAbortFetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('reads error details from error and message fields', async () => {
    const { HTTPError,request } = await import('./http');

    mockResponse(new Response(JSON.stringify({ error: 'bad input' }), { status: 400, statusText: 'Bad Request' }));
    await expect(request('/bad')).rejects.toThrow('400 Bad Request: bad input');

    mockResponse(new Response(JSON.stringify({ message: 'missing' }), { status: 404, statusText: 'Not Found' }));
    await expect(request('/missing')).rejects.toThrow('404 Not Found: missing');

    mockResponse(new Response('', { status: 500, statusText: 'Server Error' }));
    await expect(request('/empty-error')).rejects.toThrow('500 Server Error');

    mockResponse(new Response('not json', { status: 502, statusText: 'Bad Gateway' }));
    await expect(request('/bad-json-error')).rejects.toThrow('502 Bad Gateway');

    mockResponse(new Response(JSON.stringify({}), { status: 409, statusText: 'Conflict' }));
    await expect(request('/empty-json-error')).rejects.toThrow('409 Conflict');

    const conflictBody = { error: 'exclusive resource is held by another run: run-a',run: { id: 'run-a' } };
    mockResponse(new Response(JSON.stringify(conflictBody), { status: 409, statusText: 'Conflict' }));
    const conflict = await request('/conflict').catch((cause: unknown) => cause);
    expect(conflict).toBeInstanceOf(HTTPError);
    expect(conflict).toMatchObject({ status: 409,body: conflictBody });
  });

  it('returns undefined for empty JSON responses', async () => {
    const { request } = await import('./http');

    mockResponse(new Response(null, { status: 204, statusText: 'No Content' }));
    await expect(request('/empty')).resolves.toBeUndefined();

    mockResponse(new Response('', { status: 200, statusText: 'OK' }));
    await expect(request('/empty-text')).resolves.toBeUndefined();
  });

  it('supports blob, form-data, and binary upload requests with their exact transport headers', async () => {
    const fetchMock = mockResponse(() => new Response('ok', { status: 200 }));
    const { requestBlob,uploadBinaryRequest,uploadRequest } = await import('./http');

    const blob = await requestBlob('files/download', undefined, { targetCoreId: 'core 1', timeoutMs: 100 });
    expect(blob.size).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/cores/core%201/proxy/files/download');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ uploaded: true }), { status: 200 }));
    const data = new FormData();
    data.append('file', new Blob(['x']));
    await uploadRequest('/host/files/upload', data, { auth: 'terminal' });
    const uploadInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = uploadInit.headers as Headers;
    expect(headers.has('Content-Type')).toBe(false);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ uploaded: true }), { status: 200 }));
    const binary = new Blob(['recording']);
    await uploadBinaryRequest('/recordings/chunks/1', binary, { targetCoreId: 'core-a' });
    const binaryInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect(fetchMock.mock.calls[2][0]).toContain('/api/cores/core-a/proxy/recordings/chunks/1');
    expect(binaryInit.method).toBe('PUT');
    expect(binaryInit.body).toBe(binary);
    expect((binaryInit.headers as Headers).get('Content-Type')).toBe('application/octet-stream');
  });

  it('reconnects replay streams after non-abort failures', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const onError = vi.fn();
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onError,reconnectDelayMs: 5,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
    await vi.advanceTimersByTimeAsync(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stream.close();
  });

  it('awaits replay preflight and evaluates connection headers afterwards', async () => {
    let releasePreflight: (() => void) | undefined;
    const beforeConnect = vi.fn(() => new Promise<void>((resolve) => { releasePreflight = resolve; }));
    const dynamicHeaders = vi.fn(() => ({ 'X-Dynamic-Cursor': 'stream-2' }));
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start() {} }),
      { status: 200 },
    )));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '7',beforeConnect,dynamicHeaders,
      onValue: vi.fn(),reconnectDelayMs: 60_000,
    });

    await vi.waitFor(() => expect(beforeConnect).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    releasePreflight?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-Dynamic-Cursor')).toBe('stream-2');
    expect(headers.get('Last-Event-ID')).toBe('7');
    stream.close();
  });

  it('reconnects when replay open validation rejects a response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start() {} }),
      { status: 200 },
    )));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const onOpen = vi.fn().mockResolvedValue(false);
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onOpen,reconnectDelayMs: 5,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stream.close();
  });

  it('does not reconnect after closing during replay open validation', async () => {
    vi.useFakeTimers();
    let rejectOpen: ((value: false) => void) | undefined;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({ start() {} }),
      { status: 200 },
    )));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),reconnectDelayMs: 5,
      onOpen: () => new Promise<false>((resolve) => { rejectOpen = resolve; }),
    });

    await vi.waitFor(() => expect(rejectOpen).toBeTypeOf('function'));
    stream.close();
    rejectOpen?.(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['headers','json','consumer','status'] as const)(
    'releases a failed %s response before reconnecting the replay stream',
    async (failure) => {
      vi.useFakeTimers();
      const lifecycle: string[] = [];
      const fetchMock = vi.fn(() => {
        lifecycle.push('open');
        return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(
              failure === 'json' ? 'data: invalid-json\n\n' : 'data: {}\n\n',
            ));
          },
          cancel() { lifecycle.push('cancel'); },
        }), { status: failure === 'status' ? 503 : 200 }));
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      const { openReplayJSONStream } = await import('./http');
      const onError = vi.fn();
      const stream = openReplayJSONStream({
        path: () => '/events',lastEventId: () => '',reconnectDelayMs: 5,onError,
        onOpen: () => { if (failure === 'headers') throw new Error('invalid stream identity'); },
        onValue: () => { throw new Error('invalid event identity'); },
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledOnce();
      expect(lifecycle).toEqual(['open','cancel']);
      await vi.advanceTimersByTimeAsync(5);
      expect(lifecycle).toEqual(['open','cancel','open','cancel']);
      stream.close();
    },
  );

  it('does not connect or reconnect when closed during async replay preflight', async () => {
    let releasePreflight: (() => void) | undefined;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',
      beforeConnect: () => new Promise<void>((resolve) => { releasePreflight = resolve; }),
      onValue: vi.fn(),reconnectDelayMs: 0,
    });

    await vi.waitFor(() => expect(releasePreflight).toBeTypeOf('function'));
    stream.close();
    releasePreflight?.();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silently reconnects replay streams after unexpected abort errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const onError = vi.fn();
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onError,reconnectDelayMs: 5,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    stream.close();
  });

  it('does not reconnect after closing an active replay stream', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const onError = vi.fn();
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onError,reconnectDelayMs: 5,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stream.close();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not reconnect when a response body finishes after the stream is closed', async () => {
    vi.useFakeTimers();
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) { bodyController = controller; },
    }), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '',onValue: vi.fn(),reconnectDelayMs: 5,
    });

    await vi.waitFor(() => expect(bodyController).toBeDefined());
    stream.close();
    bodyController?.close();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends station identity and parses a replay stream response', async () => {
    window.localStorage.setItem('xgcStationToken', 'station-1');
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('id: 1\nevent: update\ndata: {"ok":true}\n\n'));
        controller.close();
      },
    }), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { openReplayJSONStream } = await import('./http');
    const onValue = vi.fn();
    const stream = openReplayJSONStream({
      path: () => '/events',lastEventId: () => '0',onValue,reconnectDelayMs: 60_000,
    });

    await vi.waitFor(() => expect(onValue).toHaveBeenCalledWith({ ok: true }, expect.objectContaining({ id: '1',event: 'update' })));
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('X-XGC-Station-Token')).toBe('station-1');
    expect(headers.get('Last-Event-ID')).toBe('0');
    stream.close();
  });

  it('reports non-success and bodyless replay stream responses', async () => {
    const { openReplayJSONStream } = await import('./http');
    const onError = vi.fn();
    let fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    let stream = openReplayJSONStream({ path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onError,reconnectDelayMs: 60_000 });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'event stream failed: 503' })));
    stream.close();

    onError.mockClear();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    stream = openReplayJSONStream({ path: () => '/events',lastEventId: () => '',onValue: vi.fn(),onError,reconnectDelayMs: 60_000 });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'event stream has no response body' })));
    stream.close();
  });

  it('delivers a final SSE frame without a trailing separator', async () => {
    const { consumeSSEBody } = await import('./http');
    const encoder = new TextEncoder();
    const messages: unknown[] = [];
    await consumeSSEBody(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': keepalive\n\nevent: final\ndata: done'));
        controller.close();
      },
    }), (message) => messages.push(message));
    expect(messages).toEqual([{ id: '',event: 'final',data: 'done' }]);
  });

  it('parses SSE fields with and without delimiters or leading spaces', async () => {
    const { parseSSEFrame } = await import('./http');

    expect(parseSSEFrame('id: 7\nevent: update\ndata:value')).toEqual({ id: '7',event: 'update',data: 'value' });
    expect(parseSSEFrame('data')).toBeNull();
  });
});

function mockJsonFetch(payload: unknown) {
  return mockResponse(() => new Response(JSON.stringify(payload), { status: 200 }));
}

function mockResponse(response: Response | (() => Response)) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
    typeof response === 'function' ? response() : response,
  ));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
