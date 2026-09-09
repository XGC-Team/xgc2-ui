import type { RobotOperation } from './robotRuntimeModel';
import {
  getRunRuntimeState,
  updateRunRuntimeState,
} from './robotRuntimeState';

const maxRetainedOperations = 200;

export function mergeRobotOperations(
  targetId: string,
  runId: string,
  incoming: RobotOperation[],
) {
  if (incoming.length === 0) return;
  const current = getRunRuntimeState(targetId, runId);
  const byID = new Map(current.operations.map((operation) => [operation.id,operation]));
  let changed = false;
  incoming.forEach((operation) => {
    const existing = byID.get(operation.id);
    if (existing && existing.revision >= operation.revision) return;
    byID.set(operation.id, operation);
    changed = true;
  });
  if (!changed) return;
  const sorted = [...byID.values()]
    .sort((left,right) => (
      right.updatedAt.localeCompare(left.updatedAt) || right.revision - left.revision
    ));
  const operations = sorted.length <= maxRetainedOperations
    ? sorted
    : sorted.filter((operation,index) => (
      index < maxRetainedOperations || !terminalRobotOperationPhase(operation.phase)
    ));
  updateRunRuntimeState(targetId, runId, {
    operations,
    ...(current.projection ? { projection: { ...current.projection,operations } } : {}),
  });
}

function terminalRobotOperationPhase(phase: RobotOperation['phase']) {
  return phase === 'succeeded'
    || phase === 'rejected'
    || phase === 'failed'
    || phase === 'expired'
    || phase === 'uncertain';
}
