// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ExperimentProcessRuntimeProjection,PanelInstance } from '../../domains/experiment/experimentPublic';
import type { AutomationRunSummaryView,AutomationSpec } from '../../domains/automation/automationPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import {
  GazeboWorldCameraFrameProvider,
  GazeboWorldCameraHeaderActions,
  GazeboWorldCameraHeaderLeading,
} from './GazeboWorldCameraPanelFrame';
import { ExperimentSurfaceVisibilityProvider } from '../../domains/experiment/experimentPublic';
import { GazeboWorldCameraWorkspace } from './GazeboWorldCameraWorkspace';
import {
  calibrationCameraEmptyState,
  calibrationCameraOwnedProcesses,
  calibrationCameraRunIds,
  calibrationCameraViewerProjection,
  selectedCalibrationCameraRun,
} from './gazeboWorldCameraWorkspaceModel';

const notificationMocks = vi.hoisted(() => ({ useError:vi.fn() }));
const cameraVideoMocks = vi.hoisted(() => ({ render:vi.fn() }));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic',() => ({
  useGroundStationErrorNotification:notificationMocks.useError,
}));

vi.mock('./CameraVideoPanel',() => ({
  CameraVideoPanel:({ panel,connectionEnabled,ownerLifecycle,surfaceVisible }:{
    panel:PanelInstance;connectionEnabled:boolean;ownerLifecycle:string;surfaceVisible:boolean;
  }) => {
    cameraVideoMocks.render({ panel,connectionEnabled,ownerLifecycle,surfaceVisible });
    return <div data-testid={surfaceVisible ? 'world-camera-video':'world-camera-video-lifecycle'}
      data-image-fit={String(panel.options.imageFit)} data-connected={String(connectionEnabled)}
      data-owner-lifecycle={ownerLifecycle} />;
  },
}));
vi.mock('./CameraExtrinsicCalibrationRuntimePanel',() => ({
  CameraExtrinsicCalibrationRuntimePanel:({ processInstanceId,liveStage }:{
    processInstanceId:string;liveStage?:ReactNode;
  }) => (
    <div data-testid="extrinsic-runtime" data-process={processInstanceId}>{liveStage}</div>
  ),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver',ResizeObserverStub);

beforeEach(() => {
  notificationMocks.useError.mockReset();
  cameraVideoMocks.render.mockClear();
});

describe('calibration camera empty state',() => {
  it('keeps a failed camera child on source-failed with primaryError',() => {
    const state = calibrationCameraEmptyState({
      stopping:false,running:false,cameraReady:false,mediaReady:false,runFailed:true,
      sourceError:'readiness: dial unix /run/xgc2-local-fleet/media/gazebo_world_camera.sock: connect: no such file or directory',
      disabledReason:'',
    });
    expect(state.lifecycle).toBe('source-failed');
    expect(state.title).toBe('Calibration camera source failed');
    expect(state).not.toHaveProperty('description');
  });

  it('does not stay source-preparing when a physical source is ready',() => {
    expect(calibrationCameraEmptyState({
      stopping:false,running:true,cameraReady:true,mediaReady:false,runFailed:false,sourceError:'',disabledReason:'',
    }).lifecycle).toBe('media-preparing');
  });

  it('separates camera source wait from Media Edge wait',() => {
    expect(calibrationCameraEmptyState({
      stopping:false,running:true,cameraReady:false,mediaReady:false,runFailed:false,sourceError:'',disabledReason:'',
    }).lifecycle).toBe('source-preparing');
    expect(calibrationCameraEmptyState({
      stopping:false,running:true,cameraReady:true,mediaReady:false,runFailed:false,sourceError:'',disabledReason:'',
    })).toEqual({
      lifecycle:'media-preparing',
      title:'Preparing calibration camera',
    });
  });

  it('gives a stopped camera a next step',() => {
    expect(calibrationCameraEmptyState({
      stopping:false,running:false,cameraReady:false,mediaReady:false,runFailed:false,
      sourceError:'',disabledReason:'',
    })).toEqual({
      lifecycle:'stopped',
      title:'Calibration camera is stopped',
    });
  });
});

describe('GazeboWorldCameraWorkspace ports',() => {
  it('keeps intrinsic YAML selection in Panel settings instead of the stopped image',() => {
    renderWorkspace(panelFixture(),context({ 'camera-service':actionPort('camera-service') }));
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopped');
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-intrinsic-file"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-simulation-intrinsic"]')).toBeNull();
  });

  it('projects one lifecycle-only viewer pass when its owner starts stopping',() => {
    const runtime=workflowRuntimeWithMediaEdge();
    const running=calibrationCameraViewerProjection(
      runtime,'world-camera-workflow',{ id:'run-camera',status:'running',revision:1 },undefined,
    );
    expect(running).toMatchObject({ viewerVisible:true,viewerMounted:true,stopRequested:false });

    const stopping=calibrationCameraViewerProjection(
      runtime,'world-camera-workflow',{ id:'run-camera',status:'stopping',revision:2 },running.memory,
    );
    expect(stopping).toMatchObject({ viewerVisible:false,viewerMounted:true,stopRequested:true });
    expect(stopping.memory).toMatchObject({ mounted:false,stopRequested:true });
  });

  it('leaves Panel Workflow lifecycle to the shared frame and keeps domain tools',() => {
    const service = actionPort('camera-service');
    const panel = panelFixture();
    renderWorkspace(panel,context({ 'camera-service':service }));
    const poseButton = screen.getByRole('button',{ name:'Adjust world camera pose' });
    expect(poseButton).toBeEnabled();
    expect(poseButton).toHaveAttribute('data-xgc-available','false');
    expect(poseButton).toHaveAttribute(
      'title',
      'Adjust the running Gazebo camera pose without restarting video. Connect the Set camera pose Action port.',
    );
    expect(screen.getByRole('button',{ name:'Open extrinsic calibration' })).toBeInTheDocument();
    expect(screen.queryByRole('button',{ name:'Run calibration camera' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Stop calibration camera' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-view-switcher"]'))
      .toHaveAttribute('data-xgc-id', 'world-camera');
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-header-leading"]'))
      .toHaveAttribute('data-xgc-id', 'world-camera');
    expect(service.invoke).not.toHaveBeenCalled();

    fireEvent.click(poseButton);
    const editor = screen.getByRole('complementary',{ name:'Adjust world camera pose' });
    expect(editor).toHaveAttribute('aria-disabled','true');
    expect(editor).not.toHaveTextContent('Adjust the running Gazebo camera pose without restarting video.');
    expect(editor.querySelector('[data-xgc-role="gazebo-world-camera-pose-unavailable"]'))
      .toBeNull();
    expect(screen.getByRole('button',{ name:'Apply pose' })).toBeDisabled();
    expect(screen.getByRole('button',{ name:'Apply pose' })).toHaveAttribute('title','Connect the Set camera pose Action port.');
  });

  it('keeps the same media viewer mounted while the Experiment dashboard is parked',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    const renderWorkspace = (visible:boolean) => <ExperimentSurfaceVisibilityProvider visible={visible}>
      <GazeboWorldCameraFrameProvider panel={panelFixture()}>
        <GazeboWorldCameraHeaderLeading panel={panelFixture()} editing={false} />
        <GazeboWorldCameraHeaderActions panel={panelFixture()} editing={false} />
        <GazeboWorldCameraWorkspace panel={panelFixture()} context={context({ 'camera-service':service },workflowRuntimeWithMediaEdge())} />
      </GazeboWorldCameraFrameProvider>
    </ExperimentSurfaceVisibilityProvider>;
    const view = render(renderWorkspace(true));
    const video = screen.getByTestId('world-camera-video');

    view.rerender(renderWorkspace(false));
    expect(screen.getByTestId('world-camera-video')).toBe(video);

    view.rerender(renderWorkspace(true));
    expect(screen.getByTestId('world-camera-video')).toBe(video);
  });

  it('keeps one workspace and exclusive image branches across Run and Stop transitions',() => {
    const panel = panelFixture();
    const renderState = (
      activeInvocation:PanelActionPortRuntime['activeInvocation'] | undefined,
      runtime:ExperimentProcessRuntimeProjection,
    ) => <GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel}
        context={context({ 'camera-service':actionPort('camera-service',activeInvocation) },runtime)} />
    </GazeboWorldCameraFrameProvider>;
    const view = render(renderState(
      { id:'experiment-start-run-1',status:'running',revision:1 },workflowRuntimeWithMediaEdge(),
    ));

    expectExclusiveImageBranch(view.container,'video');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-intrinsic-file"]')).toBeNull();
    view.rerender(renderState(
      { id:'experiment-start-run-1',status:'stopping',revision:2 },workflowRuntimeWithMediaEdge(),
    ));
    expectExclusiveImageBranch(view.container,'empty');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopping');
    expect(view.container).not.toHaveTextContent('The Panel Workflow is releasing its camera runtime.');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-intrinsic-file"]')).toBeNull();

    view.rerender(renderState(undefined,workflowRuntime()));
    expectExclusiveImageBranch(view.container,'empty');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopped');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-intrinsic-file"]')).toBeNull();

    view.rerender(renderState(
      { id:'experiment-start-run-1',status:'running',revision:3 },workflowRuntimeWithMediaEdge(),
    ));
    expectExclusiveImageBranch(view.container,'video');
    expect(view.container.querySelector('[data-xgc-role="gazebo-world-camera-intrinsic-file"]')).toBeNull();
  });

  it('rehydrates the exact Panel Workflow owner after workspace remount',() => {
    const panel = panelFixture();
    const runtime = workflowRuntimeWithMediaEdge();
    const first = renderWorkspace(panel,context({
      'camera-service':actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 }),
    },runtime));
    first.unmount();
    renderWorkspace(panel,context({ 'camera-service':actionPort('camera-service') },runtime));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
    expectExclusiveImageBranch(document.body,'video');
  });

  it('retains the viewer through a transient relation and process projection gap',() => {
    const panel = panelFixture();
    const runtime = workflowRuntimeWithMediaEdge();
    const view = renderWorkspace(panel,context({
      'camera-service':actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 }),
    },runtime));
    const viewer = screen.getByTestId('world-camera-video');
    const gap:ExperimentProcessRuntimeProjection = {
      ...runtime,activeRun:undefined,activeRuns:[],runSummaries:[],processInstances:[],runDetailsById:{},
    };
    view.rerender(<GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel} context={context({
        'camera-service':actionPort('camera-service') },gap)} />
    </GazeboWorldCameraFrameProvider>);
    expect(screen.getByTestId('world-camera-video')).toBe(viewer);
    expect(screen.queryByText('Calibration camera is stopped')).toBeNull();
    expectExclusiveImageBranch(view.container,'video');
  });

  it('removes the viewer only for an explicit stop and keeps branches exclusive',() => {
    const panel = panelFixture();
    const runtime = workflowRuntimeWithMediaEdge();
    const view = renderWorkspace(panel,context({
      'camera-service':actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 }),
    },runtime));
    view.rerender(<GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel} context={context({
        'camera-service':actionPort('camera-service',{ id:'run-camera',status:'stopping',revision:2 }),
      },runtime)} />
    </GazeboWorldCameraFrameProvider>);
    expectExclusiveImageBranch(view.container,'empty');
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopping');
  });

  it('mounts the viewer only after the workflow-owned Media Edge is ready',() => {
    const panel = panelFixture();
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    const view = renderWorkspace(panel,context({ 'camera-service':service },workflowRuntimeWithReadyCamera()));
    expectExclusiveImageBranch(view.container,'empty');
    expect(document.querySelector('[data-xgc-camera-lifecycle="media-preparing"]')).toBeTruthy();
    view.rerender(<GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel}
        context={context({ 'camera-service':service },workflowRuntimeWithMediaEdge())} />
    </GazeboWorldCameraFrameProvider>);
    expectExclusiveImageBranch(view.container,'video');
  });

  it('waits for the camera source before Media Edge',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntimeWithCameraSource()));
    expect(screen.queryByTestId('world-camera-video')).toBeNull();
    expect(document.querySelector('[data-xgc-camera-lifecycle="source-preparing"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state-stage"][data-xgc-id="world-camera:camera"]'))
      .toHaveAttribute('data-xgc-status','active');
    expect(screen.queryByText('Waiting for the camera source to become ready.')).toBeNull();
    expect(screen.queryByText('Waiting for Media Edge to become ready.')).toBeNull();
  });

  it('waits for the workflow-owned Media Edge after the camera source is ready',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntimeWithReadyCamera()));
    expect(screen.queryByTestId('world-camera-video')).toBeNull();
    expect(document.querySelector('[data-xgc-camera-lifecycle="media-preparing"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state-stage"][data-xgc-id="world-camera:media"]'))
      .toHaveAttribute('data-xgc-status','active');
    expect(screen.queryByText('Waiting for Media Edge to become ready.')).toBeNull();
  });

  it('routes the camera child primaryError to notifications instead of panel content',() => {
    const error = 'readiness: dial unix /run/xgc2-local-fleet/media/gazebo_world_camera.sock: connect: no such file or directory';
    renderWorkspace(panelFixture(),context({ 'camera-service':actionPort('camera-service') },workflowRuntimeWithFailedCamera()));
    expect(screen.queryByTestId('world-camera-video')).toBeNull();
    expect(document.querySelector('[data-xgc-camera-lifecycle="source-failed"]')).toBeTruthy();
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state-stage"][data-xgc-id="world-camera:camera"]'))
      .toHaveAttribute('data-xgc-status','failed');
    expect(document.body).not.toHaveTextContent(error);
    expect(notificationMocks.useError).toHaveBeenCalledWith('local',error,{
      title:'Calibration camera',source:'world-camera',dedupeKey:'world-camera:camera-source',
    });
    expect(screen.queryByText('Calibration camera is stopped')).toBeNull();
    expect(screen.queryByText('Preparing calibration camera')).toBeNull();
  });

  it('treats a ready physical v4l2/rtp source as camera-ready without gazebo-static-camera',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntimeWithPhysicalSource()));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-camera-lifecycle="source-preparing"]')).toBeNull();
  });

  it('does not let a later failed sibling override an active source and Media Edge',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    const runtime = workflowRuntimeWithHistoricalFailedSibling();
    const runIds = calibrationCameraRunIds(runtime,'world-camera-workflow','run-camera');
    expect(selectedCalibrationCameraRun(runtime,runIds,'run-camera')?.status).toBe('running');
    expect(calibrationCameraOwnedProcesses(runtime,runIds).mediaReady).toBe(true);
    renderWorkspace(panelFixture(),context({ 'camera-service':service },runtime));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-camera-lifecycle="source-failed"]')).toBeNull();
  });

  it('opens the configured WebRTC view after the Media Edge is ready',() => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntimeWithMediaEdge()));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
  });

  it('sends edited pose values only through the set-pose Action port',async () => {
    const service = actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    const setPose = actionPort('set-pose');
    const panel = panelFixture();
    renderWorkspace(panel,context({ 'camera-service':service,'set-pose':setPose },workflowRuntimeWithMediaEdge()));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
    expect(screen.getByTestId('world-camera-video')).toHaveAttribute('data-image-fit', 'cover');
    fireEvent.click(screen.getByRole('button',{ name:'Adjust world camera pose' }));
    fireEvent.click(screen.getByRole('button',{ name:/Apply/ }));
    await waitFor(() => expect(setPose.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ request:expect.objectContaining({ model_state:expect.objectContaining({
        model_name:'gazebo_world_camera',pose:expect.objectContaining({ position:{ x:0,y:0,z:3 } }),
      }) }) }),
      'Apply Gazebo world-camera pose from its panel Action port',
    ));
  });

  it('hands owner teardown to the media viewer before removing its visible branch',() => {
    const panel = panelFixture();
    const runtime = workflowRuntimeWithMediaEdge();
    const renderState = (status:'running'|'stopping',revision:number) => (
      <GazeboWorldCameraFrameProvider panel={panel}>
        <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
        <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
        <GazeboWorldCameraWorkspace panel={panel} context={context({
          'camera-service':actionPort('camera-service',{ id:'run-camera',status,revision }),
        },runtime)} />
      </GazeboWorldCameraFrameProvider>
    );
    const view = render(renderState('running',1));
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();
    view.rerender(renderState('stopping',2));
    expect(screen.queryByTestId('world-camera-video')).toBeNull();
    expect(cameraVideoMocks.render).toHaveBeenCalledWith(expect.objectContaining({
      ownerLifecycle:'stopping',surfaceVisible:false,connectionEnabled:false,
    }));
    expectExclusiveImageBranch(view.container,'empty');
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopping');
    expect(screen.queryByRole('button',{ name:'Stopping calibration camera' })).toBeNull();
    const terminalRuntime:ExperimentProcessRuntimeProjection = {
      ...runtime,
      runSummaries:runtime.runSummaries.map((run) => run.id === 'run-camera'
        ? { ...run,status:'stopped' as const } : run),
      processInstances:runtime.processInstances.map((process) => process.ownerId === 'run-camera'
        ? { ...process,desiredState:'stopped' as const,observedState:'stopped' as const,readiness:{ status:'unknown' as const } }
        : process),
    };
    view.rerender(<GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel}
        context={context({ 'camera-service':actionPort('camera-service') },terminalRuntime)} />
    </GazeboWorldCameraFrameProvider>);
    expectExclusiveImageBranch(view.container,'empty');
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-empty-state"]'))
      .toHaveAttribute('data-state','stopped');
  });

  it('hands owner teardown to the viewer when projection jumps directly to terminal',() => {
    const panel = panelFixture();
    const runtime = workflowRuntimeWithMediaEdge();
    const running = () => <GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel} context={context({
        'camera-service':actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 }),
      },runtime)} />
    </GazeboWorldCameraFrameProvider>;
    const terminalRuntime:ExperimentProcessRuntimeProjection = {
      ...runtime,
      runSummaries:runtime.runSummaries.map((run) => run.id === 'run-camera'
        ? { ...run,status:'stopped' as const } : run),
      processInstances:runtime.processInstances.map((process) => process.ownerId === 'run-camera'
        ? { ...process,desiredState:'stopped' as const,observedState:'stopped' as const,readiness:{ status:'unknown' as const } }
        : process),
    };
    const terminal = () => <GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel}
        context={context({ 'camera-service':actionPort('camera-service') },terminalRuntime)} />
    </GazeboWorldCameraFrameProvider>;
    const view = render(running());
    expect(screen.getByTestId('world-camera-video')).toBeInTheDocument();

    view.rerender(terminal());
    expect(screen.queryByTestId('world-camera-video')).toBeNull();
    expect(cameraVideoMocks.render).toHaveBeenCalledWith(expect.objectContaining({
      ownerLifecycle:'stopping',surfaceVisible:false,connectionEnabled:false,
    }));
    expectExclusiveImageBranch(view.container,'empty');

    view.rerender(terminal());
    expect(screen.queryByTestId('world-camera-video-lifecycle')).toBeNull();
    expectExclusiveImageBranch(view.container,'empty');
  });

  it('keeps one live viewer through transient Action and Media projections and tears down with its owner',() => {
    const panel=panelFixture();
    const serviceRunning=actionPort('camera-service',{ id:'run-camera',status:'running',revision:1 });
    const runtime=workflowRuntimeWithMediaEdge();
    const view=renderWorkspace(panel,context({ 'camera-service':serviceRunning },runtime));
    const viewer=screen.getByTestId('world-camera-video');
    const media=runtime.processInstances.find((process) => process.definitionId==='xgc-media-edge')!;
    media.readiness={ status:'unknown' };
    const renderState = (service:PanelActionPortRuntime) => <GazeboWorldCameraFrameProvider panel={panel}>
      <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
      <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
      <GazeboWorldCameraWorkspace panel={panel}
        context={context({ 'camera-service':service },runtime)} />
    </GazeboWorldCameraFrameProvider>;
    view.rerender(renderState(serviceRunning));
    expect(screen.getByTestId('world-camera-video')).toBe(viewer);
    expect(viewer).toHaveAttribute('data-owner-lifecycle','running');
    expect(viewer).toHaveAttribute('data-connected','true');
    view.rerender(renderState(actionPort('camera-service')));
    expect(screen.getByTestId('world-camera-video')).toBe(viewer);
    expect(viewer).toHaveAttribute('data-owner-lifecycle','running');
    expect(viewer).toHaveAttribute('data-connected','true');
    view.rerender(renderState(actionPort('camera-service',{
      id:'projected-child-run',status:'running',revision:2,
    })));
    expect(screen.getByTestId('world-camera-video')).toBe(viewer);
    expect(viewer).toHaveAttribute('data-owner-lifecycle','running');
    expect(viewer).toHaveAttribute('data-connected','true');
    view.rerender(renderState(actionPort('camera-service',{
      id:'projected-child-run',status:'stopping',revision:3,
    })));
    expectExclusiveImageBranch(view.container,'empty');
    view.rerender(renderState(actionPort('camera-service')));
    expectExclusiveImageBranch(view.container,'empty');
  });

  it('draws the exact Panel Workflow snapshot instead of a generated startup DAG',() => {
    const service = actionPort('camera-service',{ id:'experiment-start-run-1',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntime()));
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    expect(document.querySelector('[data-xgc-role="gazebo-world-camera-workflow"]')).toBeTruthy();
    expect(screen.getByLabelText('camera')).toBeInTheDocument();
    expect(screen.queryByText(/invocation/)).toBeNull();
  });

  it('opens the provider-owned calibrator found through the exact child relation',() => {
    const service = actionPort('camera-service',{ id:'experiment-start-run-1',status:'running',revision:1 });
    renderWorkspace(panelFixture(),context({ 'camera-service':service },workflowRuntimeWithCalibrator()));
    fireEvent.click(screen.getByRole('button',{ name:'Open extrinsic calibration' }));
    expect(screen.getByTestId('extrinsic-runtime')).toHaveAttribute('data-process','calibrator-process');
    const dialog = document.querySelector(
      '[data-xgc-role="gazebo-world-camera-calibration-dialog"][data-xgc-id="world-camera"]',
    );
    expect(dialog).toHaveClass('gazebo-world-camera-calibration-dialog');
    expect(dialog?.parentElement).toHaveClass('gazebo-world-camera-calibration-backdrop');
  });
});

