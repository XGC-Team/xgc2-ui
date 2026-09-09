// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { newAutomationSpec,type AutomationDocument } from '../../domains/automation/automationPublic';
import { useExecutionTarget,type ProcessInstance } from '../../domains/execution/executionPublic';
import type * as ExecutionPublicModule from '../../domains/execution/executionPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { CameraIntrinsicCalibrationWorkspace } from './CameraIntrinsicCalibrationWorkspace';
import { CameraIntrinsicValidationWorkspace } from './CameraIntrinsicValidationWorkspace';
import {
  CameraIntrinsicCalibrationFrameProvider,
  CameraIntrinsicCalibrationHeaderActions,
} from './CameraIntrinsicCalibrationWorkspaceFrame';
import { intrinsicWorkflowRuntime,type IntrinsicWorkflowRuntime } from './cameraIntrinsicWorkspaceModel';

vi.mock('../../domains/execution/executionPublic', async (loadOriginal) => {
  const original = await loadOriginal<typeof ExecutionPublicModule>();
  return { ...original,useExecutionTarget: vi.fn(() => ({
    targetId:'local',processDefinitions:[],processInstances:[],processInstancesTruncated:false,
    jobs:[],events:[],streamId:'',lastOffset:0,
    streamState:'connected',loading:false,error:'',
  })) };
});

vi.mock('./CameraVideoPanel',() => ({
  CameraVideoPanel:({ connectionEnabled,ownerLifecycle,surfaceVisible,expectedSourceSize }:{
    connectionEnabled:boolean;ownerLifecycle:string;surfaceVisible:boolean;
    expectedSourceSize?:{ width:number;height:number };
  }) => <div data-testid={surfaceVisible ? 'intrinsic-camera-video':'intrinsic-camera-video-lifecycle'}
    data-connected={String(connectionEnabled)} data-owner-lifecycle={ownerLifecycle}
    data-expected-size={expectedSourceSize ? `${expectedSourceSize.width}x${expectedSourceSize.height}` : undefined} />,
}));

