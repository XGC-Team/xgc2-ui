// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { CameraIntrinsicState } from '../../domains/execution/cameraCalibrationProcessPublic';
import type * as CameraCalibrationProcessPublicModule from '../../domains/execution/cameraCalibrationProcessPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { CameraIntrinsicCalibrationRuntimePanel } from './CameraIntrinsicCalibrationRuntimePanel';

const apiMocks = vi.hoisted(() => ({
  loadState:vi.fn(),loadImage:vi.fn(),loadReference:vi.fn(),analyze:vi.fn(),saveCandidate:vi.fn(),
  reset:vi.fn(),
  loadEvidence:vi.fn(),
  goto: vi.fn(),autoRun: vi.fn(),commitAsset: vi.fn(),
  startAutoCapture:vi.fn(),stopAutoCapture:vi.fn(),openStateStream:vi.fn(),
}));

vi.mock('../../domains/execution/cameraCalibrationProcessPublic', async (importOriginal) => ({
  ...await importOriginal<typeof CameraCalibrationProcessPublicModule>(),
  loadCameraIntrinsicState: apiMocks.loadState,
  loadCameraIntrinsicImage: apiMocks.loadImage,
  loadCameraIntrinsicEvidence:apiMocks.loadEvidence,
  openCameraIntrinsicStateStream:apiMocks.openStateStream,
  loadCameraIntrinsicReference: apiMocks.loadReference,
  startCameraIntrinsicAnalysis:apiMocks.analyze,
  saveCameraIntrinsicCandidate:apiMocks.saveCandidate,
  commitCameraIntrinsicAsset: apiMocks.commitAsset,
  resetCameraIntrinsic: apiMocks.reset,
  gotoCameraIntrinsicTarget: apiMocks.goto,
  autoRunCameraIntrinsic: apiMocks.autoRun,
  startCameraIntrinsicAutoCapture:apiMocks.startAutoCapture,
  stopCameraIntrinsicAutoCapture:apiMocks.stopAutoCapture,
}));

vi.mock('../../domains/groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: vi.fn(),
}));

vi.mock('../../domains/execution/executionPublic', () => ({
  useExecutionTarget: () => ({ processInstances:[] }),
}));

