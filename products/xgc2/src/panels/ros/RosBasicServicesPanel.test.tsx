// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type {
  AutomationChildRunRelation,
  AutomationDocument,
  AutomationRunDetail,
  AutomationSpec,
} from '../../domains/automation/automationPublic';
import {
  type ExperimentProcessRuntimeProjection,
  type PanelInstance,
} from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { RosBasicServicesPanel } from './RosBasicServicesPanel';
import {
  RosBasicServicesPanelFrameProvider,
  RosBasicServicesPanelHeaderActions,
  RosBasicServicesPanelHeaderLeading,
} from './RosBasicServicesPanelFrame';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const notificationMocks = vi.hoisted(() => ({ useError: vi.fn() }));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: notificationMocks.useError,
}));
vi.stubGlobal('ResizeObserver',ResizeObserverStub);

describe('ROS Control whiteboard',() => {
  beforeEach(() => notificationMocks.useError.mockClear());

  it('does not fall back to the System Runner when no current ROS Panel Run exists',() => {
    const panel = panelFixture();
    render(<RosBasicServicesPanelFrameProvider panel={panel}>
      <RosBasicServicesPanelHeaderLeading panel={panel} editing={false} />
      <RosBasicServicesPanelHeaderActions panel={panel} editing={false} />
      <RosBasicServicesPanel panel={panel} context={context()} />
    </RosBasicServicesPanelFrameProvider>);
    expect(document.querySelectorAll('[data-xgc-role="ros-basic-service-control"]')).not.toHaveLength(0);
    expect(document.querySelector('[data-xgc-role="ros-basic-services-run"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="ros-basic-services-stop"]')).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name:'Whiteboard' }));
    expect(document.querySelector('[data-xgc-role="ros-basic-services-whiteboard-view"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-role="experiment-startup-graph"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="experiment-startup-graph-state"]')).toHaveTextContent('No Panel Workflow Run');
    expect(screen.queryByLabelText('Run')).toBeNull();
    expect(screen.queryByLabelText('Start managed panels')).toBeNull();
    expect(screen.queryByLabelText('ROS master')).toBeNull();
    expect(screen.queryByLabelText('Gazebo server')).toBeNull();
    expect(document.querySelector('[data-xgc-role="panel-workflow-run-tree"]')).toBeNull();
  });

  it('shows only the recursive ROS Panel Run closure and selects exact descendant snapshots',() => {
    const panel = panelFixture();
    render(<RosBasicServicesPanelFrameProvider panel={panel}>
      <RosBasicServicesPanelHeaderLeading panel={panel} editing={false} />
      <RosBasicServicesPanelHeaderActions panel={panel} editing={false} />
      <RosBasicServicesPanel panel={panel} context={recursiveContext()} />
    </RosBasicServicesPanelFrameProvider>);
    fireEvent.click(screen.getByRole('button',{ name:'Whiteboard' }));
    const selector = screen.getByRole('button',{ name:'ROS Control workflow' });
    fireEvent.click(selector);

    expect(screen.getAllByRole('option')).toHaveLength(5);
    expect(screen.getByRole('option',{ name:/ROS Control Panel · start-for-experiment · local · waiting/ })).toBeInTheDocument();
    expect(screen.getByRole('option',{ name:/Start ROS · start-ros · local · running/ })).toHaveTextContent('↳');
    const rosCoreOption = screen.getByRole('option',{ name:/ROS Core · start-ros-core · local · waiting/ });
    expect(rosCoreOption).toHaveTextContent('↳ ↳');
    expect(screen.getByRole('option',{ name:/ROS Core Process · start-provider · local · running/ }))
      .toHaveTextContent('↳ ↳ ↳');
    expect(screen.getByRole('option',{ name:/ROS Control Panel · start-service · local · running/ }))
      .toHaveTextContent('↳ ↳ ↳ ↳');
    expect(screen.queryByRole('option',{ name:/Experiment runner|Sibling Panel/ })).toBeNull();

    const whiteboard = document.querySelector('[data-xgc-role="ros-basic-services-whiteboard-view"]');
    expect(document.querySelector('[data-xgc-role="panel-workflow-run-tree"]')).toBeNull();
    expect(whiteboard).not.toHaveTextContent('start-for-experiment');
    expect(whiteboard).not.toHaveTextContent('call-gzserver');
    expect(whiteboard).not.toHaveTextContent('Sibling Panel');
    expect(whiteboard).not.toHaveTextContent('System Experiment Runner');

    fireEvent.click(rosCoreOption);
    expect(document.querySelector('[data-xgc-role="ros-basic-services-whiteboard-controls"]'))
      .toHaveAttribute('data-xgc-selected','ros-core-run');
    expect(document.querySelector('[data-xgc-role="experiment-startup-graph"]'))
      .toHaveAttribute('data-xgc-selected','ros-core-run');
    expect(document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="ros-core-node"]')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="automation-node"][data-xgc-id="panel-node"]')).toBeNull();
  });

  it('routes action failures to the right notification host instead of inline panel copy', async () => {
    const failingContext = context();
    const failingPort = actionPort('roscore');
    failingPort.invoke = vi.fn().mockRejectedValue(new Error('ROS master failed to start'));
    (failingContext.ports.actions as Record<string,PanelActionPortRuntime>).roscore = failingPort;

    render(<RosBasicServicesPanelFrameProvider panel={panelFixture()}>
      <RosBasicServicesPanelHeaderLeading panel={panelFixture()} editing={false} />
      <RosBasicServicesPanelHeaderActions panel={panelFixture()} editing={false} />
      <RosBasicServicesPanel panel={panelFixture()} context={failingContext} />
    </RosBasicServicesPanelFrameProvider>);

    fireEvent.click(screen.getByRole('button',{ name:'Controls' }));
    fireEvent.click(screen.getByRole('button',{ name:/ROS.*start service/i }));
    await waitFor(() => expect(notificationMocks.useError).toHaveBeenLastCalledWith(
      'local',
      'ROS master failed to start',
      expect.objectContaining({ title:'ROS Control',source:'ros-control' }),
    ));
    expect(document.querySelector('[data-xgc-role="ros-basic-services-error"]')).toBeNull();
  });
});

