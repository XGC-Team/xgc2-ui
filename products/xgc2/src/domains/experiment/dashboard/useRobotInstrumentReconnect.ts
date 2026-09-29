import { useCallback,useEffect,useRef,useState } from 'react';
import type { AutomationRunControl,AutomationRunDetail,AutomationStopRunSetResponse } from '../../automation/automationPublic';
import { executionTargetResourceId } from '../../execution/executionPublic';
import { useGroundStationErrorNotification } from '../../groundStationInteraction/groundStationInteractionPublic';
import { canonicalRobotSelectionParameters } from '../../robot/robotPublic';
import { isRunStatus,isRunStatusTerminal } from '../../../shared/executionStatusVocabulary';

export type InstrumentReconnectStop = {
  targetId:string;
  run:AutomationRunControl;
  stop:() => Promise<AutomationStopRunSetResponse>;
};
type Observation = {
  runDetailsById:Readonly<Record<string,AutomationRunDetail>>;
  retainRunObservation:(id:string) => () => void;
};
type Observations = ReadonlyMap<string,Observation>;
type Options = {
  scopeKey:string;
  targetId:string;
  canceled:boolean;
  /** The latest exact Run observations per target, read when a batch needs them. */
  observations:() => Observations;
  /** Fires when those observations may have changed; followed only while waiting. */
  subscribe:(listener:() => void) => () => void;
  start:(ids:readonly string[]) => Promise<{ id:string }>;
  onStarted?:(run:{ id:string },ids:readonly string[]) => void;
};
type Phase = 'idle'|'disconnecting'|'waiting'|'connecting';
type Proof = { targetId:string;id:string;revision:number;mayBeIntent:boolean };
type Batch = {
  scopeKey:string;
  phase:Phase;
  proofs:Map<string,Proof>;
  releases:Map<string,() => void>;
  selected:readonly string[];
  start:Options['start'];
  onStarted:Options['onStarted'];
};
const proofKey = (targetId:string,id:string) => JSON.stringify([targetId,id]);
const STOP_ERROR = 'Selected robots could not all be disconnected. Reconnect was not started.';
const CLEANUP_ERROR = 'A selected robot workflow did not finish cleanup. Reconnect was not started.';
const OBSERVATION_ERROR = 'Disconnect completion could not be verified. Reconnect was not started.';

