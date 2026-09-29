// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('confirmed station transport', () => {
  beforeEach(() => { vi.resetModules(); vi.useRealTimers(); window.localStorage.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it('uses the confirmed cookie for terminal, direct station and replay requests despite legacy tokens', async () => {
    vi.stubEnv('VITE_XGC_TERMINAL_TOKEN', 'env-terminal');
    window.localStorage.setItem('xgcTerminalToken', 'stored-terminal');
    window.localStorage.setItem('xgcStationToken', 'stored-station');
    const { confirmStationTransport } = await import('./stationTransport');
    const { request, requestStationResponse, openReplayJSONStream, withTerminalAuth, terminalToken, stationToken } = await import('./http');
    confirmStationTransport('operator-cookie');
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 200 }));
    await request('/terminal/ws-ticket', { method: 'POST', body: '{}' }, withTerminalAuth());
    await requestStationResponse('/api/agent-runtime/settings');
    const opened = vi.fn();
    const stream = openReplayJSONStream({ path: () => '/events', lastEventId: () => 'cursor-7',
      dynamicHeaders: () => ({ 'X-XGC-Execution-Stream-ID': 'execution-1', 'X-XGC-Robot-Stream-ID': 'robot-1' }),
      onValue: vi.fn(), onOpen: () => { opened(); return false; }, reconnectDelayMs: 60_000 });
    await vi.waitFor(() => expect(opened).toHaveBeenCalledOnce());
    stream.close();
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.has('X-XGC-Station-Token')).toBe(false);
      expect(headers.has('X-XGC-Terminal-Token')).toBe(false);
    }
    const streamHeaders = new Headers(vi.mocked(fetch).mock.calls[2]![1]?.headers);
    expect(streamHeaders.get('X-XGC-Execution-Stream-ID')).toBe('execution-1');
    expect(streamHeaders.get('X-XGC-Robot-Stream-ID')).toBe('robot-1');
    expect(streamHeaders.get('Last-Event-ID')).toBe('cursor-7');
    expect(terminalToken()).toBe('');
    expect(stationToken()).toBe('');
    expect(window.localStorage.getItem('xgcTerminalToken')).toBe('stored-terminal');
  });
  it.each(['local', 'header'] as const)('keeps existing explicit terminal behavior for %s transport', async (transport) => {
    vi.stubEnv('VITE_XGC_TERMINAL_TOKEN', 'env-terminal');
    window.localStorage.setItem('xgcStationToken', 'station-header');
    const { confirmStationTransport } = await import('./stationTransport');
    const { request, withTerminalAuth } = await import('./http');
    confirmStationTransport(transport);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await request('/terminal/ws-ticket', { method: 'POST', body: '{}' }, withTerminalAuth());
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers);
    expect(headers.get('X-XGC-Terminal-Token')).toBe('env-terminal');
    expect(headers.get('X-XGC-Station-Token')).toBe('station-header');
  });
  it('does not persist a confirmed transport across page module initialization', async () => {
    const first = await import('./stationTransport');
    first.confirmStationTransport('operator-cookie');
    window.localStorage.setItem('xgcOperatorTransport', 'operator-cookie');
    expect(first.stationUsesOperatorCookie()).toBe(true);
    vi.resetModules();
    const nextPage = await import('./stationTransport');
    expect(nextPage.stationUsesOperatorCookie()).toBe(false);
  });
  it('reports 401 for a confirmed identity but does not turn capability 403 into logout or retry', async () => {
    const { confirmStationTransport, subscribeStationUnauthorized } = await import('./stationTransport');
    const { request } = await import('./http');
    confirmStationTransport('operator-cookie');
    const invalid = vi.fn();
    const unsubscribe = subscribeStationUnauthorized(invalid);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(request('/forbidden-capability')).rejects.toThrow('403');
    expect(invalid).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(request('/expired-session')).rejects.toThrow('401');
    expect(invalid).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it('stops replay authentication failure without reconnecting or switching credentials', async () => {
    vi.useFakeTimers();
    const { confirmStationTransport, subscribeStationUnauthorized } = await import('./stationTransport');
    const { openReplayJSONStream } = await import('./http');
    confirmStationTransport('operator-cookie');
    const invalid = vi.fn();
    const unsubscribe = subscribeStationUnauthorized(invalid);
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 401 }));
    const onError = vi.fn();
    const stream = openReplayJSONStream({ path: () => '/events', lastEventId: () => '', onValue: vi.fn(), onError, reconnectDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(fetch).toHaveBeenCalledOnce();
    expect(invalid).toHaveBeenCalledOnce();
    stream.close();
    unsubscribe();
  });
});
