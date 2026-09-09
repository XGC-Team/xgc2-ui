// @vitest-environment jsdom

import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ProcessInstance } from './executionModel';
import {
  boundExecutionProcessInstances,
  executionProcessCatalogSnapshot,
  executionSnapshot,
  EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT,
  mergeExecutionRevision,
  patchExecutionSnapshot,
  resetExecutionSnapshotsForTests,
  subscribeExecutionSnapshot,
} from './executionSnapshotStore';

describe('execution Process snapshot retention', () => {
  beforeEach(() => {
    resetExecutionSnapshotsForTests();
    sessionStorage.clear();
  });

  it('keeps every actionable fact and only the most recent fully stopped history', () => {
    const completed = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 12 },
      (_,index) => processInstance({
        id:`completed-${String(index).padStart(3,'0')}`,
        revision:index + 1,
        stoppedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
        updatedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
      }),
    );
    const retainedRegardlessOfLimit = [
      processInstance({ id:'running',desiredState:'running',observedState:'running',handle:null,stoppedAt:undefined }),
      processInstance({ id:'failed',observedState:'failed',stoppedAt:undefined }),
      processInstance({ id:'exited',observedState:'exited',stoppedAt:undefined }),
      processInstance({ id:'lost',observedState:'lost',stoppedAt:undefined }),
      processInstance({ id:'stopped-with-handle',handle:{ pid:42 } }),
      processInstance({ id:'never-started',stoppedAt:undefined }),
      processInstance({ id:'restart-pending',nextRestartAt:'2026-08-24T02:00:00Z' }),
    ];

    const bounded = boundExecutionProcessInstances([
      ...completed,
      ...retainedRegardlessOfLimit,
    ].reverse());

    expect(bounded).toHaveLength(EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + retainedRegardlessOfLimit.length);
    retainedRegardlessOfLimit.forEach((instance) => expect(bounded).toContain(instance));
    expect(bounded.some((instance) => instance.id === 'completed-000')).toBe(false);
    expect(bounded.some((instance) => instance.id === `completed-${String(completed.length - 1).padStart(3,'0')}`)).toBe(true);
    expect(bounded.map((instance) => instance.id)).toEqual(
      [...bounded].map((instance) => instance.id).sort((left,right) => left.localeCompare(right)),
    );
  });

  it('selects equal and malformed timestamps deterministically by revision then id', () => {
    const tied = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 2 },
      (_,index) => processInstance({
        id:`tie-${String(index).padStart(3,'0')}`,
        revision:7,
        updatedAt:'not-a-timestamp',
      }),
    );
    const higherRevision = processInstance({ id:'tie-last',revision:8,updatedAt:'also-invalid' });
    const first = boundExecutionProcessInstances([...tied,higherRevision].reverse());
    const second = boundExecutionProcessInstances([higherRevision,...tied]);

    expect(first.map((instance) => instance.id)).toEqual(second.map((instance) => instance.id));
    expect(first).toContain(higherRevision);
    expect(first.some((instance) => instance.id === 'tie-256')).toBe(false);
    expect(first.some((instance) => instance.id === 'tie-257')).toBe(false);
  });

  it('preserves structural sharing for canonical and stale revisions', () => {
    const canonical = [processInstance({ id:'a' }),processInstance({ id:'b' })];
    expect(boundExecutionProcessInstances(canonical)).toBe(canonical);
    expect(mergeExecutionRevision(canonical,{ ...canonical[0],revision:canonical[0].revision })).toBe(canonical);
    expect(mergeExecutionRevision(canonical,{ ...canonical[0],revision:canonical[0].revision - 1 })).toBe(canonical);

    const listener = vi.fn();
    const unsubscribe = subscribeExecutionSnapshot('local',listener);
    patchExecutionSnapshot('local',{ processInstances:canonical });
    expect(executionSnapshot('local').processInstances).toBe(canonical);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('keeps truncation truth sticky until an authoritative replacement resets it', () => {
    const history = Array.from(
      { length:EXECUTION_TERMINAL_PROCESS_INSTANCE_LIMIT + 1 },
      (_,index) => processInstance({
        id:`history-${String(index).padStart(3,'0')}`,
        stoppedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
        updatedAt:new Date(Date.UTC(2026,7,24,0,index)).toISOString(),
      }),
    );
    patchExecutionSnapshot('local',{
      processInstances:history,
      processInstancesTruncated:false,
    });

    expect(executionSnapshot('local').processInstancesTruncated).toBe(true);
    expect(executionProcessCatalogSnapshot('local').processInstancesTruncated).toBe(true);

    const running = processInstance({
      id:'running',desiredState:'running',observedState:'running',handle:{ pid:42 },stoppedAt:undefined,
    });
    patchExecutionSnapshot('local',{
      processInstances:[...executionSnapshot('local').processInstances,running],
    });
    expect(executionSnapshot('local').processInstancesTruncated).toBe(true);

    patchExecutionSnapshot('local',{
      processInstances:[running],
      processInstancesTruncated:false,
    });
    expect(executionSnapshot('local').processInstancesTruncated).toBe(false);
    expect(executionProcessCatalogSnapshot('local').processInstancesTruncated).toBe(false);
  });
});

function processInstance(overrides: Partial<ProcessInstance> = {}): ProcessInstance {
  return {
    id:'process-1',targetId:'local',definitionId:'process',definitionVersion:'1',
    definitionDigest:'sha256:test',ownerType:'orchestration-run',ownerId:'run-1',
    scope:'automation:auto-1:run:run-1:node:start',parameters:{},driver:'exec',
    desiredState:'stopped',observedState:'stopped',readiness:{ status:'unknown' },
    liveness:{ status:'unknown' },handle:null,revision:1,restartCount:0,
    stoppedAt:'2026-08-24T00:00:00Z',createdAt:'2026-08-24T00:00:00Z',
    updatedAt:'2026-08-24T00:00:00Z',
    ...overrides,
  };
}
