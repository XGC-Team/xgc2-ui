// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { newAutomationSpec,newAutomationNode,type AutomationDocument,type AutomationRun,type AutomationRunSummaryView,type AutomationRunDetail } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { definePanelPlugin,type PanelActionInvocation } from '../../../panels/types';
import { SYSTEM_EXPERIMENT_RUNNER } from '../experimentWorkflowService';
import { createPanelContext,type PanelContextActions } from './panelContextFactory';
import { testPanelExecution } from '../../../test/panelExecutionTestSupport';

const plugin=definePanelPlugin({
  id:'lifecycle-regression',name:'Lifecycle',category:'Custom',description:'',
  capabilities:['experiment'] as const,component:() => null,
  actionPorts:[{ id:'run',label:'Run',required:true }],
});
type AutomationChildRunRelation=NonNullable<AutomationRunDetail['relations']>['childRuns'][number];
const at='2026-09-18T00:00:00Z';
function resource(domain:string,resourceId:string) {
  return {
    head:{ domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:at,updatedAt:at },
    branch:{ domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:at,updatedAt:at },
  };
}
function experiment():ExperimentDocument {
  const spec=newExperimentSpec({ name:'Experiment',runModes:['simulation'] });
  spec.workflowInstances=[{ id:'worker',ref:{ domain:'automation',resourceId:'worker',branch:'main' },actionPresets:[{ id:'default',actionId:'run',inputs:{},parameterBindings:[] }] }];
  return { ...resource('experiment','experiment-a'),spec };
}
function document():AutomationDocument {
  const spec=newAutomationSpec('Worker');
  spec.actions[0]!.kind='service';
  spec.actions[0]!.controls=['stop','restart'];
  spec.actions[0]!.inputSchema.fields=[{ name:'runMode',kind:'string' }];
  return { ...resource('automation','worker'),spec };
}
function panel():PanelInstance {
  return { id:'panel',pluginId:plugin.id,title:'Panel',gridPos:{ x:0,y:0,w:4,h:4 },query:{},options:{},fieldConfig:{},portBindings:[
    { portId:'workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:false,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'run',kind:'action',presetId:'default' },
  ] };
}
function root(id='invoke',status:AutomationRunSummaryView['status']='waiting',actionId='invoke-panel-action'):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId,actionVersion:1,
    sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
    experimentSelector:{ runMode:'simulation',panelId:'panel',...(actionId==='invoke-panel-action' ? { presetId:'default' } : {}) },
    rootRunId:id,status,revision:2,createdAt:at,updatedAt:at,
  };
}
function child(id='child',parent='invoke',status:AutomationRunSummaryView['status']='waiting',revision=4):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'worker',actionId:'run',actionVersion:1,
    sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:'worker',branch:'main',commitId:'worker-commit',version:1,digest:'e'.repeat(64) },
    parentRunId:parent,rootRunId:parent,status,revision,createdAt:at,updatedAt:at,
  };
}
function relation(parent='invoke',id='child'):AutomationChildRunRelation {
  return {
    id:`link-${id}`,targetId:'local',rootRunId:parent,parentRunId:parent,parentInvocationId:'call',callNodeId:'invoke-selected-action',ordinal:0,
    childRunId:id,ownerRunId:parent,childDefinitionId:'worker',childDefinitionVersion:1,
    childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'e'.repeat(64),triggerNodeId:'trigger',
    relation:'attached',waitPolicy:'wait',cancelPolicy:'cascade',resultPolicy:'reference',boundAt:at,createdAt:at,updatedAt:at,
    runStatus:'waiting',runRevision:4,revision:1,
  };
}
function detail(runId:string,run?:AutomationRunSummaryView,childRuns:AutomationChildRunRelation[]=[]):AutomationRunDetail {
  return { ...(run ? { run:{ ...run,parameters:{ runMode:'simulation' } } as unknown as AutomationRun } : {}),
    invocations:[],nodeSummaries:[],loading:false,error:'',
    relations:{ runId,childRuns,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[] },
  };
}
function host(runSummaries:AutomationRunSummaryView[]=[],runDetailsById:Record<string,AutomationRunDetail>={}):PanelContextActions {
  return {
    experiment:experiment(),
    automation:{ targetId:'local',documents:[document()],catalog:[],runSummaries,runDetailsById,loading:false,error:'' } as unknown as PanelContextActions['automation'],
    execution:testPanelExecution(runDetailsById),
    experimentLifecycle:{ runMode:'simulation',start:async () => undefined,stop:async () => undefined },
  };
}
function port(value:PanelContextActions) { return createPanelContext(plugin,panel(),{},value).ports.actions.run!; }
function totalFallback(value:PanelContextActions) {
  value.experimentLifecycle.activeRun={ id:'total',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId:'run',runMode:'simulation',rootRunId:'total',status:'waiting',revision:7,createdAt:at,updatedAt:at,workflowTargets:[] };
  value.experimentLifecycle.panelWorkflowInvocationFallback={ id:'child',rootRunId:'total',targetId:'local',status:'waiting',revision:3 };
}

