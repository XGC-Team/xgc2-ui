import { useCallback, useEffect, useState } from 'react';
import { useLatestAsyncRequest } from '../../../hooks/useLatestAsyncRequest';
import { listTaskLogPage, type TaskLogRow } from './taskLogsService';

export type { TaskLogRow } from './taskLogsService';

export type TaskLogsResource = {
  logs: TaskLogRow[];
  total: number;
  loading: boolean;
  message: string;
  refresh: () => Promise<void>;
};

export function useTaskLogsResource(params: {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}): TaskLogsResource {
  const [logs, setLogs] = useState<TaskLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const q = params.q ?? '';
  const status = params.status ?? 'all';
  const beginRequest = useLatestAsyncRequest(JSON.stringify([
    q,
    status,
    params.page,
    params.pageSize,
  ]));

  const refresh = useCallback(async () => {
    const isCurrent = beginRequest();
    setLoading(true);
    try {
      const result = await listTaskLogPage({
        q,
        status,
        page: params.page,
        pageSize: params.pageSize,
      });
      if (!isCurrent()) return;
      setLogs(result.rows);
      setTotal(result.total);
      setMessage('');
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [beginRequest, params.page, params.pageSize, q, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { logs, total, loading, message, refresh };
}