function panelFixture():PanelInstance {
  return { id:'ros-control',pluginId:'ros-basic-services-control',title:'ROS Control',gridPos:{ x:0,y:0,w:10,h:5 },
    query:{},options:{},fieldConfig:{},portBindings:[] };
}

function context():PanelPluginContext {
  const automationSpec:AutomationSpec = {
    schemaVersion:11,metadata:{ name:'System Experiment Runner',description:'',tags:[] },
    targetPolicy:{ mode:'inherit',executionTargetId:'' },actions:[],stickyNotes:[],
    nodes:[
      { id:'trigger',displayName:'Run',kind:'trigger.manual',typeVersion:1,parameters:{},retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } },
      { id:'call-panels',displayName:'Start managed panels',kind:'automation.call-bound-each',typeVersion:1,parameters:{},retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } },
    ],edges:[{ id:'edge',from:'trigger',to:'call-panels',condition:'success' }],
  };
  return { ports:{
    actions:{
      roscore:actionPort('roscore'),
      gzserver:actionPort('gzserver'),
    },
    data:{ 'service-health':{ id:'service-health',label:'Health',contract:'experiment.runtime.v1',connected:true,value:{
      targetId:'local',loading:false,error:'',processInstances:[],documents:[],catalog:automationSpec.nodes.map((node) => ({
        kind:node.kind,typeVersion:1,label:node.displayName,category:'test',traits:[],parameterSchema:{},
      })),runSummaries:[{
        id:'root-run',targetId:'local',automationResourceId:'system-runner',actionId:'run',actionVersion:1,status:'running',revision:1,
        sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'a'.repeat(64) },
        rootRunId:'root-run',createdAt:'t',updatedAt:'t',
      }],runDetailsById:{ 'root-run':{
        invocations:[],loading:false,error:'',snapshot:{ automationSpec },nodeSummaries:[
          summary('trigger','trigger.manual','succeeded'),summary('call-panels','automation.call-bound-each','waiting'),
        ],
      } },
      activeRun:{
        id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
        automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'running',revision:1,
        rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[],
      },
    },trace:{} } },
    authoring:{},interactions:{},
  } };
}

