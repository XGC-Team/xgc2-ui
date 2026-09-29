import { useEffect,useRef,useState } from 'react';
import { isRunStatusActive } from '../shared/executionStatusVocabulary';
import type { PanelActionInvocation,PanelActionPortRuntime } from './types';
import { newestPanelInvocation } from './panelInvocationObservation';
import { usePanelExecutionRunDetail } from './panelExecutionObserver';

/**
 * Observe the exact accepted receipt through the existing Run store/SSE.
 * This retains facts, not a second execution lifecycle. No polling or mutation.
 */
export function usePanelInvocationObservation(
  port: PanelActionPortRuntime | undefined,
  accepted: PanelActionInvocation | undefined,
  observeAfterTerminal = false,
) {
  const id = accepted?.id ?? '';
  const [loadResult,setLoadResult] = useState<{ id:string;error:string }>();
  const retained = useRef<PanelActionInvocation | undefined>(undefined);
  const execution = port?.execution;
  // The domain store merges Run, child-link and child-Run revisions independently.
  // A load response must never survive here as a second detail snapshot.
  const stored = usePanelExecutionRunDetail(execution,id);
  const detail = stored?.run?.id === id ? stored : undefined;
  const next = newestPanelInvocation(
    accepted,retained.current,detail?.run,port?.latestInvocation,port?.activeInvocation,
  );
  const previous = retained.current;
  const invocation = previous?.id === next?.id && previous?.status === next?.status
    && previous?.revision === next?.revision ? previous : next;
  retained.current = invocation;
  const observe = Boolean(id) && (observeAfterTerminal || isRunStatusActive(invocation?.status));
  const retain = execution?.retainRunObservation;
  const load = execution?.loadRunDetail;

  useEffect(() => {
    if (!observe || !retain) return;
    return retain(id);
  },[id,observe,retain]);

  useEffect(() => {
    if (!id || !load) return;
    let current = true;
    setLoadResult({ id,error:'' });
    void Promise.resolve().then(() => load(id)).then((value) => {
      if (!current) return;
      setLoadResult({ id,error:value?.error
        || (value?.run?.id !== id ? 'Run observation identity mismatch.' : '') });
    }).catch((cause: unknown) => {
      if (current) setLoadResult({ id,error:cause instanceof Error ? cause.message : String(cause) });
    });
    return () => { current = false; };
  },[id,load]);

  return { invocation,detail,error:stored?.error ?? (loadResult?.id === id ? loadResult.error : '') };
}
