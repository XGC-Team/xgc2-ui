// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapOperatorSession,
  deleteOperatorSession,
  establishOperatorIdentity,
  establishOperatorSessionWithRetry,
  getOperatorIdentity,
  issueOperatorPairing,
  OperatorAccessError,
} from './operatorAccessService';

// Establish retries wait on real transport backoff; collapse it to keep the
// retry count, not the wall clock, under test.
vi.mock('../../api/http', async () => ({
  ...(await vi.importActual('../../api/http')),
  waitForTransportRetry: () => Promise.resolve(),
}));

const identity = { authenticated: true, transport: 'operator-cookie', stationId: 'station-main', name: 'Main', role: 'owner', capabilities: ['core.view'], visibleCores: ['local'], canPair: false };

describe('operator session transport', () => {
  beforeEach(() => {
    window.localStorage.setItem('xgcStationToken', 'stale-bearer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(identity), { status: 200 })));
  });
  afterEach(() => { window.localStorage.clear(); vi.unstubAllGlobals(); });
  it('exchanges only a JSON ticket through cookie transport despite an old bearer', async () => {
    await expect(bootstrapOperatorSession('one-use')).resolves.toEqual(identity);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(path).toBe('/api/access/operator-session/bootstrap');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBe(JSON.stringify({ token: 'one-use' }));
    const headers = new Headers(init?.headers);
    expect(headers.get('X-XGC-Station-Token')).toBeNull();
    expect(headers.get('Authorization')).toBeNull();
    expect(window.localStorage.getItem('xgcStationToken')).toBe('stale-bearer');
  });
  it('preserves an existing explicit header identity for current identity and logout', async () => {
    await getOperatorIdentity();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await deleteOperatorSession();
    expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual(['/api/access/sessions/current', '/api/access/sessions/current']);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.credentials).toBe('include');
      expect(new Headers(init?.headers).get('X-XGC-Station-Token')).toBe('stale-bearer');
    }
    expect(vi.mocked(fetch).mock.calls[1]![1]?.method).toBe('DELETE');
  });
  it('uses a cookie session without inventing a station header', async () => {
    window.localStorage.removeItem('xgcStationToken');
    await getOperatorIdentity();
    expect(new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers).get('X-XGC-Station-Token')).toBeNull();
  });
  it('delegates only the selected station and backend-reported host', async () => {
    await issueOperatorPairing('station-main', '192.168.51.251');
    const [path, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(path).toBe('/api/access/operator-pairings');
    expect(JSON.parse(String(init?.body))).toEqual({ stationId: 'station-main', host: '192.168.51.251' });
  });
  it('rejects a used ticket and preserves the previous identity', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Ticket consumed' }), { status: 401 }));
    await expect(bootstrapOperatorSession('used')).rejects.toThrow('Ticket consumed');
    expect(window.localStorage.getItem('xgcStationToken')).toBe('stale-bearer');
  });
});

describe('establishOperatorSessionWithRetry', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const localIdentity = { ...identity, transport: 'local', canPair: true };
  function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }

  it('turns local loopback trust into an individual cookie session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(localIdentity));
    vi.mocked(fetch).mockResolvedValueOnce(response(identity));
    await expect(establishOperatorIdentity()).resolves.toEqual(identity);
    expect(vi.mocked(fetch).mock.calls.map(([path]) => path))
      .toEqual(['/api/access/sessions/current', '/api/access/operator-session/local']);
    expect(vi.mocked(fetch).mock.calls[1]![1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('returns a ready cookie identity without re-establishing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(identity));
    await expect(establishOperatorSessionWithRetry()).resolves.toEqual(identity);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('answers a signed-out browser without trying to establish anything', async () => {
    const signedOut = { authenticated: false, canPair: false };
    vi.mocked(fetch).mockResolvedValueOnce(response(signedOut));
    await expect(establishOperatorSessionWithRetry()).resolves.toEqual(signedOut);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures before giving up', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(response(identity));
    await expect(establishOperatorSessionWithRetry()).resolves.toEqual(identity);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('fails fast on a definitive refusal without burning retries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(localIdentity));
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: 'local session requires an unmixed verified local Origin' }, 403));
    const failure = await establishOperatorSessionWithRetry().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OperatorAccessError);
    expect((failure as OperatorAccessError).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rethrows the last transient failure after the retry budget is spent', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network down'));
    await expect(establishOperatorSessionWithRetry()).rejects.toThrow('network down');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
