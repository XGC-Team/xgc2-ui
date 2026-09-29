// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAccessEntry,
  listAccessEntries,
  revokeAccessEntry,
  rotateAccessEntryBootstrap,
  startAccessEntry,
  stopAccessEntry,
} from './accessService';
import type { AccessEntry, AccessEntryIssued, CreateAccessEntryBody } from './accessTypes';
import { useAccessEntries } from './useAccessEntries';

vi.mock('./accessService', () => ({
  createAccessEntry: vi.fn(),
  listAccessEntries: vi.fn(),
  revokeAccessEntry: vi.fn(),
  rotateAccessEntryBootstrap: vi.fn(),
  startAccessEntry: vi.fn(),
  stopAccessEntry: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function entry(id: string, status: AccessEntry['status'] = 'running'): AccessEntry {
  return {
    id,
    grantId: `grant-${id}`,
    name: `Camera ${id}`,
    listenHost: '0.0.0.0',
    requestedPort: 0,
    boundPort: status === 'running' ? 49152 : 0,
    status,
    surface: { kind: 'experiment-panel', experimentId: 'experiment-a', panelId: 'camera-a' },
    capabilities: ['core.view', 'experiment.read', 'operations.process.read'],
    actions: ['surface.read', 'camera.live'],
    advertisedHosts: ['192.168.1.9'],
    expiresAt: '2026-09-20T14:00:00Z',
    entryPath: '/access-entry',
  };
}

function issued(value: AccessEntry): AccessEntryIssued {
  return { entry: value, bootstrapToken: 'test-bootstrap', bootstrapExpiresAt: '2026-09-20T12:02:00Z' };
}

const createBody: CreateAccessEntryBody = {
  name: 'Camera entry-a',
  listenHost: '0.0.0.0',
  port: 0,
  expiresAt: '2026-09-20T14:00:00Z',
  actions: ['surface.read', 'camera.live'],
  surface: { kind: 'experiment-panel', experimentId: 'experiment-a', panelId: 'camera-a' },
};

async function mountEntries(initial: AccessEntry[]) {
  vi.mocked(listAccessEntries).mockResolvedValueOnce(initial);
  const hook = renderHook(() => useAccessEntries());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.entries).toEqual(initial);
  return hook;
}

beforeEach(() => {
  vi.resetAllMocks();
  // A mutation's follow-up GET remains pending unless the test supplies its
  // response. This separates the mutation receipt from a later list snapshot.
  vi.mocked(listAccessEntries).mockImplementation(() => deferred<AccessEntry[]>().promise);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useAccessEntries', () => {
  it.each(['create', 'start'] as const)('projects the %s receipt before the list refresh completes', async (operation) => {
    const initial = operation === 'create' ? [] : [entry('entry-a', 'stopped')];
    const { result } = await mountEntries(initial);
    const response = deferred<AccessEntryIssued>();
    const refreshed = deferred<AccessEntry[]>();
    vi.mocked(listAccessEntries).mockReturnValueOnce(refreshed.promise);
    vi.mocked(createAccessEntry).mockReturnValueOnce(response.promise);
    vi.mocked(startAccessEntry).mockReturnValueOnce(response.promise);
    const receipt = issued(entry('entry-a'));
    let pending!: Promise<AccessEntryIssued | undefined>;

    act(() => {
      pending = operation === 'create' ? result.current.create(createBody) : result.current.start('entry-a');
    });
    expect(result.current.busyId).toBe(operation === 'create' ? 'new' : 'entry-a');
    await act(async () => {
      response.resolve(receipt);
      expect(await pending).toEqual(receipt);
    });

    // The page can select this entry and retain its fresh access link even
    // while the authoritative post-mutation list is still in flight.
    expect(result.current.entries).toEqual([receipt.entry]);
    expect(result.current.busyId).toBe('');
    await act(async () => { refreshed.resolve([receipt.entry]); });
    expect(result.current.entries).toEqual([receipt.entry]);
  });

  it.each(['stop', 'revoke'] as const)('does not let an earlier GET undo an acknowledged %s', async (operation) => {
    const running = entry('entry-a');
    const { result } = await mountEntries([running]);
    const earlierList = deferred<AccessEntry[]>();
    const followUpList = deferred<AccessEntry[]>();
    const stopResponse = deferred<AccessEntry>();
    const revokeResponse = deferred<void>();
    vi.mocked(listAccessEntries)
      .mockReturnValueOnce(earlierList.promise)
      .mockReturnValueOnce(followUpList.promise);
    vi.mocked(stopAccessEntry).mockReturnValueOnce(stopResponse.promise);
    vi.mocked(revokeAccessEntry).mockReturnValueOnce(revokeResponse.promise);
    let earlierRefresh!: Promise<void>;
    let mutation!: Promise<unknown>;
    act(() => {
      earlierRefresh = result.current.refresh();
      mutation = operation === 'stop' ? result.current.stop(running.id) : result.current.revoke(running.id);
    });

    const status = operation === 'stop' ? 'stopped' : 'revoked';
    await act(async () => {
      if (operation === 'stop') stopResponse.resolve(entry(running.id, status));
      else revokeResponse.resolve(undefined);
      await mutation;
    });
    expect(result.current.entries.find((item) => item.id === running.id)?.status).toBe(status);

    await act(async () => {
      earlierList.resolve([running]);
      await earlierRefresh;
    });
    expect(result.current.entries.find((item) => item.id === running.id)?.status).toBe(status);
    await act(async () => { followUpList.resolve([entry(running.id, status)]); });
    expect(result.current.entries.find((item) => item.id === running.id)?.status).toBe(status);
  });

  it('keeps the newer refresh when two GETs complete in reverse order', async () => {
    const oldEntry = entry('entry-a');
    const latestEntry = entry('entry-a', 'stopped');
    const { result } = await mountEntries([oldEntry]);
    const older = deferred<AccessEntry[]>();
    const newer = deferred<AccessEntry[]>();
    vi.mocked(listAccessEntries).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    let olderRefresh!: Promise<void>;
    let newerRefresh!: Promise<void>;
    act(() => {
      olderRefresh = result.current.refresh();
      newerRefresh = result.current.refresh();
    });
    await act(async () => { newer.resolve([latestEntry]); await newerRefresh; });
    expect(result.current.entries).toEqual([latestEntry]);
    await act(async () => { older.resolve([oldEntry]); await olderRefresh; });
    expect(result.current.entries).toEqual([latestEntry]);
  });

  it('does not clear a newer refresh failure with an older successful response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const known = entry('entry-a');
    const { result } = await mountEntries([known]);
    const older = deferred<AccessEntry[]>();
    const newer = deferred<AccessEntry[]>();
    vi.mocked(listAccessEntries).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    let olderRefresh!: Promise<void>;
    let newerRefresh!: Promise<void>;
    act(() => {
      olderRefresh = result.current.refresh();
      newerRefresh = result.current.refresh();
    });
    await act(async () => { newer.reject(new Error('private upstream diagnostic')); await newerRefresh; });
    expect(result.current.error).toBe('load');
    expect(result.current.entries).toEqual([known]);
    await act(async () => { older.resolve([]); await olderRefresh; });
    expect(result.current.error).toBe('load');
    expect(result.current.entries).toEqual([known]);
  });

  it('loads after StrictMode effect replay and ignores the retired effect response', async () => {
    const retired = deferred<AccessEntry[]>();
    const replayed = deferred<AccessEntry[]>();
    vi.mocked(listAccessEntries).mockReturnValueOnce(retired.promise).mockReturnValueOnce(replayed.promise);
    const { result } = renderHook(() => useAccessEntries(), { wrapper: StrictMode });
    const current = entry('entry-a', 'stopped');

    await act(async () => { replayed.resolve([current]); });
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([current]);
    await act(async () => { retired.resolve([entry('entry-a')]); });
    expect(result.current.entries).toEqual([current]);
  });

  it('attributes a late action failure to its exact entry after the consumer clears old feedback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = await mountEntries([entry('entry-a', 'stopped'), entry('entry-b')]);
    const response = deferred<AccessEntryIssued>();
    vi.mocked(startAccessEntry).mockReturnValueOnce(response.promise);
    let pending!: Promise<AccessEntryIssued | undefined>;
    act(() => { pending = result.current.start('entry-a'); });
    // The page clears feedback when selecting another entry while A's request
    // is still in flight. Its eventual error must retain A as the owner.
    act(() => { result.current.clearActionError(); });
    await act(async () => {
      response.reject(new Error('raw failure mentioning private process IDs'));
      expect(await pending).toBeUndefined();
    });
    expect(result.current.actionError).toEqual({ id: 'entry-a', reason: 'action' });
    expect(result.current.createError).toBe('');
    expect(result.current.error).toBe('');
    expect(result.current.busyId).toBe('');
  });

  it.each(['create', 'start'] as const)('rejects duplicate and cross-entry mutations while %s is pending', async (operation) => {
    const { result } = await mountEntries([entry('entry-b')]);
    const response = deferred<AccessEntryIssued>();
    const receipt = issued(entry('entry-a'));
    vi.mocked(createAccessEntry).mockReturnValue(response.promise);
    vi.mocked(startAccessEntry).mockReturnValue(response.promise);
    vi.mocked(rotateAccessEntryBootstrap).mockResolvedValue(issued(entry('entry-b')));
    vi.mocked(stopAccessEntry).mockResolvedValue(entry('entry-b', 'stopped'));
    vi.mocked(revokeAccessEntry).mockResolvedValue(undefined);
    const pending: Promise<unknown>[] = [];

    // Invoke twice before React renders the busy flag: a state-only guard
    // would still send both requests, and a different entry must not bypass it.
    act(() => {
      const first = () => operation === 'create' ? result.current.create(createBody) : result.current.start('entry-a');
      pending.push(first(), first());
      pending.push(operation === 'create' ? result.current.start('entry-b') : result.current.create(createBody));
      pending.push(result.current.rotate('entry-b'), result.current.stop('entry-b'), result.current.revoke('entry-b'));
    });

    const callsBeforeCompletion = {
      create: vi.mocked(createAccessEntry).mock.calls.length,
      start: vi.mocked(startAccessEntry).mock.calls.length,
      rotate: vi.mocked(rotateAccessEntryBootstrap).mock.calls.length,
      stop: vi.mocked(stopAccessEntry).mock.calls.length,
      revoke: vi.mocked(revokeAccessEntry).mock.calls.length,
    };
    const busyBeforeCompletion = result.current.busyId;
    let results: unknown[] = [];
    // Settle even an incorrectly admitted request before asserting, so the
    // red case does not leave React updates outside act or leak into a test.
    await act(async () => {
      response.resolve(receipt);
      results = await Promise.all(pending);
    });
    expect(callsBeforeCompletion).toEqual({
      create: operation === 'create' ? 1 : 0,
      start: operation === 'start' ? 1 : 0,
      rotate: 0,
      stop: 0,
      revoke: 0,
    });
    expect(busyBeforeCompletion).toBe(operation === 'create' ? 'new' : 'entry-a');
    expect(results[0]).toEqual(receipt);
    expect(results.slice(1)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(result.current.busyId).toBe('');

    // Completion releases the gate for a subsequent intentional action.
    await act(async () => { await result.current.rotate('entry-b'); });
    expect(rotateAccessEntryBootstrap).toHaveBeenCalledExactlyOnceWith('entry-b');
  });
});
