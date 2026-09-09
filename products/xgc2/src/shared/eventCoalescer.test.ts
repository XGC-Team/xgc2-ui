import { afterEach,describe,expect,it,vi } from 'vitest';
import { createDeadlineTimer,createEventCoalescer } from './eventCoalescer';

describe('createEventCoalescer', () => {
  afterEach(() => vi.useRealTimers());

  it('turns a burst of events into one trailing task without polling', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const coalescer = createEventCoalescer(100, task);
    coalescer.schedule();
    coalescer.schedule();
    coalescer.schedule();
    vi.advanceTimersByTime(99);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending event refresh', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const coalescer = createEventCoalescer(100, task);
    coalescer.schedule();
    coalescer.cancel();
    vi.runAllTimers();
    expect(task).not.toHaveBeenCalled();
  });
});

describe('createDeadlineTimer', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps only the most recently scheduled deadline', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    const deadline = createDeadlineTimer(task);
    deadline.schedule(100);
    vi.advanceTimersByTime(20);
    deadline.schedule(200);
    vi.advanceTimersByTime(199);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
