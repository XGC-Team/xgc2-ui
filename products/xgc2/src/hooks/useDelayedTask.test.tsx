// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { useDelayedTask } from './useDelayedTask';

describe('useDelayedTask', () => {
  afterEach(() => vi.useRealTimers());

  it('runs once after the delay and cancels when disabled', async () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useDelayedTask({ enabled,delayMs: 1000,task }), {
      initialProps: { enabled: true },
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    rerender({ enabled: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(task).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