/** A gesture owns its frozen selection until every exact Stop-set has cleaned up. */
export function useRobotInstrumentReconnect(options:Options) {
  const latest=useRef(options);
  latest.current=options;
  const active=useRef<Batch|undefined>(undefined);
  // A failed cleanup must not disappear merely because its Run left the
  // active list. A later explicit retry still has to prove that exact closure.
  const unresolved=useRef<{ scopeKey:string;proofs:Map<string,Proof> }|undefined>(undefined);
  const [phase,setPhase]=useState<Phase>('idle');
  // Observation changes during the cleanup wait re-render the owner, so the
  // completion check below runs after a render with that snapshot's options.
  const [observed,setObserved]=useState(0);
  const [failure,setFailure]=useState({ scopeKey:options.scopeKey,message:'' });
  const error=failure.scopeKey===options.scopeKey ? failure.message : '';
  useGroundStationErrorNotification(options.targetId,error,{
    title:'Robot instruments',source:options.scopeKey,dedupeKey:'robot-instruments:reconnect',
  });
  const dispose=useCallback((batch:Batch) => {
    batch.releases.forEach((release) => release());
    batch.releases.clear();
    if (active.current===batch) active.current=undefined;
  },[]);
  const current=useCallback((batch:Batch) => active.current===batch
    && latest.current.scopeKey===batch.scopeKey && !latest.current.canceled,[]);
  const fail=useCallback((batch:Batch,message:string) => {
    if (!current(batch)) return;
    unresolved.current={ scopeKey:batch.scopeKey,proofs:new Map([...batch.proofs].map(([key,proof]) => [key,{ ...proof }])) };
    dispose(batch);
    setFailure({ scopeKey:batch.scopeKey,message });
    setPhase('idle');
  },[current,dispose]);
  const retain=useCallback((observations:Observations,batch:Batch,proof:Proof) => {
    const key=proofKey(proof.targetId,proof.id);
    if (batch.releases.has(key)) return;
    const owner=observations.get(proof.targetId);
    if (!owner) throw new Error(OBSERVATION_ERROR);
    batch.releases.set(key,owner.retainRunObservation(proof.id));
  },[]);
  useEffect(() => () => {
    const batch=active.current;
    if (batch) dispose(batch);
  },[dispose]);

  const subscribe=options.subscribe;
  useEffect(() => {
    if (phase!=='waiting') return undefined;
    return subscribe(() => setObserved((value) => value+1));
  },[phase,subscribe]);

  // Observe the existing shared snapshot/SSE owner after every owner render
  // (options) and every observation change. No timer, polling or
  // disappearance-from-active-list shortcut is a disconnect completion fence.
  useEffect(() => {
    const batch=active.current;
    if (!batch) return;
    if (!current(batch)) { dispose(batch);setPhase('idle');return; }
    if (batch.phase!=='waiting') return;
    const observations=latest.current.observations();
    try {
      if (!disconnectComplete(batch,observations,(proof) => retain(observations,batch,proof))) return;
    } catch (cause) {
      fail(batch,cause instanceof Error && cause.message===CLEANUP_ERROR ? CLEANUP_ERROR : OBSERVATION_ERROR);
      return;
    }
    batch.phase='connecting'; // synchronous fence against repeated effects
    setPhase('connecting');
    void batch.start(batch.selected).then((started) => {
      if (!current(batch)) return;
      batch.onStarted?.(started,batch.selected);
      unresolved.current=undefined;
      dispose(batch);
      setPhase('idle');
    }).catch(() => fail(batch,'Selected robots could not be reconnected. Check the Experiment status and try again.'));
  },[current,dispose,fail,retain,observed,options,phase]);

  const reconnect=(ids:readonly string[],stops:readonly InstrumentReconnectStop[]) => {
    if (active.current || latest.current.canceled) return;
    const selected=canonicalRobotSelectionParameters(ids).robotIds;
    if (!selected.length) return;
    const frozenStops=stops.map((stop) => ({ ...stop,run:{ ...stop.run } }));
    const batch:Batch={
      scopeKey:latest.current.scopeKey,phase:'disconnecting',
      proofs:new Map(unresolved.current?.scopeKey===latest.current.scopeKey ? unresolved.current.proofs : []),releases:new Map(),
      selected:[...selected],start:latest.current.start,onStarted:latest.current.onStarted,
    };
    active.current=batch;
    setFailure({ scopeKey:batch.scopeKey,message:'' });
    setPhase('disconnecting');
    try {
      // Retain before issuing Stop, including roots that disappear from the
      // active projection while their descendants are still cleaning up.
      frozenStops.forEach(({ targetId,run }) => {
        const proof={ targetId,id:run.id,revision:run.revision,mayBeIntent:false };
        const key=proofKey(targetId,run.id);
        proof.revision=Math.max(proof.revision,batch.proofs.get(key)?.revision ?? 0);
        batch.proofs.set(key,proof);
      });
      const observations=latest.current.observations();
      batch.proofs.forEach((proof) => { if (!proof.mayBeIntent) retain(observations,batch,proof); });
    } catch { fail(batch,OBSERVATION_ERROR);return; }
    void Promise.allSettled(frozenStops.map(async (stop) => {
      const response=await stop.stop();
      if (!response || response.anchorRunId!==stop.run.id || !response.outcomes.length
        || !response.outcomes.some((outcome) => outcome.runId===stop.run.id)
        || new Set(response.outcomes.map((outcome) => outcome.runId)).size!==response.outcomes.length
        || response.outcomes.some((outcome) => !outcome.runId || outcome.error
          || outcome.accepted===outcome.alreadyTerminal)) throw new Error(STOP_ERROR);
      return { stop,response };
    })).then((results) => {
      if (!current(batch)) return;
      if (results.some((result) => result.status==='rejected')) { fail(batch,STOP_ERROR);return; }
      const observations=latest.current.observations();
      for (const result of results) {
        if (result.status!=='fulfilled') continue;
        const { stop,response }=result.value;
        for (const outcome of response.outcomes) {
          const key=proofKey(stop.targetId,outcome.runId);
          const previous=batch.proofs.get(key);
          const known=observations.get(stop.targetId)?.runDetailsById[outcome.runId]?.run;
          const minRevision=outcome.runId===stop.run.id
            ? stop.run.revision+(outcome.accepted && outcome.priorStatus!=='stopping' ? 1 : 0)
            : known?.revision ?? 0;
          const proof:Proof={
            targetId:stop.targetId,id:outcome.runId,revision:Math.max(previous?.revision ?? 0,minRevision),
            // `queued` also represents a prepared child with no Run. Its
            // parent's launchAbandonedAt is the completion authority.
            mayBeIntent:!previous && (!isRunStatus(outcome.priorStatus) || outcome.priorStatus==='queued'),
          };
          batch.proofs.set(key,proof);
          if (!proof.mayBeIntent || known) {
            try { retain(observations,batch,proof); } catch { fail(batch,OBSERVATION_ERROR);return; }
          }
        }
      }
      batch.phase='waiting';
      setPhase('waiting');
    });
  };
  return { reconnect,busy:phase!=='idle',phase,error };
}

