import { describe,expect,it } from 'vitest';
import type { ProcessInstance } from '../execution/executionPublic';
import {
  experimentDescendantRunIds,
  experimentOwnedProcessInstances,
  experimentPanelWorkflowRunIds,
  experimentProcessInstanceReady,
  experimentProcessRuntimeProjection,
  experimentWorkflowMemberOwnerRunId,
  experimentWorkflowRunIds,
  type ExperimentProcessRuntimeProjection,
} from './experimentProcessRuntime';

describe('Experiment workflow Process ownership',() => {
  it('accepts only the complete workflow runtime projection',() => {
    expect(experimentProcessRuntimeProjection({
      targetId:'local',processInstances:[],loading:false,error:'',
    })).toBeUndefined();
    expect(experimentProcessRuntimeProjection(runtime([]))).toBeDefined();
  });

  it('includes explicit root and child owners while rejecting unrelated host processes',() => {
    const value = runtime([
      process('root-process','root-run'),
      process('panel-process','panel-run'),
      process('nested-process','nested-run'),
      process('unrelated-process','other-run'),
      process('operator-process','root-run','operator'),
    ]);
    const closure = experimentWorkflowRunIds(value);
    expect([...closure].sort()).toEqual(['nested-run','panel-run','root-run','sibling-run']);
    expect(experimentOwnedProcessInstances(value).map((item) => item.id).sort()).toEqual([
      'nested-process','panel-process','root-process',
    ]);
    expect(experimentProcessInstanceReady(value,'nested-process')).toBe(true);
  });

  it('selects one Panel Workflow relation subtree without mixing sibling actions',() => {
    const value = runtime([
      process('panel-process','panel-run'),
      process('nested-process','nested-run'),
      process('sibling-process','sibling-run'),
    ]);
    const panelRuns = experimentPanelWorkflowRunIds(value,'panel-workflow');
    expect([...panelRuns].sort()).toEqual(['nested-run','panel-run']);
    expect([...experimentDescendantRunIds(value,['panel-run'])].sort()).toEqual(['nested-run','panel-run']);
    expect(experimentOwnedProcessInstances(value,panelRuns).map((item) => item.id).sort()).toEqual([
      'nested-process','panel-process',
    ]);
  });

  it('keeps an exact relation-only Panel anchor before target history catches up',() => {
    const value=runtime([
      process('relation-process','relation-only-run'),
      process('unrelated-process','other-run'),
    ]);
    const relationRuns=experimentDescendantRunIds(value,['relation-only-run']);
    expect([...relationRuns]).toEqual(['relation-only-run']);
    expect(experimentOwnedProcessInstances(value,relationRuns).map((item) => item.id)).toEqual([
      'relation-process',
    ]);
  });

  it('unions every Session-owned System root instead of projecting only the first root',() => {
    const value=runtime([
      process('full-process','root-run'),
      process('manual-process','manual-child'),
    ]);
    const manualRoot={
      ...value.activeRun!,id:'manual-root',rootRunId:'manual-root',
      actionId:'invoke-panel-action',status:'succeeded' as const,revision:8,
    };
    value.activeRuns=[value.activeRun!,manualRoot];
    value.runSummaries.push(
      { ...run('manual-root','system-runner'),actionId:'invoke-panel-action',status:'succeeded' },
      { ...run('manual-child','rviz-workflow'),parentRunId:'manual-root',rootRunId:'manual-root' },
    );
    expect([...experimentWorkflowRunIds(value)].sort()).toEqual([
      'manual-child','manual-root','nested-run','panel-run','root-run','sibling-run',
    ]);
    expect(experimentOwnedProcessInstances(value).map((item) => item.id).sort()).toEqual([
      'full-process','manual-process',
    ]);
  });

  it('selects exactly one active Workflow member owner for Config pose fill',() => {
    const value=runtime([]);
    value.sessionViews=[{
      session:{ id:'session-1',targetId:'local',state:'active',revision:1 } as never,
      members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'panel-robot-instruments',
        kind:'workflow_run',ownerId:'robot-runtime-run',status:'running',revision:1,
      }],
    }];
    expect(experimentWorkflowMemberOwnerRunId(value,'panel-robot-instruments')).toBe('robot-runtime-run');
    value.sessionViews[0]!.members.push({
      ...value.sessionViews[0]!.members[0]!,id:'member-2',ownerId:'ambiguous-run',
    });
    expect(experimentWorkflowMemberOwnerRunId(value,'panel-robot-instruments')).toBeUndefined();
  });
});

function runtime(processInstances:ProcessInstance[]):ExperimentProcessRuntimeProjection {
  return {
    targetId:'local',loading:false,error:'',processInstances,documents:[],catalog:[],runDetailsById:{
      'panel-run':{
        invocations:[],nodeSummaries:[],loading:false,error:'',relations:{
          runId:'panel-run',childRuns:[{
            id:'child-relation',targetId:'local',rootRunId:'root-run',parentRunId:'panel-run',
            parentInvocationId:'invoke-call',callNodeId:'call',ordinal:0,childRunId:'nested-run',ownerRunId:'panel-run',
            childDefinitionId:'nested-workflow',childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
            childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
            childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',
            cancelPolicy:'cascade',resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',revision:1,
          }],childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      },
    },
    runSummaries:[
      run('root-run','system-runner'),
      { ...run('panel-run','panel-workflow'),parentRunId:'root-run',rootRunId:'root-run' },
      { ...run('nested-run','nested-workflow'),parentRunId:'panel-run',rootRunId:'root-run' },
      { ...run('sibling-run','sibling-workflow'),parentRunId:'root-run',rootRunId:'root-run' },
    ],
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'running',revision:1,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'panel',automationRef:{ domain:'automation',resourceId:'panel-workflow',branch:'main' },
        executionTargetId:'local',actionPresetIds:['run'],
      }],
    },
  };
}

function run(id:string,automationResourceId:string) {
  return {
    id,targetId:'local',automationResourceId,actionId:'run',actionVersion:1,sourceKind:'experiment' as const,
    sourceRef:{ domain:'experiment' as const,resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
    status:'running' as const,revision:1,rootRunId:id,createdAt:'t',updatedAt:'t',
  };
}

function process(id:string,ownerId:string,ownerType='orchestration-run'):ProcessInstance {
  return {
    id,targetId:'local',definitionId:id,definitionVersion:'1',definitionDigest:'a'.repeat(64),
    ownerType,ownerId,scope:'run',parameters:{},driver:'host',desiredState:'running',observedState:'running',
    readiness:{ status:'passing' },liveness:{ status:'passing' },revision:1,restartCount:0,createdAt:'t',updatedAt:'t',
  };
}
