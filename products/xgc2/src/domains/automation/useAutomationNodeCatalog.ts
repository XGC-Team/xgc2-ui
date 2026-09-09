import { useCallback,useEffect,useRef,useState } from 'react';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import { listAutomationNodeCatalog } from './automationCatalogService';
import { messageOf } from './automationErrorModel';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type NodeCatalogSnapshot = {
  scope: AutomationTargetScope;
  catalog: AutomationNodeCatalogEntry[];
  error: string;
  loaded: boolean;
  loading: boolean;
};

export function useAutomationNodeCatalog(targetId: string) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<NodeCatalogSnapshot>(() => emptyNodeCatalog(targetScope));
  const requestGenerationRef = useRef(0);

  const refreshNodeCatalog = useCallback(async (signal?: AbortSignal) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    setSnapshot((current) => ({
      scope: requestScope,
      catalog: current.scope === requestScope ? current.catalog : [],
      error: '',
      loaded: false,
      loading: true,
    }));
    try {
      const catalog = await listAutomationNodeCatalog(requestScope.targetId, { signal });
      if (signal?.aborted
        || targetScopeRef.current !== requestScope
        || requestGenerationRef.current !== generation) return;
      setSnapshot({ scope: requestScope,catalog,error: '',loaded: true,loading: false });
    } catch (cause) {
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && requestGenerationRef.current === generation) {
        setSnapshot((current) => ({
          scope: requestScope,
          catalog: current.scope === requestScope ? current.catalog : [],
          error: messageOf(cause),
          loaded: false,
          loading: false,
        }));
      }
    } finally {
      if (targetScopeRef.current === requestScope && requestGenerationRef.current === generation) {
        setSnapshot((current) => current.scope === requestScope && current.loading
          ? { ...current,loading: false }
          : current);
      }
    }
  }, [targetScope,targetScopeRef]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshNodeCatalog(controller.signal);
    return () => controller.abort();
  }, [refreshNodeCatalog]);

  const active = snapshot.scope === targetScope ? snapshot : emptyNodeCatalog(targetScope);
  return {
    catalog: active.catalog,
    catalogError: active.error,
    catalogLoaded: active.loaded,
    catalogLoading: active.loading,
    refreshNodeCatalog,
  };
}

function emptyNodeCatalog(scope: AutomationTargetScope): NodeCatalogSnapshot {
  return { scope,catalog: [],error: '',loaded: false,loading: true };
}
