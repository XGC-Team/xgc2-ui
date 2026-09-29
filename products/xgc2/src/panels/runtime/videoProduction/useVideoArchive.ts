import { useCallback,useEffect,useRef,useState } from 'react';
import { listROSBagRecordings,type ROSBagRecording } from '../../../domains/recording/recordingPublic';

/** Apply the optional Experiment filter before paging; selection stays caller-owned. */
export function useVideoArchive(experimentId?: string) {
  const [bags,setBags] = useState<ROSBagRecording[]>([]);
  const [busy,setBusy] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [loadedScope,setLoadedScope] = useState(experimentId);
  const [error,setError] = useState('');
  const [incomplete,setIncomplete] = useState(false);
  const [nextOffset,setNextOffset] = useState<number>();
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (offset = 0) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const page = await listROSBagRecordings({ ...(experimentId ? { experimentId } : {}),offset },controller.signal);
      if (controller.signal.aborted) return;
      setBags((current) => offset === 0 ? page.items : [...current,...page.items.filter(
        (bag) => !current.some((existing) => existing.id === bag.id),
      )]);
      const next = page.nextOffset;
      const advances = Number.isSafeInteger(next) && next !== undefined && next > offset;
      setNextOffset(page.truncated && advances ? next : undefined);
      const missing = Boolean(page.attributionTruncated || (page.truncated && !advances));
      setIncomplete((previous) => offset === 0 ? missing : previous || missing);
      setLoaded(true);
      setLoadedScope(experimentId);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  },[experimentId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  },[load]);
  const sameScope = loadedScope === experimentId;
  return { bags: sameScope ? bags : [],busy,loaded: sameScope && loaded,error,
    incomplete: sameScope && incomplete,nextOffset: sameScope ? nextOffset : undefined,load };
}
