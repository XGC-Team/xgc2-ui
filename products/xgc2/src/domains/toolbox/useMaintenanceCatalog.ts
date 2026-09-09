import { useEffect,useMemo,useRef,useState } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import type { MaintenanceDefinition } from './toolboxModel';
import { listMaintenanceDefinitions } from './toolboxService';

type MaintenanceCatalogState = {
  catalogKey: string;
  definitions: MaintenanceDefinition[];
  loading: boolean;
  error: string;
};

/**
 * Loads registered maintenance definitions at most once per catalogKey while enabled.
 * Disabled/offline callers pass enabled=false → 0 requests.
 */
export function useMaintenanceCatalog(
  catalogKey: string,
  apiTarget: ApiTargetOptions,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const requestRef = useRef({ catalogKey,generation: 0 });
  if (requestRef.current.catalogKey !== catalogKey) {
    requestRef.current = { catalogKey,generation: requestRef.current.generation + 1 };
  }
  const [state,setState] = useState<MaintenanceCatalogState>({
    catalogKey,definitions: [],loading: enabled,error: '',
  });

  useEffect(() => {
    if (!enabled) {
      setState({ catalogKey,definitions: [],loading: false,error: '' });
      return;
    }
    const generation = requestRef.current.generation + 1;
    requestRef.current.generation = generation;
    setState({ catalogKey,definitions: [],loading: true,error: '' });
    void listMaintenanceDefinitions(apiTarget).then((definitions) => {
      if (!isCurrent()) return;
      setState({ catalogKey,definitions,loading: false,error: '' });
    }).catch((cause: unknown) => {
      if (!isCurrent()) return;
      setState({ catalogKey,definitions: [],loading: false,error: messageOf(cause) });
    });
    return () => {
      if (isCurrent()) requestRef.current.generation += 1;
    };

    function isCurrent() {
      return requestRef.current.catalogKey === catalogKey
        && requestRef.current.generation === generation;
    }
  }, [apiTarget,catalogKey,enabled]);

  const current = state.catalogKey === catalogKey
    ? state
    : { catalogKey,definitions: [],loading: enabled,error: '' };

  return useMemo(() => ({
    definitions: current.definitions,
    loading: current.loading,
    error: current.error,
    supports: (kind: string) => current.definitions.some((definition) => definition.kind === kind),
  }), [current.definitions,current.error,current.loading]);
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
