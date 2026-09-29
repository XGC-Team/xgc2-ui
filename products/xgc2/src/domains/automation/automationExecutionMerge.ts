import type { AutomationChildRunRelation,AutomationExecutionRelations } from './automationExecutionContracts';

/**
 * Revision wins: a higher incoming revision always replaces the retained item.
 * When the merge changes nothing, return the retained array so memoized
 * consumers are not re-rendered by a no-op sync.
 */
export function mergeRevisioned<T extends { revision: number }>(
  incoming: T[],
  retained: T[],
  keyOf: (item: T) => string,
): T[] {
  const byID = new Map(retained.map((item) => [keyOf(item),item]));
  let changed = false;
  for (const item of incoming) {
    const key = keyOf(item);
    const previous = byID.get(key);
    if (!previous || previous.revision <= item.revision) {
      if (previous !== item) changed = true;
      byID.set(key, item);
    }
  }
  const merged = [...byID.values()];
  if (!changed && merged.length === retained.length
    && merged.every((item,index) => item === retained[index])) return retained;
  return merged;
}

export function mergeExecutionRelations(
  incoming: AutomationExecutionRelations,
  retained?: AutomationExecutionRelations,
): AutomationExecutionRelations {
  if (!retained || retained.runId !== incoming.runId) return incoming;
  const merged: AutomationExecutionRelations = {
    runId: incoming.runId,
    childRuns: mergeChildRunRelations(incoming.childRuns, retained.childRuns),
    childRunGroups: mergeRevisioned(incoming.childRunGroups, retained.childRunGroups, (item) => item.id),
    childRunGroupMembers: mergeRevisioned(incoming.childRunGroupMembers, retained.childRunGroupMembers, (item) => item.id),
    waits: mergeRevisioned(incoming.waits, retained.waits, (item) => item.id),
    effects: mergeRevisioned(incoming.effects, retained.effects, (item) => item.id),
    runtimeGroups: mergeRevisioned(incoming.runtimeGroups, retained.runtimeGroups, (item) => item.id),
    runtimes: mergeRevisioned(incoming.runtimes, retained.runtimes, (item) => item.id),
    resources: mergeRevisioned(incoming.resources, retained.resources, (item) => item.id),
  };
  if (merged.childRuns === retained.childRuns
    && merged.childRunGroups === retained.childRunGroups
    && merged.childRunGroupMembers === retained.childRunGroupMembers
    && merged.waits === retained.waits
    && merged.effects === retained.effects
    && merged.runtimeGroups === retained.runtimeGroups
    && merged.runtimes === retained.runtimes
    && merged.resources === retained.resources) return retained;
  return merged;
}

/**
 * A child relation joins two independently versioned records. `revision`
 * belongs to the durable link; `runRevision` belongs to the optional child Run
 * snapshot. A child changing status does not update the link's revision.
 * Merge each record by its own revision, never by response arrival order.
 * Target-root `observed*` fields, unlike the joined `run*` fields, are persisted
 * with the link and therefore continue to follow the link revision.
 */
function mergeChildRunRelations(
  incoming: AutomationChildRunRelation[],
  retained: AutomationChildRunRelation[],
): AutomationChildRunRelation[] {
  const byID = new Map(retained.map((item) => [item.id,item]));
  const candidates = incoming.map((item) => {
    const previous = byID.get(item.id);
    if (!previous) return item;
    if (item.targetId !== previous.targetId || item.parentRunId !== previous.parentRunId
      || item.rootRunId !== previous.rootRunId || item.childRunId !== previous.childRunId) {
      throw new Error('Automation child relation changed its immutable Run identity.');
    }
    if (item.runRevision !== undefined && item.runRevision === previous.runRevision
      && item.runStatus !== previous.runStatus) {
      throw new Error('Automation child Run has conflicting statuses at the same revision.');
    }
    const relation = item.revision >= previous.revision ? item : previous;
    const run = (item.runRevision ?? 0) >= (previous.runRevision ?? 0) ? item : previous;
    if (run.runRevision === undefined || (
      relation.runRevision === run.runRevision && relation.runStatus === run.runStatus
    )) return relation;
    return { ...relation,runStatus:run.runStatus,runRevision:run.runRevision };
  });
  return mergeRevisioned(candidates, retained, (item) => item.id);
}
