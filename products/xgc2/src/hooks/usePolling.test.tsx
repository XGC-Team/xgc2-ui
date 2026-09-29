// @vitest-environment jsdom

import { act,cleanup,renderHook } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { useEffect } from 'react';
import { usePolling } from './usePolling';

function deferred() {
  let resolve!: () => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<void>((accept,fail) => { resolve = accept;reject = fail; });
  return { promise,resolve,reject };
}

describe('usePolling', () => {
  afterEach(() => {
    cleanup();
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

  it('restarts immediately on a resource change after the previous task settles', async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ pollKey }) => usePolling({ enabled: true,intervalMs: 1000,pollKey,task }), {
      initialProps: { pollKey: 'first' },
    });

    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
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

  it('keeps only the latest refresh while a task outlives many resource changes', async () => {
    vi.useFakeTimers();
    const first = deferred();const latest = deferred();
    const started: string[] = [];let active = 0;let peak = 0;
    const { rerender,unmount } = renderHook(({ pollKey }) => usePolling({
      enabled: true,intervalMs: 1000,pollKey,
      task: async () => {
        started.push(pollKey);active += 1;peak = Math.max(peak,active);
        try { await (pollKey === 'first' ? first.promise : latest.promise); }
        finally { active -= 1; }
      },
    }), { initialProps: { pollKey: 'first' } });

    for (let i = 0;i < 100;i += 1) rerender({ pollKey: `next-${i}` });
    expect(started).toEqual(['first']);
    expect(peak).toBe(1);
    await act(async () => { first.resolve(); });
    expect(started).toEqual(['first','next-99']);
    expect(peak).toBe(1);
    await act(async () => { latest.resolve(); });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serializes a hide and show against the unfinished visible task', async () => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);
    const { rerender } = renderHook(({ enabled }) => usePolling({ enabled,intervalMs: 1000,task }), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });rerender({ enabled: true });
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(); });
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not revive an obsolete schedule when the resource returns to A', async () => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);
    const { rerender } = renderHook(({ pollKey }) => usePolling({
      enabled: true,intervalMs: 1000,pollKey,task: () => task(),
    }), { initialProps: { pollKey: 'A' } });
    rerender({ pollKey: 'B' });rerender({ pollKey: 'A' });
    await act(async () => { first.resolve(); });
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('suppresses the obsolete error but reports and retries the latest failure', async () => {
    vi.useFakeTimers();
    const first = deferred();const next = deferred();
    const oldError = vi.fn();const currentError = vi.fn();
    const task = vi.fn(() => next.promise);
    const { rerender } = renderHook(({ pollKey }) => usePolling({
      enabled: true,intervalMs: 1000,pollKey,
      task: pollKey === 'A' ? () => first.promise : task,
      onError: pollKey === 'A' ? oldError : currentError,
    }), { initialProps: { pollKey: 'A' } });
    rerender({ pollKey: 'B' });
    await act(async () => { first.reject(new Error('obsolete')); });
    expect(oldError).not.toHaveBeenCalled();
    expect(currentError).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);
    const failure = new Error('current');
    await act(async () => { next.reject(failure); });
    expect(currentError).toHaveBeenCalledTimes(1);
    expect(currentError).toHaveBeenCalledWith(failure);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(currentError).toHaveBeenCalledTimes(2);
  });

  it('discards a queued refresh and late rejection on unmount', async () => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);const onError = vi.fn();
    const { rerender,unmount } = renderHook(({ pollKey }) => usePolling({
      enabled: true,intervalMs: 1000,pollKey,task,onError,
    }), { initialProps: { pollKey: 'A' } });
    rerender({ pollKey: 'B' });unmount();
    await act(async () => { first.reject(new Error('late')); });
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { enabled: false,intervalMs: 1000 },
    { enabled: true,intervalMs: 0 },
    { enabled: true,intervalMs: Number.NaN },
    { enabled: true,intervalMs: Number.POSITIVE_INFINITY },
  ])('discards pending work when disabled or invalid: %j', async ({ enabled,intervalMs }) => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);
    const { rerender } = renderHook((props) => usePolling({ ...props,task }), {
      initialProps: { enabled: true,intervalMs: 1000,pollKey: 'A' },
    });
    rerender({ enabled: true,intervalMs: 1000,pollKey: 'B' });
    rerender({ enabled,intervalMs,pollKey: 'C' });
    await act(async () => { first.resolve(); });
    await vi.advanceTimersByTimeAsync(3000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true,false])('honors the new delayed start when the old task settles early: %s', async (early) => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);
    const { rerender } = renderHook(({ intervalMs,immediate }) => usePolling({
      enabled: true,intervalMs,immediate,task,
    }), { initialProps: { intervalMs: 1000,immediate: true } });
    rerender({ intervalMs: 2000,immediate: false });
    if (early) {
      await act(async () => { first.resolve(); });
      await vi.advanceTimersByTimeAsync(1999);
      expect(task).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
    } else {
      await vi.advanceTimersByTimeAsync(2000);
      expect(task).toHaveBeenCalledTimes(1);
      await act(async () => { first.resolve(); });
    }
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps the active task slot across StrictMode effect replay', async () => {
    vi.useFakeTimers();
    const first = deferred();const task = vi.fn(() => first.promise);
    const setup = vi.fn();const cleanup = vi.fn();
    renderHook(() => {
      useEffect(() => { setup();return cleanup; }, []);
      usePolling({ enabled: true,intervalMs: 1000,task });
    }, { reactStrictMode: true });
    expect(setup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(); });
    expect(task).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('uses fresh task callbacks without restarting an unchanged schedule', async () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => undefined);const next = vi.fn(async () => undefined);
    const { rerender } = renderHook(({ task }) => usePolling({ enabled: true,intervalMs: 1000,task }), {
      initialProps: { task: first },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    rerender({ task: next });
    expect(next).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