test('Total Run fallback cannot resurrect a child stopped in newer retained details', () => {
  const value=host([child('child','total')],{ child:detail('child',child('child','total','stopped',8)) });
  totalFallback(value);
  assert.equal(port(value).activeInvocation,undefined);
});

test('restored details remain authoritative when the bounded history omits the child', () => {
  const value=host([],{ child:detail('child',child('child','total','stopped',8)) });
  totalFallback(value);
  assert.equal(port(value).activeInvocation,undefined);
});

test('stale active child relation cannot override a terminal child summary', () => {
  const value=host([root('invoke','succeeded'),child('child','invoke','stopped',8)],{ invoke:detail('invoke',undefined,[relation()]) });
  assert.equal(port(value).activeInvocation,undefined);
});

test('stale active child relation cannot return a terminal detail as activeInvocation', () => {
  const value=host([root('invoke','succeeded')],{ invoke:detail('invoke',undefined,[relation()]),child:detail('child',child('child','invoke','stopped',8)) });
  assert.equal(port(value).activeInvocation,undefined);
});

test('newer child Run fact in a relation wins over older retained child details', () => {
  const value=host([root('invoke','succeeded')],{ invoke:detail('invoke',undefined,[{ ...relation(),runStatus:'stopping',runRevision:8 }]),child:detail('child',child()) });
  assert.deepEqual(port(value).activeInvocation,{ id:'child',status:'stopping',revision:8 });
});

test('a later failed command does not release another active Run with the same preset', () => {
  const failed={ ...root('failed','failed'),createdAt:'2026-09-19T00:00:00Z',updatedAt:'2026-09-19T00:00:00Z' };
  assert.equal(port(host([root(),child(),failed])).activeInvocation?.id,'child');
});

test('another target cannot contribute a child to the current Panel', () => {
  const value=host([root('invoke','succeeded')],{ invoke:detail('invoke',undefined,[{ ...relation(),targetId:'remote' }]) });
  assert.equal(port(value).activeInvocation,undefined);
});

test('Stop and Restart resolve the same dedicated Panel owner and preserve declared runMode', async () => {
  for (const actionId of ['run-panel','invoke-panel-action']) {
    const value=host([root('invoke','waiting',actionId),child()]);
    const stopped:PanelActionInvocation[]=[];
    const invoked:unknown[][]=[];
    value.experimentLifecycle.stopAction=async target => { stopped.push(target); };
    value.experimentLifecycle.invokeAction=async (...args) => { invoked.push(args);return { id:'next',status:'accepted',revision:1 }; };
    const action=port(value);
    await action.control({ id:'child',status:'waiting',revision:4 },'stop','Stop panel');
    await action.control({ id:'child',status:'waiting',revision:4 },'restart','Restart panel');
    assert.deepEqual(stopped.map(run => run.id),['invoke','invoke']);
    assert.deepEqual(invoked,[['panel','default',{ runMode:'simulation' },'Restart panel']]);
  }
});

test('Panel Stop under Total Run never widens to the Total Run or a sibling', async () => {
  const full={ ...root('total','waiting','run'),experimentSelector:{ runMode:'simulation' } };
    const value=host([full,child('child','total'),child('sibling','total')]);
  const stopped:string[]=[];
  value.experimentLifecycle.stopAction=async target => { stopped.push(target.id); };
  await port(value).control({ id:'child',status:'waiting',revision:4 },'stop','Stop child');
  assert.deepEqual(stopped,['child']);
});

