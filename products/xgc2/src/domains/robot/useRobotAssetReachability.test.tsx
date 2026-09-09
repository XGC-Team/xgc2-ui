// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import {
  ROBOT_REACHABILITY_FEEDBACK_MS,
  useRobotAssetReachability,
} from './useRobotAssetReachability';

describe('useRobotAssetReachability', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a successful check to neutral after a short acknowledgement', async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockResolvedValue({
      address: '192.0.2.10',reachable: true,latencyMs: 1,detail: 'management address responded',
      checkedAt: '2026-08-10T10:00:00Z',
    });
    const { result } = renderHook(() => useRobotAssetReachability(probe));

    await act(() => result.current.checkReachability('robot-a'));
    expect(result.current.reachabilityById['robot-a']?.status).toBe('reachable');

    act(() => vi.advanceTimersByTime(ROBOT_REACHABILITY_FEEDBACK_MS));
    expect(result.current.reachabilityById['robot-a']).toMatchObject({
      status: 'checked',result: { reachable: true,address: '192.0.2.10' },
    });
  });
});
