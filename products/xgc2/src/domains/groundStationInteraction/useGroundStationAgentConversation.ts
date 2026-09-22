import { useCallback } from 'react';
import { emptyStream,type AgentAnswer,type AgentTurnOptions } from '@xgc2/agent-runtime/state';
import { useGroundStationNativeAgentRegistry } from './GroundStationAgentProvider';
import type { GroundStationNativeBinding } from './groundStationAgentTypes';

/** Bind shared presentation intents to the exact Experiment and pending native request. */
export function useGroundStationAgentConversation(experimentId: string,binding?: GroundStationNativeBinding,options?:AgentTurnOptions) {
  const registry = useGroundStationNativeAgentRegistry();
  const send = useCallback((message: string) => {
    if (!registry) return Promise.reject(new Error('The local native Agent registry is unavailable.'));
    return registry.send(experimentId,message,options);
  },[registry,experimentId,options]);
  const interrupt = useCallback(() => {
    if (!registry) return Promise.reject(new Error('The local native Agent registry is unavailable.'));
    return registry.cancel(experimentId);
  },[registry,experimentId]);
  const answer = useCallback((requestId: string,value: AgentAnswer) => {
    const item = registry?.pendingInputs.find((pending) => pending.sessionId === binding?.sessionId && pending.request.id === requestId);
    if (!registry || !item) return Promise.reject(new Error('This native input request is no longer pending.'));
    return registry.answer(item,value);
  },[registry,binding?.sessionId]);
  return {
    available: Boolean(registry),
    state: binding?.projection?.state ?? emptyStream(binding?.sessionId ?? `experiment:${experimentId}`,binding?.session?.provider ?? 'codex'),
    disabled: Boolean(binding?.session?.archived || binding?.error || binding?.projection?.error),
    onSend: binding?.session && !binding.session.archived ? send : undefined,
    onInterrupt: binding?.session ? interrupt : undefined,
    onAnswer: answer,
  };
}
