// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { CameraExtrinsicState } from '../../domains/execution/cameraCalibrationProcessPublic';
import type * as CameraCalibrationProcessPublicModule from '../../domains/execution/cameraCalibrationProcessPublic';
import { CameraExtrinsicCalibrationRuntimePanel } from './CameraExtrinsicCalibrationRuntimePanel';
import { cameraPixelForClientPoint } from './cameraExtrinsicPixel';

const apiMocks = vi.hoisted(() => ({
  loadState: vi.fn(),loadImage: vi.fn(),freeze: vi.fn(),live: vi.fn(),solve: vi.fn(),save: vi.fn(),
}));

vi.mock('../../domains/execution/cameraCalibrationProcessPublic', async (importOriginal) => ({
  ...await importOriginal<typeof CameraCalibrationProcessPublicModule>(),
  loadCameraExtrinsicState: apiMocks.loadState,
  loadCameraExtrinsicImage: apiMocks.loadImage,
  freezeCameraExtrinsicFrame: apiMocks.freeze,
  resumeCameraExtrinsicLive: apiMocks.live,
  solveCameraExtrinsic: apiMocks.solve,
  saveCameraExtrinsicCandidate: apiMocks.save,
}));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: vi.fn(),useGroundStationNotification: vi.fn(),
}));

vi.mock('../../domains/execution/executionPublic', () => ({
  useExecutionTarget: () => ({ processInstances:[] }),
}));