function renderWorkspace(panel:PanelInstance,contextValue:PanelPluginContext) {
  return render(<GazeboWorldCameraFrameProvider panel={panel}>
    <GazeboWorldCameraHeaderLeading panel={panel} editing={false} />
    <GazeboWorldCameraHeaderActions panel={panel} editing={false} />
    <GazeboWorldCameraWorkspace panel={panel} context={contextValue} />
  </GazeboWorldCameraFrameProvider>);
}
function expectExclusiveImageBranch(container:HTMLElement,expected:'empty'|'video') {
  expect(container.querySelectorAll(
    '[data-xgc-role="gazebo-world-camera-workspace"][data-xgc-id="world-camera"]',
  )).toHaveLength(1);
  const imageView = container.querySelector(
    '[data-xgc-role="gazebo-world-camera-image-view"][data-xgc-id="world-camera"]',
  );
  expect(imageView).not.toBeNull();
  const empty = imageView!.querySelectorAll('[data-xgc-role="gazebo-world-camera-empty-state"]');
  const video = imageView!.querySelectorAll('[data-testid="world-camera-video"]');
  expect({ empty:empty.length,video:video.length }).toEqual(
    expected === 'empty' ? { empty:1,video:0 } : { empty:0,video:1 },
  );
  if (expected === 'empty') {
    expect(empty[0]).toHaveAttribute('data-xgc-id', 'world-camera');
  }
}
function panelFixture():PanelInstance {
  return { id:'world-camera',pluginId:'gazebo-world-camera',title:'World camera',gridPos:{ x:0,y:0,w:8,h:6 },
    query:{},options:{ edgeUrl:'https://media.example.test',sourceId:'world_camera',x:0,y:0,z:3,rollDegrees:0,pitchDegrees:45,yawDegrees:0 },fieldConfig:{},portBindings:[] };
}
function actionPort(id:string,activeInvocation?:PanelActionPortRuntime['activeInvocation']):PanelActionPortRuntime {
  return { id,label:id,connected:true,disabledReason:'',action:{ id,label:id,kind:id === 'camera-service' ? 'service':'command',controls:['stop'] },
    defaults:{},activeInvocation,invoke:vi.fn(async () => ({ id:`run-${id}`,status:'running' as const,revision:1 })),control:vi.fn(),
    trace:{ automationResourceId:'world-camera-workflow',actionId:id } };
}
function context(
  actions:Record<string,PanelActionPortRuntime>,
  videoValue:unknown = {},
  authoring:PanelPluginContext['ports']['authoring'] = {},
):PanelPluginContext {
  return { ports:{
    actions,
    data:{ video:{ id:'video',label:'Video',contract:'experiment.runtime.v1',connected:true,value:videoValue,trace:{} } },
    authoring,
    interactions:{},
  } };
}