describe('CameraIntrinsicCalibrationRuntimePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL,'createObjectURL',{ configurable:true,value:vi.fn(() => 'blob:annotated-frame') });
    Object.defineProperty(URL,'revokeObjectURL',{ configurable:true,value:vi.fn() });
    apiMocks.loadState.mockResolvedValue(calibrationState());
    apiMocks.loadImage.mockResolvedValue(new Blob(['annotated']));
    apiMocks.loadEvidence.mockResolvedValue(new Blob(['evidence'],{ type:'application/zip' }));
    apiMocks.openStateStream.mockReturnValue({ close:vi.fn() });
    apiMocks.loadReference.mockImplementation(() => new Promise(() => undefined));
    apiMocks.goto.mockResolvedValue({ ok: true,name: 'near' });
    apiMocks.commitAsset.mockResolvedValue({
      resourceId:'calibration-asset-1',commitId:'commit-1',version:1,digest:'d'.repeat(64),
    });
    apiMocks.autoRun.mockResolvedValue({
      accepted: true,
      action: { name: 'auto_run',status: 'running',targetIndex: null,targetName: null,error: null },
    });
    apiMocks.startAutoCapture.mockResolvedValue({ ok:true,autoCapture:{ enabled:true,intervalSeconds:0.5,lastError:null,coverageComplete:false } });
    apiMocks.stopAutoCapture.mockResolvedValue({ ok:true,autoCapture:{ enabled:false,intervalSeconds:0.5,lastError:null,coverageComplete:false } });
    apiMocks.reset.mockResolvedValue(calibrationState({
      samples:0,candidatePool:{ count:0,imageSize:null,solveFrozen:false },
    }));
    apiMocks.analyze.mockImplementation(async () => {
      const candidate=calibrationCandidate();
      apiMocks.loadState.mockResolvedValue(candidateCalibrationState({
        candidate,
        evidence:{ available:true,sampleCount:17,filename:'candidate-1-evidence.zip' },
      }));
      return candidate;
    });
    apiMocks.saveCandidate.mockImplementation(async () => {
      const result=calibrationResult();
      apiMocks.loadState.mockResolvedValue(savedCalibrationState({
        result,outputFile:result.outputFile,savedCandidateId:result.candidateId,
        evidence:{ available:true,sampleCount:17,filename:'intrinsics-20260830T120000.000000Z-evidence.zip' },
      }));
      return result;
    });
  });

  it('does not read calibrator state after its workflow owner begins teardown', async () => {
    const view = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-teardown" targetId="local" panelId="panel-teardown" enabled={false} />);
    await act(async () => undefined);
    expect(apiMocks.loadState).not.toHaveBeenCalled();

    view.rerender(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-teardown" targetId="local" panelId="panel-teardown" enabled />);
    await waitFor(() => expect(apiMocks.loadState).toHaveBeenCalledOnce());
  });

  it('reserves the detection result card before the first image is processed', () => {
    apiMocks.loadState.mockImplementation(() => new Promise(() => undefined));
    apiMocks.loadImage.mockImplementation(() => new Promise(() => undefined));
    const { container } = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-waiting" targetId="local" panelId="panel-waiting" />);

    const controls = container.querySelector('[data-xgc-role="camera-intrinsic-controls"]');
    const detection = container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]');
    expect(controls).toHaveAttribute('data-xgc-id','intrinsic-waiting');
    expect(controls?.firstElementChild).toBe(detection);
    expect(detection).toHaveTextContent('Detection result');
    expect(detection).toHaveTextContent('waiting');
    expect(detection).toHaveTextContent('Waiting for a detection result');
    expect(detection?.querySelector('[data-xgc-role="camera-intrinsic-annotated-frame"]')).toBeNull();
    expect(screen.getByRole('button',{ name:'Download evidence' })).toBeDisabled();
  });

  it('keeps Auto sweep disabled until the continuous detector processes a fresh frame', async () => {
    apiMocks.loadState.mockResolvedValue(calibrationState({
      imageReady:false,
      autoCapture:{ enabled:true,intervalSeconds:0.2,lastError:null,coverageComplete:false },
      detection:{
        status:'not_detected',cornerCount:0,expectedCornerCount:144,
        frameWidth:3840,frameHeight:2160,sequence:0,metrics:[],accepted:false,duplicate:false,
      },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-not-ready" targetId="local" panelId="panel-not-ready" />);

    const sweep = await screen.findByRole('button',{ name:'Auto sweep' });
    expect(sweep).toBeDisabled();
    expect(sweep).toHaveAttribute(
      'title','Wait for the continuous detector to process a fresh frame before starting the sweep.',
    );
    expect(apiMocks.autoRun).not.toHaveBeenCalled();
  });

  it('uses one regular label treatment for every annotated simulation target',async () => {
    apiMocks.loadState.mockResolvedValue(calibrationState({
      targets:[
        { name:'left edge',position:[-1,0,0],done:false,hasRef:false },
        { name:'centre',position:[0,0,0],done:false,hasRef:false },
        { name:'lower edge',position:[0,0,-1],done:false,hasRef:false },
        { name:'upper edge',position:[0,0,1],done:false,hasRef:false },
      ],
      next:0,
    }));
    const { container }=render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-target-labels" targetId="local" panelId="panel-target-labels" />);

    await screen.findByRole('button',{ name:'Go to left edge' });
    for (const id of ['0','2','3']) {
      const target=container.querySelector(
        `[data-xgc-role="camera-intrinsic-target"][data-xgc-id="intrinsic-target-labels:${id}"]`,
      );
      expect(target?.querySelector('.panels-camera-intrinsic-target-icon')).toBeInTheDocument();
      expect(target?.querySelector('.panels-camera-intrinsic-target-label')).toBeInTheDocument();
      expect(target?.querySelector('strong')).toBeNull();
    }
  });

  it('moves the Gazebo camera and solves through the typed intrinsic API', async () => {
    const { container } = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-1" targetId="agent-a" panelId="panel-1"
      livePlaybackMetrics={{ width:3840,height:2160,fps:29.94 }} />);

    const target = await screen.findByRole('button', { name: 'Go to near' });
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-runtime"]'))
      .toHaveClass('panels-camera-calibration-runtime', 'panels-camera-intrinsic-layout');
    const live = container.querySelector('[data-xgc-role="camera-intrinsic-image"]')!;
    expect(live).toHaveClass('panels-camera-intrinsic-card', 'panels-camera-intrinsic-live-preview');
    expect(live.querySelector('header')).toHaveTextContent('Live camera');
    expect(live.querySelector('[data-xgc-role="camera-intrinsic-live-metrics"]'))
      .toHaveTextContent('3840×2160 · 29.9 fps');
    expect(live.querySelector('[data-xgc-role="camera-intrinsic-live-metrics"]'))
      .not.toHaveTextContent(/^live$/i);
    expect(await screen.findByRole('img',{ name:'Annotated intrinsic calibration frame' })).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-controls"]'))
      .toHaveClass('panels-camera-calibration-inspector', 'panels-camera-intrinsic-inspector');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-source"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-guide"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Fill all four coverage axes/);
    expect(container.textContent).not.toMatch(/authored views captured/);
    expect(container.textContent).not.toMatch(/simulation ·/);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-stage-overlay"]')).toBeNull();
    const initialActions = container.querySelector('.panels-camera-calibration-actions');
    expect(initialActions).toBeInTheDocument();
    expect([...initialActions!.children].map((control) => control.getAttribute('data-xgc-role'))).toEqual([
      'camera-intrinsic-auto-run','camera-intrinsic-analyze',
      'camera-intrinsic-reset','camera-intrinsic-evidence-download',
    ]);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-solve"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-continue"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-candidate-quality"]')).toBeNull();
    expect(container).not.toHaveTextContent('Candidate quality accepted');
    expect(container).not.toHaveTextContent('Held-out');
    const coverage = container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]')!;
    const detection = container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]');
    expect(coverage.querySelector('header')).toHaveTextContent('View coverage');
    expect(coverage.querySelector('header')).not.toHaveTextContent('AprilGrid');
    expect(detection?.querySelector('[data-xgc-role="camera-intrinsic-detection"]'))
      .toHaveAttribute('data-xgc-detected', 'true');
    expect(coverage.querySelector('.panels-camera-intrinsic-detection-metrics')).toBeNull();
    expect(coverage).not.toHaveTextContent('frame 42');
    const bars = [...coverage.querySelectorAll('[role="progressbar"]')];
    expect(bars).toHaveLength(4);
    expect(bars.filter((bar) => bar.getAttribute('aria-label') === 'X' || bar.getAttribute('aria-label') === 'Skew'))
      .toHaveLength(2);
    const barHosts = [...coverage.querySelectorAll('[data-xgc-role="camera-intrinsic-coverage-bar"]')];
    expect(barHosts.map((host) => host.getAttribute('data-xgc-id'))).toEqual([
      'intrinsic-1:X','intrinsic-1:Y','intrinsic-1:Size','intrinsic-1:Skew',
    ]);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute('data-xgc-size','compact');
      const complete = bar.getAttribute('aria-valuenow') === '1';
      if (complete) {
        expect(bar).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
      } else {
        expect(bar).toHaveAttribute('data-xgc-tone','warning');
      }
    });
    expect(screen.getByText('35 / 35 corners')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]'))
      .not.toHaveTextContent('Accepted sample.');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]'))
      .not.toHaveTextContent('Duplicate view');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]'))
      .not.toHaveTextContent('More varied');
    expect(screen.queryByRole('button',{ name:'Reset pose' })).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-reset-pose"]')).toBeNull();
    expect(target).toBeEnabled();
    fireEvent.click(target);
    await waitFor(() => expect(apiMocks.goto).toHaveBeenCalledWith('agent-a', 'intrinsic-1', 1));
    expect(screen.queryByRole('button', { name: 'Capture now' })).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-capture"]')).toBeNull();

    expect(screen.queryByRole('button',{ name:'Save result' })).toBeNull();
    const analyze=screen.getByRole('button',{ name:'Analyze calibration' });
    expect(analyze).toHaveAttribute('data-xgc-role','camera-intrinsic-analyze');
    fireEvent.click(analyze);
    await waitFor(() => expect(apiMocks.analyze).toHaveBeenCalledWith('agent-a','intrinsic-1'));
    const save=await screen.findByRole('button',{ name:'Save result' });
    await waitFor(() => expect(save).toBeEnabled());
    expect(apiMocks.saveCandidate).not.toHaveBeenCalled();
    expect(apiMocks.commitAsset).not.toHaveBeenCalled();
    fireEvent.click(save);
    await waitFor(() => expect(apiMocks.saveCandidate).toHaveBeenCalledWith(
      'agent-a','intrinsic-1','candidate-1',
    ));
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-candidate-quality"]')).toBeNull();
    expect(container).not.toHaveTextContent('Candidate quality accepted');
    expect(container).not.toHaveTextContent('Held-out');
    await waitFor(() => expect(apiMocks.commitAsset).toHaveBeenCalledWith(
      'agent-a','intrinsic-1',expect.objectContaining({
        cameraSourceId:'usb_cam',
        idempotencyKey:expect.stringMatching(/^camera-intrinsic-ui-v3-intrinsic-1-/),
      }),
    ));
    const download = await screen.findByRole('button',{ name:'Download evidence' });
    expect(screen.queryByText('Calibration asset saved')).toBeNull();
    expect(screen.queryByText('calibration-asset-1 · v1')).toBeNull();
    expect(screen.queryByText('0.310 px RMS')).toBeNull();
    expect(screen.queryByText('Focal length')).toBeNull();
    expect(screen.queryByText('Principal point')).toBeNull();
    expect(screen.queryByText('Distortion')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-result"]')).toBeNull();
    const actions = container.querySelector('.panels-camera-intrinsic-actions');
    expect(download).toHaveAttribute('data-xgc-role','camera-intrinsic-evidence-download');
    expect(download).toHaveAttribute('data-xgc-id','intrinsic-1');
    expect(download).toBeEnabled();
    expect(download.parentElement).toBe(actions);
    expect(download.previousElementSibling).toHaveAttribute('data-xgc-role','camera-intrinsic-reset');
    const downloadNames:string[] = [];
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function (this:HTMLAnchorElement) {
      downloadNames.push(this.download);
    });
    fireEvent.click(download);
    await waitFor(() => expect(apiMocks.loadEvidence).toHaveBeenCalledWith('agent-a','intrinsic-1'));
    expect(downloadClick).toHaveBeenCalledOnce();
    expect(downloadNames).toEqual(['intrinsics-20260830T120000.000000Z-evidence.zip']);
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(expect.objectContaining({ type:'application/zip' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:annotated-frame');
    downloadClick.mockRestore();
    expect(actions).toBe(container.querySelector('[data-xgc-role="camera-intrinsic-controls"]')?.lastElementChild);
    expect(screen.queryByRole('button', { name: 'Capture now' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Analyze candidate' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Continue collecting' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save result' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recalibrate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Auto sweep' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to near' })).toBeDisabled();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-guide"]')).not.toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('keeps routine actions quiet while invoking the requested APIs', async () => {
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-routine" targetId="local" panelId="panel-routine" />);

    fireEvent.click(await screen.findByRole('button',{ name:'Go to near' }));
    await waitFor(() => expect(apiMocks.goto).toHaveBeenCalledWith('local','intrinsic-routine',1));
    fireEvent.click(screen.getByRole('button',{ name:'Reset samples' }));
    await waitFor(() => expect(apiMocks.reset).toHaveBeenCalledWith('local','intrinsic-routine'));
    fireEvent.click(screen.getByRole('button',{ name:'Auto sweep' }));
    await waitFor(() => expect(apiMocks.autoRun).toHaveBeenCalledWith('local','intrinsic-routine'));

  });

  it('shows the WebRTC live view with the annotated result at the top of the inspector', async () => {
    const { container } = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-1" targetId="local" panelId="panel-1"
      livePlaybackMetrics={{ width:1920,height:1080 }}
      liveStage={<div data-testid="intrinsic-webrtc">WebRTC checkerboard view</div>}
    />);
    expect(await screen.findByTestId('intrinsic-webrtc')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.loadState).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.loadImage).toHaveBeenCalledWith(
      'local','intrinsic-1',expect.any(AbortSignal),
    ));
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-image"]'))
      .toHaveTextContent('Live camera');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-live-metrics"]'))
      .toHaveTextContent('1920×1080 · measuring fps');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-raw-live"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-frame"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]'))
      .toHaveTextContent('35 / 35 corners');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]'))
      .not.toHaveTextContent('#42');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]'))
      .not.toHaveTextContent('simulation ·');
    const controls = container.querySelector('[data-xgc-role="camera-intrinsic-controls"]');
    expect(controls?.firstElementChild).toHaveAttribute('data-xgc-role','camera-intrinsic-annotated-view');
  });

  it.each(['simulation','physical'] as const)(
    'keeps the first detection result visible while %s capture events advance',
    async (runMode) => {
      const first = deferred<Blob>();
      const latest = deferred<Blob>();
      const signals: AbortSignal[] = [];
      let publishState: (state: CameraIntrinsicState) => void = () => undefined;
      apiMocks.loadImage.mockImplementation((
        _targetId:string,_processInstanceId:string,signal:AbortSignal,
      ) => {
        signals.push(signal);
        return signals.length === 1 ? first.promise : latest.promise;
      });
      apiMocks.openStateStream.mockImplementation((
        _targetId:string,_processInstanceId:string,onState:(state:CameraIntrinsicState) => void,
      ) => {
        publishState = onState;
        return { close:vi.fn() };
      });
      render(<CameraIntrinsicCalibrationRuntimePanel
        processInstanceId={`${runMode}-intrinsic`} targetId="local" panelId={`${runMode}-panel`}
        runMode={runMode}
      />);

      await waitFor(() => expect(apiMocks.loadImage).toHaveBeenCalledTimes(1));
      act(() => {
        publishState(calibrationState({ detection:{ ...calibrationState().detection,sequence:43 } }));
        publishState(calibrationState({ detection:{ ...calibrationState().detection,sequence:44 } }));
      });
      expect(signals[0]?.aborted).toBe(false);

      await act(async () => { first.resolve(new Blob(['first detection'])); });
      expect(await screen.findByRole('img',{ name:'Annotated intrinsic calibration frame' })).toBeInTheDocument();
      await waitFor(() => expect(apiMocks.loadImage).toHaveBeenCalledTimes(2));
      expect(signals[0]?.aborted).toBe(false);

      await act(async () => { latest.resolve(new Blob(['latest detection'])); });
      expect(apiMocks.loadImage).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps the physical inspector compact and lets the operator pause automatic capture', async () => {
    apiMocks.loadState.mockResolvedValue(calibrationState({
      cameraControl:false,
      board:{ type:'aprilgrid',size:[6,6],squareSizeM:0.088,tagFamily:'tag36h11',tagSpacingM:0.0264 },
      detection:{ ...calibrationState().detection,cornerCount:72,expectedCornerCount:144 },
      autoCapture:{ enabled:true,intervalSeconds:0.5,lastError:null,coverageComplete:false },
      guidance:{ complete:false,dimension:'Skew',direction:'tilt',progress:0.58 },
    }));
    const { container } = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="physical-1" targetId="local" panelId="panel-physical" runMode="physical" />);

    const pause = await screen.findByRole('button',{ name:'Pause auto capture' });
    const physicalActions = container.querySelector('.panels-camera-calibration-actions');
    expect([...physicalActions!.children].map((control) => control.getAttribute('data-xgc-role'))).toEqual([
      'camera-intrinsic-auto-capture','camera-intrinsic-analyze',
      'camera-intrinsic-reset','camera-intrinsic-evidence-download',
    ]);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-solve"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-continue"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-runtime"]')).toHaveAttribute('data-mode','physical');
    expect(await screen.findByRole('img',{ name:'Annotated intrinsic calibration frame' })).toBeInTheDocument();
    expect(screen.getByText('72 / 144 corners')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-controls"]')?.firstElementChild)
      .toHaveAttribute('data-xgc-role','camera-intrinsic-annotated-view');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]'))
      .toHaveTextContent('72 / 144 corners');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]'))
      .not.toHaveTextContent('physical ·');
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-source"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-guide"]')).toBeNull();
    expect(container.querySelector('.panels-camera-intrinsic-details')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Auto sweep' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Reset pose' })).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-next-view"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]'))
      .not.toHaveTextContent('tilt the board');
    const guidance=container.querySelector('[data-xgc-role="camera-intrinsic-physical-guidance"]');
    expect(guidance).toHaveAttribute('data-mode','tilt');
    expect(guidance?.querySelector('.panels-camera-intrinsic-guidance-copy')?.children).toHaveLength(2);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-tilt-direction"]')).toBeNull();
    fireEvent.click(pause);
    await waitFor(() => expect(apiMocks.stopAutoCapture).toHaveBeenCalledWith('local','physical-1'));
  });

  it('animates one final relative pose with no extra direction list',async () => {
    apiMocks.loadState.mockResolvedValue(calibrationState({
      cameraControl:false,samples:22,
      coverage:[
        { label:'X',progress:1 },{ label:'Y',progress:0.985 },
        { label:'Size',progress:1 },{ label:'Skew',progress:0.75 },
      ],
      guidance:{ complete:false,dimension:'Y',direction:'bottom',progress:0.985 },
      detection:{
        ...calibrationState().detection,status:'not_detected',cornerCount:0,
        accepted:false,duplicate:false,
      },
    }));
    const { container }=render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="physical-final" targetId="local" panelId="panel-final" runMode="physical" />);

    const coverage=container.querySelector('[data-xgc-role="camera-intrinsic-coverage"]')!;
    const guidance=await waitFor(() => {
      const value=coverage.querySelector('[data-xgc-role="camera-intrinsic-physical-guidance"]');
      expect(value).not.toBeNull();
      return value!;
    });
    expect(guidance).toHaveAttribute('data-mode','frame-bottom');
    expect(guidance).toHaveAttribute('data-xgc-board','symbolic-checker');
    expect(guidance).toHaveAttribute('data-xgc-size-target','0.4');
    expect(guidance.querySelectorAll('.panels-camera-intrinsic-guidance-board > i')).toHaveLength(9);
    expect(guidance.querySelectorAll('.panels-camera-intrinsic-guidance-camera')).toHaveLength(1);
    expect(guidance.querySelector('.panels-camera-intrinsic-guidance-title')?.tagName).toBe('SPAN');
    expect(guidance.querySelector('strong')).toBeNull();
    expect([...guidance.querySelector('.panels-camera-intrinsic-guidance-copy')!.children]
      .map((line) => line.textContent)).toEqual([
      'Next recommended view',
      'Follow this framing and viewing angle.',
    ]);
    expect(guidance.querySelectorAll('.panels-camera-intrinsic-guidance-corner')).toHaveLength(4);
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-annotated-view"]')
      ?.querySelector('[data-xgc-role="camera-intrinsic-physical-guidance"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="camera-intrinsic-raw-live"]')
      ?.querySelector('[data-xgc-role="camera-intrinsic-physical-guidance"]')).toBeNull();
    expect(coverage).toHaveTextContent('X100%');
    expect(coverage).toHaveTextContent('Y99%');
    expect(coverage).toHaveTextContent('Size100%');
    expect(coverage).toHaveTextContent('Skew75%');
    expect(coverage).not.toHaveTextContent('Camera left of board');
    expect(coverage).not.toHaveTextContent('Horizontal framing');
  });

  it('does not toast an already-failed auto sweep after a view remount', async () => {
    const failed = calibrationState({
      action: {
        name: 'auto_run',status: 'failed',targetIndex: 0,targetName: 'left edge',
        error: "automatic sweep could not detect the calibration board at target 'left edge'",
      },
    });
    apiMocks.loadState.mockResolvedValue(failed);
    const view = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-failed" targetId="local" panelId="panel-failed" />);
    expect(await screen.findByRole('button',{ name:'Auto sweep' })).toBeEnabled();
    expect(publishedErrors().join('\n')).not.toMatch(/could not detect the calibration board/);
    view.unmount();
    vi.mocked(useGroundStationErrorNotification).mockClear();
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-failed" targetId="local" panelId="panel-failed" />);
    expect(await screen.findByRole('button',{ name:'Auto sweep' })).toBeEnabled();
    expect(publishedErrors().join('\n')).not.toMatch(/could not detect the calibration board/);
  });

  it('toasts when auto sweep newly fails while the panel is mounted', async () => {
    let publishState: ((state: CameraIntrinsicState) => void) | undefined;
    apiMocks.openStateStream.mockImplementation((_target,_id,onState: (state: CameraIntrinsicState) => void) => {
      publishState = onState;
      return { close: vi.fn() };
    });
    apiMocks.loadState.mockResolvedValue(calibrationState({
      action: { name: 'auto_run',status: 'running',targetIndex: 0,targetName: 'left edge',error: null },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-sweep" targetId="local" panelId="panel-sweep" />);
    await waitFor(() => expect(publishState).toBeDefined());
    act(() => {
      publishState!(calibrationState({
        action: {
          name: 'auto_run',status: 'failed',targetIndex: 0,targetName: 'left edge',
          error: "automatic sweep could not detect the calibration board at target 'left edge'",
        },
      }));
    });
    await waitFor(() => expect(publishedErrors().some((message) => (
      message.includes("could not detect the calibration board at target 'left edge'")
    ))).toBe(true));
  });

  it('keeps an already-analyzed auto-sweep candidate unsaved after refresh', async () => {
    const candidate=calibrationCandidate();
    const succeeded = candidateCalibrationState({
      candidate,
      action:{
        name:'auto_run',status:'succeeded',targetIndex:null,targetName:null,error:null,result:candidate,
      },
    });
    apiMocks.loadState.mockResolvedValue(succeeded);
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-saved" targetId="local" panelId="panel-saved" />);
    await waitFor(() => expect(screen.getByRole('button',{ name:'Download evidence' })).toBeInTheDocument());
    const save = screen.getByRole('button',{ name:'Save result' });
    expect(save).toBeEnabled();
    expect(save).toHaveAttribute('data-xgc-role','camera-intrinsic-save');
    expect(apiMocks.commitAsset).not.toHaveBeenCalled();
  });

  it('offers Save result without auto-committing when auto calibration newly succeeds', async () => {
    let publishState: ((state: CameraIntrinsicState) => void) | undefined;
    apiMocks.openStateStream.mockImplementation((_target,_id,onState: (state: CameraIntrinsicState) => void) => {
      publishState = onState;
      return { close: vi.fn() };
    });
    apiMocks.loadState.mockResolvedValue(calibrationState({
      action: { name: 'auto_run',status: 'running',targetIndex: 1,targetName: 'near',error: null },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-live" targetId="local" panelId="panel-live" />);
    await waitFor(() => expect(publishState).toBeDefined());
    const candidate=calibrationCandidate();
    act(() => {
      publishState!(candidateCalibrationState({
        candidate,
        action:{
          name:'auto_run',status:'succeeded',targetIndex:null,targetName:null,error:null,result:candidate,
        },
      }));
    });
    expect(await screen.findByRole('button',{ name:'Save result' })).toBeEnabled();
    expect(apiMocks.commitAsset).not.toHaveBeenCalled();
    expect(screen.queryByText('Candidate quality accepted')).toBeNull();
    expect(screen.queryByText(/Held-out/)).toBeNull();
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-candidate-quality"]')).toBeNull();
  });

  it('uses server quality, not four coverage bars, as the save authority',async () => {
    const accepted=calibrationCandidate();
    apiMocks.loadState.mockResolvedValue(candidateCalibrationState({
      candidate:accepted,
      coverage:[
        { label:'X',progress:0.2 },{ label:'Y',progress:0.3 },
        { label:'Size',progress:0.4 },{ label:'Skew',progress:0.5 },
      ],
    }));
    const view=render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="quality-authority" targetId="local" panelId="quality-panel" />);
    expect(await screen.findByRole('button',{ name:'Save result' })).toBeEnabled();
    expect(screen.queryByText('Candidate quality accepted')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Analyze candidate' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Continue collecting' })).toBeNull();

    const unstable={
      ...calibrationCandidate(),saveBlocked:'stability_validation_failed' as const,
      quality:{
        ...calibrationCandidate().quality,status:'unstable' as const,
        reasons:['held_out_residual_exceeds_confidence_envelope'],
        assessment:{ ...calibrationCandidate().quality.assessment,passed:false },
      },
    };
    act(() => {
      apiMocks.openStateStream.mock.calls[0]?.[2](candidateCalibrationState({
        candidate:unstable,
        coverage:[
          { label:'X',progress:1 },{ label:'Y',progress:1 },
          { label:'Size',progress:1 },{ label:'Skew',progress:1 },
        ],
      }));
    });
    expect(screen.getByRole('button',{ name:'Save result' })).toBeDisabled();
    expect(screen.queryByText('Candidate needs more views')).toBeNull();
    expect(screen.queryByText(/Held-out/)).toBeNull();
    expect(screen.queryByRole('button',{ name:'Continue collecting' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-candidate-quality"]')).toBeNull();
    view.unmount();
  });

  it('refreshes the server-owned unstable candidate after analysis admission returns 422',async () => {
    const unstable={
      ...calibrationCandidate(),saveBlocked:'stability_validation_failed' as const,
      quality:{
        ...calibrationCandidate().quality,status:'unstable' as const,
        reasons:['projected_intrinsic_rank_deficient'],
        assessment:{ ...calibrationCandidate().quality.assessment,passed:false },
      },
    };
    apiMocks.loadState
      .mockResolvedValueOnce(calibrationState())
      .mockResolvedValue(candidateCalibrationState({ candidate:unstable }));
    apiMocks.analyze.mockRejectedValueOnce(new Error('Intrinsic candidate is unstable'));
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="unstable-analysis" targetId="local" panelId="unstable-panel" />);

    const save=await screen.findByRole('button',{ name:'Analyze calibration' });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole('button',{ name:'Save result' })).toBeDisabled());
    expect(screen.queryByText('Candidate needs more views')).toBeNull();
    expect(screen.queryByText(/Held-out/)).toBeNull();
    expect(publishedErrors()).toContain('Intrinsic candidate is unstable');
  });

  it('saves an analyzed candidate without analyzing it a second time', async () => {
    apiMocks.loadState.mockResolvedValue(candidateCalibrationState());
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-save" targetId="local" panelId="panel-save" />);
    const button = await screen.findByRole('button',{ name:'Save result' });
    expect(button).toHaveAttribute('data-xgc-role','camera-intrinsic-save');
    expect(button).toHaveAttribute('title','Save the current solved calibration.');
    expect(button).toBeEnabled();
    expect(screen.queryByText('Candidate quality accepted')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(apiMocks.saveCandidate).toHaveBeenCalledWith(
      'local','intrinsic-save','candidate-1',
    ));
    await waitFor(() => expect(apiMocks.commitAsset).toHaveBeenCalled());
    expect(apiMocks.analyze).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button',{ name:'Save result' })).toBeDisabled());
    expect(screen.getByRole('button',{ name:'Recalibrate' })).toBeEnabled();
  });

  it('shows a restored result without inviting a duplicate capture or asset commit', async () => {
    apiMocks.loadState.mockResolvedValue(savedCalibrationState({
      cameraControl:false,resultRestored:true,
      autoCapture:{ enabled:false,intervalSeconds:0.5,lastError:null,coverageComplete:false },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="physical-restored" targetId="local" panelId="panel-restored" runMode="physical" />);

    expect(await screen.findByRole('button',{ name:'Download evidence' })).toBeInTheDocument();
    expect(screen.queryByText('Saved calibration restored')).toBeNull();
    expect(screen.queryByRole('button',{ name:'Capture now' })).toBeNull();
    const save = screen.getByRole('button',{ name:'Save result' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('data-xgc-role','camera-intrinsic-save');
    const recalibrate = screen.getByRole('button',{ name:'Recalibrate' });
    expect(recalibrate).toBeEnabled();
    expect(recalibrate).toHaveAttribute('data-xgc-role','camera-intrinsic-reset');
    expect(screen.queryByText('Collection guide complete')).toBeNull();
    expect(apiMocks.commitAsset).not.toHaveBeenCalled();
  });

  it('restores a running analysis and never saves merely because it completes',async () => {
    const job={ id:'job-1',status:'running' as const,stage:'validating' as const,completed:3,total:17,error:null };
    apiMocks.loadState.mockResolvedValue(calibrationState({
      solveJob:job,candidatePool:{ count:17,imageSize:[1280,720],solveFrozen:true },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel processInstanceId="analysis-1" targetId="local" panelId="panel-1" />);
    await waitFor(() => expect(screen.getByRole('button',{ name:'Analyze calibration' })).toBeDisabled());
    expect(screen.getByText('Validating 3 / 17')).toBeInTheDocument();
    const publish=apiMocks.openStateStream.mock.calls.at(-1)?.[2] as (state:CameraIntrinsicState) => void;
    await act(async () => publish(candidateCalibrationState()));
    expect(screen.getByRole('button',{ name:'Save result' })).toBeEnabled();
    expect(apiMocks.analyze).not.toHaveBeenCalled();
    expect(apiMocks.saveCandidate).not.toHaveBeenCalled();
    expect(apiMocks.commitAsset).not.toHaveBeenCalled();
  });

  it('reflects a backend-owned asynchronous auto sweep and disables conflicting actions', async () => {
    apiMocks.loadState.mockResolvedValue(calibrationState({
      action: { name: 'auto_run',status: 'running',targetIndex: 1,targetName: 'near',error: null },
    }));
    render(<CameraIntrinsicCalibrationRuntimePanel processInstanceId="intrinsic-2" targetId="local" panelId="panel-2" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Auto sweep' })).toBeDisabled());
    expect(document.querySelector('[data-xgc-role="camera-intrinsic-coverage"]'))
      .not.toHaveTextContent('Auto sweep');
    expect(screen.queryByRole('button',{ name:'Analyze candidate' })).toBeNull();
    expect(screen.getByRole('button',{ name:'Analyze calibration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to near' })).toBeDisabled();
  });

  it('ignores a candidate that settles after the process identity changes', async () => {
    const earlier = deferred<ReturnType<typeof calibrationCandidate>>();
    apiMocks.analyze.mockReset().mockImplementationOnce(() => earlier.promise);
    const view = render(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-old" targetId="agent-a" panelId="panel-1" />);

    const save=await screen.findByRole('button',{ name:'Analyze calibration' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    view.rerender(<CameraIntrinsicCalibrationRuntimePanel
      processInstanceId="intrinsic-current" targetId="agent-b" panelId="panel-1" />);
    await waitFor(() => expect(apiMocks.loadState).toHaveBeenCalledWith(
      'agent-b','intrinsic-current',expect.any(AbortSignal),
    ));

    await act(async () => earlier.resolve(calibrationCandidate()));
    expect(screen.queryByText('Calibration asset saved')).toBeNull();
    expect(screen.queryByText('0.310 px RMS')).toBeNull();
    expect(screen.queryByText('Candidate quality accepted')).toBeNull();
    expect(apiMocks.saveCandidate).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{ name:'Analyze calibration' })).toBeEnabled();
  });
});

function publishedErrors() {
  return vi.mocked(useGroundStationErrorNotification).mock.calls
    .map(([, message]) => String(message ?? ''))
    .filter((message) => message.length > 0);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => { resolve = onResolve; });
  return { promise,resolve };
}

type CollectingIntrinsicState=Extract<CameraIntrinsicState,{ phase:'collecting' }>;
type CandidateIntrinsicState=Extract<CameraIntrinsicState,{ phase:'candidate_ready' }>;
type SavedIntrinsicState=Extract<CameraIntrinsicState,{ phase:'saved' }>;

function calibrationState(overrides:Partial<CollectingIntrinsicState>={}):CollectingIntrinsicState {
  return {
    mode:'intrinsic',phase:'collecting',sessionRevision:1,collectionRevision:17,
    samples:17,candidatePool:{ count:17,imageSize:[1280,720],solveFrozen:false },
    coverage: [
      { label: 'X',progress: 1 },{ label: 'Y',progress: 0.82 },
      { label: 'Size',progress: 0.76 },{ label: 'Skew',progress: 1 },
    ],
    imageReady:true,resultRestored:false,
    imageTopic: '/camera/image',board: { size: [7,5],squareSizeM: 0.2 },
    targets: [
      { name: 'far',position: [-4,0,1.5],done: true,hasRef: false },
      { name: 'near',position: [0.2,0,1.5],done: false,hasRef: false },
    ],
    next: 1,pose: { x: -4,y: 0,z: 1.5,qx: 0,qy: 0,qz: 0,qw: 1 },cameraControl: true,
    autoCapture:{ enabled:true,intervalSeconds:0.5,lastError:null,coverageComplete:false },
    guidance:{ complete:false,dimension:'Size',direction:'closer',progress:0.76 },
    recovery:{ checkpointFile:'/tmp/intrinsics.yaml.session.npz',checkpointAvailable:true,resultRestored:false,lastError:null },
    evidence:{ available:false,sampleCount:0,filename:'' },
    detection: {
      status:'detected',cornerCount:35,expectedCornerCount:35,frameWidth:1280,frameHeight:720,
      sequence:42,metrics:[
        { label:'X',value:0.18 },{ label:'Y',value:0.72 },
        { label:'Size',value:0.36 },{ label:'Skew',value:0.51 },
      ],accepted:true,duplicate:false,
    },
    ...overrides,
  };
}

function candidateCalibrationState(
  overrides:Partial<CandidateIntrinsicState>={},
):CandidateIntrinsicState {
  const { phase:_phase,...base }=calibrationState();
  return {
    ...base,phase:'candidate_ready',sessionRevision:2,
    candidatePool:{ ...base.candidatePool,solveFrozen:true },
    candidate:calibrationCandidate(),...overrides,
  } as CandidateIntrinsicState;
}

function savedCalibrationState(overrides:Partial<SavedIntrinsicState>={}):SavedIntrinsicState {
  const { phase:_phase,candidatePool:_candidatePool,...base }=calibrationState();
  const result=calibrationResult();
  return {
    ...base,phase:'saved',sessionRevision:3,
    result,outputFile:result.outputFile,savedCandidateId:result.candidateId,
    ...overrides,
  } as SavedIntrinsicState;
}

function calibrationCandidate() {
  return {
    cameraMatrix:[800,0,640,0,805,360,0,0,1] as const,distortion:[-0.1,0.02,0,0,0],
    fx:800,fy:805,cx:640,cy:360,imageWidth:1280,imageHeight:720,
    rmsReprojectionErrorPx:0.31,sampleCount:17,candidateId:'candidate-1',
    phase:'candidate_ready' as const,sessionRevision:2,collectionRevision:17,
    saved:false as const,saveBlocked:'explicit_save_required' as const,
    diagnostics:{ available:true },outputFile:null,
    quality:{
      status:'save_ready' as const,reasons:[],assessment:{
        method:'detector_uncertainty_plus_three_sigma_mad',detectorUncertaintyPx:0.25,
        trainingPerViewMedianPx:0.3,trainingRobustSigmaPx:0.05,confidenceLimitPx:0.8,
        heldOutRmsMaximumPx:0.42,undistortedRayMaximumEquivalentPx:0.38,
        normalizedRayConfidenceLimitPx:0.85,passed:true,
      },
    },
  };
}

function calibrationResult() {
  return {
    cameraMatrix: [800,0,640,0,805,360,0,0,1] as const,distortion: [-0.1,0.02,0,0,0],
    fx: 800,fy: 805,cx: 640,cy: 360,imageWidth: 1280,imageHeight: 720,
    rmsReprojectionErrorPx:0.31,sampleCount:17,candidateId:'candidate-1',
    phase:'saved' as const,sessionRevision:3,collectionRevision:17,saved:true as const,
    outputFile:'/tmp/intrinsics-20260830T120000.000000Z.yaml',
  };
}