describe('CameraExtrinsicCalibrationRuntimePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.loadState.mockResolvedValue(liveState());
    apiMocks.loadImage.mockImplementation(() => new Promise(() => undefined));
    apiMocks.freeze.mockResolvedValue(frozenState());
  });

  it('freezes through the backend and records an image correspondence in source pixels', async () => {
    const { container } = render(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="calibrator-1" targetId="agent-a" panelId="panel-1"
    />);

    const freeze = await screen.findByRole('button', { name: 'Freeze' });
    expect(freeze).toBeEnabled();
    expect(freeze).toHaveAttribute(
      'title',
      'Freeze one immutable image with the latest static marker poses.',
    );
    expect(screen.getByRole('button', { name: 'Live' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rigid body pose' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Solve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save result' })).toBeDisabled();
    expect(container.querySelector('.panels-camera-extrinsic-stage-status')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-extrinsic-runtime"]'))
      .toHaveClass('panels-camera-calibration-runtime', 'panels-camera-extrinsic-layout');
    expect(container.querySelector('[data-xgc-role="camera-calibration-image"]'))
      .toHaveClass('panels-camera-calibration-stage', 'panels-camera-extrinsic-stage');
    expect(container.querySelector('[data-xgc-role="camera-calibration-controls"]'))
      .toHaveClass('panels-camera-calibration-inspector', 'panels-camera-extrinsic-inspector');
    expect(container.querySelector('.panels-camera-calibration-frame-meta')).toBeInTheDocument();
    expect(container.querySelector('.panels-camera-calibration-actions')).toBeInTheDocument();
    const stage = container.querySelector<HTMLElement>('[data-xgc-role="camera-calibration-image"]');
    expect(stage).not.toBeNull();
    expect(stage).not.toHaveAttribute('role');
    expect(stage).not.toHaveAttribute('aria-disabled');
    expect(stage).not.toHaveAttribute('data-xgc-interactive');
    fireEvent.click(freeze);
    await waitFor(() => expect(apiMocks.freeze).toHaveBeenCalledWith('agent-a', 'calibrator-1'));

    vi.spyOn(stage!, 'getBoundingClientRect').mockReturnValue({
      left: 0,top: 0,width: 640,height: 480,right: 640,bottom: 480,x: 0,y: 0,toJSON: () => ({}),
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rigid body pose' })).toHaveTextContent('uav1'));
    expect(stage).toHaveAttribute('role', 'button');
    expect(stage).toHaveAttribute('tabindex', '0');
    expect(stage).toHaveAttribute('data-xgc-interactive', 'true');
    expect(stage).not.toHaveAttribute('aria-disabled');
    expect(freeze).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Live' })).toBeEnabled();
    fireEvent.click(stage!, { clientX: 320,clientY: 240 });

    const selected = container.querySelector('[data-xgc-role="camera-calibration-points"] li');
    expect(selected).toHaveTextContent('uav1');
    expect(selected).toHaveTextContent('640.0, 360.0');
    await waitFor(() => expect(stage).toHaveAccessibleName(/place ugv1/i));
    fireEvent.keyDown(stage!, { key: 'Enter' });
    await waitFor(() => expect(container.querySelectorAll('[data-xgc-role="camera-calibration-points"] li')).toHaveLength(2));
    expect(container.querySelector('[data-xgc-role="camera-calibration-frame"]')).toBeNull();
  });

  it('maps clicks through image letterboxing and rejects clicks in the bars', () => {
    const bounds = { left: 10,top: 20,width: 400,height: 400 };
    expect(cameraPixelForClientPoint(210,220,bounds,1280,720)).toEqual([640,360]);
    expect(cameraPixelForClientPoint(210,40,bounds,1280,720)).toBeUndefined();
  });

  it('uses the supplied WebRTC stage in live mode without polling the calibration JPEG endpoint', async () => {
    render(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="calibrator-1" targetId="agent-a" panelId="panel-1"
      liveStage={<div data-testid="webrtc-stage">WebRTC live video</div>}
    />);

    expect(await screen.findByTestId('webrtc-stage')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.loadState).toHaveBeenCalled());
    expect(apiMocks.loadImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(apiMocks.freeze).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.loadImage).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('webrtc-stage')).not.toBeInTheDocument();
  });

  it('ignores a frozen frame that settles after the process identity changes', async () => {
    const earlier = deferred<CameraExtrinsicState>();
    apiMocks.freeze.mockReset().mockImplementationOnce(() => earlier.promise);
    const view = render(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="calibrator-old" targetId="agent-a" panelId="panel-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Freeze' }));
    view.rerender(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="calibrator-current" targetId="agent-b" panelId="panel-1" />);
    await waitFor(() => expect(apiMocks.loadState).toHaveBeenCalledWith(
      'agent-b','calibrator-current',expect.any(AbortSignal),
    ));

    await act(async () => earlier.resolve(frozenState()));
    expect(screen.getByRole('button', { name: 'Freeze' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Live' })).toBeDisabled();
    expect(document.querySelector('[data-xgc-role="camera-calibration-points"] li')).toBeNull();
  });

  it('saves only the exact reviewed candidate and then disables repeated Save', async () => {
    const candidate = candidateResult(false);
    apiMocks.loadState.mockResolvedValue({ ...frozenState(),result:candidate });
    apiMocks.save.mockResolvedValue({
      ...candidate,saved:true,outputFile:'/camera/sim/usb_cam/extrinsics-20260831T120000.000000Z.yaml',
    });
    render(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="calibrator-1" targetId="agent-a" panelId="panel-1" />);

    const save = await screen.findByRole('button', { name: 'Save result' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(apiMocks.save).toHaveBeenCalledWith(
      'agent-a','calibrator-1','candidate-1',
    ));
    await waitFor(() => expect(save).toBeDisabled());
    expect(save).toHaveAttribute('title','This candidate is already saved.');
  });

  it('shows an exactly restored saved result without overlaying stale points on live video',async () => {
    apiMocks.loadState.mockResolvedValue({
      ...liveState(),resultRestored:true,
      outputFile:'/camera/phy/usb_cam/extrinsics-20260831T120000.000000Z.yaml',
      result:{
        ...candidateResult(true),
        outputFile:'/camera/phy/usb_cam/extrinsics-20260831T120000.000000Z.yaml',
      },
    });
    const { container }=render(<CameraExtrinsicCalibrationRuntimePanel
      processInstanceId="restored" targetId="local" panelId="panel-restored" />);
    expect(await screen.findByText('0.100 px')).toBeInTheDocument();
    expect(screen.getByRole('button',{ name:'Save result' })).toBeDisabled();
    expect(container.querySelectorAll('[data-xgc-role="camera-calibration-points"] li')).toHaveLength(0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise,resolve };
}

function liveState(): CameraExtrinsicState {
  return {
    resultRestored:false,
    mode: 'live',generation: 0,parentFrame: 'world',childFrame: 'camera',
    source: {
      imageTopic: '/camera/image',intrinsicFile: '/camera/sim/usb_cam/intrinsics-20260830T010203.000000Z.yaml',posePrefix: '/vrpn',
      imageReady: true,intrinsicReady: true,markerCount: 2,markerNames: ['uav1','ugv1'],
    },
    markers: [],
  };
}

function frozenState(): CameraExtrinsicState {
  return {
    ...liveState(),mode: 'frozen',generation: 1,frame: { stampSec: 10,frameId: 'camera',width: 1280,height: 720 },
    markers: [
      { name: 'uav1',position: [0,0,1] },
      { name: 'ugv1',position: [1,0,0] },
    ],
  };
}

function candidateResult(saved: boolean) {
  return {
    candidateId:'candidate-1',saved,translation:[1,2,3] as const,
    quaternionXyzw:[0,0,0,1] as const,meanReprojectionErrorPx:0.1,maxReprojectionErrorPx:0.2,
    inlierIndices:[0,1,2,3],warnings:[],projections:[],
    points:[
      { marker:'uav1',pixel:[100,100] as const },{ marker:'uav2',pixel:[200,100] as const },
      { marker:'uav3',pixel:[100,200] as const },{ marker:'uav4',pixel:[200,200] as const },
    ],
  };
}
