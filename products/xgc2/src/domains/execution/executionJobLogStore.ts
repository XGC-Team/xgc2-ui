import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { createEventCoalescer } from '../../shared/eventCoalescer';
import type { ExecutionLogEvent } from './executionModel';
import {
  getExecutionJobLogs,
  getOrchestrationRunLogs,
  getProcessInstanceLogs,
  type ExecutionLogStream,
} from './executionService';
import { openExecutionLogStream } from './executionStreamService';

const MAX_LOG_CHARS = 1_000_000;
const FLUSH_DELAY_MS = 200;

type LogBuffer = {
  parts: string[];
  length: number;
};

function emptyLogBuffer(): LogBuffer {
  return { parts: [],length: 0 };
}

// Appends a chunk and trims from the front so the retained content always
// equals the last MAX_LOG_CHARS characters, without reallocating the whole
// string per event.
function pushLogPart(buffer: LogBuffer, chunk: string) {
  if (!chunk) return;
  buffer.parts.push(chunk);
  buffer.length += chunk.length;
  while (buffer.length > MAX_LOG_CHARS && buffer.parts.length > 0) {
    const overflow = buffer.length - MAX_LOG_CHARS;
    const first = buffer.parts[0]!;
    if (first.length <= overflow) {
      buffer.parts.shift();
      buffer.length -= first.length;
    } else {
      buffer.parts[0] = first.slice(overflow);
      buffer.length -= overflow;
    }
  }
}

/** Owns fetch/follow lifecycle for one entity stream and its byte cursor. */
export function useExecutionLog({
  targetId,
  entityType,
  entityId,
  stream,
  follow,
}: {
  targetId: string;
  entityType: 'job' | 'process-instance' | 'orchestration';
  entityId: string;
  stream: ExecutionLogStream;
  follow: boolean;
}) {
  const [content, setContent] = useState('');
  const bufferRef = useRef<LogBuffer>(emptyLogBuffer());
  const nextOffsetRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const flushContent = useCallback(() => {
    setContent(bufferRef.current.parts.join(''));
  }, []);

  const flushCoalescer = useMemo(
    () => createEventCoalescer(FLUSH_DELAY_MS, flushContent),
    [flushContent],
  );
  useEffect(() => () => flushCoalescer.cancel(), [flushCoalescer]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const chunk = await readExecutionLog(targetId, entityType, entityId, stream);
      const buffer = emptyLogBuffer();
      pushLogPart(buffer, chunk.content);
      flushCoalescer.cancel();
      bufferRef.current = buffer;
      setContent(buffer.parts.join(''));
      nextOffsetRef.current = chunk.nextOffset;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, flushCoalescer, stream, targetId]);

  useEffect(() => {
    let closed = false;
    let closeStream: () => void = () => undefined;
    flushCoalescer.cancel();
    bufferRef.current = emptyLogBuffer();
    setContent('');
    nextOffsetRef.current = 0;
    const start = async () => {
      await refresh();
      if (closed || !follow) return;
      const connection = openExecutionLogStream({
        targetId,
        entityType,
        entityId,
        stream,
        offset: nextOffsetRef.current,
        onLog: (event: ExecutionLogEvent) => {
          pushLogPart(bufferRef.current, event.content);
          nextOffsetRef.current = event.nextOffset;
          flushCoalescer.schedule();
        },
        onError: (cause) => setError(errorMessage(cause)),
      });
      closeStream = connection.close;
    };
    void start();
    return () => {
      closed = true;
      closeStream();
      flushCoalescer.cancel();
    };
  }, [entityId, entityType, flushCoalescer, follow, refresh, stream, targetId]);

  return { content,loading,error,refresh };
}

function readExecutionLog(targetId: string, entityType: 'job' | 'process-instance' | 'orchestration', entityId: string, stream: ExecutionLogStream) {
  if (entityType === 'job') return getExecutionJobLogs(targetId, entityId, 0, 64 * 1024, stream);
  if (entityType === 'process-instance') return getProcessInstanceLogs(targetId, entityId, 0, 64 * 1024, stream);
  return getOrchestrationRunLogs(targetId, entityId, 0, 64 * 1024, stream);
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
