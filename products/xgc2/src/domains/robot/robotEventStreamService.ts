import {
  openReplayJSONStream,
  ReplayJSONStreamHTTPError,
  type ReplayJSONStream,
} from '../../api/http';
import { segment } from '../../shared/url';
import { executionTargetPath } from '../execution/executionPublic';
import { isRecord,safeInteger,validDateTime } from './robotContractPrimitives';
import { isRobotOperation } from './robotOperationContract';
import type { RobotPatchEvent,RobotRuntimeStreamState } from './robotRuntimeModel';
import { isRobotChannelChange,isRobotConnectionReset } from './robotTelemetryContract';

export function robotEventStreamPath(targetId: string, runId: string) {
  return `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/robots/events`;
}

export function openRobotEventStream({
  targetId,
  runId,
  streamId: initialStreamId,
  afterRevision,
  onEvent,
  onCursorInvalid,
  onState,
  onError,
  reconnectDelayMs = 1000,
}: {
  targetId: string;
  runId: string;
  streamId: string;
  afterRevision: number;
  onEvent: (event: RobotPatchEvent) => void;
  onCursorInvalid: () => void;
  onState?: (state: RobotRuntimeStreamState) => void;
  onError?: (error: unknown) => void;
  reconnectDelayMs?: number;
}): ReplayJSONStream {
  const streamId = initialStreamId.trim();
  let revision = afterRevision;
  let replayTargetRevision = afterRevision;
  let invalidated = false;
  if (!streamId) throw new Error('robot event stream requires a stream ID from the run snapshot');
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('robot event stream requires a valid projection revision');
  }

  const invalidate = () => {
    if (invalidated) return;
    invalidated = true;
    onCursorInvalid();
  };

  return openReplayJSONStream<RobotPatchEvent>({
    path: () => robotEventStreamPath(targetId, runId),
    lastEventId: () => String(revision || ''),
    dynamicHeaders: () => ({ 'X-XGC-Robot-Stream-ID': streamId }),
    reconnectDelayMs,
    onConnecting: () => onState?.(revision > 0 ? 'replaying' : 'connecting'),
    onOpen: (response) => {
      const responseStreamId = response.headers.get('X-XGC-Robot-Stream-ID')?.trim() ?? '';
      const latestRevision = Number(response.headers.get('X-XGC-Robot-Latest-Revision') ?? Number.NaN);
      if (!responseStreamId) throw new Error('robot event stream response is missing its stream ID');
      if (!Number.isSafeInteger(latestRevision) || latestRevision < 0) {
        throw new Error('robot event stream response has an invalid latest revision');
      }
      if (responseStreamId !== streamId || revision > latestRevision) {
        invalidate();
        return false;
      }
      replayTargetRevision = latestRevision;
      onState?.(revision < replayTargetRevision ? 'replaying' : 'connected');
      return true;
    },
    onValue: (event, message) => {
      if (invalidated) return;
      if (!isRobotPatchEvent(event, targetId, runId)) {
        invalidate();
        return;
      }
      const eventRevision = Number(message.id);
      if (!Number.isSafeInteger(eventRevision) || eventRevision !== event.revision) {
        invalidate();
        return;
      }
      if (event.revision <= revision) return;
      if (event.revision !== revision + 1) {
        invalidate();
        return;
      }
      try {
        onEvent(event);
      } catch (error) {
        invalidate();
        throw error;
      }
      revision = event.revision;
      if (revision >= replayTargetRevision) onState?.('connected');
    },
    onError: (error) => {
      onState?.('disconnected');
      if (error instanceof ReplayJSONStreamHTTPError && error.status === 409) {
        invalidate();
        return;
      }
      onError?.(error);
    },
  });
}

function isRobotPatchEvent(value: unknown, targetId: string, runId: string): value is RobotPatchEvent {
  if (!isRecord(value)) return false;
  const event = value as Partial<RobotPatchEvent>;
  return safeInteger(event.revision, 1)
    && event.targetId === targetId
    && event.runId === runId
    && (event.refresh === undefined || typeof event.refresh === 'boolean')
    && Array.isArray(event.changes)
    && event.changes.every(isRobotChannelChange)
    && Array.isArray(event.resets)
    && event.resets.every(isRobotConnectionReset)
    && (event.operations === undefined || (
      Array.isArray(event.operations)
      && event.operations.every((operation) => isRobotOperation(operation, targetId, runId))
    ))
    && (!event.refresh || (
      event.changes.length === 0
      && event.resets.length === 0
      && (event.operations === undefined || event.operations.length === 0)
    ))
    && validDateTime(event.emittedAt);
}