function actionPort(id:string):PanelActionPortRuntime {
  return { id,label:id,connected:true,disabledReason:'',
    action:{ id,label:id,kind:'service',controls:['stop'] },defaults:{},
    invoke:vi.fn(async () => ({ id:`run-${id}`,status:'running' as const,revision:1 })),control:vi.fn(),
    trace:{ automationResourceId:'ros-panel',actionId:id } };
}

function recursiveContext():PanelPluginContext {
  const value = context();
  const runtime = value.ports.data['service-health']!.value as ExperimentProcessRuntimeProjection;
  const definitions = {
    root:workflowSpec('System Experiment Runner','root-node'),
    panel:workflowSpec('ROS Control Panel','panel-node'),
    startRos:workflowSpec('Start ROS','start-ros-node'),
    rosCore:workflowSpec('ROS Core','ros-core-node'),
    provider:workflowSpec('ROS Core Process','provider-node'),
    sibling:workflowSpec('Sibling Panel','sibling-node'),
  };
  runtime.documents = [
    workflowDocument('system-runner',definitions.root),
    workflowDocument('ros-panel',definitions.panel),
    workflowDocument('start-ros-workflow',definitions.startRos),
    workflowDocument('ros-core-workflow',definitions.rosCore),
    workflowDocument('ros-provider-workflow',definitions.provider),
    workflowDocument('sibling-workflow',definitions.sibling),
  ];
  runtime.catalog = Object.values(definitions).flatMap((definition) => definition.nodes.map((node) => ({
    kind:node.kind,typeVersion:node.typeVersion,label:node.displayName,category:'test',traits:[],parameterSchema:{},
  })));
  runtime.runSummaries = [
    workflowRun('root-run','system-runner','run','running'),
    workflowRun('panel-run','ros-panel','start-for-experiment','waiting','root-run','root-run'),
    workflowRun('start-ros-run','start-ros-workflow','start-ros','running','panel-run','root-run'),
    workflowRun('ros-core-run','ros-core-workflow','start-ros-core','waiting','start-ros-run','root-run'),
    workflowRun('provider-run','ros-provider-workflow','start-provider','running','ros-core-run','root-run'),
    { ...workflowRun('same-automation-action-run','ros-panel','start-service','running','provider-run','root-run'),
      revision:20,updatedAt:'z' },
    workflowRun('sibling-run','sibling-workflow','run','running','root-run','root-run'),
  ];
  runtime.runDetailsById = {
    'root-run':workflowDetail('root-run',definitions.root,[]),
    'panel-run':workflowDetail('panel-run',definitions.panel,[
      workflowChild('start-ros-run','panel-run','start-ros-workflow','call-start-ros','running'),
    ]),
    'start-ros-run':workflowDetail('start-ros-run',definitions.startRos,[
      workflowChild('ros-core-run','start-ros-run','ros-core-workflow','call-ros-core','waiting'),
    ]),
    'ros-core-run':workflowDetail('ros-core-run',definitions.rosCore,[
      workflowChild('provider-run','ros-core-run','ros-provider-workflow','call-provider','running'),
    ]),
    'provider-run':workflowDetail('provider-run',definitions.provider,[
      workflowChild('same-automation-action-run','provider-run','ros-panel','call-service','running'),
    ]),
    'same-automation-action-run':workflowDetail('same-automation-action-run',definitions.panel,[]),
    'sibling-run':workflowDetail('sibling-run',definitions.sibling,[]),
  };
  runtime.activeRun = {
    id:'root-run',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
    automationResourceId:'system-runner',actionId:'run',runMode:'simulation',status:'running',revision:1,
    rootRunId:'root-run',createdAt:'t',updatedAt:'t',workflowTargets:[{
      workflowInstanceId:'ros-control',automationRef:{ domain:'automation',resourceId:'ros-panel',branch:'main' },
      executionTargetId:'local',actionPresetIds:['start-for-experiment'],
    }],
  };
  return value;
}