vi.mock('./CameraIntrinsicCalibrationRuntimePanel',() => ({
  CameraIntrinsicCalibrationRuntimePanel:({ processInstanceId,liveStage }:{
    processInstanceId:string;liveStage?:ReactNode;
  }) => <div data-testid="intrinsic-runtime" data-process={processInstanceId}>{liveStage}</div>,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

describe('CameraIntrinsicCalibrationWorkspace Action port',() => {
  it('leaves Panel Workflow lifecycle to the shared frame while preserving its views',() => {
    const action = actionPort();
    const panel = panelFixture();
    render(<CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicCalibrationWorkspace panel={panel} context={context(action)} />
    </CameraIntrinsicCalibrationFrameProvider>);
    expect(screen.getByRole('button',{ name:'Camera' })).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Workflow' })).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-header-actions"]'))
      .not.toHaveAttribute('data-xgc-workflow-view-active');
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-header-actions"]'))
      .toHaveAttribute('data-xgc-id', 'intrinsic');
    expect(document.querySelector('[data-xgc-role="camera-calibration-view-switcher"]'))
      .toHaveAttribute('data-xgc-id', 'intrinsic');
    expect(screen.queryByRole('button',{ name:'Run camera intrinsic calibration' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop camera intrinsic calibration' })).toBeNull();
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('keeps a stopped empty state without rendering workflow wiring prose',() => {
    const panel = panelFixture();
    render(<CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicCalibrationWorkspace panel={panel} context={context()} />
    </CameraIntrinsicCalibrationFrameProvider>);
    const pipeline = document.querySelector('[data-xgc-role="camera-calibration-lifecycle"][data-xgc-id="intrinsic"]');
    expect(pipeline).toHaveAttribute('data-state','stopped');
    expect(pipeline?.querySelectorAll('[data-xgc-role="camera-calibration-lifecycle-stage"]')).toHaveLength(4);
    expect(screen.getByText('Calibration pipeline')).toBeInTheDocument();
    expect(screen.getByText('No run')).toBeInTheDocument();
    expect(screen.getByText('usb_cam')).toBeInTheDocument();
    expect(screen.getByText('media.example.test')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.queryByText('Capture source')).toBeNull();
    expect(screen.queryByText('Calibration is stopped')).toBeNull();
    expect(document.body).not.toHaveTextContent('Connect the Calibration workflow Action port.');
    expect(document.body).not.toHaveTextContent('Run the connected Panel Workflow');
    expect(screen.queryByRole('button',{ name:'Run camera intrinsic calibration' })).toBeNull();
  });

  it('draws the bound calibration workflow when the camera view is switched',async () => {
    vi.mocked(useExecutionTarget).mockReturnValue({
      targetId:'local',processDefinitions:[],processInstances:[],processInstancesTruncated:false,
      jobs:[],events:[],streamId:'',lastOffset:0,
      streamState:'connected',loading:false,error:'',
    });
    const action = actionPort();
    action.trace = { automationResourceId:'camera-physical',actionId:'start-for-experiment' };
    action.action = { id:'start-for-experiment',label:'Start',kind:'service',controls:['stop'] };
    const panel = panelFixture();
    render(<CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicCalibrationWorkspace panel={panel} context={context(action, runtimeFixture())} />
    </CameraIntrinsicCalibrationFrameProvider>);
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-header-actions"]'))
      .toHaveAttribute('data-xgc-workflow-view-active','true');
    expect(document.querySelector('[data-xgc-role="camera-calibration-action-trace"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeTruthy();
  });

  it('gives intrinsic validation the same Camera and Workflow views',async () => {
    const action=actionPort();
    action.trace={ automationResourceId:'camera-physical',actionId:'start-for-experiment' };
    const panel={ ...panelFixture(),id:'validation',pluginId:'camera-intrinsic-validation',title:'Camera intrinsic validation' };
    render(<CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicValidationWorkspace panel={panel} context={context(action,runtimeFixture())} />
    </CameraIntrinsicCalibrationFrameProvider>);

    expect(screen.getByRole('button',{ name:'Camera' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-header-actions"]'))
      .toHaveAttribute('data-xgc-workflow-view-active','true');
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeTruthy();
  });

  it('follows the active Panel Workflow Run instead of unrelated host processes',async () => {
    const action = actionPort();
    action.activeInvocation = { id:'experiment-start-run-1',status:'running',revision:1 };
    action.action = { id:'experiment-run',label:'Experiment Run',kind:'service',controls:['stop','restart'] };
    const panel = panelFixture();
    render(<CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicCalibrationWorkspace panel={panel} context={context(action)} />
    </CameraIntrinsicCalibrationFrameProvider>);
    expect(screen.queryByText('Calibration is stopped')).toBeNull();
    expect(screen.queryByText(/No calibration Run is active/)).toBeNull();
    const pipeline = await findLifecycle('intrinsic','starting');
    expect(pipeline.querySelector('[data-xgc-role="camera-calibration-lifecycle-stage"][data-xgc-id="intrinsic:run"]'))
      .toHaveAttribute('data-xgc-status','ready');
    expect(pipeline.querySelector('[data-xgc-role="camera-calibration-lifecycle-stage"][data-xgc-id="intrinsic:calibrator"]'))
      .toHaveAttribute('data-xgc-status','pending');
    expect(document.body).not.toHaveTextContent('ROS, the camera, Media Edge');
    expect(screen.queryByRole('button',{ name:'Run camera intrinsic calibration' })).toBeNull();
  });

  it('keeps exact local teardown mounted when owner readiness falls before Run stopping',() => {
    const action = actionPort();
    action.activeInvocation = { id:'panel-run',status:'running',revision:1 };
    const baseRuntime = runtimeFixture();
    const runtime = intrinsicWorkflowRuntime({
      ...baseRuntime,runDetailsById:{
        'panel-run':{
          loading:false,error:'',invocations:[],nodeSummaries:[],relations:{
            runId:'panel-run',childRuns:[{ parentRunId:'panel-run',childRunId:'provider-run' }],
            childRunGroups:[],childRunGroupMembers:[],waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
          },
        },
      },
    })!;
    const processes = [
      processFixture('calibrator','xgc2-camera-intrinsic-calibrator-ros1','provider-run'),
      processFixture('media-edge','xgc-media-edge','provider-run'),
    ];
    vi.mocked(useExecutionTarget).mockReturnValue(executionWith(processes));
    const panel = panelFixture();
    const renderState = () => <CameraIntrinsicCalibrationFrameProvider panel={panel}>
      <CameraIntrinsicCalibrationHeaderActions panel={panel} editing={false} />
      <CameraIntrinsicCalibrationWorkspace panel={panel} context={context(action,runtime)} />
    </CameraIntrinsicCalibrationFrameProvider>;
    const view = render(renderState());
    expect(screen.getByTestId('intrinsic-camera-video')).toHaveAttribute('data-connected','true');
    expect(screen.getByTestId('intrinsic-camera-video')).toHaveAttribute('data-expected-size','3840x2160');

    processes.forEach((process) => { process.readiness = { status:'unknown' }; });
    vi.mocked(useExecutionTarget).mockReturnValue(executionWith(processes));
    view.rerender(renderState());
    expect(screen.queryByTestId('intrinsic-camera-video')).toBeNull();
    expect(screen.getByTestId('intrinsic-camera-video-lifecycle'))
      .toHaveAttribute('data-owner-lifecycle','stopping');
    expect(screen.getByTestId('intrinsic-camera-video-lifecycle'))
      .toHaveAttribute('data-connected','false');

    action.activeInvocation = { id:'panel-run',status:'stopping',revision:2 };
    view.rerender(renderState());
    expect(screen.getByTestId('intrinsic-camera-video-lifecycle'))
      .toHaveAttribute('data-owner-lifecycle','stopping');

    action.activeInvocation = undefined;
    view.rerender(renderState());
    expect(screen.queryByTestId('intrinsic-runtime')).toBeNull();
    expect(findLifecycle('intrinsic','stopped')).toHaveAttribute('data-state','stopped');
    expect(screen.queryByText('Calibration is stopped')).toBeNull();
  });
});

function findLifecycle(panelId:string,state:string) {
  const pipeline = document.querySelector(
    `[data-xgc-role="camera-calibration-lifecycle"][data-xgc-id="${panelId}"]`,
  );
  expect(pipeline).toHaveAttribute('data-state',state);
  return pipeline as HTMLElement;
}

function panelFixture():PanelInstance {
  return { id:'intrinsic',pluginId:'camera-intrinsic-calibration',title:'Intrinsic',gridPos:{ x:0,y:0,w:8,h:6 },
    query:{},options:{ edgeUrl:'https://media.example.test' },fieldConfig:{},portBindings:[] };
}
function actionPort():PanelActionPortRuntime {
  return { id:'camera-intrinsic-calibration',label:'Calibration',connected:true,disabledReason:'',
    action:{ id:'calibrate',label:'Calibrate',kind:'interaction',controls:['stop'] },defaults:{},
    invoke:vi.fn(async () => ({ id:'run-calibration',status:'running' as const,revision:1 })),control:vi.fn(),trace:{} };
}
function context(action?:PanelActionPortRuntime, runtime?:IntrinsicWorkflowRuntime):PanelPluginContext {
  return { ports:{
    actions:action ? { 'camera-intrinsic-calibration':action } : {},
    data:runtime ? { video:{ id:'video',label:'Video',contract:'camera.video.v1',connected:true,value:runtime,trace:{ projection:'camera.video.v1' } } } : {},
    authoring:{},interactions:{},
  } };
}

function runtimeFixture(): IntrinsicWorkflowRuntime {
  const document:AutomationDocument = {
    head:{ domain:'automation',resourceId:'camera-physical',name:'Physical',tags:[],mainCommitId:'c',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'t',updatedAt:'t' },
    branch:{ domain:'automation',resourceId:'camera-physical',name:'main',headCommitId:'c',headVersion:1,revision:1,createdAt:'t',updatedAt:'t' },
    spec:newAutomationSpec('Physical'),
  };
  document.spec.actions = [{
    ...document.spec.actions[0]!,id:'start-for-experiment',label:'Start',entryNodeId:'called',controls:['stop'],
  }];
  document.spec.nodes = [{
    ...document.spec.nodes[0]!,id:'called',kind:'trigger.automation-call',typeVersion:1,displayName:'Called',parameters:{},
  }];
  return {
    targetId:'local',catalog:[],loading:false,error:'',experimentResourceId:'experiment-a',
    documents:[document],runSummaries:[],runDetailsById:{},
  };
}

function processFixture(id:string,definitionId:string,ownerId:string):ProcessInstance {
  return {
    id,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'d'.repeat(64),
    ownerType:'orchestration-run',ownerId,scope:'run',parameters:{},driver:'host',
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },liveness:{ status:'passing' },
    restartCount:0,revision:1,createdAt:'t',updatedAt:'t',
  };
}

function executionWith(processInstances:ProcessInstance[]):ReturnType<typeof useExecutionTarget> {
  return {
    targetId:'local',processDefinitions:[],processInstances,processInstancesTruncated:false,
    jobs:[],events:[],streamId:'',lastOffset:0,streamState:'connected',loading:false,error:'',
  };
}
