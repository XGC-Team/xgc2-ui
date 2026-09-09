// @vitest-environment jsdom

import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import {
  releaseRobotVisualInvalidation,
  resetRobotVisualInvalidationForTests,
  scheduleRobotVisualInvalidation,
} from './robotVisualInvalidation';

describe('robot visual invalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    resetRobotVisualInvalidationForTests();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('coalesces visible channel changes into one repaint per interval', () => {
    const listener = vi.fn();
    for (let index = 0; index < 40; index += 1) scheduleRobotVisualInvalidation(listener, 'compact');
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(listener).toHaveBeenCalledTimes(1);
    releaseRobotVisualInvalidation(listener);
  });

  it('repaints nothing while the tab is hidden and exactly once when it returns', () => {
    const listener = vi.fn();
    setVisibility('hidden');
    // One measured second of the live stream: 8.1 frames carrying 138.9 changes.
    for (let index = 0; index < 139; index += 1) scheduleRobotVisualInvalidation(listener, 'compact');
    vi.advanceTimersByTime(5_000);
    expect(listener).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(200);
    expect(listener).toHaveBeenCalledTimes(1);

    scheduleRobotVisualInvalidation(listener, 'compact');
    vi.advanceTimersByTime(200);
    expect(listener).toHaveBeenCalledTimes(2);
    releaseRobotVisualInvalidation(listener);
  });

  it('keeps a released listener out of the deferred queue', () => {
    const listener = vi.fn();
    setVisibility('hidden');
    scheduleRobotVisualInvalidation(listener, 'interactive');
    releaseRobotVisualInvalidation(listener);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(200);
    expect(listener).not.toHaveBeenCalled();
  });
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true,get: () => state });
}
