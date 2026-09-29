import { useCallback,useRef,useState } from 'react';
import type { DecisionFacts } from '@xgc2/agent-runtime/client';
import { decisionModeForScope,readDecisionPolicy,readDecisionScope,replaceDecisionPolicy,sameDecisionScope } from './decisionPolicyService';
import type { DecisionPolicy,DecisionSource,DecisionRule } from './decisionPolicyTypes';
import { createGroundStationNativeClient } from './groundStationAgentService';
import { useGroundStationNativeText } from './groundStationAgentMessages';

export function useDecisionPolicy(experimentId:string,source:DecisionSource,disabled:boolean) {
  const t=useGroundStationNativeText();
  const [review,setReview]=useState<{policy:DecisionPolicy;facts:DecisionFacts | null}>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState<DecisionRule['mode']>('manual');
  const pending=useRef(false);
  const sourceKind=source.kind;
  const sessionId=source.kind==='native' ? source.sessionId : '';
  const requestId=source.kind==='native' ? source.requestId : '';
  const interactionId=source.kind==='gcs' ? source.interactionId : '';
  const identity=sourceKind==='native' ? `${sessionId}:${requestId}` : interactionId;
  const load=useCallback(async () => {
    if (pending.current || disabled) return;
    pending.current=true; setBusy(true); setError(''); setReview(undefined);
    try {
      const scopedSource:DecisionSource=sourceKind==='native'
        ? {kind:'native',sessionId,requestId}
        : {kind:'gcs',interactionId};
      const [policy,facts]=await Promise.all([readDecisionPolicy(experimentId),readDecisionScope(experimentId,scopedSource)]);
      setReview({policy,facts});
      setMode(decisionModeForScope(policy,facts));
      if (!facts) setError(t('This request needs an individual decision.'));
    } catch (cause) {setError(cause instanceof Error ? cause.message : String(cause));}
    finally {pending.current=false; setBusy(false);}
  },[disabled,experimentId,interactionId,requestId,sessionId,sourceKind,t]);
  const change=async (mode:string) => {
    if (disabled || pending.current || !review?.facts || !['manual','auto','deny'].includes(mode)) return;
    pending.current=true; setBusy(true); setError('');
    try {
      const now=Date.now();
      const rules=review.policy.rules.filter(rule => Date.parse(rule.expiresAt)>now && rule.remainingUses>0 && !sameDecisionScope(rule.scope,review.facts!));
      if (mode!=='manual') rules.push({id:`rule_${crypto.randomUUID()}`,mode:mode as DecisionRule['mode'],scope:review.facts,
        issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),remainingUses:10});
      const policy=await replaceDecisionPolicy(experimentId,review.policy,rules);
      setReview({...review,policy}); setMode(decisionModeForScope(policy,review.facts,now));
      if (sourceKind==='native') await createGroundStationNativeClient(experimentId).evaluateNativeInputs(sessionId);
    } catch (cause) {setError(cause instanceof Error ? cause.message : String(cause));}
    finally {pending.current=false;setBusy(false);}
  };
  return {identity,error,busy,mode,canChange:Boolean(review?.facts),load,change};
}
