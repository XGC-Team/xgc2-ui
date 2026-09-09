import {
  consumeSSEBody,
  openReplayJSONStream,
  parseSSEFrame,
  type ReplayJSONStream,
} from '../../api/streams';
import type { ExecutionEvent,ExecutionEventCursor,ExecutionLogEvent,ExecutionStreamState } from './executionModel';
import {
  executionEventStreamPath,
  executionJobLogStreamPath,
  getExecutionEventCursor,
  orchestrationRunLogStreamPath,
  processInstanceLogStreamPath,
  type ExecutionLogStream,
} from './executionService';

export type ReplayStream = ReplayJSONStream;
export { consumeSSEBody,parseSSEFrame };

export function openExecutionEventStream({
  targetId,
  afterOffset,
  streamId: initialStreamId = '',
  onEvent,
  onCursorReset,
  onState,
  onError,
  reconnectDelayMs = 1000,
}: {
  targetId: string;
  afterOffset: number;
  streamId?: string;
  onEvent: (event: ExecutionEvent) => void;
  onCursorReset?: (cursor: ExecutionEventCursor, afterOffset: number) => void;
  onState?: (state: ExecutionStreamState) => void;
  onError?: (error: unknown) => void;
  reconnectDelayMs?: number;
}): ReplayStream {
  let offset = Math.max(0, afterOffset);
  let streamId = initialStreamId.trim();
  let replayUntilOffset = offset;
  let currentState: ExecutionStreamState | undefined;

  const setState = (state: ExecutionStreamState) => {
    if (currentState === state) return;
    currentState = state;
    onState?.(state);
  };

  const resetCursor = (cursor: ExecutionEventCursor, afterOffset = 0) => {
    offset = afterOffset;
    streamId = cursor.streamId;
    replayUntilOffset = cursor.latestOffset;
    onCursorReset?.(cursor, afterOffset);
  };

  return openReplayJSONStream<ExecutionEvent>({
    path: () => executionEventStreamPath(targetId, offset),
    lastEventId: () => String(offset || ''),
    beforeConnect: async () => {
      const cursor = validateExecutionEventCursor(await getExecutionEventCursor(targetId));
      // A fresh browser session already bootstraps its resource projections from
      // authoritative REST snapshots. Join the live tail instead of replaying
      // the target's entire durable history before current events can arrive.
      if (!streamId) resetCursor(cursor, cursor.latestOffset);
      else if (streamId !== cursor.streamId || offset > cursor.latestOffset) resetCursor(cursor);
      else replayUntilOffset = cursor.latestOffset;
    },
    dynamicHeaders: () => ({ 'X-XGC-Execution-Stream-ID': streamId }),
    reconnectDelayMs,
    onConnecting: () => setState(offset > 0 ? 'replaying' : 'connecting'),
    onOpen: (response) => {
      const responseStreamId = response.headers.get('X-XGC-Execution-Stream-ID')?.trim() ?? '';
      const responseLatestOffset = Number(response.headers.get('X-XGC-Execution-Latest-Offset') ?? Number.NaN);
      if (!responseStreamId) throw new Error('execution event stream response is missing its stream ID');
      if (!Number.isSafeInteger(responseLatestOffset) || responseLatestOffset < 0) {
        throw new Error('execution event stream response has an invalid latest offset');
      }
      if (responseStreamId !== streamId || offset > responseLatestOffset) {
        resetCursor({
          streamId: responseStreamId,
          latestOffset: responseLatestOffset,
        });
        return false;
      }
      replayUntilOffset = responseLatestOffset;
      setState(offset < replayUntilOffset ? 'replaying' : 'connected');
      return true;
    },
    onValue: (event) => {
      if (!isExecutionEvent(event) || event.offset <= offset) return;
      offset = event.offset;
      onEvent(event);
      if (offset >= replayUntilOffset) setState('connected');
    },
    onError: (error) => {
      setState('disconnected');
      onError?.(error);
    },
  });
}

function validateExecutionEventCursor(value: ExecutionEventCursor) {
  if (
    !value
    || typeof value.streamId !== 'string'
    || !value.streamId.trim()
    || !Number.isSafeInteger(value.latestOffset)
    || value.latestOffset < 0
  ) throw new Error('invalid execution event cursor response');
  return { streamId: value.streamId.trim(),latestOffset: value.latestOffset } satisfies ExecutionEventCursor;
}

export function openExecutionLogStream({
  targetId,
  entityType,
  entityId,
  stream,
  offset,
  onLog,
  onError,
  reconnectDelayMs = 1000,
}: {
  targetId: string;
  entityType: 'job' | 'process-instance' | 'orchestration';
  entityId: string;
  stream: ExecutionLogStream;
  offset: number;
  onLog: (event: ExecutionLogEvent) => void;
  onError?: (error: unknown) => void;
  reconnectDelayMs?: number;
}): ReplayStream {
  let lastOffset = Math.max(0, offset);
  const path = entityType === 'job'
    ? executionJobLogStreamPath(targetId, entityId, stream)
    : entityType === 'process-instance'
      ? processInstanceLogStreamPath(targetId, entityId, stream)
      : orchestrationRunLogStreamPath(targetId, entityId, stream);
  return openReplayJSONStream<ExecutionLogEvent>({
    path: () => path,
    lastEventId: () => String(lastOffset || ''),
    reconnectDelayMs,
    onValue: (event, message) => {
      if (
        !isExecutionLogEvent(event)
        || event.entityType !== entityType
        || event.entityId !== entityId
        || event.stream !== stream
        || (event.offset < lastOffset && !event.truncated)
      ) return;
      const eventId = Number(message.id);
      if (!Number.isSafeInteger(eventId) || eventId !== event.nextOffset || event.nextOffset < event.offset) return;
      lastOffset = event.nextOffset;
      onLog(event);
    },
    onError,
  });
}

function isExecutionEvent(value: unknown): value is ExecutionEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return Number.isFinite(event.offset) && typeof event.entityType === 'string' && typeof event.entityId === 'string';
}

function isExecutionLogEvent(value: unknown): value is ExecutionLogEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return Number.isSafeInteger(event.offset)
    && Number.isSafeInteger(event.nextOffset)
    && typeof event.entityType === 'string'
    && typeof event.entityId === 'string'
    && (event.stream === 'stdout' || event.stream === 'stderr')
    && typeof event.content === 'string'
    && typeof event.truncated === 'boolean';
}
