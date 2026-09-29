// @vitest-environment jsdom

import { renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationPanelContext } from '../../../panels/types';
import type { AutomationExecutionRelations } from '../../automation/automationPublic';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../experimentProcessRuntime';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import {
  dataContractsDemandRunDetails,
  panelRunDetailDemands,
  usePanelRunDetailDemand,
} from './panelRunDetailDemand';

describe('Panel Run detail demand',() => {
  it('is declared by runtime-bearing data contracts, never dashboard or Panel names',() => {
    expect(dataContractsDemandRunDetails([EXPERIMENT_PROCESS_RUNTIME_DATASOURCE])).toBe(true);
    expect(dataContractsDemandRunDetails([workflowRuntimeDatasources.run])).toBe(true);
    expect(dataContractsDemandRunDetails([workflowRuntimeDatasources.runLogs])).toBe(true);
    expect(dataContractsDemandRunDetails(['camera.video.v1'])).toBe(true);
    expect(dataContractsDemandRunDetails(['experiment.robots.v1','robot.assets.v1'])).toBe(false);
  });

  it('selects only exact mounted Panel roots on the requested target',() => {
    const runs=[
      run('own','arbitrary-panel','local',4),
      run('sibling','other-panel','local',5),
      run('remote','arbitrary-panel','agent/a',6),
    ];
    expect(panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',activeRuns:runs,
      fallback:{ rootRunId:'full',targetId:'local',id:'managed',status:'waiting',revision:7 },
      enabled:true,
    })).toEqual([
      { id:'managed',targetId:'local',revision:7,frozenSnapshot:true },
      { id:'own',targetId:'local',revision:4,frozenSnapshot:true },
    ]);
    expect(panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',activeRuns:runs,enabled:false,
    })).toEqual([]);
  });

  it('also demands active relation children of a retained Panel root',() => {
    expect(panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',
      activeRuns:[run('own','arbitrary-panel','local',4)],
      runDetailsById:{
        own:{
          invocations:[],nodeSummaries:[],loading:false,error:'',
          relations:{
            runId:'own',
            childRuns:[{
              id:'rel-child',targetId:'local',rootRunId:'own',parentRunId:'own',
              parentInvocationId:'invoke',callNodeId:'invoke-selected-action',ordinal:0,
              childRunId:'child',ownerRunId:'own',childDefinitionId:'worker',
              childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
              childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
              childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',
              relation:'attached',waitPolicy:'wait',cancelPolicy:'cascade',
              resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',
              runStatus:'waiting',runRevision:8,revision:1,
            }],
            childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],
            runtimeGroups:[],runtimes:[],resources:[],
          },
        },
      },
      enabled:true,
    })).toEqual([
      { id:'child',targetId:'local',revision:8 },
      { id:'own',targetId:'local',revision:4,frozenSnapshot:true },
    ]);
  });

  it('loads a frozen snapshot for a local xgc-world-runtime child-group member',() => {
    const parentInvocationId='8119a01e-9fb9-583c-b2a9-1db9924ae23d';
    const worldRuntimeId='a67c3022-e819-522c-b4a2-cd844dc56973';
    const prepOwnerId='7c6fc08d-f4c7-56a5-acf1-8cc60f41d446';
    const groupId='679e8c82-4605-50d8-9255-1c0ddbc8df5f';
    const relations:AutomationExecutionRelations={
      runId:prepOwnerId,
      childRuns:[{
        id:'relation-world-runtime',targetId:'local',rootRunId:'root',
        parentRunId:prepOwnerId,parentInvocationId,
        callNodeId:'runtime-direct',ordinal:0,childRunId:worldRuntimeId,
        ownerRunId:prepOwnerId,childDefinitionId:'world-runtime',
        childDefinitionVersion:2,childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
        childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),triggerNodeId:'called',
        relation:'supervised',waitPolicy:'join-later',cancelPolicy:'cascade',resultPolicy:'propagate',
        createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:'succeeded',runRevision:2,revision:2,
      }],
      childRunGroups:[{
        id:groupId,targetId:'local',rootRunId:'root',parentRunId:prepOwnerId,
        producerInvocationId:parentInvocationId,producerNodeId:'runtime-direct',groupKey:'automation-call:fan-out',
        expectedMembers:1,memberCount:1,waitPolicy:'wait',joinMode:'join-all',failurePolicy:'fail-fast',
        remainingPolicy:'cancel',resultPolicy:'propagate',maxConcurrency:256,state:'resolved',outcome:'succeeded',
        terminalCount:1,createdAt:'t',updatedAt:'t',sealedAt:'t',resolvedAt:'t',revision:3,
      }],
      childRunGroupMembers:[{
        id:'5aa7924d-1e46-5535-8fdc-b622924157b0',groupId,ordinal:0,itemKey:'xgc-world-runtime',
        childRunId:worldRuntimeId,state:'terminal',createdAt:'t',updatedAt:'t',dispatchedAt:'t',terminalAt:'t',revision:4,
      }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    };
    const demands=panelRunDetailDemands({
      panelId:'ros-control',targetId:'local',activeRuns:[run(prepOwnerId,'ros-control','local',4)],
      runDetailsById:{ [prepOwnerId]:{ invocations:[],nodeSummaries:[],loading:false,error:'',relations } },enabled:true,
    });
    expect(demands).toContainEqual({
      id:worldRuntimeId,targetId:'local',revision:2,frozenSnapshot:true,
    });
  });

  it('recursively follows known active children across targets without backfilling or looping',() => {
    const details={
      root:detail('root',[
        child('local-child','local','running'),
        child('world-dispatcher','local','succeeded'),
        child('unbound-success','local','succeeded',{ boundAt:undefined }),
        { ...targetRootChild('remote-child','agent/a',5),targetRootBindingId:'xgc-world-runtime' },
        child('detached','local','running',{ relation:'detached' }),
        child('abandoned','local','running',{ launchAbandonedAt:'t' }),
        child('terminal','local','stopped'),
        child('missing-target','','running'),
      ]),
      'remote-child':detail('remote-child',[
        targetRootChild('deep-child','agent/b',7),
        child('root','local','running'),
      ]),
      'deep-child':detail('deep-child',[child('leaf','agent/b','running')]),
      'world-dispatcher':detail('world-dispatcher',[child('world-agent','agent/world','running')]),
      'external-root':detail('external-root',[child('external-leaf','agent/c','running')]),
    };
    const demands=panelRunDetailDemands({
      panelId:'arbitrary-panel',targetId:'local',activeRuns:[run('root','arbitrary-panel','local',4)],
      rootDemands:[{ id:'external-root',targetId:'agent/c',revision:9 }],
      runDetailsById:details,enabled:true,
    });
    expect(demands).toEqual([
      { id:'remote-child',targetId:'agent/a',revision:5,frozenSnapshot:true },
      { id:'deep-child',targetId:'agent/b',revision:7 },
      { id:'leaf',targetId:'agent/b',revision:1 },
      { id:'external-leaf',targetId:'agent/c',revision:1 },
      { id:'external-root',targetId:'agent/c',revision:9,frozenSnapshot:true },
      { id:'world-agent',targetId:'agent/world',revision:1 },
      { id:'local-child',targetId:'local',revision:1 },
      { id:'root',targetId:'local',revision:4,frozenSnapshot:true },
      { id:'world-dispatcher',targetId:'local',revision:1 },
    ]);
  });

  it('retains each demand on its exact target, loads one frozen snapshot, and releases both targets',async () => {
    const localRelease=vi.fn();
    const remoteRelease=vi.fn();
    const local=runtime('local',localRelease);
    const remote=runtime('agent/a',remoteRelease);
    const runtimes=new Map([['agent/a',remote]]);
    const demands=[
      { id:'root',targetId:'local',revision:3,frozenSnapshot:true as const },
      { id:'local-child',targetId:'local',revision:4 },
      { id:'remote-child',targetId:'agent/a',revision:5 },
      { id:'unavailable-remote',targetId:'agent/missing',revision:6 },
    ];
    const { rerender,unmount }=renderHook(({ current,automation,runtimeMap }) => usePanelRunDetailDemand({
      demands:current,automation,runtimes:runtimeMap,
    }),{ initialProps:{ current:demands,automation:local,runtimeMap:runtimes } });
    await waitFor(() => {
      expect(local.retainRunObservation).toHaveBeenCalledWith('root');
      expect(remote.retainRunObservation).toHaveBeenCalledWith('remote-child');
      expect(local.loadRunDetail).toHaveBeenCalledWith('root');
    });
    expect(local.retainRunObservation).toHaveBeenCalledWith('local-child');
    expect(local.retainRunObservation).not.toHaveBeenCalledWith('unavailable-remote');
    expect(remote.retainRunObservation).not.toHaveBeenCalledWith('unavailable-remote');
    expect(local.loadRunDetail).toHaveBeenCalledTimes(1);
    expect(remote.loadRunDetail).not.toHaveBeenCalled();
    const localReplacement={
      ...local,runDetailsById:{ changed:detail('changed',[]) },
      runSummaries:[{ id:'new-summary' } as unknown as AutomationPanelContext['automation']['runSummaries'][number]],
    } as AutomationPanelContext['automation'];
    const remoteReplacement={
      ...remote,runDetailsById:{ changed:detail('changed',[]) },
      runSummaries:[{ id:'new-summary' } as unknown as AutomationPanelContext['automation']['runSummaries'][number]],
    } as AutomationPanelContext['automation'];
    rerender({
      current:[...demands],automation:localReplacement,
      runtimeMap:new Map([['agent/a',remoteReplacement]]),
    });
    expect(local.retainRunObservation).toHaveBeenCalledTimes(2);
    expect(remote.retainRunObservation).toHaveBeenCalledTimes(1);
    expect(local.loadRunDetail).toHaveBeenCalledTimes(1);
    expect(remote.loadRunDetail).not.toHaveBeenCalled();

    const nextRelease=vi.fn();
    const nextTarget=runtime('agent/b',nextRelease);
    rerender({
      current:[{ id:'next-root',targetId:'agent/b',revision:1,frozenSnapshot:true }],
      automation:localReplacement,runtimeMap:new Map([['agent/b',nextTarget]]),
    });
    await waitFor(() => {
      expect(nextTarget.retainRunObservation).toHaveBeenCalledWith('next-root');
      expect(nextTarget.loadRunDetail).toHaveBeenCalledWith('next-root');
    });
    expect(localRelease).toHaveBeenCalledTimes(2);
    expect(remoteRelease).toHaveBeenCalledOnce();
    unmount();
    expect(nextRelease).toHaveBeenCalledOnce();
  });
});

