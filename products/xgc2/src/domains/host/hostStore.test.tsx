// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { useHostOverviewRefresh } from './hostStore';

const { getHostOverview,usePolling } = vi.hoisted(() => ({
  getHostOverview: vi.fn(),
  usePolling: vi.fn(),
}));

vi.mock('./hostOverviewActions', () => ({ getHostOverview }));
vi.mock('../../hooks/usePolling', () => ({ usePolling }));

describe('useHostOverviewRefresh', () => {
  it('keeps both core and managed-host routing in refresh requests', async () => {
    const overview = { hostname: 'agent-b' };
    getHostOverview.mockResolvedValue(overview);
    const onOverview = vi.fn();
    renderHook(() => useHostOverviewRefresh({
      enabled: true,
      intervalMs: 5000,
      options: { targetCoreId: 'core-a',managedHostId: 'agent-b' },
      onOverview,
    }));

    const polling = usePolling.mock.calls[0]?.[0];
    expect(polling.pollKey).toBe('core-a:agent-b');
    expect(polling.immediate).toBe(false);
    await polling.task();
    expect(getHostOverview).toHaveBeenCalledWith({ targetCoreId: 'core-a',managedHostId: 'agent-b' });
    expect(onOverview).toHaveBeenCalledWith(overview);
  });
});
