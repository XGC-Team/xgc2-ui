import { useCallback,useEffect,useMemo,useRef } from 'react';
import { useNativeStream } from '@xgc2/native-agent/react';
import type { NativeAnswer,NativeSession,NativeTurnOptions,Scope,StreamState } from '@xgc2/native-agent/state';
import { assertNativeExperimentSession,createGroundStationNativeClient,nativeExperimentPath,openGroundStationNativeStream } from './groundStationNativeAgentService';
import type { GroundStationNativeAttentionItem,GroundStationNativeRegistry,NativeProjection } from './groundStationNativeAgentTypes';
import { useGroundStationConversationIndex } from './useGroundStationConversationIndex';
import { remoteConversationScope,bindRemoteConversationDraft } from './groundStationRemoteMessages';
import { useNativeConversationAttention } from './useNativeConversationAttention';

function mergeNativeOptions(base:NativeTurnOptions = {},override:NativeTurnOptions = {}):NativeTurnOptions {
  const options = {...base};
  if (override.model && override.model !== base.model) delete options.effort;
  return {...options,...override};
}

function projectedOptions(session:NativeSession,state:StreamState) {
  return state.items.reduce((options,item) => item.details?.type === 'userMessage'
    ? mergeNativeOptions(options,item.details.nativeOptions) : options,session.options ?? {});
}

function durableNativeSessionState(sessionState: NativeSession['state'] | undefined, worker: StreamState['worker']) {
  // emptyStream starts as `starting`. That must not hide a disconnected HTTP
  // session, or send skips reconnect and waits forever on the journal.
  if ((sessionState === 'disconnected' || sessionState === 'closed') && worker === 'starting') return sessionState;
  return worker;
}

