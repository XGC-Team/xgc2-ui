import { createContext,useCallback,useContext,useEffect,useState,type ReactNode } from 'react';
import type { NativeSession } from '@xgc2/native-agent/state';
import type { GroundStationNativeRegistry,NativeProjection } from './groundStationNativeAgentTypes';
import { useGroundStationNativeAgentBindings,useGroundStationNativeSessionProjection } from './useGroundStationNativeAgentBindings';

export type { GroundStationNativeBinding,GroundStationNativeAttentionItem } from './groundStationNativeAgentTypes';

const NativeRegistry = createContext<GroundStationNativeRegistry | null>(null);
const NativeStreamFocus = createContext<(experimentId: string,active: boolean) => void>(() => undefined);

export function GroundStationNativeAgentProvider({ children,executionTargetId }: { children: ReactNode; executionTargetId: string }) {
  const [focusedExperimentId,setFocusedExperimentId] = useState('');
  const setStreamFocus = useCallback((experimentId: string,active: boolean) => {
    setFocusedExperimentId((current) => {
      if (active) return experimentId;
      return current === experimentId ? '' : current;
    });
  },[]);
  const { value,project } = useGroundStationNativeAgentBindings(executionTargetId,focusedExperimentId);
  return <NativeRegistry.Provider value={value}>
    <NativeStreamFocus.Provider value={setStreamFocus}>
      {value.bindings.map((binding) => executionTargetId === 'local' && binding.session && binding.experimentId === focusedExperimentId && value.selected[focusedExperimentId] === binding.sessionId ? <NativeSessionMonitor
        key={`${binding.experimentId}:${binding.sessionId}`}
        experimentId={binding.experimentId}
        session={binding.session}
        reload={binding.reload}
        onProjection={project}
      /> : null)}
      {children}
    </NativeStreamFocus.Provider>
  </NativeRegistry.Provider>;
}

/** HTTP/1.1 allows six connections per origin. Only the visible Experiment may hold a native SSE. */
// eslint-disable-next-line react-refresh/only-export-components -- focus is part of the same native registry API
export function useGroundStationNativeStreamFocus(experimentId: string,active: boolean) {
  const setStreamFocus = useContext(NativeStreamFocus);
  useEffect(() => {
    setStreamFocus(experimentId,active);
    return () => setStreamFocus(experimentId,false);
  },[active,experimentId,setStreamFocus]);
}

function NativeSessionMonitor(props: {
  experimentId: string; session: NativeSession; reload: number;
  onProjection: (experimentId: string,sessionId: string,projection: NativeProjection) => void;
}) {
  useGroundStationNativeSessionProjection(props);
  return null;
}

// eslint-disable-next-line react-refresh/only-export-components -- domain context API
export function useGroundStationNativeAgentRegistry() { return useContext(NativeRegistry); }

// eslint-disable-next-line react-refresh/only-export-components -- global attention projection of the same registry
export function useGroundStationNativeAttention() {
  const registry = useContext(NativeRegistry);
  return {items:registry?.pendingInputs ?? [],answer:registry?.answer ?? unavailableAnswer,error:registry?.attentionError ?? '',readInputs:registry?.readInputs};
}

function unavailableAnswer() { return Promise.reject(new Error('The local native Agent registry is unavailable.')); }