function workflowRuntimeWithCalibrator() {
  const runtime = workflowRuntimeWithMediaEdge();
  runtime.processInstances.push({
    id:'calibrator-process',targetId:'local',definitionId:'xgc2-camera-extrinsic-calibrator-ros1',
    definitionVersion:'1',definitionDigest:'d'.repeat(64),ownerType:'orchestration-run',ownerId:'provider-run',
    scope:'run',parameters:{},driver:'host',desiredState:'running',observedState:'running',
    readiness:{ status:'passing' },liveness:{ status:'passing' },restartCount:0,revision:1,createdAt:'t',updatedAt:'t',
  });
  runtime.runSummaries.push({
    ...runtime.runSummaries[0]!,id:'provider-run',parentRunId:'run-camera',
    automationResourceId:'physical-provider',rootRunId:'experiment-start-run-1',
  });
  return runtime;
}

function workflowRuntimeWithFailedCamera() {
  const runtime = workflowRuntimeWithCameraSource();
  runtime.runSummaries[1] = {
    ...runtime.runSummaries[1]!,status:'failed',updatedAt:'u',
  };
  runtime.runDetailsById['run-camera'] = {
    invocations:[],nodeSummaries:[{
      runId:'run-camera',nodeId:'camera',kind:'process.run-definition',status:'failed',
      error:'readiness: dial unix /run/xgc2-local-fleet/media/gazebo_world_camera.sock: connect: no such file or directory',
      occurrenceCount:1,activeOccurrenceCount:0,completedOccurrenceCount:0,failedOccurrenceCount:1,
      attemptCount:1,updatedAt:'u',revision:1,
    }],loading:false,error:'',
    run:{
      id:'run-camera',targetId:'local',automationResourceId:'world-camera-workflow',definitionId:'world-camera-workflow',
      definitionVersion:1,actionId:'camera-service',actionVersion:1,configDigest:'c'.repeat(64),
      executionPlanDigest:'d'.repeat(64),registryDigest:'e'.repeat(64),definitionDigest:'f'.repeat(64),
      executionModel:'orchestration-occurrence-v1',sourceKind:'experiment',
      sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
      status:'failed',revision:1,parameters:{},terminationKind:'failed',
      primaryError:'readiness: dial unix /run/xgc2-local-fleet/media/gazebo_world_camera.sock: connect: no such file or directory',
      parentRunId:'experiment-start-run-1',admissionMode:'limited',admissionScope:'root',
      rootRunId:'experiment-start-run-1',depth:1,correlationId:'run-camera',
      acceptedAt:'t',createdAt:'t',updatedAt:'u',finishedAt:'u',
    },
  };
  runtime.processInstances[0] = {
    ...runtime.processInstances[0]!,desiredState:'stopped',observedState:'stopped',
    readiness:{ status:'unknown' },
    lastError:'readiness: dial unix /run/xgc2-local-fleet/media/gazebo_world_camera.sock: connect: no such file or directory',
    updatedAt:'u',
  };
  return runtime;
}

