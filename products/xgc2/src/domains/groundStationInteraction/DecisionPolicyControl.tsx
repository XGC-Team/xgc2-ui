import { useCallback,useRef,useState } from 'react';
import type { DecisionFacts } from '@xgc2/native-agent/client';
import { SelectControl } from '../../components/controls/SelectControl';
import { Notice } from '@xgc2/ui-react';
import { decisionModeForScope,readDecisionPolicy,readDecisionScope,replaceDecisionPolicy,sameDecisionScope,type DecisionPolicy,type DecisionSource,type DecisionRule } from './decisionPolicyService';
import { createGroundStationNativeClient } from './groundStationNativeAgentService';
import { useGroundStationNativeText } from './groundStationNativeMessages';

/** The same policy choice is used by native permissions and GCS decisions.
 * Scope comes from the pending request's backend, not the visible message. */
export function DecisionPolicyControl({experimentId,source,disabled=false}:{experimentId:string;source:DecisionSource;disabled?:boolean}) {
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
  return <div data-xgc-role="decision-policy-control" data-xgc-id={identity}>
    <SelectControl size="compact" ariaLabel={t('Approval policy')} dataXgcRole="decision-policy-mode" dataXgcId={identity}
      value={mode} disabled={disabled} busy={busy} onOpen={() => void load()} onChange={mode => void change(mode)}
      options={[{value:'manual',label:t('Ask each time'),disabled:busy || !review?.facts},
        {value:'auto',label:t('Allow this action · 5 min / 10 uses'),disabled:busy || !review?.facts},
        {value:'deny',label:t('Deny this action · 5 min / 10 uses'),disabled:busy || !review?.facts}]} />
    {error ? <Notice tone="warning" density="compact">{error}</Notice> : null}
  </div>;
}
