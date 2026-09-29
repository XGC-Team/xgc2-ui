import type {
  AutomationChildRunRelation,
  AutomationExecutionRelations,
} from '../automation/automationPublic';

type AutomationChildRunGroupRelation = AutomationExecutionRelations['childRunGroups'][number];
type AutomationChildRunGroupMemberRelation = AutomationExecutionRelations['childRunGroupMembers'][number];

// Relation ledgers are immutable snapshots that every Panel header and
// run-detail demand re-reads on each Run event. A fleet Panel run has one slot
// and one observer child per robot, so per-child scans made each read
// O(children x members); the ledgers are indexed once per snapshot instead.
const childRunIndexes = new WeakMap<readonly AutomationChildRunRelation[],ReadonlyMap<string,readonly AutomationChildRunRelation[]>>();
const memberIndexes = new WeakMap<readonly AutomationChildRunGroupMemberRelation[],ReadonlyMap<string,readonly AutomationChildRunGroupMemberRelation[]>>();
const groupIndexes = new WeakMap<readonly AutomationChildRunGroupRelation[],ReadonlyMap<string,AutomationChildRunGroupRelation>>();

function groupedBy<T>(
  cache: WeakMap<readonly T[],ReadonlyMap<string,readonly T[]>>,
  rows: readonly T[],
  key: (row: T) => string,
) {
  let index = cache.get(rows);
  if (!index) {
    const grouped = new Map<string,T[]>();
    rows.forEach((row) => {
      const rowKey = key(row);
      const bucket = grouped.get(rowKey);
      if (bucket) bucket.push(row);
      else grouped.set(rowKey, [row]);
    });
    index = grouped;
    cache.set(rows, index);
  }
  return index;
}

function groupById(groups: readonly AutomationChildRunGroupRelation[]) {
  let index = groupIndexes.get(groups);
  if (!index) {
    const byId = new Map<string,AutomationChildRunGroupRelation>();
    // Keep the first group per id, as a find() over the ledger would.
    groups.forEach((group) => { if (!byId.has(group.id)) byId.set(group.id, group); });
    index = byId;
    groupIndexes.set(groups, index);
  }
  return index;
}

/** Every relation row for one child Run, in ledger order. */
export function experimentChildRunRelations(
  relations: Pick<AutomationExecutionRelations,'childRuns'>,
  childRunId: string,
): readonly AutomationChildRunRelation[] {
  return groupedBy(childRunIndexes, relations.childRuns, (child) => child.childRunId).get(childRunId) ?? [];
}

/** Resolve the binding identity for one child using the persisted relation ledger. */
export function experimentChildRunBindingId(
  relations:AutomationExecutionRelations|undefined,
  childRunId:string,
):string|undefined {
  if (!relations || !childRunId.trim()) return undefined;
  const bindingIds=new Set<string>();
  const children=experimentChildRunRelations(relations,childRunId);
  const members=groupedBy(memberIndexes,relations.childRunGroupMembers,(member) => member.childRunId).get(childRunId) ?? [];
  const groups=groupById(relations.childRunGroups);
  for (const child of children) {
    const remoteBinding=child.targetRoot && child.targetRootBindingId?.trim();
    if (remoteBinding) bindingIds.add(remoteBinding);
    for (const member of members) {
      if (!member.itemKey.trim()) continue;
      const group=groups.get(member.groupId);
      if (group && group.producerInvocationId===child.parentInvocationId) {
        bindingIds.add(member.itemKey);
      }
    }
  }
  return bindingIds.size===1 ? [...bindingIds][0] : undefined;
}
