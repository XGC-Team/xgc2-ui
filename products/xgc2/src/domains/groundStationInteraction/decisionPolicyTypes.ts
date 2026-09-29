import type { DecisionFacts } from '@xgc2/agent-runtime/client';

export type DecisionRule = {id:string; mode:'manual'|'auto'|'deny'; scope:DecisionFacts; issuedAt:string; expiresAt:string; remainingUses:number};
export type DecisionPolicy = {id:string; revision:string; actor:{id:string; label?:string}; rules:DecisionRule[]};
export type DecisionSource = {kind:'native'; sessionId:string; requestId:string} | {kind:'gcs'; interactionId:string};