test('Restart never submits a new Run after Stop reports a failure', async () => {
  const value=host([root(),child()]);
  let submitted=false;
  value.experimentLifecycle.stopAction=async () => { throw new Error('cleanup failed'); };
  value.experimentLifecycle.invokeAction=async () => { submitted=true;return { id:'next',status:'accepted',revision:1 }; };
  await assert.rejects(port(value).control({ id:'child',status:'waiting',revision:4 },'restart','Restart'),/cleanup failed/);
  assert.equal(submitted,false);
});

test('a ready process must not hide a failed owning Run', () => {
  const failed={ ...root('failed','failed'),automationResourceId:'worker',actionId:'run' };
  const value=host([failed]);
  const doc=document();
  doc.spec.nodes=[doc.spec.nodes[0]!];
  doc.spec.edges=[];
  value.automation.documents=[doc];
  value.executionRuntime={ targetId:'local',loading:false,error:'',processInstances:[{
    id:'owned',targetId:'local',definitionId:'algorithm',definitionVersion:'1',definitionDigest:'a'.repeat(64),ownerType:'orchestration-run',ownerId:'failed',scope:'run',parameters:{},driver:'host',
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },revision:1,restartCount:0,createdAt:at,updatedAt:at,
  }] };
  assert.equal(port(value).serviceStatus?.state,'degraded');
});

test('late System Runner node summaries never replace the authored Action progress graph', () => {
  const value=host([root()]);
  const doc=document();
  const first={ ...newAutomationNode('wait.process',{},'first',1),id:'first' };
  const second={ ...newAutomationNode('wait.process',{},'second',1),id:'second' };
  doc.spec.nodes=[doc.spec.nodes[0]!,first,second];
  doc.spec.edges=[{ id:'one',from:doc.spec.nodes[0]!.id,to:'first',condition:'success' },{ id:'two',from:'first',to:'second',condition:'success' }];
  value.automation.documents=[doc];
  const pendingRelation=relation();
  delete pendingRelation.runStatus;delete pendingRelation.runRevision;
  const childDetail=detail('child');
  childDetail.nodeSummaries=[{ runId:'child',nodeId:'first',kind:'wait.process',status:'waiting',occurrenceCount:1,activeOccurrenceCount:1,completedOccurrenceCount:0,failedOccurrenceCount:0,attemptCount:1,updatedAt:at,revision:1 }];
  const ownerDetail=detail('invoke',undefined,[pendingRelation]);
  value.automation.runDetailsById={ invoke:ownerDetail,child:childDetail };
  const before=port(value).serviceStatus;
  ownerDetail.nodeSummaries=[...childDetail.nodeSummaries.map(node => ({ ...node,runId:'invoke' })),{ ...childDetail.nodeSummaries[0]!,runId:'invoke',nodeId:'second' }];
  const after=port(value).serviceStatus;
  assert.deepEqual(after,before);
  assert.equal(after?.total,2);
  assert.equal(after?.ready,1);
});


test('a terminal embedded child fact removes an older active candidate under a waiting owner', () => {
  const value=host([root(),child()],{ invoke:detail('invoke',undefined,[{ ...relation(),runStatus:'stopped',runRevision:8 }]) });
  assert.deepEqual(port(value).activeInvocation,{ id:'invoke',status:'waiting',revision:2 });
});

test('a terminal full-Run fallback is never exposed as activeInvocation', () => {
  const value=host();
  totalFallback(value);
  value.experimentLifecycle.panelWorkflowInvocationFallback!.status='stopped';
  assert.equal(port(value).activeInvocation,undefined);
});

test('a full child Run remains occupied when an older link has not observed binding yet', () => {
  const unbound=relation();delete unbound.boundAt;delete unbound.runStatus;delete unbound.runRevision;
  const value=host([root('invoke','succeeded'),child()],{ invoke:detail('invoke',undefined,[unbound]) });
  assert.equal(port(value).activeInvocation?.id,'child');
});
