import { useCallback,useEffect,useRef,useState } from 'react';
import { listRecordings,type RecordingFile } from './recordingService';

/**
 * Exact screen-recording save watch, supplied by the invocation owner.
 * `closed` means the original Run/child Job AND its resource cleanup are
 * proven complete by the caller — it is not a stopping state, not an
 * arbitrary terminal state, and never the acceptance of Stop/cancel.
 */
export type ScreenRecordingWatch = {
  /** Exact accepted producer run (the direct Bash template uses root=producer). */
  workflowRunId: string;
  /** Frozen owner Experiment. */
  experimentId: string;
  /** Execution target. The archive is station-local: anything but 'local' is reported, never silently queried locally. */
  targetId: string;
  closed: boolean;
};

export type ScreenRecordingResultState =
  | { status: 'idle' }
  | { status: 'watching' }
  | { status: 'loading' }
  | { status: 'saved'; file: RecordingFile }
  | { status: 'no-result' }
  | { status: 'error'; reason: 'request-failed' | 'unsupported-target' | 'ambiguous-result' };

export type ScreenRecordingResult = {
  state: ScreenRecordingResultState;
  /** Re-issues the same exact GET once, bound to the current render's watch. No-op before proven closure. */
  refresh: () => void;
};

export function isLocalScreenRecordingTarget(targetId: string): boolean {
  return targetId === 'local';
}

/** Saved requires every identity fact present and exact; a missing targetId/record identity is not a match. */
export function classifyScreenRecordingResult(
  watch: ScreenRecordingWatch,
  files: readonly RecordingFile[],
): ScreenRecordingResultState {
  const matches = files.filter((file) => (
    file.experimentId === watch.experimentId
    && file.workflowRunId === watch.workflowRunId
    && file.targetId === watch.targetId
    && file.status === 'finalized'
    && Number.isSafeInteger(file.size)
    && file.size > 0
  ));
  if (matches.length === 0) return { status: 'no-result' };
  // One Run may own several Bash invocations; never pick an arbitrary first.
  if (matches.length > 1) return { status: 'error',reason: 'ambiguous-result' };
  return { status: 'saved',file: matches[0]! };
}

type TrackedResult = { key: string; value: ScreenRecordingResultState };

function watchKey(watch: ScreenRecordingWatch): string {
  return [watch.workflowRunId,watch.experimentId,watch.targetId,String(watch.closed)].join(' ');
}

function baseStateFor(watch: ScreenRecordingWatch | null): ScreenRecordingResultState {
  if (!watch) return { status: 'idle' };
  if (!isLocalScreenRecordingTarget(watch.targetId)) return { status: 'error',reason: 'unsupported-target' };
  if (!watch.closed) return { status: 'watching' };
  return { status: 'loading' };
}

/**
 * One-shot finalized-file feedback after a proven closure: exactly one exact
 * GET per closure, plus explicit Refresh. No timers, no polling, no SSE — the
 * caller owns Run observation. Results are keyed to the exact
 * run/experiment/target/closed identity they belong to; the render that
 * receives a new identity never exposes the previous identity's state, and a
 * late, aborted, or superseded response can never mark a newer watch saved.
 */
export function useScreenRecordingResult(watch: ScreenRecordingWatch | null): ScreenRecordingResult {
  const [tracked,setTracked] = useState<TrackedResult | null>(null);
  const inflightRef = useRef<{ ticket: number; controller?: AbortController }>({ ticket: 0 });

  const workflowRunId = watch?.workflowRunId;
  const experimentId = watch?.experimentId;
  const targetId = watch?.targetId;
  const closed = watch?.closed;
  const currentKey = watch ? watchKey(watch) : null;

  const runQuery = useCallback((current: ScreenRecordingWatch) => {
    const key = watchKey(current);
    inflightRef.current.ticket += 1;
    const ticket = inflightRef.current.ticket;
    inflightRef.current.controller?.abort();
    const controller = new AbortController();
    inflightRef.current.controller = controller;
    setTracked({ key,value: { status: 'loading' } });
    void listRecordings({
      experimentId: current.experimentId,
      workflowRunId: current.workflowRunId,
      signal: controller.signal,
    }).then((files) => {
      if (controller.signal.aborted || ticket !== inflightRef.current.ticket) return;
      setTracked({ key,value: classifyScreenRecordingResult(current, files) });
    },() => {
      if (controller.signal.aborted || ticket !== inflightRef.current.ticket) return;
      setTracked({ key,value: { status: 'error',reason: 'request-failed' } });
    });
  },[]);

  useEffect(() => {
    const inflight = inflightRef.current;
    const current = workflowRunId !== undefined && experimentId !== undefined && targetId !== undefined && closed !== undefined
      ? { workflowRunId,experimentId,targetId,closed } satisfies ScreenRecordingWatch
      : null;
    if (!current) {
      setTracked(null);
    } else if (!isLocalScreenRecordingTarget(current.targetId)) {
      setTracked({ key: watchKey(current),value: { status: 'error',reason: 'unsupported-target' } });
    } else if (!current.closed) {
      setTracked({ key: watchKey(current),value: { status: 'watching' } });
    } else {
      runQuery(current);
    }
    return () => {
      // Identity change or unmount: an older response must not land afterwards.
      // `inflight` is the same mutable holder for the hook's lifetime, so the
      // cleanup always aborts the latest request, not a stale captured one.
      inflight.ticket += 1;
      inflight.controller?.abort();
    };
  }, [workflowRunId,experimentId,targetId,closed,runQuery]);

  const refresh = useCallback(() => {
    // Bound to this render's identity — never to a previous render's watch.
    if (workflowRunId === undefined || experimentId === undefined || targetId === undefined || closed !== true) return;
    if (!isLocalScreenRecordingTarget(targetId)) return;
    runQuery({ workflowRunId,experimentId,targetId,closed });
  }, [workflowRunId,experimentId,targetId,closed,runQuery]);

  // Only a result tracked under the exact current identity is public. Any
  // other render falls back to the base state derived from the current watch,
  // so the render that changes identity can never expose the old saved file.
  const state = tracked !== null && currentKey !== null && tracked.key === currentKey
    ? tracked.value
    : baseStateFor(watch);

  return { state,refresh };
}
