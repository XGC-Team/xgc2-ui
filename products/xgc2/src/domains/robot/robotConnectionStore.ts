import type { ReplayJSONStream } from '../../api/http';
import {
  createDeadlineTimer,
  type DeadlineTimer,
} from '../../shared/eventCoalescer';
import { openRobotEventStream } from './robotEventStreamService';
import { mergeRobotOperations } from './robotOperationProjection';
import { installRunRobotProjection,applyRunRobotPatch } from './robotProjectionRuntime';
import { getRunRobots } from './robotProjectionService';
import {
  earliestRobotPatchDeadline,
  expireRunRobotFreshness,
  nextRunFreshnessDeadline,
} from './robotRuntimeFreshness';
import { normalizeRobotTargetId,robotRunIdentity } from './robotRuntimeIdentity';
import type { RobotPatchEvent,RunRobotRuntimeState } from './robotRuntimeModel';
import {
  getRunRuntimeState,
  releaseRunRuntimeState,
  resetRobotRuntimeState,
  updateRunRuntimeState,
} from './robotRuntimeState';

type RetainedRobotRun = {
  count: number;
  targetId: string;
  runId: string;
  stream?: ReplayJSONStream;
  freshnessTimer?: DeadlineTimer;
  freshnessDeadlineMs?: number;
  resetQueued: boolean;
  refreshAgain: boolean;
};

type RobotProjectionRefresh = {
  controller: AbortController;
  promise: Promise<RunRobotRuntimeState>;
};

const retainedRuns = new Map<string,RetainedRobotRun>();
const projectionRefreshes = new Map<string,RobotProjectionRefresh>();
let runtimeGeneration = 0;

export function refreshRunRobotProjection(
  targetId: string,
  runId: string,
): Promise<RunRobotRuntimeState> {
  const target = normalizeRobotTargetId(targetId);
  const run = runId.trim();
  if (!run) return Promise.resolve(getRunRuntimeState(target, run));
  const key = robotRunIdentity(target, run);
  const active = projectionRefreshes.get(key);
  if (active) return active.promise;
  const generation = runtimeGeneration;
  const controller = new AbortController();
  // The previous error stays visible while a load or event-driven refresh is
  // in flight; it is cleared only by a successful snapshot, so a connection
  // event cannot blink the failure state away and back.
  updateRunRuntimeState(target, run, { loading: true });
  const refresh = getRunRobots(target, run, controller.signal)
    .then((projection) => {
      if (controller.signal.aborted || generation !== runtimeGeneration) {
        return getRunRuntimeState(target, run);
      }
      const normalized = installRunRobotProjection(target, run, projection.robots);
      updateRunRuntimeState(target, run, {
        projection: { ...projection,robots: normalized },
        loaded: true,
        loading: false,
        error: '',
      });
      mergeRobotOperations(target, run, projection.operations ?? []);
      const entry = retainedRuns.get(key);
      if (entry) {
        attachRobotEventStream(entry);
        scheduleFreshnessCheck(entry);
      }
      return getRunRuntimeState(target, run);
    })
    .catch((error) => {
      if (!controller.signal.aborted && generation === runtimeGeneration) {
        handleProjectionError(target, run, error);
      }
      return getRunRuntimeState(target, run);
    })
    .finally(() => {
      if (projectionRefreshes.get(key)?.promise === refresh) projectionRefreshes.delete(key);
    });
  projectionRefreshes.set(key, { controller,promise:refresh });
  return refresh;
}

export function retainRobotRun(targetId: string, runId: string) {
  const target = normalizeRobotTargetId(targetId);
  const run = runId.trim();
  const key = robotRunIdentity(target, run);
  const existing = retainedRuns.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    retainedRuns.set(key, {
      count: 1,
      targetId: target,
      runId: run,
      resetQueued: false,
      refreshAgain: false,
    });
    void refreshRunRobotProjection(target, run);
  }
  return () => {
    const entry = retainedRuns.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    closeRetainedRun(entry);
    retainedRuns.delete(key);
    const refresh = projectionRefreshes.get(key);
    if (refresh) {
      projectionRefreshes.delete(key);
      refresh.controller.abort();
    }
    releaseRunRuntimeState(target, run);
    if (refresh) {
      void refresh.promise.finally(() => {
        if (!retainedRuns.has(key)) releaseRunRuntimeState(target, run);
      });
    }
  };
}

export function resetRobotConnectionStoreForTests() {
  runtimeGeneration += 1;
  retainedRuns.forEach(closeRetainedRun);
  retainedRuns.clear();
  projectionRefreshes.forEach((refresh) => refresh.controller.abort());
  projectionRefreshes.clear();
  resetRobotRuntimeState();
}

function handleProjectionError(targetId: string, runId: string, error: unknown) {
  updateRunRuntimeState(targetId, runId, {
    loaded: true,
    loading: false,
    error: errorMessage(error),
    streamState: 'disconnected',
  });
}