/** Coordinates the existing native journal, selected conversation and scoped commands. */
export function useGroundStationNativeAgentBindings(executionTargetId: string,focusedExperimentId = '') {
  const index = useGroundStationConversationIndex(executionTargetId,focusedExperimentId);
  const attention = useNativeConversationAttention(executionTargetId,index.bindings);
  const current = useRef({index,attention,executionTargetId});
  current.current = {index,attention,executionTargetId};
  const createAttempts = useRef(new Map<string,{fingerprint:string; key:string}>());
  const promptAttempts = useRef(new Map<string,{fingerprint:string; key:string}>());
  const requireLocal = useCallback(() => {
    if (current.current.executionTargetId !== 'local') throw new Error('Local native Agent is only available on the local execution target.');
  },[]);
  const requiredBinding = useCallback((experimentId:string,sessionId = current.current.index.selected[experimentId]) => {
    const binding = current.current.index.bindings.find(item => item.sessionId === sessionId && item.experimentId === experimentId);
    if (!binding?.session) throw new Error('Choose a conversation from this experiment.');
    assertNativeExperimentSession(binding.session,experimentId);
    return binding;
  },[]);
  const project = useCallback((experimentId:string,sessionId:string,projection:NativeProjection) => {
    current.current.index.setBindings(items => items.map(item => item.experimentId === experimentId && item.sessionId === sessionId
      ? {...item,projection:{...projection,receivedAt:Date.now()},session:item.session ? {...item.session,
        state: durableNativeSessionState(item.session.state,projection.state.worker),
        nativeSessionId:projection.state.nativeSessionId || item.session.nativeSessionId,
        runtimeId:projection.state.runtimeId || item.session.runtimeId,
        options:projectedOptions(item.session,projection.state),
        ...(projection.state.metadata ?? {})} : item.session} : item));
  },[]);
  const connect = useCallback(async (experimentId:string,selection:Omit<Scope,'context'>,experimentServices = false) => {
    requireLocal();
    const draftScope = remoteConversationScope(experimentId,current.current.index.selected[experimentId]);
    const scope:Scope = {...selection,context:{kind:'experiment',id:experimentId}};
    const fingerprint = JSON.stringify([scope,experimentServices]);
    let attempt = createAttempts.current.get(experimentId);
    if (attempt?.fingerprint !== fingerprint) {
      attempt = {fingerprint,key:crypto.randomUUID()};
      createAttempts.current.set(experimentId,attempt);
    }
    const session = assertNativeExperimentSession(await createGroundStationNativeClient(experimentId,experimentServices).createNativeSession(scope,attempt.key),experimentId);
    bindRemoteConversationDraft(experimentId,draftScope,session.id);
    current.current.index.chooseCreated(experimentId,session);
    if (createAttempts.current.get(experimentId) === attempt) createAttempts.current.delete(experimentId);
    return session;
  },[requireLocal]);
  const send = useCallback(async (experimentId:string,message:string,options?:NativeTurnOptions,sessionId?:string) => {
    requireLocal();
    const api = createGroundStationNativeClient(experimentId);
    // Reuse the exact ready projection. A new/recovered conversation can precede
    // React projection; only that case needs a fresh identity read.
    const cached = current.current.index.bindings.find(item => item.experimentId === experimentId && item.sessionId === sessionId);
    const binding = sessionId ? (cached?.session?.state === 'ready' ? cached
      : {sessionId,session:assertNativeExperimentSession(await api.getNativeSession(sessionId),experimentId)}) : requiredBinding(experimentId);
    if (binding.session?.archived || binding.session?.state !== 'ready' || !message.trim()) throw new Error('The conversation is not ready to receive a message.');
    const fingerprint = JSON.stringify([message,options?.model ?? null,options?.effort ?? null,options?.permission ?? null]);
    let attempt = promptAttempts.current.get(binding.sessionId);
    if (attempt?.fingerprint !== fingerprint) {
      attempt = {fingerprint,key:crypto.randomUUID()};
      promptAttempts.current.set(binding.sessionId,attempt);
    }
    const turnId = await api.sendNativePrompt(binding.sessionId,message,attempt.key,options);
    if (options && binding.session) current.current.index.upsert(experimentId,[{...binding.session,options:mergeNativeOptions(binding.session.options,options)}]);
    if (promptAttempts.current.get(binding.sessionId) === attempt) promptAttempts.current.delete(binding.sessionId);
    return turnId;
  },[requiredBinding,requireLocal]);
  const answer = useCallback(async (item:GroundStationNativeAttentionItem,value:NativeAnswer) => {
    requireLocal();
    const pending = current.current.attention.items.find(input => input.id === item.id && input.experimentId === item.experimentId && input.sessionId === item.sessionId);
    if (!pending || pending.summaryOnly || pending.submitted) throw new Error('This native input request is no longer available for a response.');
    const result = await createGroundStationNativeClient(item.experimentId).answerNativeRequest(item.sessionId,item.request.id,value);
    await current.current.attention.readInputs(item.experimentId,item.sessionId);
    return result;
  },[requireLocal]);
  const cancel = useCallback(async (experimentId:string) => {
    requireLocal();
    return createGroundStationNativeClient(experimentId).cancelNativeTurn(requiredBinding(experimentId).sessionId);
  },[requireLocal,requiredBinding]);
  const reconnect = useCallback(async (experimentId:string,experimentServices = false) => {
    requireLocal();
    const binding = requiredBinding(experimentId);
    if (binding.session?.archived) throw new Error('Restore the archived conversation before reconnecting.');
    const sessionState = binding.session?.state;
    const state = sessionState === 'disconnected' || sessionState === 'closed'
      ? sessionState
      : binding.projection?.state.worker ?? sessionState;
    if (state !== 'disconnected' && state !== 'closed' && state !== 'ready') throw new Error('Wait for the current turn to finish before reconnecting.');
    const api = createGroundStationNativeClient(experimentId,experimentServices);
    if (state === 'ready') await api.closeNativeSession(binding.sessionId);
    return api.reconnectNativeSession(binding.sessionId);
  },[requireLocal,requiredBinding]);
  const close = useCallback(async (experimentId:string) => {
    requireLocal();
    return createGroundStationNativeClient(experimentId).closeNativeSession(requiredBinding(experimentId).sessionId);
  },[requireLocal,requiredBinding]);
  const reload = useCallback((experimentId:string) => {
    const id = current.current.index.selected[experimentId];
    current.current.index.setBindings(items => items.map(item => item.sessionId === id ? {...item,reload:item.reload+1} : item));
  },[]);
  const recover = useCallback(async (experimentId:string) => {
    const binding = requiredBinding(experimentId);
    current.current.index.upsert(experimentId,[await createGroundStationNativeClient(experimentId).getNativeSession(binding.sessionId)]);
    reload(experimentId);
  },[requiredBinding,reload]);
  const update = useCallback(async (experimentId:string,sessionId:string,changes:{title?:string; archived?:boolean}) => {
    requireLocal();
    const binding = requiredBinding(experimentId,sessionId);
    const session = await createGroundStationNativeClient(experimentId).updateNativeSession(sessionId,{expectedRevision:binding.session!.metadataRevision,...changes});
    current.current.index.upsert(experimentId,[session]);
  },[requireLocal,requiredBinding]);
  const open = useCallback(async (experimentId:string,sessionId:string) => {
    requireLocal();
    const session = await createGroundStationNativeClient(experimentId).getNativeSession(sessionId);
    current.current.index.chooseCreated(experimentId,assertNativeExperimentSession(session,experimentId));
  },[requireLocal]);
  const value = useMemo<GroundStationNativeRegistry>(() => ({bindings:index.bindings,selected:index.selected,inventories:index.inventories,
    select:index.select,open,refresh:index.refresh,update,readInputs:attention.readInputs,pendingInputs:attention.items,attentionError:attention.error,
    connect,send,answer,cancel,reconnect,close,reload,recover}),
  [index.bindings,index.selected,index.inventories,index.select,index.refresh,update,open,attention.readInputs,attention.items,attention.error,connect,send,answer,cancel,reconnect,close,reload,recover]);
  return {value,project};
}

/** Only the selected visible conversation holds a transcript SSE. */
export function useGroundStationNativeSessionProjection({experimentId,session,reload,onProjection}:{
  experimentId:string; session:NativeSession; reload:number;
  onProjection:(experimentId:string,sessionId:string,projection:NativeProjection) => void;
}) {
  const {state,connection,error} = useNativeStream(session,reload,{basePath:`/api${nativeExperimentPath(experimentId)}`,openStream:openGroundStationNativeStream});
  useEffect(() => onProjection(experimentId,session.id,{state,connection,error}),[experimentId,session.id,state,connection,error,onProjection]);
}
