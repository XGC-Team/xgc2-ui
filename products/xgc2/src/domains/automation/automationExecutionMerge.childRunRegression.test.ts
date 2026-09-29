import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { AutomationChildRunRelation, AutomationExecutionRelations } from './automationExecutionContracts';
import { mergeExecutionRelations } from './automationExecutionMerge';

function link(overrides: Partial<AutomationChildRunRelation> = {}): AutomationChildRunRelation {
  return { id: 'link-1', targetId: 'local', rootRunId: 'total', parentRunId: 'total',
    parentInvocationId: 'invoke-panel', childRunId: 'panel-1', revision: 2,
    callNodeId: 'call-panel', ordinal: 0, ownerRunId: 'total', childDefinitionId: 'worker',
    childDefinitionVersion: 1, childConfigDigest: 'a'.repeat(64), childExecutionPlanDigest: 'b'.repeat(64),
    childRegistryDigest: 'c'.repeat(64), childDefinitionDigest: 'd'.repeat(64), triggerNodeId: 'trigger',
    relation: 'supervised', waitPolicy: 'wait', cancelPolicy: 'cascade', resultPolicy: 'reference',
    createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z',
    boundAt: '2026-09-18T00:00:00Z', runStatus: 'waiting', runRevision: 5, ...overrides };
}
function relations(childRuns: AutomationChildRunRelation[]): AutomationExecutionRelations {
  return { runId: 'total', childRuns, childRunGroups: [], childRunGroupMembers: [],
    waits: [], effects: [], runtimeGroups: [], runtimes: [], resources: [] };
}
function merge(incoming: AutomationChildRunRelation, retained: AutomationChildRunRelation) {
  return mergeExecutionRelations(relations([incoming]), relations([retained])).childRuns[0]!;
}
test('late same-link-revision snapshot cannot resurrect a stopped child', () => {
  assert.equal(merge(link(), link({ runStatus: 'stopped', runRevision: 8 })).runStatus, 'stopped');
});
test('newer relation metadata cannot replace newer child Run facts', () => {
  const actual = merge(link({ revision: 3, updatedAt: 'new-link' }), link({ runStatus: 'stopped', runRevision: 8 }));
  assert.equal(actual.revision, 3);
  assert.equal(actual.updatedAt, 'new-link');
  assert.equal(actual.runRevision, 8);
  assert.equal(actual.runStatus, 'stopped');
});
test('older relation metadata can carry newer independently revisioned child facts', () => {
  const actual = merge(link({ runStatus: 'stopped', runRevision: 8 }), link({ revision: 3, updatedAt: 'new-link' }));
  assert.equal(actual.revision, 3);
  assert.equal(actual.updatedAt, 'new-link');
  assert.equal(actual.runRevision, 8);
  assert.equal(actual.runStatus, 'stopped');
});
test('missing optional joined Run data is not a deletion of known Run truth', () => {
  const incoming = link({ revision: 3 });
  delete incoming.runStatus; delete incoming.runRevision;
  assert.equal(merge(incoming, link({ runStatus: 'stopped', runRevision: 8 })).runStatus, 'stopped');
});
test('same Run revision cannot authorize two contradictory statuses', () => {
  assert.throws(() => merge(link({ runStatus: 'running' }), link()), /revision.*status|status.*revision/i);
});
test('a relation identity cannot be reused for another child', () => {
  assert.throws(() => merge(link({ childRunId: 'sibling', revision: 3 }), link()), /identity/i);
});
test('a relation identity cannot be reused across targets', () => {
  assert.throws(() => merge(link({ targetId: 'other', revision: 3 }), link()), /identity/i);
});
test('replays of lower relation and Run revisions reuse retained references', () => {
  const previous = relations([link({ revision: 3, runStatus: 'stopped', runRevision: 8 })]);
  assert.equal(mergeExecutionRelations(relations([link()]), previous), previous);
});
test('independent child generations never transfer status to siblings or successors', () => {
  const old = link({ runStatus: 'stopped', runRevision: 80 });
  const next = link({ id: 'link-2', childRunId: 'panel-2', runRevision: 1, runStatus: 'running' });
  const actual = mergeExecutionRelations(relations([next]), relations([old])).childRuns;
  assert.equal(actual.length, 2);
  assert.equal(actual.find(row => row.id === 'link-2')!.runStatus, 'running');
});
test('every arrival order converges independently on link revision and child Run revision', () => {
  const snapshots = [link(), link({ revision: 3, updatedAt: 'new-link' }), link({ runStatus: 'stopped', runRevision: 8 })];
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    let current = relations([]);
    for (const index of [...order, ...order]) current = mergeExecutionRelations(relations([snapshots[index]!]), current);
    assert.equal(current.childRuns[0]!.revision, 3, String(order));
    assert.equal(current.childRuns[0]!.runRevision, 8, String(order));
    assert.equal(current.childRuns[0]!.runStatus, 'stopped', String(order));
  }
});
test('retained snapshots are never mutated', () => {
  const retained = Object.freeze(link({ revision: 3 }));
  const incoming = Object.freeze(link({ runStatus: 'stopped', runRevision: 8 }));
  const actual = merge(incoming, retained);
  assert.equal(actual.runStatus, 'stopped');
  assert.equal(retained.runStatus, 'waiting');
  assert.equal(incoming.revision, 2);
});

test('target-root observations remain governed by the durable link revision', () => {
  const actual = merge(
    link({ revision: 4, observedStatus: 'stopped', observedRevision: 20, runRevision: 4 }),
    link({ revision: 3, observedStatus: 'waiting', observedRevision: 19, runRevision: 8, runStatus: 'stopped' }),
  );
  assert.equal(actual.observedStatus, 'stopped');
  assert.equal(actual.observedRevision, 20);
  assert.equal(actual.runRevision, 8);
});

test('one hundred child generations retain independent terminal facts under replay', () => {
  let retained = relations([]);
  for (let cycle = 1; cycle <= 100; cycle += 1) {
    const running = link({ id: `link-${cycle}`, childRunId: `panel-${cycle}`, runRevision: 1 });
    const stopped = { ...running, runStatus: 'stopped' as const, runRevision: 3 };
    for (const snapshot of [running, stopped, running, stopped, running]) {
      retained = mergeExecutionRelations(relations([snapshot]), retained);
    }
    assert.equal(retained.childRuns.length, cycle);
    assert.ok(retained.childRuns.every(child => child.runStatus === 'stopped' && child.runRevision === 3));
  }
});
