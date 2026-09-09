import {
  Camera,CheckCircle2,Crosshair,FileCode2,LoaderCircle,Pause,
  RotateCcw,Save,Trash2,Undo2,
} from 'lucide-react';
import type { ReactNode,RefObject } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import type {
  CameraExtrinsicPixel,CameraExtrinsicPoint,CameraExtrinsicResult,CameraExtrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { CameraCalibrationRuntimeLayout } from './CameraCalibrationLayouts';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

export type CameraExtrinsicCalibrationRuntimeViewProps = {
  processInstanceId: string;
  serverState?: CameraExtrinsicState;
  imageUrl: string;
  liveStage?: ReactNode;
  frameSize?: readonly [number,number];
  points: readonly CameraExtrinsicPoint[];
  projections: CameraExtrinsicResult['projections'];
  result?: CameraExtrinsicResult;
  availableMarkers: readonly string[];
  selectedMarker: string;
  busyAction: 'freeze' | 'live' | 'solve' | 'save' | '';
  solvePreflightReason: string;
  stageRef: RefObject<HTMLDivElement | null>;
  onImageSize: (size: readonly [number,number]) => void;
  onStageActivate: (clientX: number,clientY: number) => void;
  onSelectMarker: (marker: string) => void;
  onFreeze: () => void;
  onLive: () => void;
  onSolve: () => void;
  onSave: () => void;
  onRemovePoint: (index: number) => void;
  onUndoPoint: () => void;
  onClearPoints: () => void;
};

export function CameraExtrinsicCalibrationRuntimeView(props: CameraExtrinsicCalibrationRuntimeViewProps) {
  const t = useCameraText();
  const { processInstanceId,serverState,imageUrl,liveStage,frameSize,points,projections,result,availableMarkers,
    selectedMarker,busyAction,solvePreflightReason,stageRef,onImageSize,onStageActivate,onSelectMarker,onFreeze,onLive,onSolve,onSave,
    onRemovePoint,onUndoPoint,onClearPoints } = props;
  const inputReady = Boolean(serverState?.source.imageReady
    && serverState.source.intrinsicReady
    && serverState.source.markerCount > 0);
  const stageInteractive = serverState?.mode === 'frozen' && Boolean(selectedMarker) && !busyAction;

  return <CameraCalibrationRuntimeLayout kind="extrinsic" processInstanceId={processInstanceId}
    dataMode={serverState?.mode ?? 'loading'}
    stage={<div ref={stageRef}
        className="panels-camera-calibration-stage panels-camera-extrinsic-stage"
        data-xgc-interactive={stageInteractive ? 'true' : undefined}
        data-xgc-role="camera-calibration-image" data-xgc-id={processInstanceId}
        role={stageInteractive ? 'button' : undefined}
        tabIndex={stageInteractive ? 0 : undefined}
        aria-label={stageInteractive
          ? t('Calibration image: place {marker} at the selected image position', { marker:selectedMarker })
          : t('Calibration camera image')}
        onClick={(event) => onStageActivate(event.clientX,event.clientY)}
        onKeyDown={(event) => {
          if (!stageInteractive || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          onStageActivate(bounds.left + bounds.width / 2,bounds.top + bounds.height / 2);
        }}>
        {serverState?.mode !== 'frozen' && liveStage ? liveStage
          : imageUrl ? <img src={imageUrl} alt={t('Gazebo calibration camera')} draggable={false}
          onLoad={(event) => onImageSize([event.currentTarget.naturalWidth,event.currentTarget.naturalHeight])} />
          : <div className="panels-camera-calibration-image-placeholder">
            <Camera size={28} aria-hidden="true" /><span>{t('Waiting for the camera stream')}</span>
          </div>}
        {frameSize && <svg className="panels-camera-extrinsic-overlay"
          viewBox={`0 0 ${frameSize[0]} ${frameSize[1]}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {projections.map((projection) => <CalibrationPointOverlay key={`projection:${projection.marker}`}
            marker={projection.marker} pixel={projection.pixel} kind="projection" />)}
          {points.map((point) => <CalibrationPointOverlay key={`point:${point.marker}`}
            marker={point.marker} pixel={point.pixel} kind="selected" />)}
        </svg>}
      </div>}
    frameMetadata={<>
        <span>{serverState?.frame
          ? `${serverState.frame.width}×${serverState.frame.height} · ${serverState.frame.frameId}`
          : serverState?.source.imageReady ? t('Gazebo live camera') : t('Camera input pending')}</span>
        {serverState?.mode === 'frozen'
          && <span>{t('{count} static markers', { count:serverState.markers.length })}</span>}
      </>}>
      <div className="panels-camera-extrinsic-correspondence-control">
        <span className="panels-camera-extrinsic-step"><b>1</b>{t('Select a rigid body')}</span>
        <SelectControl value={selectedMarker}
          options={availableMarkers.map((name) => ({ value: name,label: name }))}
          onChange={onSelectMarker}
          placeholder={serverState?.mode === 'frozen'
            ? availableMarkers.length ? t('Select marker') : t('All markers selected')
            : t('Freeze frame first')}
          icon={<Crosshair size={14} />} ariaLabel={t('Rigid body pose')} dataXgcRole="camera-calibration-marker"
          dataXgcId={processInstanceId} fill
          disabled={Boolean(busyAction) || serverState?.mode !== 'frozen' || availableMarkers.length === 0} />
        <span className="panels-camera-extrinsic-step"><b>2</b>{t('Click its coordinate origin in the image')}</span>
      </div>

      <div className="panels-camera-extrinsic-points" data-xgc-role="camera-calibration-points" data-xgc-id={processInstanceId}>
        <div className="panels-camera-extrinsic-section-heading">
          <span>{t('Correspondences')}</span><b>{points.length}</b><div>
            <ControlButton iconOnly size="compact" aria-label={t('Undo last correspondence')} title={t('Undo last')}
              dataXgcRole="camera-calibration-undo" dataXgcId={processInstanceId}
              disabled={Boolean(busyAction) || points.length === 0} onClick={onUndoPoint}><Undo2 size={13} /></ControlButton>
            <ControlButton iconOnly size="compact" aria-label={t('Clear correspondences')} title={t('Clear')}
              dataXgcRole="camera-calibration-clear" dataXgcId={processInstanceId}
              disabled={Boolean(busyAction) || points.length === 0} onClick={onClearPoints}><Trash2 size={13} /></ControlButton>
          </div>
        </div>
        {points.length ? <ol>{points.map((point,index) => <li key={point.marker}>
          <span className="panels-camera-extrinsic-point-index">{index + 1}</span><strong>{point.marker}</strong>
          <span>{point.pixel[0].toFixed(1)}, {point.pixel[1].toFixed(1)}</span>
          <span className="panels-camera-extrinsic-point-error" data-xgc-outlier={point.inlier === false ? 'true' : undefined}>
            {point.reprojectionErrorPx == null ? '—' : `${point.reprojectionErrorPx.toFixed(2)} px`}
          </span>
          <ControlButton iconOnly size="compact" aria-label={t('Remove {marker}', { marker:point.marker })}
            title={t('Remove {marker}', { marker:point.marker })}
            dataXgcRole="camera-calibration-remove-point" dataXgcId={`${processInstanceId}:${point.marker}`}
            disabled={Boolean(busyAction)} onClick={() => onRemovePoint(index)}><Trash2 size={11} /></ControlButton>
        </li>)}</ol> : <div className="panels-camera-extrinsic-points-empty">{t('No points selected')}</div>}
      </div>

      <div className="panels-camera-calibration-actions panels-camera-extrinsic-actions">
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-freeze" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || !inputReady || serverState?.mode === 'frozen'}
          title={freezeDisabledReason(t,serverState)} onClick={onFreeze}>
          {busyAction === 'freeze' ? <LoaderCircle className="spin" size={14} /> : <Pause size={14} />}{t('Freeze')}
        </ControlButton>
        <ControlButton dataXgcRole="camera-calibration-live" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || serverState?.mode !== 'frozen'} onClick={onLive}>
          {busyAction === 'live' ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}{t('Live')}
        </ControlButton>
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-solve" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || serverState?.mode !== 'frozen' || points.length < 4}
          title={solvePreflightReason
            ? localizeCameraMessage(t,solvePreflightReason) : t('Solve the camera transform candidate without saving.')}
          onClick={onSolve}>
          {busyAction === 'solve' ? <LoaderCircle className="spin" size={14} /> : <Crosshair size={14} />}{t('Solve')}
        </ControlButton>
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-save" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || !result || result.saved}
          title={result?.saved ? t('This candidate is already saved.') : t('Save the current solved candidate.')}
          onClick={onSave}>
          {busyAction === 'save' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t('Save result')}
        </ControlButton>
      </div>

      {result && serverState && <CalibrationResult processInstanceId={processInstanceId} state={serverState} result={result} />}

      {serverState && <details className="panels-camera-calibration-details panels-camera-extrinsic-details">
        <summary><FileCode2 size={13} />{t('Capture inputs and output')}</summary><dl>
          <dt>{t('Image source')}</dt><dd title={serverState.source.imageTopic}>{serverState.source.imageTopic}</dd>
          <dt>{t('Intrinsics')}</dt><dd title={serverState.source.intrinsicFile}>{serverState.source.intrinsicSource === 'ideal-pinhole' ? `Ideal pinhole · HFOV ${serverState.source.idealHorizontalFovDegrees ?? '—'}° · assumed, not measured` : serverState.source.intrinsicFile || 'Model source unspecified'}</dd>
          <dt>{t('Poses')}</dt><dd title={serverState.source.posePrefix}>{serverState.source.posePrefix}</dd>
          <dt>{t('Output')}</dt><dd title={serverState.outputFile}>{serverState.outputFile || '—'}</dd>
        </dl>
      </details>}
  </CameraCalibrationRuntimeLayout>;
}

function CalibrationPointOverlay({ marker,pixel,kind }: {
  marker: string;pixel: CameraExtrinsicPixel;kind: 'selected' | 'projection';
}) {
  return <g className="panels-camera-extrinsic-overlay-point" data-xgc-kind={kind} transform={`translate(${pixel[0]} ${pixel[1]})`}>
    <circle r={kind === 'selected' ? 8 : 6} /><path d="M -12 0 H 12 M 0 -12 V 12" /><text x="13" y="-10">{marker}</text>
  </g>;
}

function CalibrationResult({ processInstanceId,state,result }: {
  processInstanceId: string;state: CameraExtrinsicState;result: CameraExtrinsicResult;
}) {
  const t = useCameraText();
  return <div className="panels-camera-calibration-result panels-camera-extrinsic-result"
    data-xgc-role="camera-calibration-result" data-xgc-id={processInstanceId}>
    <div><CheckCircle2 size={15} /><strong>{state.parentFrame} → {state.childFrame}</strong></div><dl>
      <dt>{t('Mean error')}</dt><dd>{result.meanReprojectionErrorPx.toFixed(3)} px</dd>
      <dt>{t('Max error')}</dt><dd>{result.maxReprojectionErrorPx.toFixed(3)} px</dd>
      <dt>xyz</dt><dd>{formatVector(result.translation)}</dd>
      <dt>q xyzw</dt><dd>{formatVector(result.quaternionXyzw)}</dd>
    </dl>{result.warnings.map((warning) => <span key={warning}>{localizeCameraMessage(t,warning)}</span>)}
  </div>;
}

function freezeDisabledReason(t: ReturnType<typeof useCameraText>,state?: CameraExtrinsicState) {
  if (!state) return t('Waiting for the calibration backend.');
  if (state.mode === 'frozen') return t('Return to live mode before freezing a new frame.');
  if (!state.source.imageReady) return t('Waiting for a camera image.');
  if (!state.source.intrinsicReady) return t('Waiting for the selected intrinsic file.');
  if (!state.source.markerCount) return t('Waiting for rigid body poses.');
  return t('Freeze one immutable image with the latest static marker poses.');
}

function formatVector(values: readonly number[]) { return `[${values.map((value) => value.toFixed(5)).join(', ')}]`; }