function workflowRuntimeWithCameraSource() {
  const runtime = workflowRuntime();
  runtime.runSummaries.push({
    ...runtime.runSummaries[0]!,id:'run-camera',parentRunId:'experiment-start-run-1',
    automationResourceId:'world-camera-workflow',rootRunId:'experiment-start-run-1',
  });
  runtime.processInstances.push(processInstance('camera-process','gazebo-static-camera','run-camera',{
    desiredState:'running',observedState:'running',readiness:{ status:'failing' },
  }));
  return runtime;
}

function workflowRuntimeWithReadyCamera() {
  const runtime = workflowRuntimeWithCameraSource();
  runtime.processInstances[0] = processInstance('camera-process','gazebo-static-camera','run-camera',{
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },
  });
  return runtime;
}

function workflowRuntimeWithMediaEdge() {
  const runtime = workflowRuntimeWithReadyCamera();
  runtime.processInstances.push(processInstance('media-edge-process','xgc-media-edge','run-camera',{
    desiredState:'running',observedState:'running',readiness:{ status:'passing' },
  }));
  return runtime;
}

function workflowRuntimeWithPhysicalSource() {
  const runtime = workflowRuntime();
  runtime.runSummaries.push({
    ...runtime.runSummaries[0]!,id:'run-camera',parentRunId:'experiment-start-run-1',
    automationResourceId:'world-camera-workflow',rootRunId:'experiment-start-run-1',
  });
  runtime.processInstances.push(
    processInstance('v4l2-process','xgc2-camera-v4l2-ros1','run-camera',{
      desiredState:'running',observedState:'running',readiness:{ status:'passing' },
    }),
    processInstance('rtp-process','xgc2-ros1-image-rtp-adapter','run-camera',{
      desiredState:'running',observedState:'running',readiness:{ status:'passing' },
    }),
    processInstance('media-edge-process','xgc-media-edge','run-camera',{
      desiredState:'running',observedState:'running',readiness:{ status:'passing' },
    }),
  );
  return runtime;
}

