import { openExecutionEventStream,refreshExecutionTarget } from './executionActions';
import {
  flushExecutionCursor,
  resetExecutionCursorWritesForTests,
  writeExecutionCursor,
} from './executionCursorStorage';
import { applyExecutionEvent } from './executionEventProjection';
import { executionSnapshot,patchExecutionSnapshot,resetExecutionSnapshotsForTests } from './executionSnapshotStore';

type ExecutionTargetRetention = {
  refs: number;
  processRefs: number;
  jobRefs: number;
  close: () => void;
};

export type ExecutionTargetInterest = {
  processes: boolean;
  jobs: boolean;
};

const streams = new Map<string,ExecutionTargetRetention>();

export function retainExecutionTarget(targetId: string, interest: ExecutionTargetInterest) {
  const existing = streams.get(targetId);
  if (existing) {
    const needsProcessProjection = interest.processes && existing.processRefs === 0;
    const needsJobProjection = interest.jobs && existing.jobRefs === 0;
    existing.refs += 1;
    if (interest.processes) existing.processRefs += 1;
    if (interest.jobs) existing.jobRefs += 1;
    if (needsJobProjection) void refreshExecutionTarget(targetId, true);
    else if (needsProcessProjection) void refreshExecutionTarget(targetId, false);
    return () => releaseExecutionTarget(targetId, interest);
  }
  if (interest.processes) void refreshExecutionTarget(targetId, interest.jobs);
  const registration: ExecutionTargetRetention = {
    refs: 1,
    processRefs: interest.processes ? 1 : 0,
    jobRefs: interest.jobs ? 1 : 0,
    close: () => undefined,
  };
  streams.set(targetId, registration);
  const snapshot = executionSnapshot(targetId);
  const stream = openExecutionEventStream({
    targetId,
    afterOffset: snapshot.lastOffset,
    streamId: snapshot.streamId,
    onEvent: (event) => applyExecutionEvent(targetId, event, registration.jobRefs > 0),
    onCursorReset: (cursor, afterOffset) => {
      patchExecutionSnapshot(targetId, {
        streamId: cursor.streamId,
        lastOffset: afterOffset,
        events: [],
        streamState: afterOffset < cursor.latestOffset ? 'replaying' : 'connecting',
        error: '',
      });
      writeExecutionCursor(targetId, { streamId: cursor.streamId,offset: afterOffset });
      if (registration.processRefs > 0) void refreshExecutionTarget(targetId, registration.jobRefs > 0);
    },
    onState: (streamState) => {
      if (streamState==='disconnected') flushExecutionCursor(targetId);
      patchExecutionSnapshot(targetId,{ streamState });
    },
    onError: (error) => patchExecutionSnapshot(targetId, { error: error instanceof Error ? error.message : String(error) }),
  });
  registration.close = stream.close;
  return () => releaseExecutionTarget(targetId, interest);
}

function releaseExecutionTarget(targetId: string, interest: ExecutionTargetInterest) {
  const stream = streams.get(targetId);
  if (!stream) return;
  stream.refs -= 1;
  if (interest.processes && stream.processRefs > 0) stream.processRefs -= 1;
  if (interest.jobs && stream.jobRefs > 0) stream.jobRefs -= 1;
  if (stream.refs <= 0) {
    flushExecutionCursor(targetId);
    stream.close();
    streams.delete(targetId);
    patchExecutionSnapshot(targetId, { streamState: 'disconnected' });
  }
}

export function resetExecutionRuntimeForTests() {
  streams.forEach((stream) => stream.close());
  streams.clear();
  resetExecutionCursorWritesForTests();
  resetExecutionSnapshotsForTests();
}
