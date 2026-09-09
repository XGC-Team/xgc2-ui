import type { AutomationExecutionRelations } from './automationExecutionContracts';

export function mergeRevisioned<T extends { revision: number }>(
  incoming: T[],
  retained: T[],
  keyOf: (item: T) => string,
) {
  const byID = new Map(retained.map((item) => [keyOf(item),item]));
  for (const item of incoming) {
    const previous = byID.get(keyOf(item));
    if (!previous || previous.revision <= item.revision) byID.set(keyOf(item), item);
  }
  return [...byID.values()];
}

export function mergeExecutionRelations(
  incoming: AutomationExecutionRelations,
  retained?: AutomationExecutionRelations,
): AutomationExecutionRelations {
  if (!retained || retained.runId !== incoming.runId) return incoming;
  return {
    runId: incoming.runId,
    childRuns: mergeRevisioned(incoming.childRuns, retained.childRuns, (item) => item.id),
    childRunGroups: mergeRevisioned(incoming.childRunGroups, retained.childRunGroups, (item) => item.id),
    childRunGroupMembers: mergeRevisioned(incoming.childRunGroupMembers, retained.childRunGroupMembers, (item) => item.id),
    waits: mergeRevisioned(incoming.waits, retained.waits, (item) => item.id),
    effects: mergeRevisioned(incoming.effects, retained.effects, (item) => item.id),
    runtimeGroups: mergeRevisioned(incoming.runtimeGroups, retained.runtimeGroups, (item) => item.id),
    runtimes: mergeRevisioned(incoming.runtimes, retained.runtimes, (item) => item.id),
    resources: mergeRevisioned(incoming.resources, retained.resources, (item) => item.id),
  };
}