function workflowRuntimeWithHistoricalFailedSibling() {
  const runtime = workflowRuntimeWithMediaEdge();
  runtime.runSummaries.push({
    ...runtime.runSummaries[1]!,id:'failed-sibling',parentRunId:'run-camera',
    status:'failed',updatedAt:'z',
  });
  runtime.processInstances.push(processInstance('stale-camera','gazebo-static-camera','failed-sibling',{
    desiredState:'stopped',observedState:'stopped',readiness:{ status:'unknown' },
  }));
  runtime.processInstances[runtime.processInstances.length - 1]!.lastError = 'stale sibling failure';
  return runtime;
}

function processInstance(
  id:string,
  definitionId:string,
  ownerId:string,
  state:{ desiredState:'running'|'stopped';observedState:'running'|'stopped';readiness:{ status:'passing'|'failing'|'unknown' } },
):ProcessInstance {
  return {
    id,targetId:'local',definitionId,definitionVersion:'1',definitionDigest:'c'.repeat(64),
    ownerType:'orchestration-run',ownerId,scope:'run',parameters:{},driver:'host',
    desiredState:state.desiredState,observedState:state.observedState,readiness:state.readiness,
    liveness:{ status:state.readiness.status === 'passing' ? 'passing' : 'unknown' },
    restartCount:0,revision:1,createdAt:'t',updatedAt:'t',
  };
}

