import { useCallback,useEffect,useRef,useState } from 'react';
import type { ExecutionLogEvent } from './executionModel';
import {
  getExecutionJobLogs,
  getOrchestrationRunLogs,
  getProcessInstanceLogs,
  type ExecutionLogStream,
} from './executionService';
import { openExecutionLogStream } from './executionStreamService';

const MAX_LOG_CHARS = 1_000_000;

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
  const nextOffsetRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const chunk = await readExecutionLog(targetId, entityType, entityId, stream);
      setContent(trimLog(chunk.content));
      nextOffsetRef.current = chunk.nextOffset;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, stream, targetId]);

  useEffect(() => {
    let closed = false;
    let closeStream: () => void = () => undefined;
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
          setContent((current) => trimLog(current + event.content));
          nextOffsetRef.current = event.nextOffset;
        },
        onError: (cause) => setError(errorMessage(cause)),
      });
      closeStream = connection.close;
    };
    void start();
    return () => {
      closed = true;
      closeStream();
    };
  }, [entityId, entityType, follow, refresh, stream, targetId]);

  return { content,loading,error,refresh };
}

function readExecutionLog(targetId: string, entityType: 'job' | 'process-instance' | 'orchestration', entityId: string, stream: ExecutionLogStream) {
  if (entityType === 'job') return getExecutionJobLogs(targetId, entityId, 0, 64 * 1024, stream);
  if (entityType === 'process-instance') return getProcessInstanceLogs(targetId, entityId, 0, 64 * 1024, stream);
  return getOrchestrationRunLogs(targetId, entityId, 0, 64 * 1024, stream);
}

function trimLog(value: string) {
  return value.length > MAX_LOG_CHARS ? value.slice(value.length - MAX_LOG_CHARS) : value;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
