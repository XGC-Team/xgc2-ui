// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { fetchNativeAgent,openNativeAgentStream,experimentServicesTransport } from './nativeAgent';

const transport = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock('./streams',() => ({ openReplayJSONStream: transport.replay }));

describe('native Agent station transport',() => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); transport.replay.mockReturnValue({ close: vi.fn() }); });
  it('adds station authority only to the exact same-origin native route',async () => {
    localStorage.setItem('xgcStationToken','fixture-station-token');
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch',fetchMock);
    await fetchNativeAgent('/api/experiments/experiment-a/native-agents/sessions',{ method: 'POST',headers: { 'X-XGC-Native-Client': '1' } });
    const [,init] = fetchMock.mock.calls[0] as unknown as [string,RequestInit];
    expect(new Headers(init.headers).get('X-XGC-Station-Token')).toBe('fixture-station-token');
    expect(new Headers(init.headers).get('X-XGC-Native-Client')).toBe('1');
    expect(() => fetchNativeAgent('https://elsewhere.test/api/experiments/experiment-a/native-agents/sessions')).toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('allows only the exact provider settings routes outside an Experiment',async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch',fetchMock);
    await fetchNativeAgent('/api/native-agents/settings');
    await fetchNativeAgent('/api/native-agents/settings/refresh',{method:'POST'});
    for (const path of ['/api/native-agents/sessions','/api/native-agents/settings?target=other','/api/native-agents/settings/extra']) {
      expect(() => fetchNativeAgent(path)).toThrow();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sends fresh consent only on create/resume and strips caller-provided enrollment',async () => {
    localStorage.setItem('xgcStationToken','fixture-station-token');
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch',fetchMock);
    const scoped = experimentServicesTransport(true);
    const root = '/api/experiments/experiment-a/native-agents';
    for (const [path,method,wantsConsent] of [
      [`${root}/sessions`,'POST',true],
      [`${root}/sessions/s_one/reconnect`,'POST',true],
      [`${root}/sessions/s_one/prompts`,'POST',false],
      [`${root}/sessions`,'GET',false],
    ] as const) {
      await scoped(path,{method,headers:{'X-XGC-Agent-Enrollment':'never-trust-browser','X-XGC-Experiment-Services':'spoof'}});
      const [,init] = fetchMock.mock.calls.at(-1) as unknown as [string,RequestInit];
      expect(new Headers(init.headers).get('X-XGC-Agent-Enrollment')).toBeNull();
      expect(new Headers(init.headers).get('X-XGC-Experiment-Services')).toBe(wantsConsent ? '1' : null);
    }
    await experimentServicesTransport(false)(`${root}/sessions`,{method:'POST',headers:{'X-XGC-Experiment-Services':'1'}});
    const [,init] = fetchMock.mock.calls.at(-1) as unknown as [string,RequestInit];
    expect(new Headers(init.headers).has('X-XGC-Experiment-Services')).toBe(false);
    expect(() => scoped('https://attacker.test/api/experiments/a/native-agents/sessions',{method:'POST'})).toThrow();
  });
  it('requests experiment services without a browser token and leaves operator authentication to Core',async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch',fetchMock);
    await experimentServicesTransport(true)('/api/experiments/experiment-a/native-agents/sessions',{
      method:'POST',headers:{'X-XGC-Experiment-Services':'1'},
    });
    const [,init] = fetchMock.mock.calls[0] as unknown as [string,RequestInit];
    expect(new Headers(init.headers).get('X-XGC-Experiment-Services')).toBe('1');
  });
  it('uses the existing replay transport, committed cursor and native event name',() => {
    const callbacks = { lastEventId: () => '17',onEvent: vi.fn(),onOpen: vi.fn(),onError: vi.fn(),onInvalid: vi.fn() };
    openNativeAgentStream({ url: '/api/experiments/experiment-a/native-agents/sessions/s_one/events?after=17',...callbacks });
    const options = transport.replay.mock.calls[0][0];
    expect(options.path()).toBe('/experiments/experiment-a/native-agents/sessions/s_one/events?after=17');
    expect(options.lastEventId()).toBe('17');
    options.onValue({ seq: 18 },{ event: 'other' });
    expect(callbacks.onEvent).not.toHaveBeenCalled();
    options.onValue({ seq: 18 },{ event: 'native-agent' });
    expect(callbacks.onEvent).toHaveBeenCalledWith({ seq: 18 });
    const invalid = new SyntaxError('invalid native JSON');
    options.onError(invalid);
    expect(callbacks.onInvalid).toHaveBeenCalledWith(invalid);
    const disconnected = new Error('connection lost');
    options.onError(disconnected);
    expect(callbacks.onError).toHaveBeenCalledWith(disconnected);
  });
});