function workflowRuntime(): ExperimentProcessRuntimeProjection {
  const automationSpec:AutomationSpec = {
    schemaVersion:11,metadata:{ name:'World camera workflow',description:'',tags:[] },
    targetPolicy:{ mode:'inherit',executionTargetId:'' },actions:[],stickyNotes:[],
    nodes:[{ id:'camera',displayName:'camera',kind:'process.run-definition',typeVersion:1,parameters:{},
      retry:{ maxAttempts:1,initialBackoff:1,maxBackoff:1 } }],edges:[],
  };
  const runSummaries:AutomationRunSummaryView[] = [{
    id:'experiment-start-run-1',targetId:'local',automationResourceId:'world-camera-workflow',actionId:'camera-service',
    actionVersion:1,status:'running',revision:1,sourceKind:'experiment',
    sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
    rootRunId:'experiment-start-run-1',createdAt:'t',updatedAt:'t',
  }];
  return {
    targetId:'local',loading:false,error:'',
    processInstances:[],documents:[],catalog:[{
      kind:'process.run-definition',typeVersion:1,label:'Process',category:'process',traits:[],parameterSchema:{},
    }],
    runSummaries,
    runDetailsById:{ 'experiment-start-run-1':{
      invocations:[],nodeSummaries:[],loading:false,error:'',
      snapshot:{
        runId:'experiment-start-run-1',targetId:'local',sourceKind:'experiment',
        sourceRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
        automationRef:{ domain:'automation',resourceId:'world-camera-workflow',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
        assetContext:{ schemaVersion:1 },automationSpec,definitionDigest:'d'.repeat(64),digest:'d'.repeat(64),createdAt:'t',
      },
    } },
    activeRun:{
      id:'experiment-start-run-1',targetId:'local',
      experimentRef:{ domain:'experiment',resourceId:'experiment-1',branch:'main' },
      automationResourceId:'world-camera-workflow',actionId:'camera-service',runMode:'simulation',status:'running',revision:1,
      rootRunId:'experiment-start-run-1',createdAt:'t',updatedAt:'t',workflowTargets:[{
        workflowInstanceId:'world-camera',
        automationRef:{ domain:'automation',resourceId:'world-camera-workflow',branch:'main' },
        executionTargetId:'local',actionPresetIds:['camera-service'],
      }],
    },
  };
}
