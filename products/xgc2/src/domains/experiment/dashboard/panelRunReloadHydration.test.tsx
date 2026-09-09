// @vitest-environment jsdom

import { useCallback,useMemo,useState } from 'react';
import { renderHook,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type {
  AutomationChildRunRelation,
  AutomationRun,
  AutomationRunDetail,
} from '../../automation/automationPublic';
import type { ProcessInstance } from '../../execution/executionPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { SYSTEM_EXPERIMENT_RUNNER } from '../experimentWorkflowService';
import type { ExperimentSessionView } from '../experimentWorkflowModel';
import { projectRosBasicServices } from '../../../panels/ros/rosBasicServicesPanelProjection';
import { fullRunPanelInvocationFallback,type FullRunRelationsSnapshot } from './ExperimentDashboardCanvas';
import { panelRunDetailDemands,usePanelRunDetailDemand } from './panelRunDetailDemand';
import { useExperimentWorkflowRuntime } from './useExperimentWorkflowRuntime';

describe('Panel Run reload hydration',() => {
  it('loads root, Panel child, and ROS service grandchildren before projecting ready tiles',async () => {
    const loadOrder:string[]=[];
    const retainRunDetail=vi.fn(() => vi.fn());
    const { result }=renderHook(() => {
      const [runDetailsById,setRunDetailsById]=useState<Record<string,AutomationRunDetail>>({});
      const loadRunDetail=useCallback(async (runId:string) => {
        loadOrder.push(runId);
        const loaded=DETAILS[runId];
        if (!loaded) throw new Error(`missing fixture ${runId}`);
        setRunDetailsById((current) => ({ ...current,[runId]:loaded }));
        return loaded;
      },[]);
      const workflow=useExperimentWorkflowRuntime(experiment(),'local',{
        runSummaries:[],runDetailsById,resolved:true,error:'',
        refreshExecutionHistory:vi.fn(async () => []),loadRunDetail,retainRunDetail,
        convergeStoppedExperiment:vi.fn(async () => undefined),
        sessionViews:[session()],
      });
      const root=workflow.activeRuns.find((run) => run.id===ROOT_RUN_ID);
      const rootDetail=runDetailsById[ROOT_RUN_ID];
      const snapshot:FullRunRelationsSnapshot|undefined=root ? {
        rootId:root.id,rootRevision:root.revision,loading:false,error:'',
        relations:rootDetail?.relations,
      } : undefined;
      const fallback=fullRunPanelInvocationFallback(
        panel(),{ activeRuns:workflow.activeRuns },snapshot,
      );
      const demands=panelRunDetailDemands({
        panelId:PANEL_ID,targetId:'local',activeRuns:workflow.activeRuns,fallback,enabled:true,
      });
      const automation=useMemo(() => ({
        targetId:'local',runDetailsById,loadRunDetail,retainRunDetail,
      }),[loadRunDetail,runDetailsById]);
      usePanelRunDetailDemand({ demands,automation:automation as never });
      const tiles=projectRosBasicServices({
        targetId:'local',activeRun:workflow.activeRun,activeRuns:workflow.activeRuns,
        processInstances:PROCESSES,documents:[],catalog:[],runSummaries:[],runDetailsById,
        loading:false,error:'',
      },SERVICES.map((service) => service.id),Object.fromEntries(SERVICES.map((service) => [service.id,{
        automationResourceId:ROS_PANEL_AUTOMATION_ID,actionId:service.id,
      }])));
      return { fallback,runDetailsById,tiles };
    });

    await waitFor(() => expect(loadOrder).toEqual([
      ROOT_RUN_ID,PANEL_RUN_ID,...SERVICES.map((service) => service.runId),
    ]));
    expect(result.current.fallback).toMatchObject({
      rootRunId:ROOT_RUN_ID,id:PANEL_RUN_ID,status:'waiting',revision:2,
    });
    expect(result.current.tiles.map((tile) => ({
      id:tile.service.id,runId:tile.runId,status:tile.status,percent:tile.progress.percent,
    }))).toEqual(SERVICES.map((service) => ({
      id:service.id,runId:service.runId,status:'ready',percent:100,
    })));
  });
});

const ROOT_RUN_ID='root-run';
const PANEL_RUN_ID='panel-run';
const PANEL_ID='ros-control';
const PANEL_WORKFLOW_ID='panel-ros-control';
const ROS_PANEL_AUTOMATION_ID='ros-panel';
const SERVICES=[
  { id:'roscore' as const,callNodeId:'call-ros',runId:'roscore-run',definitionId:'roscore' },
  { id:'gzserver' as const,callNodeId:'call-gzserver',runId:'gzserver-run',definitionId:'gazebo-server' },
  { id:'vrpn' as const,callNodeId:'call-vrpn',runId:'vrpn-run',definitionId:'vrpn-client-ros1' },
];

const ROOT_RUN=run({
  id:ROOT_RUN_ID,automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
  actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,sourceKind:'experiment',sourceResourceId:'experiment-a',
  parameters:{ runMode:'simulation' },revision:1,
});
const PANEL_RUN=run({
  id:PANEL_RUN_ID,automationResourceId:ROS_PANEL_AUTOMATION_ID,actionId:'start-for-experiment',
  sourceKind:'automation',sourceResourceId:ROS_PANEL_AUTOMATION_ID,
  parentRunId:ROOT_RUN_ID,rootRunId:ROOT_RUN_ID,depth:1,revision:2,
});
const DETAILS:Record<string,AutomationRunDetail>={
  // The exact root relation is the only source for the Panel child after
  // reload. The Session deliberately contains no workflow_run shortcut.
  [ROOT_RUN_ID]:detail(ROOT_RUN,[child(PANEL_RUN_ID,'run-panels',ROOT_RUN_ID,{
    childDefinitionId:ROS_PANEL_AUTOMATION_ID,runRevision:2,
  })],{
    childRunGroups:[{ id:'panel-group',producerNodeId:'run-panels' }] as never,
    childRunGroupMembers:[{
      groupId:'panel-group',itemKey:PANEL_WORKFLOW_ID,childRunId:PANEL_RUN_ID,state:'terminal',
    }] as never,
  }),
  [PANEL_RUN_ID]:detail(PANEL_RUN,SERVICES.map((service,index) => child(
    service.runId,service.callNodeId,PANEL_RUN_ID,{
      ordinal:index,childDefinitionId:`${service.id}-automation`,rootRunId:ROOT_RUN_ID,
    },
  ))),
  ...Object.fromEntries(SERVICES.map((service) => [service.runId,detail(run({
    id:service.runId,automationResourceId:`${service.id}-automation`,actionId:'start-from-ros-control',
    sourceKind:'automation',sourceResourceId:`${service.id}-automation`,
    parentRunId:PANEL_RUN_ID,rootRunId:ROOT_RUN_ID,depth:2,revision:1,
  }),[])])),
};

const PROCESSES:ProcessInstance[]=SERVICES.map((service) => ({
  id:`${service.id}-process`,targetId:'local',definitionId:service.definitionId,
  definitionVersion:'1',definitionDigest:'a'.repeat(64),ownerType:'orchestration-run',ownerId:service.runId,
  scope:'run',parameters:{},driver:'host',desiredState:'running',observedState:'running',
  readiness:{ status:'passing' },liveness:{ status:'passing' },revision:1,restartCount:0,
  createdAt:'t',updatedAt:'t',
}));

function experiment():ExperimentDocument {
  const spec=newExperimentSpec({ name:'Experiment',runModes:['simulation'] });
  spec.workflowInstances=[{
    id:PANEL_WORKFLOW_ID,ref:{ domain:'automation',resourceId:ROS_PANEL_AUTOMATION_ID,branch:'main' },
    actionPresets:[{ id:'start',actionId:'start-for-experiment',inputs:{},parameterBindings:[] }],
  }];
  return {
    head:{ domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],mainCommitId:'commit-1',
      currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',
      headVersion:1,revision:1,createdAt:'t',updatedAt:'t' },
    spec,
  };
}

