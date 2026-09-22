import { createContext,useCallback,useContext,useEffect,useState,type ReactNode } from 'react';
import type { AgentSession } from '@xgc2/agent-runtime/state';
import type { GroundStationNativeRegistry,AgentProjection } from './groundStationAgentTypes';
import { useGroundStationAgentBindings,useGroundStationNativeSessionProjection } from './useGroundStationAgentBindings';

export type { GroundStationNativeBinding,GroundStationNativeAttentionItem } from './groundStationAgentTypes';

const AgentRegistry = createContext<GroundStationNativeRegistry | null>(null);
const AgentStreamFocus = createContext<(experimentId: string,active: boolean) => void>(() => undefined);

export function GroundStationAgentProvider({ children,executionTargetId }: { children: ReactNode; executionTargetId: string }) {
  const [focusedExperimentId,setFocusedExperimentId] = useState('');
  const setStreamFocus = useCallback((experimentId: string,active: boolean) => {
    setFocusedExperimentId((current) => {
      if (active) return experimentId;
      return current === experimentId ? '' : current;
    });
  },[]);
  const { value,project } = useGroundStationAgentBindings(executionTargetId,focusedExperimentId);
  return <AgentRegistry.Provider value={value}>
    <AgentStreamFocus.Provider value={setStreamFocus}>
      {value.bindings.map((binding) => executionTargetId === 'local' && binding.session && binding.experimentId === focusedExperimentId && value.selected[focusedExperimentId] === binding.sessionId ? <AgentSessionMonitor
        key={`${binding.experimentId}:${binding.sessionId}`}
        experimentId={binding.experimentId}
        session={binding.session}
        reload={binding.reload}
        onProjection={project}
      /> : null)}
      {children}
    </AgentStreamFocus.Provider>
  </AgentRegistry.Provider>;
}

/** HTTP/1.1 allows six connections per origin. Only the visible Experiment may hold a native SSE. */
// eslint-disable-next-line react-refresh/only-export-components -- focus is part of the same native registry API
export function useGroundStationAgentStreamFocus(experimentId: string,active: boolean) {
  const setStreamFocus = useContext(AgentStreamFocus);
  useEffect(() => {
    setStreamFocus(experimentId,active);
    return () => setStreamFocus(experimentId,false);
  },[active,experimentId,setStreamFocus]);
}

function AgentSessionMonitor(props: {
  experimentId: string; session: AgentSession; reload: number;
  onProjection: (experimentId: string,sessionId: string,projection: AgentProjection) => void;
}) {
  useGroundStationNativeSessionProjection(props);
  return null;
}

// eslint-disable-next-line react-refresh/only-export-components -- domain context API
export function useGroundStationNativeAgentRegistry() { return useContext(AgentRegistry); }

// eslint-disable-next-line react-refresh/only-export-components -- global attention projection of the same registry
export function useGroundStationNativeAttention() {
  const registry = useContext(AgentRegistry);
  return {items:registry?.pendingInputs ?? [],answer:registry?.answer ?? unavailableAnswer,error:registry?.attentionError ?? '',readInputs:registry?.readInputs};
}

function unavailableAnswer() { return Promise.reject(new Error('The local native Agent registry is unavailable.')); }