function workflowSpec(name:string,nodeId:string):AutomationSpec {
  return {
    schemaVersion:11,metadata:{ name,description:'',tags:[] },targetPolicy:{ mode:'inherit',executionTargetId:'' },
    actions:[],stickyNotes:[],nodes:[{
      id:nodeId,displayName:name,kind:'trigger.automation-call',typeVersion:1,parameters:{},
      retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 },
    }],edges:[],
  };
}

function workflowDocument(resourceId:string,spec:AutomationSpec):AutomationDocument {
  return { head:{ resourceId },branch:{ name:'main' },spec } as AutomationDocument;
}

function workflowRun(
  id:string,
  automationResourceId:string,
  actionId:string,
  status:'running'|'waiting',
  parentRunId?:string,
  rootRunId=id,
) {
  return {
    id,targetId:'local',automationResourceId,actionId,actionVersion:1,status,revision:1,
    sourceKind:'automation' as const,
    sourceRef:{ domain:'automation' as const,resourceId:automationResourceId,branch:'main',commitId:`commit-${id}`,version:1,digest:'a'.repeat(64) },
    ...(parentRunId ? { parentRunId } : {}),rootRunId,createdAt:'t',updatedAt:'t',
  };
}

function workflowDetail(
  runId:string,
  automationSpec:AutomationSpec,
  childRuns:AutomationChildRunRelation[],
):AutomationRunDetail {
  const sourceRef = {
    domain:'automation' as const,resourceId:runId,branch:'main',commitId:`commit-${runId}`,
    version:1,digest:'a'.repeat(64),
  };
  return {
    invocations:[],loading:false,error:'',snapshot:{
      runId,targetId:'local',sourceKind:'automation',sourceRef,automationRef:sourceRef,
      assetContext:{ schemaVersion:1 },automationSpec,definitionDigest:'d'.repeat(64),
      digest:'e'.repeat(64),createdAt:'t',
    },nodeSummaries:[{
      runId,nodeId:automationSpec.nodes[0]!.id,kind:automationSpec.nodes[0]!.kind,status:'waiting',
      occurrenceCount:1,activeOccurrenceCount:1,completedOccurrenceCount:0,failedOccurrenceCount:0,
      attemptCount:1,updatedAt:'t',revision:1,
    }],relations:{
      runId,childRuns,childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    },
  };
}

function workflowChild(
  childRunId:string,
  parentRunId:string,
  childDefinitionId:string,
  callNodeId:string,
  runStatus:'running'|'waiting',
):AutomationChildRunRelation {
  return {
    id:`relation-${childRunId}`,targetId:'local',rootRunId:'root-run',parentRunId,
    parentInvocationId:`invocation-${childRunId}`,callNodeId,ordinal:0,childRunId,ownerRunId:parentRunId,
    childDefinitionId,childDefinitionVersion:1,childConfigDigest:'a'.repeat(64),
    childExecutionPlanDigest:'b'.repeat(64),childRegistryDigest:'c'.repeat(64),
    childDefinitionDigest:'d'.repeat(64),triggerNodeId:'called',relation:'supervised',waitPolicy:'wait',
    cancelPolicy:'cascade',resultPolicy:'propagate',createdAt:'t',updatedAt:'t',boundAt:'t',
    runStatus,runRevision:1,revision:1,
  };
}
function summary(nodeId:string,kind:string,status:'succeeded'|'waiting') {
  return {
    runId:'root-run',nodeId,kind,status,occurrenceCount:1,activeOccurrenceCount:status === 'waiting' ? 1:0,
    completedOccurrenceCount:status === 'succeeded' ? 1:0,failedOccurrenceCount:0,attemptCount:1,updatedAt:'t',revision:1,
  };
}
