import { createEventCoalescer } from '../../shared/eventCoalescer';
import type { RobotRuntimeListener } from './robotRuntimeState';

export type RobotChannelBundleRefresh = 'interactive' | 'compact';

const visualChannelUpdateIntervalMs = 200;
const compactVisualChannelUpdateIntervalMs = 200;
const visualQueue = new Set<RobotRuntimeListener>();
const compactVisualQueue = new Set<RobotRuntimeListener>();
const visualCoalescer = createEventCoalescer(visualChannelUpdateIntervalMs, () => {
  flushQueue(visualQueue);
});
const compactVisualCoalescer = createEventCoalescer(compactVisualChannelUpdateIntervalMs, () => {
  flushQueue(compactVisualQueue);
});

// A hidden tab still receives the full robot patch stream (the store must stay
// authoritative for the moment it comes back), but painting it is pure waste:
// measured 8.1 frames/s carrying 138.9 channel changes/s across 12 instrument
// cards. Queue while hidden and flush exactly once on return - the queues are
// Sets of live subscribers, so holding them costs nothing and cannot grow.
let flushWhenVisible = false;

export function scheduleRobotVisualInvalidation(
  listener: RobotRuntimeListener,
  refresh: RobotChannelBundleRefresh,
) {
  if (refresh === 'compact') {
    compactVisualQueue.add(listener);
    if (!deferWhileHidden()) compactVisualCoalescer.schedule();
    return;
  }
  visualQueue.add(listener);
  if (!deferWhileHidden()) visualCoalescer.schedule();
}

export function releaseRobotVisualInvalidation(listener: RobotRuntimeListener) {
  visualQueue.delete(listener);
  compactVisualQueue.delete(listener);
}

export function resetRobotVisualInvalidationForTests() {
  visualCoalescer.cancel();
  compactVisualCoalescer.cancel();
  visualQueue.clear();
  compactVisualQueue.clear();
  flushWhenVisible = false;
}

function deferWhileHidden() {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false;
  if (!flushWhenVisible) {
    flushWhenVisible = true;
    document.addEventListener('visibilitychange', resumeRobotVisualInvalidation, { once: true });
  }
  return true;
}

function resumeRobotVisualInvalidation() {
  flushWhenVisible = false;
  if (document.visibilityState === 'hidden') return;
  if (visualQueue.size > 0) visualCoalescer.schedule();
  if (compactVisualQueue.size > 0) compactVisualCoalescer.schedule();
}

function flushQueue(queue: Set<RobotRuntimeListener>) {
  const queued = [...queue];
  queue.clear();
  queued.forEach((listener) => listener());
}
