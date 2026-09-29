// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveAccessEntry } from './accessEntryParticipantService';

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('participant exit receipt', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });

  it.each([false, true])('distinguishes revocation from cleanup pending=%s', async (cleanupPending) => {
    window.localStorage.setItem('xgcStationToken', 'unrelated-main-token');
    window.localStorage.setItem('xgcTerminalToken', 'unrelated-terminal-token');
    const receipt = { participantId: 'visitor-A', status: 'revoked', cleanupPending };
    fetchMock.mockResolvedValueOnce(jsonResponse(cleanupPending ? 202 : 200, receipt));
    await expect(leaveAccessEntry()).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/access/entry/session');
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'include', cache: 'no-store' });
    expect([...new Headers(init.headers).keys()]).toEqual(['accept']);
    expect(init.body).toBeUndefined();
  });

  it.each([401, 403, 409, 500])('does not claim cleanup from HTTP %i', async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: 'not confirmed' }));
    await expect(leaveAccessEntry()).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [200, { participantId: 'A', status: 'active', cleanupPending: false }],
    [200, { participantId: '', status: 'revoked', cleanupPending: false }],
    [200, { participantId: 'A', status: 'revoked', cleanupPending: true }],
    [202, { participantId: 'A', status: 'revoked', cleanupPending: false }],
    [200, { participantId: 'A', status: 'revoked' }],
    [200, null],
  ])('rejects inconsistent or incomplete receipts (%i)', async (status, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status as number, body));
    await expect(leaveAccessEntry()).rejects.toThrow();
  });

  it('does not turn a bare 204 into a release receipt', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(leaveAccessEntry()).rejects.toThrow();
  });
});
