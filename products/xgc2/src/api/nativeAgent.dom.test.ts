// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const nativePath = '/api/experiments/exp-a/native-agents/sessions?after=4';

describe('Native Agent station transport', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    vi.stubGlobal('fetch',vi.fn());
    vi.stubEnv('VITE_API_BASE','https://other-core.example/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it('preserves the native raw error response and request controls on the current station', async () => {
    const { fetchNativeAgent } = await import('./nativeAgent');
    window.localStorage.setItem('xgcStationToken','station-token');
    const response = new Response('native protocol rejection',{ status: 409 });
    vi.mocked(fetch).mockResolvedValue(response);
    const controller = new AbortController();
    const headers = new Headers({
      Accept: 'application/x-native-response',
      'Content-Type': 'application/x-native-request',
      'X-XGC-Station-Token': 'caller-token',
      'X-Idempotency-Key': 'attempt-a',
    });

    const result = await fetchNativeAgent(new URL(nativePath,window.location.origin),{
      method: 'POST',body: 'native request',signal: controller.signal,headers,credentials: 'omit',
    });

    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(await result.text()).toBe('native protocol rejection');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path,init] = vi.mocked(fetch).mock.calls[0]!;
    expect(path).toBe(nativePath);
    expect(init).toMatchObject({ method: 'POST',body: 'native request',credentials: 'include' });
    expect(init?.signal).toBe(controller.signal);
    const sentHeaders = init?.headers as Headers;
    expect(sentHeaders.get('X-XGC-Station-Token')).toBe('station-token');
    expect(sentHeaders.get('Accept')).toBe('application/x-native-response');
    expect(sentHeaders.get('Content-Type')).toBe('application/x-native-request');
    expect(sentHeaders.get('X-Idempotency-Key')).toBe('attempt-a');
    expect(headers.get('X-XGC-Station-Token')).toBe('caller-token');
    expect(window.localStorage.getItem('xgcStationToken')).toBe('station-token');
  });

  it.each([
    'https://other-station.example/api/experiments/exp-a/native-agents/sessions',
    '/api/experiments/native-agents/sessions',
    '/api/experiments/exp-a/native-agents-other/sessions',
    '/api/cores/core-a/proxy/experiments/exp-a/native-agents/sessions',
    '/api/experiments/exp-a/../native-agents/sessions',
  ])('rejects a path outside an exact local Experiment before transport: %s', async (path) => {
    const { fetchNativeAgent } = await import('./nativeAgent');
    expect(() => fetchNativeAgent(path)).toThrow('current station and an exact Experiment');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes transport cancellation through without retrying or replacing the error', async () => {
    const { fetchNativeAgent } = await import('./nativeAgent');
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException('cancelled','AbortError');
    vi.mocked(fetch).mockRejectedValue(error);

    await expect(fetchNativeAgent(nativePath,{ signal: controller.signal })).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it('keeps the generic raw transport on station API paths without adding JSON headers', async () => {
    const { requestStationResponse } = await import('./http');
    vi.mocked(fetch).mockResolvedValue(new Response('plain'));

    expect(() => requestStationResponse('https://elsewhere.example/api/raw')).toThrow('current-station API path');
    expect(() => requestStationResponse('/public/raw')).toThrow('current-station API path');
    expect(fetch).not.toHaveBeenCalled();
    await requestStationResponse('/api/raw');
    const headers = vi.mocked(fetch).mock.calls[0]![1]?.headers as Headers;
    expect(headers.has('Accept')).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.has('X-XGC-Station-Token')).toBe(false);
  });
});
