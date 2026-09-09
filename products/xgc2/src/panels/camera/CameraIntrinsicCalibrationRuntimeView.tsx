import {
  Aperture,Camera,CheckCircle2,Download,Focus,LoaderCircle,
  MapPin,Pause,Play,RotateCcw,Save,ScanLine,Video,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@xgc2/ui-react';
import { ProgressBar } from '../../components/ProgressBar';
import { ControlButton } from '../../components/controls/ControlButton';
import type {
  CameraCalibrationAssetPin,CameraIntrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { MEASURED_READY_PROGRESS_FILL } from '../../shared/measuredReadyProgress';
import { CameraCalibrationRuntimeLayout } from './CameraCalibrationLayouts';
import type { CameraVideoPlaybackMetrics } from './CameraVideoPanel';
import { useCameraText } from './cameraMessages';

export type CameraIntrinsicAction =
  | 'analyze' | 'save' | 'reset' | 'goto' | 'auto-run' | 'auto-capture' | 'download' | '';

export type CameraIntrinsicCalibrationRuntimeViewProps = {
  processInstanceId: string;
  runMode?: string;
  serverState?: CameraIntrinsicState;
  liveStage?: ReactNode;
  livePlaybackMetrics?: CameraVideoPlaybackMetrics;
  annotatedImageUrl: string;
  selectedTargetIndex: number | null;
  assetPin?: CameraCalibrationAssetPin;
  busyAction: CameraIntrinsicAction;
  onAnalyze: () => void;
  onSave: () => void;
  onReset: () => void;
  onGotoTarget: (index: number) => void;
  onAutoRun: () => void;
  onToggleAutoCapture: () => void;
  onDownloadEvidence: () => void;
};

export function CameraIntrinsicCalibrationRuntimeView({
  processInstanceId,runMode = 'simulation',serverState,liveStage,livePlaybackMetrics,annotatedImageUrl,selectedTargetIndex,assetPin,busyAction,
  onAnalyze,onSave,onReset,onGotoTarget,onAutoRun,onToggleAutoCapture,onDownloadEvidence,
}: CameraIntrinsicCalibrationRuntimeViewProps) {
  const t = useCameraText();
  const physicalMode = runMode === 'physical';
  const capturedTargets = serverState?.targets.filter((target) => target.done).length ?? 0;
  const targetCount = serverState?.targets.length ?? 0;
  const calibrationStored = Boolean(serverState?.phase==='saved' && (assetPin || serverState.resultRestored));
  const physicalAutoCapture = physicalMode && serverState?.autoCapture.enabled === true;
  const autoRunReady = Boolean(
    serverState?.imageReady
    && serverState.autoCapture.enabled
    && !serverState.autoCapture.lastError
    && serverState.detection.sequence > 0
  );
  const actionBusy = Boolean(busyAction);
  const canSave=Boolean(serverState && !actionBusy && !calibrationStored && (
    (serverState.phase==='candidate_ready' && serverState.candidate.quality.status==='save_ready')
    || serverState.phase==='saved'
  ));
  const detection = serverState?.detection;
  const analysisPhase=!serverState || serverState.phase==='collecting';
  const analyzeControl=<ControlButton tone="primary" dataXgcRole="camera-intrinsic-analyze"
    dataXgcId={processInstanceId} disabled={actionBusy || serverState?.phase!=='collecting' || serverState.candidatePool.count<3}
    aria-busy={serverState?.solveJob?.status==='running' || busyAction==='analyze'}
    title={t('Analyze and validate the preserved observations without saving a result.')} onClick={onAnalyze}>
    {busyAction==='analyze' ? <LoaderCircle className="spin" size={14} /> : <ScanLine size={14} />}
    {t('Analyze calibration')}
  </ControlButton>;
  const saveControl=<ControlButton tone="primary" dataXgcRole="camera-intrinsic-save"
    dataXgcId={processInstanceId} disabled={!canSave}
    title={saveDisabledReason(t,serverState,assetPin,actionBusy)} onClick={onSave}>
    {busyAction==='save' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
    {t('Save result')}
  </ControlButton>;

  return <CameraCalibrationRuntimeLayout kind="intrinsic" processInstanceId={processInstanceId}
    dataMode={physicalMode ? 'physical' : 'simulation'}
    dataState={serverState?.phase ?? 'loading'}
    stage={<section className="panels-camera-intrinsic-card panels-camera-intrinsic-live-preview"
        data-xgc-role="camera-intrinsic-image" data-xgc-id={processInstanceId}>
        <header>
          <div><Video size={14} /><strong>{t('Live camera')}</strong></div>
          <span data-xgc-role="camera-intrinsic-live-metrics" data-xgc-id={processInstanceId}>
            {formatLivePlaybackMetrics(t,livePlaybackMetrics)}
          </span>
        </header>
        <div className="panels-camera-intrinsic-raw-live" data-xgc-role="camera-intrinsic-raw-live" data-xgc-id={processInstanceId}>
          {liveStage ?? <FramePlaceholder text={t('Waiting for the live camera')} />}
        </div>
      </section>}>
      <section className="panels-camera-intrinsic-card panels-camera-intrinsic-detection-preview"
        data-xgc-role="camera-intrinsic-annotated-view" data-xgc-id={processInstanceId}>
        <header><div><Camera size={14} /><strong>{t('Detection result')}</strong></div>
          <span data-xgc-role="camera-intrinsic-detection"
            data-xgc-id={processInstanceId}
            data-xgc-detected={detection?.status === 'detected' ? 'true' : undefined}
            title={detection?.sequence
              ? t('Board visibility in the current continuously processed frame; not cumulative calibration progress.')
              : t('Waiting for the continuous detector to process its first image.')}>
            {detection?.sequence ? detectionCornerSummary(t,serverState) : t('waiting')}
          </span></header>
        {annotatedImageUrl
          ? <img src={annotatedImageUrl} alt={t('Annotated intrinsic calibration frame')} draggable={false}
              data-xgc-role="camera-intrinsic-annotated-frame" data-xgc-id={processInstanceId} />
          : <FramePlaceholder text={t('Waiting for a detection result')} />}
      </section>
      <section className="panels-camera-intrinsic-card panels-camera-intrinsic-coverage"
        data-xgc-role="camera-intrinsic-coverage" data-xgc-id={processInstanceId}>
        <header><div><Aperture size={14} /><strong>{t('View coverage')}</strong></div>
          <span data-xgc-role="camera-intrinsic-analysis-progress" data-xgc-id={processInstanceId} aria-live="polite">{coverageSampleStatus(t,serverState)}</span></header>
        <div className="panels-camera-intrinsic-bars">
          {(serverState?.coverage ?? []).map((coverage) => {
            const progress = clampProgress(coverage.progress);
            return <label key={coverage.label}
              data-xgc-role="camera-intrinsic-coverage-bar"
              data-xgc-id={`${processInstanceId}:${coverage.label}`}>
              <span>{coverage.label}<b>{Math.round(progress * 100)}%</b></span>
              <ProgressBar
                percent={progress * 100}
                value={progress}
                max={1}
                label={coverage.label}
                tone={progress >= 1 ? 'success' : 'warning'}
                color={progress >= 1 ? MEASURED_READY_PROGRESS_FILL : undefined}
                size="compact"
                appearance="inset"
              />
            </label>;
          })}
        </div>
        {physicalMode && serverState?.phase==='collecting'
          ? <PhysicalCalibrationGuidance state={serverState} processInstanceId={processInstanceId} /> : null}
      </section>

      {!physicalMode && targetCount > 0 && (
        <section className="panels-camera-intrinsic-card panels-camera-intrinsic-guide"
          data-xgc-role="camera-intrinsic-guide" data-xgc-id={processInstanceId}>
          <header><div><MapPin size={14} /><strong>{t('Views')}</strong></div>
            <span>{capturedTargets}/{targetCount}</span></header>
          <ol>
            {(serverState?.targets ?? []).map((target,index) => <li key={`${target.name}:${index}`}>
              <Button appearance="ghost" type="button"
                aria-current={selectedTargetIndex === index ? 'step' : undefined}
                data-done={target.done ? 'true' : undefined}
                data-next={serverState?.next === index ? 'true' : undefined}
                data-xgc-role="camera-intrinsic-target" data-xgc-id={`${processInstanceId}:${index}`}
                disabled={actionBusy || serverState?.phase!=='collecting' || !serverState?.cameraControl}
                title={serverState?.phase==='saved'
                  ? t('Recalibrate before changing the simulated camera pose.')
                  : serverState?.phase==='candidate_ready'
                    ? t('Save or reset before changing the simulated camera pose.')
                  : serverState?.cameraControl
                    ? t('Move the simulated camera to {name}', { name:target.name })
                    : t('Camera pose control is unavailable.')}
                aria-label={t('Go to {name}', { name:target.name })}
                onClick={() => onGotoTarget(index)}>
                <span className="panels-camera-intrinsic-target-icon">
                  {target.done ? <CheckCircle2 size={13} /> : <Focus size={13} />}
                </span>
                <span className="panels-camera-intrinsic-target-label">{target.name}</span>
              </Button>
            </li>)}
          </ol>
        </section>
      )}

      <div className="panels-camera-calibration-actions panels-camera-intrinsic-actions">
        {physicalMode && <ControlButton tone="primary" dataXgcRole="camera-intrinsic-auto-capture" dataXgcId={processInstanceId}
          disabled={actionBusy || !serverState || serverState.phase!=='collecting'}
          title={serverState?.phase==='saved'
            ? t('A saved calibration is already loaded; reset only when intentionally recalibrating.')
            : serverState?.phase==='candidate_ready'
            ? t('Save or reset before inspecting more frames.')
            : physicalAutoCapture ? t('Pause automatic frame inspection.') : t('Resume automatic frame inspection.')}
          onClick={onToggleAutoCapture}>
          {busyAction === 'auto-capture' ? <LoaderCircle className="spin" size={14} />
            : physicalAutoCapture ? <Pause size={14} /> : <Play size={14} />}
          {physicalAutoCapture ? t('Pause auto capture') : t('Resume auto capture')}
        </ControlButton>}
        {!physicalMode && <ControlButton dataXgcRole="camera-intrinsic-auto-run" dataXgcId={processInstanceId}
          disabled={actionBusy || serverState?.phase!=='collecting' || !serverState?.cameraControl || !autoRunReady}
          title={serverState?.phase==='saved'
            ? t('Recalibrate before starting another automatic sweep.')
            : serverState?.phase==='candidate_ready'
            ? serverState.candidate.quality.status==='save_ready'
              ? t('Save or reset before starting another automatic sweep.')
              : t('Reset samples before starting another automatic sweep.')
            : !serverState?.cameraControl ? t('Camera pose control is unavailable.')
            : !autoRunReady ? t('Wait for the continuous detector to process a fresh frame before starting the sweep.')
            : t('Sweep every recommended simulation pose.')}
          onClick={onAutoRun}>
          {busyAction === 'auto-run' ? <LoaderCircle className="spin" size={14} /> : <ScanLine size={14} />}
          {t('Auto sweep')}
        </ControlButton>}
        {analysisPhase ? analyzeControl : saveControl}
        <ControlButton dataXgcRole="camera-intrinsic-reset" dataXgcId={processInstanceId}
          disabled={actionBusy || !serverState}
          title={serverState?.phase==='saved'
            ? t('Start a new capture stage. The versioned Calibration Asset remains safe.')
            : t('Discard samples and start a new calibration.')}
          onClick={onReset}>
          {busyAction === 'reset' ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}
          {serverState?.phase==='saved' ? t('Recalibrate') : t('Reset samples')}
        </ControlButton>
        <ControlButton dataXgcRole="camera-intrinsic-evidence-download"
          dataXgcId={processInstanceId} disabled={!serverState?.evidence.available || actionBusy}
          title={serverState?.evidence.available
            ? serverState.phase==='saved'
              ? t('Download the accepted source frames, full-resolution annotations, manifest, and calibration YAML.')
              : t('Download the accepted source frames, annotations, manifest, candidate diagnostics, and quality report.')
            : t('No reproducibility evidence is available for this observation pool.')}
          onClick={onDownloadEvidence}>
          {busyAction === 'download' ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}
          {t('Download evidence')}
        </ControlButton>
      </div>
  </CameraCalibrationRuntimeLayout>;
}

function FramePlaceholder({ text }: { text:string }) {
  return <div className="panels-camera-calibration-image-placeholder">
    <Camera size={28} aria-hidden="true" /><span>{text}</span>
  </div>;
}

function saveDisabledReason(
  t:ReturnType<typeof useCameraText>,
  state:CameraIntrinsicState|undefined,
  assetPin:CameraCalibrationAssetPin|undefined,
  busy:boolean,
) {
  if (busy) return t('Wait for the current calibration action to finish.');
  if (!state) return t('Waiting for the calibration backend.');
  if (state.phase==='collecting') {
    return state.candidatePool.count<3
      ? t('Capture at least three valid board observations first.')
      : t('Analyze the observations before saving.');
  }
  if (state.phase==='candidate_ready') {
    return state.candidate.quality.status==='save_ready'
      ? t('Save the current solved calibration.')
      : t('This solve is not ready to save. Reset samples to collect a new set.');
  }
  if (assetPin || state.resultRestored) return t('This calibration is already stored as a versioned asset.');
  return t('Commit the saved calibration as a versioned asset.');
}

function clampProgress(value: number) { return Math.min(1, Math.max(0, value)); }
type PhysicalGuidanceMode =
  | 'frame-center' | 'frame-left' | 'frame-right' | 'frame-top' | 'frame-bottom'
  | 'closer' | 'tilt' | 'complete';

function PhysicalCalibrationGuidance({ state,processInstanceId }:{
  state:CameraIntrinsicState;processInstanceId:string;
}) {
  const t=useCameraText();
  const recommendation=physicalRecommendation(state);
  return <div className="panels-camera-intrinsic-guidance"
    data-xgc-role="camera-intrinsic-physical-guidance" data-xgc-id={processInstanceId} data-mode={recommendation.mode}
    data-xgc-board="symbolic-checker" data-xgc-size-target="0.4">
    <div className="panels-camera-intrinsic-guidance-demo" aria-hidden="true">
      <div className="panels-camera-intrinsic-guidance-viewfinder">
        {['top-left','top-right','bottom-left','bottom-right'].map((corner) =>
          <span key={corner} className="panels-camera-intrinsic-guidance-corner" data-corner={corner} />)}
        <div className="panels-camera-intrinsic-guidance-board">
          {Array.from({ length:9 },(_,index) => <i key={index} />)}
        </div>
        <Camera className="panels-camera-intrinsic-guidance-camera" size={12} />
      </div>
    </div>
    <div className="panels-camera-intrinsic-guidance-copy">
      <span className="panels-camera-intrinsic-guidance-title">
        {recommendation.mode==='complete' ? t('Collection guide complete') : t('Next recommended view')}
      </span>
      <span className="panels-camera-intrinsic-guidance-instruction">
        {recommendation.mode==='complete'
          ? t('You can capture more views or analyze the current pool.')
          : t('Follow this framing and viewing angle.')}
      </span>
    </div>
  </div>;
}

function physicalRecommendation(
  state:CameraIntrinsicState,
):{ mode:PhysicalGuidanceMode } {
  const guidance=state.guidance;
  if (guidance.complete || guidance.direction==='complete') return { mode:'complete' };
  if (guidance.dimension==='X') {
    if (guidance.direction==='right') return { mode:'frame-right' };
    return { mode:guidance.direction==='left' ? 'frame-left' : 'frame-center' };
  }
  if (guidance.dimension==='Y') {
    if (guidance.direction==='bottom') return { mode:'frame-bottom' };
    return { mode:guidance.direction==='top' ? 'frame-top' : 'frame-center' };
  }
  if (guidance.dimension==='Size' || guidance.direction==='closer') return { mode:'closer' };
  if (guidance.dimension==='Skew' || guidance.direction==='tilt') return { mode:'tilt' };
  return { mode:'frame-center' };
}

function detectionCornerSummary(t: ReturnType<typeof useCameraText>,state: CameraIntrinsicState | undefined) {
  const detection = state?.detection;
  if (!detection || detection.status === 'waiting') return t('No detection result yet');
  return detection.status === 'detected'
    ? t('{corners} / {expected} corners', { corners:detection.cornerCount,expected:detection.expectedCornerCount })
    : t('{corners} / {expected} corners', { corners:0,expected:detection.expectedCornerCount });
}
function formatLivePlaybackMetrics(t: ReturnType<typeof useCameraText>,metrics: CameraVideoPlaybackMetrics | undefined) {
  if (!metrics) return t('waiting for stream metrics');
  const fps = metrics.fps === undefined ? t('measuring fps') : `${metrics.fps.toFixed(1)} fps`;
  return `${metrics.width}×${metrics.height} · ${fps}`;
}
function coverageSampleStatus(t: ReturnType<typeof useCameraText>,state: CameraIntrinsicState | undefined) {
  if (!state) return t('{count} samples', { count:0 });
  const job=state.solveJob;
  if (job?.status==='running') {
    return job.stage==='validating'
      ? t('Validating {completed} / {total}', { completed:job.completed,total:job.total })
      : t('Analyzing {count} samples', { count:state.samples });
  }
  return t('{count} samples', { count:state.samples });
}
