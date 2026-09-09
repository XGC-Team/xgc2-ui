import { describe,expect,it } from 'vitest';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import type { ExperimentProcessRuntimeProjection } from '../../domains/experiment/experimentPublic';
import { projectRosBasicServices } from './rosBasicServicesPanelProjection';

describe('ROS Control Panel Workflow projection',() => {
  it('uses each Action Run relation closure and only its explicitly owned processes',() => {
    const value = runtime([
      process('ros-process','roscore','ros-run','running','passing'),
      process('gz-ready','gazebo-server','gz-run','running','passing'),
      process('gz-starting','gazebo-server','gz-run','starting','unknown'),
      process('unrelated','roscore','other-run','running','passing'),
    ]);
    const projected = projectRosBasicServices(value,['roscore','gzserver'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'start-ros',activeRunId:'ros-run' },
      gzserver:{ automationResourceId:'ros-panel',actionId:'start-gazebo',activeRunId:'gz-run' },
    });
    expect(projected[0]).toMatchObject({ runId:'ros-run',status:'ready',progress:{ ready:1,total:1,percent:100 } });
    expect(projected[1]).toMatchObject({ runId:'gz-run',status:'running',progress:{ ready:1,total:2,percent:50,active:2 } });
    expect(projected.flatMap((item) => item.processes).some((item) => item.id === 'unrelated')).toBe(false);
  });

  it('reports no owned processes instead of inventing an expected count',() => {
    const value = runtime([]);
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'start-ros',activeRunId:'ros-run' },
    })[0]).toMatchObject({
      runId:'ros-run',status:'waiting',progress:{ ready:0,total:0,percent:0 },
      statusDescription:'Workflow waiting; no owned Process instances reported',
    });
    expect(projectRosBasicServices(undefined,['roscore'])[0]).toMatchObject({
      available:false,status:'idle',runId:undefined,
    });
  });

  it('maps Total Run start-for-experiment children by exact call node onto each service tile',() => {
    const value = totalRunRuntime();
    const projected = projectRosBasicServices(value,totalRunServices.map((service) => service.id),totalRunBindings());
    expect(projected.map((item) => ({
      id:item.service.id,runId:item.runId,status:item.status,ready:item.progress.ready,total:item.progress.total,
      process:item.processes.map((process) => process.definitionId),
    }))).toEqual(totalRunServices.map((service) => ({
      id:service.id,runId:service.childRunId,status:'ready',ready:1,total:1,process:[service.definitionId],
    })));
  });

  it('keeps the invoke-panel-action parent Action Run instead of the Total Run grandchild',() => {
    const value = totalRunRuntime();
    value.runSummaries.push({
      ...run('invoke-roscore','ros-panel','roscore'),parentRunId:'root-run',rootRunId:'root-run',status:'waiting',
    });
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({ runId:'invoke-roscore',status:'waiting' });
  });

  it('projects the active nested service after its manual Action parent succeeds',() => {
    const value = totalRunRuntime();
    value.runSummaries=value.runSummaries.filter((run) => run.id!=='ros-child');
    value.runDetailsById['panel-run']!.relations!.childRuns=
      value.runDetailsById['panel-run']!.relations!.childRuns.filter(
        (relation) => relation.callNodeId!=='call-ros',
      );
    value.processInstances=value.processInstances.filter((process) => process.ownerId!=='ros-child');
    const manualRoot = {
      ...value.activeRun!,id:'manual-root',rootRunId:'manual-root',
      actionId:'invoke-panel-action',status:'succeeded' as const,revision:9,
    };
    value.activeRuns=[value.activeRun!,manualRoot];
    value.runSummaries.push(
      { ...run('manual-root','system-runner','invoke-panel-action'),status:'succeeded',revision:9 },
      {
        ...panelWorkflowRun('manual-action','manual-root','start-for-experiment'),
        actionId:'roscore',status:'succeeded',revision:4,
      },
      {
        ...run('manual-ros-child','roscore-automation','start-from-ros-control'),
        parentRunId:'manual-action',rootRunId:'manual-root',status:'waiting',
      },
    );
    value.runDetailsById['manual-action']={
      invocations:[],nodeSummaries:[],loading:false,error:'',
      relations:{
        runId:'manual-action',
        childRuns:[childRelation('call-ros','manual-ros-child',0,'manual-action')],
        childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      },
    };
    value.processInstances.push(process(
      'manual-ros-process','roscore','manual-ros-child','running','passing','orchestration-run',
    ));

    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({
      runId:'manual-ros-child',status:'ready',progress:{ ready:1,total:1,percent:100 },
    });
  });

  it('does not let a historical stopped invoke Run mask the Total Run grandchild',() => {
    const value = totalRunRuntime();
    value.runSummaries.push({
      ...run('invoke-roscore','ros-panel','roscore'),parentRunId:'root-run',rootRunId:'root-run',
      status:'stopped',revision:9,updatedAt:'z',
    });
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({ runId:'ros-child',status:'ready' });
  });

  it('ignores call-node children of the wrong Total Run parent',() => {
    const value = totalRunRuntime();
    value.runSummaries.push(
      { ...panelWorkflowRun('start-all-run','root-run','start-all') },
      { ...panelWorkflowRun('stale-panel','other-root'),status:'waiting' },
      { ...run('decoy-child','roscore-automation','start-from-ros-control'),parentRunId:'start-all-run',rootRunId:'root-run' },
    );
    value.runDetailsById['start-all-run'] = {
      invocations:[],nodeSummaries:[],loading:false,error:'',
      relations:{
        runId:'start-all-run',
        childRuns:[childRelation('call-ros','decoy-child',0,'start-all-run')],
        childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      },
    };
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({ runId:'ros-child' });
  });

  it('returns idle after the Total Run service grandchild is no longer active',() => {
    const value = totalRunRuntime();
    const child = value.runSummaries.find((item) => item.id === 'ros-child')!;
    child.status = 'stopped';
    const relation = value.runDetailsById['panel-run']!.relations!.childRuns.find((item) => item.callNodeId === 'call-ros')!;
    relation.runStatus = 'stopped';
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({ runId:undefined,status:'idle' });
  });

  it('converges ready → stopping → terminal without a late running summary re-lighting the tile',() => {
    const value = totalRunRuntime();
    // ready
    expect(projectRosBasicServices(value,['roscore'],totalRunBindings())[0])
      .toMatchObject({ status:'ready' });
    // stopping: parent + child both stopping; processes report stopping too
    const parent = value.runSummaries.find((item) => item.id === 'panel-run')!;
    parent.status = 'stopping';
    const child = value.runSummaries.find((item) => item.id === 'ros-child')!;
    child.status = 'stopping';child.revision = 3;
    value.processInstances.forEach((instance) => { instance.observedState = 'stopping'; });
    const relation = value.runDetailsById['panel-run']!.relations!.childRuns.find((item) => item.callNodeId === 'call-ros')!;
    relation.runStatus = 'stopping';relation.runRevision = 3;
    expect(projectRosBasicServices(value,['roscore'],totalRunBindings())[0])
      .toMatchObject({ status:'stopping' });
    // terminal: summaries settle to stopped, but one stale relation still says running
    parent.status = 'stopped';parent.revision = 5;
    child.status = 'stopped';child.revision = 4;
    value.processInstances.forEach((instance) => { instance.observedState = 'stopped'; });
    relation.runStatus = 'running';relation.runRevision = 2;
    const projection = projectRosBasicServices(value,['roscore'],totalRunBindings())[0];
    expect(projection).toMatchObject({ runId:undefined,status:'idle',progress:{ percent:0 } });
  });

  it('keeps a historical running Action Run suppressed once any newer terminal record exists',() => {
    const value = runtime([]);
    value.runSummaries.push(
      { ...run('old-ros','ros-panel','start-ros'),parentRunId:'root-run',rootRunId:'root-run',status:'running',revision:1,updatedAt:'t1' },
      { ...run('done-ros','ros-panel','start-ros'),parentRunId:'root-run',rootRunId:'root-run',status:'succeeded',revision:2,updatedAt:'t2' },
    );
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'start-ros' },
    })[0]).toMatchObject({ runId:undefined,status:'idle' });
  });

  it('allows a new Action Run after a historical terminal Run',() => {
    const value = runtime([]);
    value.runSummaries.push(
      { ...run('done-ros','ros-panel','start-ros'),parentRunId:'root-run',rootRunId:'root-run',status:'stopped',revision:9,updatedAt:'t1' },
      { ...run('new-ros','ros-panel','start-ros'),parentRunId:'root-run',rootRunId:'root-run',status:'running',revision:1,updatedAt:'t2' },
    );
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'start-ros' },
    })[0]).toMatchObject({ runId:'new-ros',status:'running' });
  });

  it('does not let an old terminal child mask a new child with a fresh Run id',() => {
    const value = totalRunRuntime();
    value.runSummaries.push({
      ...run('old-ros-child','roscore-automation','start-from-ros-control'),
      parentRunId:'panel-run',rootRunId:'root-run',status:'stopped',revision:9,
    });
    value.runDetailsById['panel-run']!.relations!.childRuns.push({
      ...childRelation('call-ros','old-ros-child',99),runStatus:'stopped',runRevision:9,
    });
    expect(projectRosBasicServices(value,['roscore'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
    })[0]).toMatchObject({ runId:'ros-child',status:'ready' });
  });

  it('shows waiting without a child runId once Total Run has admitted an auto-start service',() => {
    const value = runtime([]);
    value.runSummaries = [
      run('root-run','system-runner','run'),
      panelWorkflowRun('panel-run','root-run'),
    ];
    value.runDetailsById = {
      'panel-run':{
        run:{
          ...panelWorkflowRun('panel-run','root-run'),
          parameters:{ autoStartRos:true,autoStartVrpn:false },
        } as never,
        invocations:[],nodeSummaries:[],loading:false,error:'',
        relations:{
          runId:'panel-run',childRuns:[],childRunGroups:[],childRunGroupMembers:[],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      },
    };
    const projected = projectRosBasicServices(value,['roscore','vrpn'],{
      roscore:{ automationResourceId:'ros-panel',actionId:'roscore' },
      vrpn:{ automationResourceId:'ros-panel',actionId:'vrpn' },
    });
    expect(projected[0]).toMatchObject({
      runId:undefined,status:'waiting',
      statusDescription:'Workflow waiting; no owned Process instances reported',
    });
    expect(projected[1]).toMatchObject({ runId:undefined,status:'idle' });
  });

  it('lets each service converge independently when only one was stopped',() => {
    const value = totalRunRuntime();
    const gzsChild = value.runSummaries.find((item) => item.id === 'gzs-child')!;
    gzsChild.status = 'stopped';
    const gzRelation = value.runDetailsById['panel-run']!.relations!.childRuns.find((item) => item.callNodeId === 'call-gzserver')!;
    gzRelation.runStatus = 'stopped';
    const projected = projectRosBasicServices(value,['roscore','gzserver'],totalRunBindings());
    expect(projected[0]).toMatchObject({ runId:'ros-child',status:'ready' });
    expect(projected[0].service.id).toBe('roscore');
    expect(projected[1]).toMatchObject({ runId:undefined,status:'idle' });
  });
});

