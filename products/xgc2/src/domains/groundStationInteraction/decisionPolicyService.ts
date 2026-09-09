import { decodeDecisionFacts,type DecisionFacts } from '@xgc2/native-agent/client';
import { request } from '../../api/http';
import { createGroundStationNativeClient,nativeExperimentPath } from './groundStationNativeAgentService';

export type DecisionRule = {id:string; mode:'manual'|'auto'|'deny'; scope:DecisionFacts; issuedAt:string; expiresAt:string; remainingUses:number};
export type DecisionPolicy = {id:string; revision:string; actor:{id:string; label?:string}; rules:DecisionRule[]};
export type DecisionSource = {kind:'native'; sessionId:string; requestId:string} | {kind:'gcs'; interactionId:string};
const MAX_GCS_RULE_MS=300_000;
const MAX_NATIVE_RULE_MS=3_600_000;
function policyPath(experimentId:string) {
  nativeExperimentPath(experimentId);
  return `/experiments/${experimentId}/decision-policy`;
}
export async function readDecisionPolicy(experimentId:string) {
  return decodePolicy(await request<unknown>(policyPath(experimentId)));
}
export async function readDecisionScope(experimentId:string,source:DecisionSource):Promise<DecisionFacts | null> {
  let facts:DecisionFacts | null;
  if (source.kind === 'native') {
    const inputs=await createGroundStationNativeClient(experimentId).getNativeInputs(source.sessionId);
    const pending=inputs.find(input => input.request.id === source.requestId && !input.submitted);
    facts=pending?.facts ?? null;
    if (facts && facts.conversationId !== source.sessionId) throw new Error('Decision conversation changed.');
  } else {
    const value=record(await request<unknown>(`${policyPath(experimentId)}/requests/${encodeURIComponent(source.interactionId)}`));
    facts=value.facts === null ? null : decodeDecisionFacts(value.facts);
  }
  if (facts && facts.experimentId !== experimentId) throw new Error('Decision experiment changed.');
  return facts;
}
export async function replaceDecisionPolicy(experimentId:string,policy:DecisionPolicy,rules:DecisionRule[]) {
  return decodePolicy(await request<unknown>(policyPath(experimentId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:policy.revision,rules})}));
}
export function sameDecisionScope(a:DecisionFacts,b:DecisionFacts) {
  return a.operation===b.operation && a.experimentId===b.experimentId && a.conversationId===b.conversationId
    && a.workspace.id===b.workspace.id && a.workspace.revision===b.workspace.revision
    && a.experimentSessionId===b.experimentSessionId && a.targetId===b.targetId && a.parametersDigest===b.parametersDigest;
}
/** Mirror the backend evaluator for display only. The backend remains the authority
 * that validates and atomically consumes a matching rule. */
export function decisionModeForScope(policy:DecisionPolicy,facts:DecisionFacts | null,now=Date.now()):DecisionRule['mode'] {
  if (!facts) return 'manual';
  const maxLifetime=facts.operation.startsWith('gcs.') ? MAX_GCS_RULE_MS : MAX_NATIVE_RULE_MS;
  let mode:DecisionRule['mode']='manual';
  let priority=0;
  for (const rule of policy.rules) {
    const issuedAt=Date.parse(rule.issuedAt),expiresAt=Date.parse(rule.expiresAt);
    if (!sameDecisionScope(rule.scope,facts) || rule.remainingUses<=0 || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || issuedAt>now || expiresAt<=now || expiresAt-issuedAt>maxLifetime) continue;
    const rank=rule.mode==='deny' ? 3 : rule.mode==='manual' ? 2 : 1;
    if (rank>priority) {priority=rank; mode=rule.mode;}
  }
  return mode;
}
function record(value:unknown):Record<string,unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid decision policy response.');
  return value as Record<string,unknown>;
}
function text(value:unknown):string {
  if (typeof value!=='string' || value.length>256) throw new Error('Invalid decision policy identity.');
  return value;
}
function decodePolicy(value:unknown):DecisionPolicy {
  const source=record(value),actor=record(source.actor);
  if (!Array.isArray(source.rules) || source.rules.length>256) throw new Error('Invalid decision rules.');
  return {id:text(source.id),revision:text(source.revision),actor:{id:text(actor.id),...(actor.label===undefined ? {} : {label:text(actor.label)})},
    rules:source.rules.map(value => {
      const rule=record(value);
      if (!['manual','auto','deny'].includes(rule.mode as string) || !Number.isSafeInteger(rule.remainingUses) || (rule.remainingUses as number)<0
        || !Number.isFinite(Date.parse(text(rule.issuedAt))) || !Number.isFinite(Date.parse(text(rule.expiresAt)))) throw new Error('Invalid decision rule.');
      return {id:text(rule.id),mode:rule.mode as DecisionRule['mode'],scope:decodeDecisionFacts(rule.scope),issuedAt:rule.issuedAt as string,expiresAt:rule.expiresAt as string,remainingUses:rule.remainingUses as number};
    })};
}