function attachRobotEventStream(entry: RetainedRobotRun) {
  const projection = getRunRuntimeState(entry.targetId, entry.runId).projection;
  if (!projection?.streamId) return;
  entry.stream?.close();
  entry.stream = undefined;
  entry.resetQueued = false;
  entry.refreshAgain = false;
  try {
    entry.stream = openRobotEventStream({
      targetId: entry.targetId,
      runId: entry.runId,
      streamId: projection.streamId,
      afterRevision: projection.projectionRevision,
      onEvent: (event) => applyRetainedRobotPatch(entry, event),
      onCursorInvalid: () => resetRobotEventCursor(entry),
      onState: (streamState) => {
        if (!isRetained(entry)) return;
        updateRunRuntimeState(entry.targetId, entry.runId, {
          streamState,
          ...(streamState === 'connected' ? { error: '' } : {}),
        });
      },
      onError: (error) => {
        if (!isRetained(entry)) return;
        updateRunRuntimeState(entry.targetId, entry.runId, { error: errorMessage(error) });
      },
    });
  } catch (error) {
    updateRunRuntimeState(entry.targetId, entry.runId, {
      error: errorMessage(error),
      streamState: 'disconnected',
    });
  }
}

function applyRetainedRobotPatch(entry: RetainedRobotRun, event: RobotPatchEvent) {
  if (!isRetained(entry)) return;
  if (entry.resetQueued) {
    if (event.refresh || event.resets.length > 0 || !!event.operations?.length) entry.refreshAgain = true;
    return;
  }
  const projection = getRunRuntimeState(entry.targetId, entry.runId).projection;
  if (projection && event.revision <= projection.projectionRevision) return;
  // A valid Run can be retained before robot.ensure-connected freezes its
  // binding. Its empty snapshot already opened this stream; the first reset is
  // the event-driven handoff to the complete immutable projection. Never feed
  // that reset into an empty roster and never poll the snapshot on a timer.
  if (event.refresh || getRunRuntimeState(entry.targetId, entry.runId).projection?.pending) {
    refreshRobotProjectionFromEvent(entry);
    return;
  }
  applyRunRobotPatch(entry.targetId, entry.runId, event);
  if (event.operations?.length) {
    mergeRobotOperations(entry.targetId, entry.runId, event.operations);
  }
  scheduleEarlierFreshnessCheck(entry, event.changes);
}

function refreshRobotProjectionFromEvent(entry: RetainedRobotRun) {
  const key = robotRunIdentity(entry.targetId, entry.runId);
  if (retainedRuns.get(key) !== entry || entry.resetQueued) return;
  entry.resetQueued = true;
  updateRunRuntimeState(entry.targetId, entry.runId, { streamState: 'replaying' });
  // Keep the parent stream attached until the replacement snapshot succeeds.
  // A transient snapshot failure can then recover on a later topology/reset
  // event, still without a timer or polling. Successful refresh atomically
  // replaces and closes this stream in attachRobotEventStream.
  void Promise.resolve().then(async () => {
    if (retainedRuns.get(key) !== entry) return;
    const refreshed = await refreshRunRobotProjection(entry.targetId, entry.runId);
    entry.resetQueued = false;
    const retry = entry.refreshAgain && !!refreshed.error;
    entry.refreshAgain = false;
    if (retry && retainedRuns.get(key) === entry) refreshRobotProjectionFromEvent(entry);
  });
}

function resetRobotEventCursor(entry: RetainedRobotRun) {
  const key = robotRunIdentity(entry.targetId, entry.runId);
  if (retainedRuns.get(key) !== entry) return;
  if (entry.resetQueued) {
    entry.refreshAgain = true;
    entry.stream?.close();
    entry.stream = undefined;
    return;
  }
  // Cursor invalidation closes the only event trigger, so grant this cause one
  // bounded snapshot retry even if no later reset/operation can arrive.
  entry.refreshAgain = true;
  entry.stream?.close();
  entry.stream = undefined;
  refreshRobotProjectionFromEvent(entry);
}

function scheduleFreshnessCheck(entry: RetainedRobotRun) {
  entry.freshnessTimer?.cancel();
  entry.freshnessDeadlineMs = undefined;
  const deadline = nextRunFreshnessDeadline(entry.targetId, entry.runId);
  if (Number.isFinite(deadline)) armFreshnessCheck(entry, deadline);
}

function scheduleEarlierFreshnessCheck(
  entry: RetainedRobotRun,
  changes: RobotPatchEvent['changes'],
) {
  const deadline = earliestRobotPatchDeadline(changes);
  if (!Number.isFinite(deadline)) return;
  if (entry.freshnessDeadlineMs !== undefined && entry.freshnessDeadlineMs <= deadline) return;
  armFreshnessCheck(entry, deadline);
}

function armFreshnessCheck(entry: RetainedRobotRun, deadlineMs: number) {
  if (!entry.freshnessTimer) {
    entry.freshnessTimer = createDeadlineTimer(() => {
      if (!isRetained(entry)) return;
      entry.freshnessDeadlineMs = undefined;
      expireRunRobotFreshness(entry.targetId, entry.runId);
      scheduleFreshnessCheck(entry);
    });
  }
  entry.freshnessDeadlineMs = deadlineMs;
  entry.freshnessTimer.schedule(Math.max(0, Math.ceil(deadlineMs - Date.now())));
}

function isRetained(entry: RetainedRobotRun) {
  return retainedRuns.get(robotRunIdentity(entry.targetId, entry.runId)) === entry;
}

function closeRetainedRun(entry: RetainedRobotRun) {
  entry.stream?.close();
  entry.freshnessTimer?.cancel();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
