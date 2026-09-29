import { beforeEach,describe,expect,it,vi } from 'vitest';
import { request } from '../../api/http';
import {
  createAccessEntry,
  getAccessEntry,
  listAccessEntries,
  listAccessEntryParticipants,
  revokeAccessEntry,
  revokeAccessEntryParticipant,
  rotateAccessEntryBootstrap,
  startAccessEntry,
  stopAccessEntry,
} from './accessService';
import type { AccessEntry } from './accessTypes';

vi.mock('../../api/http', () => ({ request: vi.fn() }));

const entry: AccessEntry = {
  id: 'entry-1',
  grantId: 'grant-1',
  name: 'Front camera',
  listenHost: '0.0.0.0',
  requestedPort: 0,
  boundPort: 49152,
  status: 'running',
  surface: { kind: 'experiment-panel', experimentId: 'exp-1', panelId: 'panel-1' },
  capabilities: ['surface.read', 'camera.live'],
  actions: ['surface.read', 'camera.live'],
  advertisedHosts: ['192.168.51.251'],
  expiresAt: '2026-09-19T12:00:00Z',
  entryPath: '/access-entry',
};

describe('accessService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists entries from the management collection', async () => {
    vi.mocked(request).mockResolvedValueOnce({ entries: [entry] });
    await expect(listAccessEntries()).resolves.toEqual([entry]);
    expect(request).toHaveBeenCalledWith('/access/entries', { signal: undefined, cache: 'no-store' });
  });

  it('rejects a non-object list response', async () => {
    vi.mocked(request).mockResolvedValueOnce(null);
    await expect(listAccessEntries()).rejects.toThrow(/access entries/);
  });

  it('creates an entry with the exact authored body', async () => {
    const issued = { entry, bootstrapToken: 'token-1', bootstrapExpiresAt: '2026-09-19T10:02:00Z' };
    vi.mocked(request).mockResolvedValueOnce(issued);
    const body = {
      name: 'Front camera',
      listenHost: '0.0.0.0',
      port: 0,
      expiresAt: '2026-09-19T12:00:00Z',
      actions: ['surface.read', 'camera.live'],
      surface: { kind: 'experiment-panel', experimentId: 'exp-1', panelId: 'panel-1' } as const,
    };
    await expect(createAccessEntry(body)).resolves.toEqual(issued);
    expect(request).toHaveBeenCalledWith('/access/entries', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: undefined,
    });
  });

  it('addresses start/stop/bootstrap/delete at the exact entry resource', async () => {
    vi.mocked(request).mockResolvedValue(entry);
    await startAccessEntry('entry 1');
    await stopAccessEntry('entry 1');
    await rotateAccessEntryBootstrap('entry 1');
    await revokeAccessEntry('entry 1');
    await getAccessEntry('entry 1');
    expect(vi.mocked(request).mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ['/access/entries/entry%201/start', 'POST'],
      ['/access/entries/entry%201/stop', 'POST'],
      ['/access/entries/entry%201/bootstrap', 'POST'],
      ['/access/entries/entry%201', 'DELETE'],
      ['/access/entries/entry%201', undefined],
    ]);
  });

  it('lists and revokes one visitor on the entry participant collection', async () => {
    const participants = [{
      id: 'session-1',
      name: 'Front camera',
      status: 'active',
      createdAt: '2026-09-20T12:00:00Z',
      lastSeenAt: '2026-09-20T12:01:00Z',
      expiresAt: '2026-09-20T13:00:00Z',
      mediaSessions: 1,
      cleanupPending: false,
      holdingControl: false,
    }];
    vi.mocked(request).mockResolvedValueOnce({ participants });
    await expect(listAccessEntryParticipants('entry 1')).resolves.toEqual(participants);
    vi.mocked(request).mockResolvedValueOnce(undefined);
    await revokeAccessEntryParticipant('entry 1', 'session 1');
    expect(vi.mocked(request).mock.calls.slice(-2).map(([path, init]) => [path, init?.method])).toEqual([
      ['/access/entries/entry%201/participants', undefined],
      ['/access/entries/entry%201/participants/session%201', 'DELETE'],
    ]);
  });
});
