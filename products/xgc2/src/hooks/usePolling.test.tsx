// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { usePolling } from './usePolling';

describe('usePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs repeatedly while enabled and stops after cleanup', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => undefined);
    const { unmount } = renderHook(() => usePolling({ enabled: true, intervalMs: 1000, task }));

    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not schedule while disabled or with invalid intervals', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => undefined);

    const disabled = renderHook(() => usePolling({ enabled: false, intervalMs: 1000, task }));
    const invalid = renderHook(() => usePolling({ enabled: true, intervalMs: 0, task }));
    const nan = renderHook(() => usePolling({ enabled: true, intervalMs: Number.NaN, task }));

    await vi.advanceTimersByTimeAsync(3000);
    expect(task).not.toHaveBeenCalled();

    disabled.unmount();
    invalid.unmount();
    nan.unmount();
  });

  it('can wait one interval before the first task', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => undefined);
    renderHook(() => usePolling({ enabled: true,intervalMs: 1000,immediate: false,task }));

    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('avoids scheduling when cleanup happens before the first task finishes', async () => {
    vi.useFakeTimers();
    let resolveTask: () => void = () => undefined;
    const slowTask = vi.fn(() => new Promise<void>((resolve) => {
      resolveTask = resolve;
    }));
    const slow = renderHook(() => usePolling({ enabled: true, intervalMs: 1000, task: slowTask }));
    expect(slowTask).toHaveBeenCalledTimes(1);

    slow.unmount();
    resolveTask();
    await vi.runAllTimersAsync();

    expect(slowTask).toHaveBeenCalledTimes(1);
  });

  it('restarts immediately when the polled resource changes', () => {
    const task = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ pollKey }) => usePolling({ enabled: true,intervalMs: 1000,pollKey,task }), {
      initialProps: { pollKey: 'first' },
    });

    expect(task).toHaveBeenCalledTimes(1);
    rerender({ pollKey: 'second' });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('reports task rejection and keeps polling without leaking the rejection', async () => {
    vi.useFakeTimers();
    const failure = new Error('refresh failed');
    const task = vi.fn(async () => { throw failure; });
    const onError = vi.fn();
    const { unmount } = renderHook(() => usePolling({
      enabled: true,intervalMs: 1000,task,onError,
    }));

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenNthCalledWith(1, failure);

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(2, failure);
    unmount();
  });

});
