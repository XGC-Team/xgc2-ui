import { useCallback } from 'react';
import { emptyStream,type NativeAnswer,type NativeTurnOptions } from '@xgc2/native-agent/state';
import { useGroundStationNativeAgentRegistry } from './GroundStationNativeAgentProvider';
import type { GroundStationNativeBinding } from './groundStationNativeAgentTypes';

/** Bind shared presentation intents to the exact Experiment and pending native request. */
export function useGroundStationNativeConversation(experimentId: string,binding?: GroundStationNativeBinding,options?:NativeTurnOptions) {
  const registry = useGroundStationNativeAgentRegistry();
  const send = useCallback((message: string) => {
    if (!registry) return Promise.reject(new Error('The local native Agent registry is unavailable.'));
    return registry.send(experimentId,message,options);
  },[registry,experimentId,options]);
  const interrupt = useCallback(() => {
    if (!registry) return Promise.reject(new Error('The local native Agent registry is unavailable.'));
    return registry.cancel(experimentId);
  },[registry,experimentId]);
  const answer = useCallback((requestId: string,value: NativeAnswer) => {
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
