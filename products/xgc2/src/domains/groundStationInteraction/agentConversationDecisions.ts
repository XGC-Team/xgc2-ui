import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

const key = (experimentId:string) => `xgc.experiment.${experimentId}.decision-conversations.v1`;

function read(experimentId:string): Record<string,string> {
  if (!experimentId) return {};
  try {
    const value:unknown = JSON.parse(localStorage.getItem(key(experimentId)) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const next: Record<string,string> = {};
    for (const [id,scope] of Object.entries(value)) {
      if (typeof id === 'string' && typeof scope === 'string' && scope) next[id] = scope;
    }
    return next;
  } catch { return {}; }
}

function write(experimentId:string,stamps:Record<string,string>) {
  try { localStorage.setItem(key(experimentId),JSON.stringify(stamps)); } catch { /* Keep this browser's mapping. */ }
}

/** First prompt creates a CLI session; keep draft-stamped operator receipts on that session. */
export function bindAgentConversationDecisions(experimentId:string,draft:string | undefined,sessionId:string) {
  if (!draft?.startsWith('draft:') || !sessionId) return;
  const stamps = read(experimentId);
  let wrote = false;
  const next: Record<string,string> = {};
  for (const [id,scope] of Object.entries(stamps)) {
    if (scope === draft) { next[id] = sessionId; wrote = true; }
    else next[id] = scope;
  }
  if (wrote) write(experimentId,next);
}

/**
 * Native chat additionalItems for experiment decisions.
 * Agent actions stay on agentAction.conversationId.
 * Operator confirms (Set mode / Arm) pin to the visible conversation when first seen,
 * except resolved receipts are never claimed onto a blank draft.
 */
export function agentConversationDecisions(
  experimentId:string,
  decisions:readonly GroundStationDecisionInteraction[],
  conversationId?:string,
): GroundStationDecisionInteraction[] {
  if (!experimentId || !conversationId) return [];
  const stamps = read(experimentId);
  let wrote = false;
  const next = {...stamps};
  const visible: GroundStationDecisionInteraction[] = [];
  for (const item of decisions) {
    const pinned = item.payload.decision.agentAction?.conversationId ?? next[item.id];
    if (pinned) {
      if (pinned === conversationId) visible.push(item);
      continue;
    }
    if (item.status === 'open' || !conversationId.startsWith('draft:')) {
      next[item.id] = conversationId;
      wrote = true;
      visible.push(item);
    }
  }
  if (wrote) write(experimentId,next);
  return visible;
}
