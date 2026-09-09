import { useCallback,useEffect,useMemo,useState } from 'react';
import type { HostLogChunk,HostLogSource } from './hostModel';
import { listHostLogSources,readHostLogChunk } from './hostLogActions';
import { useHostTask } from './useHostTask';

export function useHostLogsResource({
  managedHostId,
  targetCoreId,
  requestsAllowed,
}: {
  managedHostId?: string;
  targetCoreId?: string;
  requestsAllowed: boolean;
}) {
  const apiTarget = useMemo(() => ({
    ...(targetCoreId ? { targetCoreId } : {}),
    ...(managedHostId ? { managedHostId } : {}),
  }), [managedHostId,targetCoreId]);
  const [sources,setSources] = useState<HostLogSource[]>([]);
  const [sourceId,setSourceId] = useState('');
  const [chunk,setChunk] = useState<HostLogChunk | null>(null);
  const task = useHostTask();
  const { run } = task;

  const loadSources = useCallback(async () => {
    if (!managedHostId || !requestsAllowed) return;
    await run('log-sources',async () => {
      const next = await listHostLogSources(apiTarget);
      setSources(next);
      setSourceId((current) => current && next.some((source) => source.id === current) ? current : (next[0]?.id ?? ''));
    });
  }, [apiTarget,managedHostId,requestsAllowed,run]);

  const loadChunk = useCallback(async (nextSourceId: string) => {
    if (!managedHostId || !requestsAllowed || !nextSourceId) return;
    await run(`log-chunk:${nextSourceId}`,async () => {
      setChunk(await readHostLogChunk(nextSourceId, { ...apiTarget,offset: 0,limitBytes: 65_536 }));
    });
  }, [apiTarget,managedHostId,requestsAllowed,run]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!sourceId) {
      setChunk(null);
      return;
    }
    void loadChunk(sourceId);
  }, [loadChunk,sourceId]);

  const refresh = useCallback(() => loadChunk(sourceId),[loadChunk,sourceId]);

  return {
    sources,
    sourceId,
    chunk,
    busy: task.isBusy(),
    message: task.message,
    messageTone: task.messageTone,
    clearMessage: task.clearMessage,
    selectSource: setSourceId,
    refresh,
  };
}
