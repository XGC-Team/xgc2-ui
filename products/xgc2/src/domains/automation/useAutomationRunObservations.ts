import { useCallback,useEffect,useRef } from 'react';
import { createEventCoalescer } from '../../shared/eventCoalescer';
import { isWorkflowRuntimeRunEvent,WORKFLOW_RUNTIME_ENTITY_TYPE } from '../../shared/workflowRuntimeProtocol';
import { useExecutionEventChannel,type ExecutionEvent } from '../execution/executionPublic';
import { getAutomationObservations,type AutomationObservationBundle } from './automationObservationService';
import { useAutomationTargetScope } from './useAutomationTargetScope';

// One observation owner per execution target. Panels retain roots; SQL owns
// closure traversal. Cursor coverage, rather than a timer/revision guess,
// decides whether events received during a read need a trailing request.
export function useAutomationRunObservations(targetId:string,apply:(bundle:AutomationObservationBundle) => void,onError:(ids:string[],cause:unknown) => void) {
  const scopeRef=useAutomationTargetScope(targetId);
  const scope=scopeRef.current;
  const callbacks=useRef({ apply,onError });
  callbacks.current={ apply,onError };
  const stateRef=useRef(createObservationState(scope));
  if (stateRef.current.scope!==scope) {
    stateRef.current.controller?.abort();
    stateRef.current.coalescer?.cancel();
    stateRef.current=createObservationState(scope);
  }
  const state=stateRef.current;
  const refresh=useCallback(async () => {
    if (scopeRef.current!==scope || state.controller || state.roots.size===0) return;
    const roots=[...state.roots.keys()].sort();
    const generation=state.generation;
    const controller=new AbortController();
    state.controller=controller;
    try {
      const bundle=await getAutomationObservations(scope.targetId,roots,controller.signal);
      if (scopeRef.current!==scope || controller.signal.aborted) return;
      if (state.streamId && bundle.cursor.streamId!==state.streamId) throw new Error('Automation observation stream changed.');
      state.observed=new Set(bundle.items.map((item) => item.run.id));
      state.covered=bundle.cursor.latestOffset;
      callbacks.current.apply(bundle);
    } catch (cause) {
      if (scopeRef.current===scope && !controller.signal.aborted) callbacks.current.onError(roots,cause);
      // A failed request waits for a new event or explicit retention change.
      state.latest=0;
    } finally {
      if (state.controller===controller) state.controller=undefined;
      if (scopeRef.current===scope && !controller.signal.aborted
        && (state.generation!==generation || state.latest>state.covered)) state.coalescer?.schedule();
    }
  },[scope,scopeRef,state]);
  const schedule=useCallback(() => {
    if (state.roots.size===0 || state.controller) return;
    if (!state.coalescer) state.coalescer=createEventCoalescer(16,() => { void refresh(); });
    state.coalescer.schedule();
  },[refresh,state]);
  const retainRunObservation=useCallback((runId:string) => {
    if (!runId || runId.trim()!==runId) throw new Error('Observation requires an exact Run ID.');
    const previous=state.roots.get(runId)??0;
    state.roots.set(runId,previous+1);
    if (previous===0) { state.generation+=1;schedule(); }
    let released=false;
    return () => {
      if (released) return;
      released=true;
      const count=state.roots.get(runId)??0;
      if (count>1) state.roots.set(runId,count-1);
      else { state.roots.delete(runId);state.generation+=1; }
      if (state.roots.size===0) { state.controller?.abort();state.coalescer?.cancel();state.observed.clear(); }
    };
  },[schedule,state]);
  const handleEvent=useCallback((event:ExecutionEvent) => {
    if (event.entityType!==WORKFLOW_RUNTIME_ENTITY_TYPE || !isWorkflowRuntimeRunEvent(event.type)
      || state.roots.size===0) return;
    const run=event.payload.run;
    const rootId=run && typeof run==='object' && 'rootRunId' in run ? run.rootRunId : undefined;
    if (!state.observed.has(event.entityId) && !state.roots.has(event.entityId)
      && !(typeof rootId==='string' && state.roots.has(rootId))) return;
    state.latest=Math.max(state.latest,event.offset);
    if (event.offset>state.covered) schedule();
  },[schedule,state]);
  const channel=useExecutionEventChannel(targetId,handleEvent);
  useEffect(() => {
    state.controller?.abort();
    state.controller=undefined;
    state.coalescer?.cancel();
    state.generation+=1;
    state.covered=0;
    state.latest=0;
    state.streamId=channel.streamId;
    if (channel.streamState==='connected') schedule();
  },[channel.streamId,channel.streamState,schedule,state]);
  useEffect(() => () => { state.controller?.abort();state.coalescer?.cancel(); },[state]);
  return retainRunObservation;
}

function createObservationState(scope:{ targetId:string }) {
  return {
    scope,roots:new Map<string,number>(),observed:new Set<string>(),
    generation:0,latest:0,covered:0,streamId:undefined as string|undefined,
    controller:undefined as AbortController|undefined,
    coalescer:undefined as ReturnType<typeof createEventCoalescer>|undefined,
  };
}
