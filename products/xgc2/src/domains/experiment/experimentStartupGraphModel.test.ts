import { describe,expect,it } from 'vitest';
import type {
  AutomationDocument,
  AutomationNodeExecutionSummary,
  AutomationSpec,
} from '../automation/automationPublic';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import {
  EXPERIMENT_STARTUP_GRAPH_ALL,
  projectExperimentRunGraph,
  projectExperimentStartupGraph,
} from './experimentStartupGraphModel';

describe('Experiment Automation graph projection',() => {
  it('renders the immutable System Runner nodes and exact authored edges without a generated Process DAG',() => {
    const value = runtime();
    const graph = projectExperimentStartupGraph(value);
    expect(graph.nodes.map((node) => node.id)).toEqual(['trigger','read-panels','call-panels']);
    expect(graph.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual([
      'trigger->read-panels','read-panels->call-panels',
    ]);
    expect(graph.nodes.some((node) => node.kind === 'process.run-definition')).toBe(false);
    expect(graph.nodeSummaries.map((summary) => summary.status)).toEqual([
      'succeeded','succeeded','waiting',
    ]);
    expect(graph.nodeRuntimeFacts['call-panels']?.status).toBe('running');
    expect(graph.activeRuntimeNodeIds).toContain('call-panels');
    expect(graph.executionRunId).toBe('root-run');
    expect(graph.degraded).toBe(false);
  });

  it('selects an authored Panel Workflow and only uses its exact execution detail',() => {
    const value = runtime();
    const graph = projectExperimentStartupGraph(value,'panel-workflow',['panel-workflow']);
    expect(graph.selectedId).toBe('panel-workflow');
    expect(graph.nodes.map((node) => node.id)).toEqual(['panel-trigger','start-process']);
    expect(graph.edges).toEqual([expect.objectContaining({ from:'panel-trigger',to:'start-process' })]);
    expect(graph.executionRunId).toBe('panel-run');
    expect(graph.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value:EXPERIMENT_STARTUP_GRAPH_ALL,label:'Experiment runner · running' }),
      expect.objectContaining({ value:'panel-workflow',group:'Panel workflows' }),
    ]));
  });

  it('selects one exact descendant Run instead of the latest Run for its workflow',() => {
    const value = runtime();
    const older = spec('Older ROS Core',[node('older-trigger','trigger.automation-call')],[]);
    const current = spec('Current ROS Core',[node('current-trigger','trigger.automation-call')],[]);
    value.runSummaries.push(
      { ...run('ros-core-old','ros-core-workflow'),rootRunId:'root-run',parentRunId:'panel-run',updatedAt:'t1' },
      { ...run('ros-core-current','ros-core-workflow'),rootRunId:'root-run',parentRunId:'panel-run',updatedAt:'t2',revision:2 },
    );
    value.runDetailsById['ros-core-old'] = detail('ros-core-old',older,[
      summary('ros-core-old','older-trigger','trigger.automation-call','waiting'),
    ]);
    value.runDetailsById['ros-core-current'] = detail('ros-core-current',current,[
      summary('ros-core-current','current-trigger','trigger.automation-call','waiting'),
    ]);
    const graph = projectExperimentRunGraph(value,{
      runId:'ros-core-old',automationResourceId:'ros-core-workflow',
    });
    expect(graph.executionRunId).toBe('ros-core-old');
    expect(graph.nodes.map((item) => item.id)).toEqual(['older-trigger']);
    expect(graph.selectedId).toBe('ros-core-old');
    expect(graph.options).toEqual([]);
  });

  it('states when an active Run snapshot is missing instead of fabricating a graph',() => {
    const value = runtime();
    delete value.runDetailsById['panel-run'];
    value.documents = [];
    const graph = projectExperimentStartupGraph(value,'panel-workflow',['panel-workflow']);
    expect(graph.empty).toBe(true);
    expect(graph.degraded).toBe(true);
    expect(graph.degradedReason).toContain('no immutable snapshot');
  });

  it('shows an idle authored Panel Workflow without pretending it executed',() => {
    const value = runtime();
    value.activeRun = undefined;
    value.runSummaries = [];
    value.runDetailsById = {};
    const graph = projectExperimentStartupGraph(value,'panel-workflow',['panel-workflow']);
    expect(graph.nodes.map((node) => node.id)).toEqual(['panel-trigger','start-process']);
    expect(graph.nodeSummaries).toEqual([]);
    expect(graph.executionRunId).toBe('');
    expect(graph.degraded).toBe(false);
  });
});