function panel():PanelInstance {
  return {
    id:PANEL_ID,pluginId:'ros-basic-services-control',title:'ROS Control',
    gridPos:{ x:0,y:0,w:10,h:5 },query:{},options:{},fieldConfig:{},
    portBindings:[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:PANEL_WORKFLOW_ID,presetId:'start',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }],
  };
}

function session():ExperimentSessionView {
  return {
    session:{ id:'session-a',targetId:'local',experimentResourceId:'experiment-a',state:'active',
      mode:'full',runMode:'simulation',revision:1 },
    members:[{
      id:'command-member',targetId:'local',sessionId:'session-a',bindingId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
      kind:'workflow_command',ownerId:ROOT_RUN_ID,status:'failed',revision:1,
    }],
  };
}

function run({
  id,automationResourceId,actionId,sourceKind,sourceResourceId,parameters={},
  parentRunId,rootRunId=id,depth=0,revision=1,
}: {
  id:string;automationResourceId:string;actionId:string;sourceKind:'experiment'|'automation';
  sourceResourceId:string;parameters?:Record<string,unknown>;parentRunId?:string;
  rootRunId?:string;depth?:number;revision?:number;
}):AutomationRun {
  return {
    id,targetId:'local',automationResourceId,definitionId:automationResourceId,definitionVersion:1,
    configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),registryDigest:'c'.repeat(64),
    definitionDigest:'d'.repeat(64),actionId,actionVersion:1,executionModel:'orchestration-occurrence-v1',
    sourceKind,sourceRef:{ domain:sourceKind,resourceId:sourceResourceId,branch:'main',commitId:'commit-1',
      version:1,digest:'e'.repeat(64) },status:'waiting',revision,parameters,
    ...(parentRunId ? { parentRunId } : {}),admissionMode:'parallel',admissionScope:'root',
    rootRunId,depth,correlationId:rootRunId,acceptedAt:'t',createdAt:'t',startedAt:'t',updatedAt:'t',
  };
}

function detail(
  exact:AutomationRun,
  childRuns:AutomationChildRunRelation[],
  overrides:Partial<NonNullable<AutomationRunDetail['relations']>>={},
):AutomationRunDetail {
  return {
    run:exact,invocations:[],nodeSummaries:[],loading:false,error:'',
    relations:{ runId:exact.id,childRuns,childRunGroups:[],childRunGroupMembers:[],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],...overrides },
  };
}

function child(
  childRunId:string,callNodeId:string,parentRunId:string,
  overrides:Partial<AutomationChildRunRelation>={},
):AutomationChildRunRelation {
  return {
    id:`relation-${childRunId}`,targetId:'local',rootRunId:ROOT_RUN_ID,parentRunId,
    parentInvocationId:`invoke-${childRunId}`,callNodeId,ordinal:0,childRunId,ownerRunId:parentRunId,
    childDefinitionId:'child-automation',childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
    childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',
    cancelPolicy:'cascade',resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',
    runStatus:'waiting',runRevision:1,revision:1,...overrides,
  };
}