function disconnectComplete(batch:Batch,observations:Observations,retain:(proof:Proof) => void) {
  const abandoned=new Set<string>();
  // Expand only this frozen Stop closure, never unrelated Session siblings.
  // Map iteration also visits descendants added during the traversal.
  for (const proof of batch.proofs.values()) {
    const owner=observations.get(proof.targetId);
    if (!owner) throw new Error(OBSERVATION_ERROR);
    const detail=owner.runDetailsById[proof.id];
    const run=detail?.run;
    if (detail?.error) throw new Error(OBSERVATION_ERROR);
    if (!run) { continue; }
    retain(proof);
    if (run.id!==proof.id || run.targetId!==executionTargetResourceId(proof.targetId)) throw new Error(OBSERVATION_ERROR);
    if (run.revision<proof.revision) continue;
    proof.revision=run.revision;
    if (run.cleanupErrors?.length) throw new Error(CLEANUP_ERROR);
    if (detail.loading || !detail.relations) continue;
    for (const child of detail.relations.childRuns) {
      const key=proofKey(proof.targetId,child.childRunId);
      if (child.launchAbandonedAt && !child.boundAt) { abandoned.add(key);continue; }
      // Cross-target last-known status has no cleanupErrors proof. Never
      // read its ID against the local runtime or assume disconnect completed.
      if (child.targetRoot || child.targetId!==run.targetId) throw new Error(OBSERVATION_ERROR);
      const prior=batch.proofs.get(key);
      const next:Proof={
        targetId:proof.targetId,id:child.childRunId,
        revision:Math.max(prior?.revision ?? 0,child.runRevision ?? 0),mayBeIntent:!child.boundAt,
      };
      batch.proofs.set(key,next);
      if (child.boundAt) retain(next);
    }
  }
  // A receipt may include an atomically abandoned prepared call rather than
  // a Run; absence alone cannot prove this, and it must not start a GET loop.
  return [...batch.proofs.entries()].every(([key,proof]) => {
    const detail=observations.get(proof.targetId)?.runDetailsById[proof.id];
    const run=detail?.run;
    if (!run && proof.mayBeIntent && abandoned.has(key)) return true;
    return Boolean(run && !detail.error && !detail.loading && detail.relations
      && run.revision>=proof.revision && isRunStatusTerminal(run.status) && !run.cleanupErrors?.length);
  });
}