function runtime(targetId:string,release=vi.fn()) {
  return {
    targetId,runDetailsById:{},runSummaries:[],
    retainRunObservation:vi.fn(() => release),
    loadRunDetail:vi.fn().mockResolvedValue({}),
  } as unknown as AutomationPanelContext['automation'];
}

function detail(runId:string,childRuns:NonNullable<AutomationPanelContext['automation']['runDetailsById'][string]['relations']>['childRuns']) {
  return {
    invocations:[],nodeSummaries:[],loading:false,error:'',
    relations:{ runId,childRuns,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] },
  } as AutomationPanelContext['automation']['runDetailsById'][string];
}

function child(childRunId:string,targetId:string,status:string,overrides:Record<string,unknown>={}) {
  return {
    id:`link-${childRunId}`,targetId,rootRunId:'root',parentRunId:'root',parentInvocationId:'invoke',
    callNodeId:'call',ordinal:0,childRunId,ownerRunId:'root',childDefinitionId:'worker',
    childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
    childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',
    relation:'supervised',waitPolicy:'join-later',cancelPolicy:'cascade',resultPolicy:'reference',
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:status,runRevision:1,revision:1,...overrides,
  } as NonNullable<AutomationPanelContext['automation']['runDetailsById'][string]['relations']>['childRuns'][number];
}

function targetRootChild(childRunId:string,targetId:string,revision:number) {
  const { runStatus:_runStatus,runRevision:_runRevision,...relation }=child(childRunId,targetId,'running');
  return {
    ...relation,targetRoot:true,observedStatus:'running',observedRevision:revision,
  } as NonNullable<AutomationPanelContext['automation']['runDetailsById'][string]['relations']>['childRuns'][number];
}

function run(id:string,panelId:string,targetId:string,revision:number) {
  return {
    id,panelId,targetId,revision,
    experimentRef:{ domain:'experiment' as const,resourceId:'experiment',branch:'main' },
    automationResourceId:'system',actionId:'run-panel',runMode:'simulation',status:'waiting' as const,
    rootRunId:id,createdAt:'t',updatedAt:'t',workflowTargets:[],
  };
}
