import { useCallback,useState } from 'react';

export function workflowStartupGeneration(runId: string, fallback = '') {
  return runId.trim() || fallback;
}

export function useWorkflowStartupPresentation(generation: string, reset = false) {
  const [presentedGeneration,setPresentedGeneration] = useState('');
  if (presentedGeneration && (presentedGeneration !== generation || reset)) {
    setPresentedGeneration('');
  }
  const presented = Boolean(generation) && presentedGeneration === generation && !reset;
  const onPresentationComplete = useCallback((presentedId: string) => {
    if (!presentedId) return;
    setPresentedGeneration(presentedId);
  }, []);
  return { presented,onPresentationComplete };
}
