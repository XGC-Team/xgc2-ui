// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { AutomationSpec } from '../../domains/automation/automationPublic';
import type { ExperimentProcessRuntimeProjection } from '../../domains/experiment/experimentPublic';
import { RobotSimulationWorkflow } from './RobotSimulationWorkflow';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver',ResizeObserverStub);

describe('RobotSimulationWorkflow',() => {
  it('renders the bound Panel Workflow snapshot without a count-specific simulation DAG',() => {
    render(<RobotSimulationWorkflow panelId="robots" runtime={runtime()} workflowResourceId="robot-panel" />);
    expect(document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="loop-assets"]'))
      .toHaveAttribute('data-xgc-kind','control.foreach');
    expect(document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="call-robot"]'))
      .toHaveAttribute('data-xgc-kind','automation.call-bound-each');
    expect(document.querySelector('[data-xgc-role="robot-simulation-workflow-view"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-kind="process.run-definition"]')).toBeNull();
  });
});

function runtime():ExperimentProcessRuntimeProjection {
  const definition:AutomationSpec = {
    schemaVersion:11,metadata:{ name:'Robot Panel Workflow',description:'',tags:[] },
    targetPolicy:{ mode:'inherit',executionTargetId:'' },actions:[],stickyNotes:[],
    nodes:[node('trigger','trigger.automation-call'),node('loop-assets','control.foreach'),node('call-robot','automation.call-bound-each')],
    edges:[
      { id:'a',from:'trigger',to:'loop-assets',condition:'success' },
      { id:'b',from:'loop-assets',to:'call-robot',condition:'success' },
    ],
  };
  return {
    targetId:'local',loading:false,error:'',processInstances:[],documents:[],
    catalog:definition.nodes.map((item) => ({ kind:item.kind,typeVersion:1,label:item.id,category:'test',traits:[],parameterSchema:{} })),
    runSummaries:[{
      id:'robot-run',targetId:'local',automationResourceId:'robot-panel',actionId:'run',actionVersion:1,status:'running',revision:1,
      sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
      parentRunId:'root-run',rootRunId:'root-run',createdAt:'t',updatedAt:'t',
    }],
    runDetailsById:{ 'robot-run':{
      invocations:[],nodeSummaries:[],loading:false,error:'',snapshot:{ automationSpec:definition },
    } as unknown as ExperimentProcessRuntimeProjection['runDetailsById'][string] },
    activeRun:{
      id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'system-runner',actionId:'run',runMode:'mixed',status:'running',revision:1,
      rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'robots',automationRef:{ domain:'automation',resourceId:'robot-panel',branch:'main' },
        executionTargetId:'local',actionPresetIds:['run'],
      }],
    },
  };
}
function node(id:string,kind:string):AutomationSpec['nodes'][number] {
  return { id,displayName:id,kind,typeVersion:1,parameters:{},retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } };
}
