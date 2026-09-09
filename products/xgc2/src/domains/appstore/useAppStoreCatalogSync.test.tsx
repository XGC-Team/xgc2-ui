// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { DEFAULT_APP_STORE_SETTING,type AppStoreSnapshot } from './appStoreModel';
import { syncCatalogAppStore } from './appStoreService';
import { useAppStoreCatalogSync } from './useAppStoreCatalogSync';

vi.mock('./appStoreService', () => ({
  syncCatalogAppStore: vi.fn(),
}));

const apiTarget = {};
const populatedSnapshot: AppStoreSnapshot = {
  apps: [{} as AppStoreSnapshot['apps'][number]],
  details: [],
  installed: [],
  setting: DEFAULT_APP_STORE_SETTING,
};

describe('useAppStoreCatalogSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves initial loading with terminal feedback when the first refresh rejects', async () => {
    const refreshSnapshot = vi.fn().mockRejectedValue(new Error('snapshot failed'));
    const { result } = renderHook(() => useAppStoreCatalogSync({
      targetId: 'local',targetKey: 'local',apiTarget,refreshSnapshot,
    }));

    await act(async () => { await Promise.resolve(); });

    expect(result.current.initialLoading).toBe(false);
    expect(result.current.syncing).toBe(false);
    expect(result.current.feedback).toEqual({ tone: 'danger',text: 'snapshot failed' });
    expect(syncCatalogAppStore).not.toHaveBeenCalled();
  });

  it('stops polling after a snapshot refresh rejects', async () => {
    vi.useFakeTimers();
    const refreshSnapshot = vi.fn()
      .mockResolvedValueOnce(populatedSnapshot)
      .mockRejectedValue(new Error('poll failed'));
    vi.mocked(syncCatalogAppStore).mockResolvedValue({
      job: {} as never,
      receipt: {} as never,
    });
    const { result,unmount } = renderHook(() => useAppStoreCatalogSync({
      targetId: 'local',targetKey: 'local',apiTarget,refreshSnapshot,
    }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.initialLoading).toBe(false);

    await act(async () => { await result.current.sync(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.syncing).toBe(false);
    expect(result.current.feedback).toEqual({ tone: 'danger',text: 'poll failed' });
    expect(refreshSnapshot).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(refreshSnapshot).toHaveBeenCalledTimes(2);
    unmount();
  });
});