export function runtime():ExperimentProcessRuntimeProjection {
  const runner = spec('System Experiment Runner',[
    node('trigger','trigger.manual'),
    node('read-panels','asset.experiment-panels'),
    node('call-panels','automation.call-bound-each'),
  ],[
    edge('runner-a','trigger','read-panels'),
    edge('runner-b','read-panels','call-panels'),
  ]);
  const panel = spec('ROS Panel Workflow',[
    node('panel-trigger','trigger.automation-call'),
    node('start-process','process.run-definition'),
  ],[edge('panel-a','panel-trigger','start-process')]);
  return {
    targetId:'local',processInstances:[],documents:[document('system-runner',runner),document('panel-workflow',panel)],
    catalog:runner.nodes.concat(panel.nodes).map((item) => ({
      kind:item.kind,typeVersion:item.typeVersion,label:item.displayName,category:'test',traits:[],parameterSchema:{},
    })),
    loading:false,error:'',
    runSummaries:[
      run('root-run','system-runner'),
      { ...run('panel-run','panel-workflow'),rootRunId:'root-run',parentRunId:'root-run' },
    ],
    runDetailsById:{
      'root-run':detail('root-run',runner,[
        summary('root-run','trigger','trigger.manual','succeeded'),
        summary('root-run','read-panels','asset.experiment-panels','succeeded'),
        summary('root-run','call-panels','automation.call-bound-each','waiting'),
      ]),
      'panel-run':detail('panel-run',panel,[
        summary('panel-run','panel-trigger','trigger.automation-call','succeeded'),
        summary('panel-run','start-process','process.run-definition','running'),
      ]),
    },
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'any-mode',status:'running',revision:1,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'ros-panel',automationRef:{ domain:'automation',resourceId:'panel-workflow',branch:'main' },
        executionTargetId:'local',actionPresetIds:['run'],
      }],
    },
  };
}

function spec(name:string,nodes:AutomationSpec['nodes'],edges:AutomationSpec['edges']):AutomationSpec {
  return {
    schemaVersion:11,metadata:{ name,description:'',tags:[] },targetPolicy:{ mode:'inherit',executionTargetId:'' },
    actions:[],nodes,edges,stickyNotes:[],
  };
}
function node(id:string,kind:string):AutomationSpec['nodes'][number] {
  return {
    id,displayName:id,kind,typeVersion:1,parameters:{},
    retry:{ maxAttempts:1,initialBackoff:1_000_000_000,maxBackoff:1_000_000_000 },
  };
}
function edge(id:string,from:string,to:string):AutomationSpec['edges'][number] {
  return { id,from,to,condition:'success' };
}
function document(resourceId:string,value:AutomationSpec):AutomationDocument {
  return { head:{ resourceId },branch:{ name:'main' },spec:value } as AutomationDocument;
}
function run(id:string,automationResourceId:string) {
  return {
    id,targetId:'local',automationResourceId,actionId:'run',actionVersion:1,status:'running' as const,
    sourceKind:'experiment' as const,sourceRef:{ domain:'experiment' as const,resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
    revision:1,rootRunId:id,createdAt:'t',updatedAt:'t',
  };
}
function detail(runId:string,automationSpec:AutomationSpec,nodeSummaries:AutomationNodeExecutionSummary[]) {
  return {
    invocations:[],nodeSummaries,loading:false,error:'',snapshot:{ automationSpec },
  } as unknown as ExperimentProcessRuntimeProjection['runDetailsById'][string];
}
function summary(
  runId:string,nodeId:string,kind:string,status:AutomationNodeExecutionSummary['status'],
):AutomationNodeExecutionSummary {
  return {
    runId,nodeId,kind,status,occurrenceCount:1,activeOccurrenceCount:status === 'running' || status === 'waiting' ? 1:0,
    completedOccurrenceCount:status === 'succeeded' ? 1:0,failedOccurrenceCount:status === 'failed' ? 1:0,
    attemptCount:1,updatedAt:'t',revision:1,
  };
}
