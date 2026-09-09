import { isRunStatusTerminal } from '../../shared/executionStatusVocabulary';
import type { AutomationRunDetail } from './automationExecutionContracts';

/**
 * Browser audit window for completed Automation Run details. Active truth and
 * the most recently requested relation tree are retained separately and are
 * never subject to this limit.
 */
export const AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT = 64;

export function retainAutomationRunDetails(
  details: Record<string,AutomationRunDetail>,
  terminalLimit = AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT,
  pinnedRunIds:ReadonlySet<string> = new Set(),
) {
  if (!Number.isSafeInteger(terminalLimit) || terminalLimit < 0) {
    throw new Error('Automation terminal Run detail limit must be a non-negative integer.');
  }
  const entries = Object.entries(details);
  if (entries.length === 0) return details;

  const adjacency = runDetailAdjacency(details);
  const retained = new Set(entries.flatMap(([runId,detail]) => (
    retainsUnboundedTruth(detail) || pinnedRunIds.has(runId) ? [runId] : []
  )));
  const queue = [...retained];
  while (queue.length > 0) {
    const runId = queue.shift()!;
    adjacency.get(runId)?.forEach((relatedRunId) => {
      if (retained.has(relatedRunId)) return;
      retained.add(relatedRunId);
      queue.push(relatedRunId);
    });
  }

  entries
    .filter(([runId]) => !retained.has(runId))
    .sort(compareTerminalRunDetailRecency)
    .slice(0,terminalLimit)
    .forEach(([runId]) => retained.add(runId));

  if (retained.size === entries.length) return details;
  return Object.fromEntries(entries.filter(([runId]) => retained.has(runId)));
}

function retainsUnboundedTruth(detail: AutomationRunDetail) {
  return detail.loading || !detail.run || !isRunStatusTerminal(detail.run.status);
}

function runDetailAdjacency(details: Record<string,AutomationRunDetail>) {
  const adjacency = new Map<string,Set<string>>();
  const connect = (left: string,right: string) => {
    if (left === right) return;
    let leftEdges = adjacency.get(left);
    if (!leftEdges) {
      leftEdges = new Set();
      adjacency.set(left,leftEdges);
    }
    leftEdges.add(right);
    let rightEdges = adjacency.get(right);
    if (!rightEdges) {
      rightEdges = new Set();
      adjacency.set(right,rightEdges);
    }
    rightEdges.add(left);
  };
  Object.entries(details).forEach(([runId,detail]) => {
    const targetId = detail.run?.targetId;
    if (!targetId) return;
    detail.relations?.childRuns.forEach((child) => {
      if (child.targetId === targetId
        && child.boundAt
        && child.relation!=='detached'
        && !child.launchAbandonedAt
        && !child.targetRoot
        && details[child.childRunId]) {
        connect(runId,child.childRunId);
      }
    });
  });
  return adjacency;
}

function compareTerminalRunDetailRecency(
  [leftId,left]: [string,AutomationRunDetail],
  [rightId,right]: [string,AutomationRunDetail],
) {
  const leftTime = runDetailRecency(left);
  const rightTime = runDetailRecency(right);
  if (leftTime !== rightTime) return rightTime - leftTime;
  const leftRevision = left.run?.revision ?? 0;
  const rightRevision = right.run?.revision ?? 0;
  if (leftRevision !== rightRevision) return rightRevision - leftRevision;
  return leftId.localeCompare(rightId);
}

function runDetailRecency(detail: AutomationRunDetail) {
  for (const value of [detail.run?.finishedAt,detail.run?.updatedAt,detail.run?.createdAt]) {
    const timestamp = Date.parse(value ?? '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Number.NEGATIVE_INFINITY;
}