function runtime(processInstances:ProcessInstance[]):ExperimentProcessRuntimeProjection {
  return {
    targetId:'local',loading:false,error:'',processInstances,documents:[],catalog:[],runDetailsById:{},
    runSummaries:[
      run('root-run','system-runner','run'),
      { ...run('ros-run','ros-panel','start-ros'),parentRunId:'root-run',rootRunId:'root-run' },
      { ...run('gz-run','ros-panel','start-gazebo'),parentRunId:'root-run',rootRunId:'root-run' },
    ],
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'waiting',revision:2,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'ros-panel',automationRef:{ domain:'automation',resourceId:'ros-panel',branch:'main' },
        executionTargetId:'local',actionPresetIds:['start-ros','start-gazebo'],
      }],
    },
  };
}

function run(id:string,automationResourceId:string,actionId:string) {
  return {
    id,targetId:'local',automationResourceId,actionId,actionVersion:1,status:'waiting' as const,
    sourceKind:'experiment' as const,sourceRef:{ domain:'experiment' as const,resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
    revision:1,rootRunId:id,createdAt:'t',updatedAt:'t',
  };
}

function process(
  id:string,definitionId:string,ownerId:string,
  observedState:ProcessInstance['observedState'],readiness:ProcessInstance['readiness']['status'],
  ownerType:ProcessInstance['ownerType']='orchestration-run',
):ProcessInstance {
  return {
    id,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'a'.repeat(64),
    ownerType,ownerId,scope:'run',parameters:{},driver:'host',desiredState:'running',
    observedState,readiness:{ status:readiness },liveness:{ status:'passing' },revision:1,restartCount:0,
    createdAt:'t',updatedAt:'t',
  };
}

const totalRunServices = [
  { id:'roscore' as const,callNodeId:'call-ros',childRunId:'ros-child',definitionId:'roscore' },
  { id:'gzserver' as const,callNodeId:'call-gzserver',childRunId:'gzs-child',definitionId:'gazebo-server' },
  { id:'gzclient' as const,callNodeId:'call-gzclient',childRunId:'gzc-child',definitionId:'gazebo-client' },
  { id:'rviz' as const,callNodeId:'call-rviz',childRunId:'rviz-child',definitionId:'rviz' },
  { id:'vrpn' as const,callNodeId:'call-vrpn',childRunId:'vrpn-child',definitionId:'vrpn-client-ros1' },
];

function totalRunBindings() {
  return Object.fromEntries(totalRunServices.map((service) => [service.id,{
    automationResourceId:'ros-panel',actionId:service.id,
  }]));
}

function totalRunRuntime():ExperimentProcessRuntimeProjection {
  const value = runtime(totalRunServices.map((service) => process(
    `${service.id}-process`,service.definitionId,service.childRunId,'running','passing','orchestration-run',
  )));
  value.runSummaries = [
    run('root-run','system-runner','run'),
    panelWorkflowRun('panel-run','root-run'),
    ...totalRunServices.map((service) => ({
      ...run(service.childRunId,`${service.id}-automation`,'start-from-ros-control'),
      parentRunId:'panel-run',rootRunId:'root-run',status:'waiting' as const,
    })),
  ];
  value.runDetailsById = {
    'panel-run':{
      invocations:[],nodeSummaries:[],loading:false,error:'',
      relations:{
        runId:'panel-run',
        childRuns:totalRunServices.map((service,index) => childRelation(service.callNodeId,service.childRunId,index)),
        childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      },
    },
  };
  return value;
}

function panelWorkflowRun(
  id:string,
  parentRunId:string,
  actionId:'start-for-experiment'|'start-all'='start-for-experiment',
) {
  return {
    ...run(id,'ros-panel',actionId),
    parentRunId,rootRunId:parentRunId,status:'waiting' as const,
    sourceKind:'automation' as const,
    sourceRef:{
      domain:'automation' as const,resourceId:'ros-panel',branch:'main',
      commitId:'commit-1',version:1,digest:'a'.repeat(64),
    },
  };
}

function childRelation(callNodeId:string,childRunId:string,ordinal:number,parentRunId='panel-run') {
  return {
    id:`rel-${callNodeId}`,targetId:'local',rootRunId:'root-run',parentRunId,
    parentInvocationId:`invoke-${callNodeId}`,callNodeId,ordinal,childRunId,ownerRunId:'panel-run',
    childDefinitionId:`${callNodeId}-automation`,childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
    childDefinitionDigest:'d'.repeat(64),triggerNodeId:'trigger',relation:'supervised' as const,
    waitPolicy:'wait' as const,cancelPolicy:'cascade' as const,resultPolicy:'propagate' as const,
    createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:'waiting' as const,runRevision:1,revision:1,
  };
}
