// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationSpec } from '../automation/automationPublic';
import { ExperimentStartupGraphView } from './ExperimentStartupGraphView';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver',ResizeObserverStub);

describe('ExperimentStartupGraphView',() => {
  it('renders the exact Automation snapshot and execution summary',() => {
    render(<ExperimentStartupGraphView panelId="ros-control" runtime={runtime()} />);
    const trigger = document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="trigger"]');
    const call = document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="call-panels"]');
    expect(trigger).toHaveAttribute('data-xgc-kind','trigger.manual');
    expect(trigger).toHaveAttribute('data-xgc-status','passing');
    expect(call).toHaveAttribute('data-xgc-kind','automation.call-bound-each');
    expect(call).toHaveAttribute('data-xgc-status','running');
    expect(screen.getByText('passing')).toBeInTheDocument();
  });

  it('renders only the graph and zoom for a nonempty snapshot without degraded state or raw run tree',() => {
    const value = runtime();
    value.runSummaries = [
      value.runSummaries[0],
      {
        ...value.runSummaries[0],id:'panel-run',automationResourceId:'panel-workflow',
        parentRunId:'root-run',rootRunId:'root-run',actionId:'start-for-experiment',
      },
      {
        ...value.runSummaries[0],id:'sibling-run',automationResourceId:'other-panel',
        parentRunId:'root-run',rootRunId:'root-run',
      },
    ];
    value.runDetailsById['panel-run'] = {
      invocations:[],loading:false,error:'',nodeSummaries:[],
      snapshot:value.runDetailsById['root-run']!.snapshot,
      relations:{
        runId:'panel-run',childRuns:[{
          id:'rel-nested',targetId:'local',rootRunId:'root-run',parentRunId:'panel-run',
          parentInvocationId:'invoke',callNodeId:'call-nested',ordinal:0,childRunId:'nested-run',
          ownerRunId:'panel-run',childDefinitionId:'nested-workflow',childDefinitionVersion:1,
          childConfigDigest:'a'.repeat(64),childExecutionPlanDigest:'b'.repeat(64),
          childRegistryDigest:'c'.repeat(64),childDefinitionDigest:'d'.repeat(64),
          triggerNodeId:'trigger',relation:'supervised',waitPolicy:'wait',cancelPolicy:'cascade',
          resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',runStatus:'running',
          runRevision:1,revision:1,
        }],
        childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      },
    } as ExperimentProcessRuntimeProjection['runDetailsById'][string];
    value.activeRun = {
      ...value.activeRun!,
      workflowTargets:[{
        workflowInstanceId:'panel',automationRef:{ domain:'automation',resourceId:'panel-workflow',branch:'main' },
        executionTargetId:'local',actionPresetIds:['start-for-experiment'],
      }],
    };
    render(<ExperimentStartupGraphView
      panelId="ros-control"
      runtime={value}
      selectedId="panel-workflow"
      workflowResourceIds={['panel-workflow']}
    />);
    expect(document.querySelector('[data-xgc-role="experiment-startup-graph-state"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="panel-workflow-run-tree"]')).toBeNull();
    expect(screen.queryByText(/run-robots|target waiting|panel-run/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeInTheDocument();
  });

  it('states a missing immutable snapshot instead of drawing inferred nodes',() => {
    const value = runtime();
    value.runDetailsById = {};
    value.documents = [];
    render(<ExperimentStartupGraphView panelId="ros-control" runtime={value} />);
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-startup-graph-state"]'))
      .toHaveAttribute('data-state','degraded');
  });
});

function runtime():ExperimentProcessRuntimeProjection {
  const definition:AutomationSpec = {
    schemaVersion:11,metadata:{ name:'System runner',description:'',tags:[] },
    targetPolicy:{ mode:'inherit',executionTargetId:'' },actions:[],stickyNotes:[],
    nodes:[node('trigger','trigger.manual'),node('call-panels','automation.call-bound-each')],
    edges:[{ id:'edge',from:'trigger',to:'call-panels',condition:'success' }],
  };
  return {
    targetId:'local',processInstances:[],documents:[],loading:false,error:'',
    catalog:definition.nodes.map((item) => ({ kind:item.kind,typeVersion:1,label:item.id,category:'test',traits:[],parameterSchema:{} })),
    runSummaries:[{
      id:'root-run',targetId:'local',automationResourceId:'system-runner',actionId:'run',actionVersion:1,
      sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
      status:'running',revision:1,rootRunId:'root-run',createdAt:'t',updatedAt:'t',
    }],
    runDetailsById:{ 'root-run':{
      invocations:[],loading:false,error:'',snapshot:{ automationSpec:definition },nodeSummaries:[
        summary('trigger','trigger.manual','succeeded'),summary('call-panels','automation.call-bound-each','waiting'),
      ],
    } as unknown as ExperimentProcessRuntimeProjection['runDetailsById'][string] },
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'running',revision:1,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[],
    },
  };
}
function node(id:string,kind:string):AutomationSpec['nodes'][number] {
  return { id,displayName:id,kind,typeVersion:1,parameters:{},retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } };
}
function summary(nodeId:string,kind:string,status:'succeeded'|'waiting') {
  return {
    runId:'root-run',nodeId,kind,status,occurrenceCount:1,activeOccurrenceCount:status === 'waiting' ? 1:0,
    completedOccurrenceCount:status === 'succeeded' ? 1:0,failedOccurrenceCount:0,attemptCount:1,updatedAt:'t',revision:1,
  };
}
