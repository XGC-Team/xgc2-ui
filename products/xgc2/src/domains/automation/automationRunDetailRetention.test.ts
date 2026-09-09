import { describe,expect,it } from 'vitest';
import type {
  AutomationExecutionRelations,
  AutomationRunDetail,
} from './automationExecutionContracts';
import type { AutomationRun } from './automationRunContracts';
import {
  AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT,
  retainAutomationRunDetails,
} from './automationRunDetailRetention';

describe('Automation Run detail retention',() => {
  it('keeps only the newest bounded terminal history with deterministic ties',() => {
    const details = Object.fromEntries(Array.from({ length:70 },(_,index) => {
      const id = `run-${String(index).padStart(3,'0')}`;
      return [id,detail(id,'succeeded',timestamp(index))];
    }));

    const retained = retainAutomationRunDetails(details);

    expect(Object.keys(retained)).toHaveLength(AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT);
    expect(retained['run-005']).toBeUndefined();
    expect(retained['run-006']).toBe(details['run-006']);
    expect(retained['run-069']).toBe(details['run-069']);
  });

  it('never limits active, loading, unresolved, or active relation-connected truth',() => {
    const active = detail('active-child','waiting','2026-08-24T00:00:00Z');
    const root = detail('terminal-root','stopped','2026-08-24T00:00:00Z',[
      'active-child','terminal-sibling',
    ]);
    const sibling = detail('terminal-sibling','succeeded','2026-08-24T00:00:00Z');
    const loading = { ...detail('loading','succeeded','2026-08-24T00:00:00Z'),loading:true };
    const unresolved:AutomationRunDetail = {
      invocations:[],nodeSummaries:[],loading:false,error:'not loaded',
    };
    const unrelated = detail('terminal-unrelated','succeeded','2026-08-24T00:00:01Z');

    const retained = retainAutomationRunDetails({
      'active-child':active,'terminal-root':root,'terminal-sibling':sibling,
      loading,unresolved,'terminal-unrelated':unrelated,
    },0);

    expect(Object.keys(retained).sort()).toEqual([
      'active-child','loading','terminal-root','terminal-sibling','unresolved',
    ]);
    expect(retained['terminal-unrelated']).toBeUndefined();
  });

  it('lets an explicitly pinned terminal detail re-enter the bounded window',() => {
    const initial = Object.fromEntries(Array.from({ length:66 },(_,index) => {
      const id = `run-${String(index).padStart(3,'0')}`;
      return [id,detail(id,'succeeded',timestamp(index))];
    }));
    const reloaded = detail('run-000','succeeded',timestamp(0));
    const second = retainAutomationRunDetails(
      { ...initial,'run-000':reloaded },
      AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT,
      new Set(['run-000']),
    );

    expect(second['run-000']).toBe(reloaded);
    expect(second['run-001']).toBeUndefined();
    expect(Object.keys(second)).toHaveLength(AUTOMATION_TERMINAL_RUN_DETAIL_LIMIT+1);
  });

  it('keeps an arbitrarily large explicitly pinned terminal relation tree',() => {
    const childRunIds = Array.from({ length:70 },(_,index) => `child-${index}`);
    const details:Record<string,AutomationRunDetail> = {
      root:detail('root','stopped',timestamp(0),childRunIds),
      unrelated:detail('unrelated','stopped',timestamp(100)),
    };
    childRunIds.forEach((runId,index) => {
      details[runId]=detail(runId,'succeeded',timestamp(index+1));
    });

    const retained = retainAutomationRunDetails(details,0,new Set(['root']));

    expect(Object.keys(retained)).toHaveLength(71);
    expect(retained.root).toBe(details.root);
    childRunIds.forEach((runId) => expect(retained[runId]).toBe(details[runId]));
    expect(retained.unrelated).toBeUndefined();
  });

  it('does not connect detached, unbound, abandoned, target-root, or foreign-target relations',() => {
    for (const mutate of [
      (child:Record<string,unknown>) => { child.relation='detached'; },
      (child:Record<string,unknown>) => { delete child.boundAt; },
      (child:Record<string,unknown>) => { child.launchAbandonedAt='t'; },
      (child:Record<string,unknown>) => { child.targetRoot=true; },
      (child:Record<string,unknown>) => { child.targetId='agent/a'; },
    ]) {
      const root=detail('root','stopped',timestamp(0),['active']);
      mutate(root.relations!.childRuns[0] as unknown as Record<string,unknown>);
      const retained=retainAutomationRunDetails({
        root,active:detail('active','waiting',timestamp(1)),
      },0);
      expect(retained.root).toBeUndefined();
      expect(retained.active).toBeDefined();
    }
  });

  it('preserves referential identity without pruning and rejects unsafe limits',() => {
    const details = { one:detail('one','succeeded','2026-08-24T00:00:00Z') };
    expect(retainAutomationRunDetails(details)).toBe(details);
    expect(() => retainAutomationRunDetails(details,-1)).toThrow('non-negative integer');
    expect(() => retainAutomationRunDetails(details,1.5)).toThrow('non-negative integer');
  });
});

function detail(
  id:string,
  status:AutomationRun['status'],
  updatedAt:string,
  childRunIds:string[]=[],
):AutomationRunDetail {
  const run = {
    id,targetId:'local',status,revision:1,updatedAt,createdAt:updatedAt,
    ...(status==='accepted' || status==='queued' || status==='running'
      || status==='waiting' || status==='stopping' ? {} : { finishedAt:updatedAt }),
  } as AutomationRun;
  const relations = childRunIds.length===0 ? undefined : {
    runId:id,
    childRuns:childRunIds.map((childRunId) => ({
      targetId:'local',childRunId,boundAt:'t',relation:'supervised',
    })),
    childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
  } as unknown as AutomationExecutionRelations;
  return {
    run,relations,invocations:[],nodeSummaries:[],loading:false,error:'',
  };
}

function timestamp(offsetSeconds:number) {
  return new Date(Date.UTC(2026,7,24,0,0,offsetSeconds)).toISOString();
}
