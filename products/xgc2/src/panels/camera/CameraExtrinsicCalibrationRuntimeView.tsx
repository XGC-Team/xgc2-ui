import {
  Camera,CheckCircle2,Crosshair,FileCode2,LoaderCircle,
  RotateCcw,Save,Trash2,Undo2,ZoomIn,ZoomOut,
} from 'lucide-react';
import { useRef,useState,type ReactNode,type RefObject } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import type {
  CameraExtrinsicPixel,CameraExtrinsicSample,CameraExtrinsicResult,CameraExtrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { CameraCalibrationRuntimeLayout } from './CameraCalibrationLayouts';
import { CalibrationImagePlaceholder } from './CameraCalibrationReadonlyViews';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

export type CameraExtrinsicCalibrationRuntimeViewProps = {
  processInstanceId: string;
  serverState?: CameraExtrinsicState;
  imageUrl: string;
  liveStage?: ReactNode;
  points: readonly CameraExtrinsicSample[];
  selectedSample?:CameraExtrinsicSample;
  captureReady:boolean;
  reviewImageIdentity:string;
  reviewImageReady:boolean;
  onReviewImageDecoded:(identity:string,width:number,height:number) => void;
  onReviewImageError:(identity:string) => void;
  result?: CameraExtrinsicResult;
  availableMarkers: readonly string[];
  selectedMarker: string;
  busyAction: string;
  solvePreflightReason: string;
  stageRef: RefObject<HTMLDivElement | null>;
  onStageActivate: (clientX: number,clientY: number) => void;
  onSelectMarker: (marker: string) => void;
  onResample: () => void;
  onReviewSample: (sampleId:string) => void;
  onLive: () => void;
  onRefresh: () => void;
  onSolve: () => void;
  onSave: () => void;
  onRemovePoint: (sampleId: string) => void;
  onUndoPoint: () => void;
  onClearPoints: () => void;
};

export function CameraExtrinsicCalibrationRuntimeView(props: CameraExtrinsicCalibrationRuntimeViewProps) {
  const t = useCameraText();
  const { processInstanceId,serverState,imageUrl,liveStage,points,result,availableMarkers,selectedSample,captureReady,
    selectedMarker,busyAction,solvePreflightReason,stageRef,onStageActivate,onSelectMarker,onResample,onReviewSample,onLive,onRefresh,onSolve,onSave,
    onRemovePoint,onUndoPoint,onClearPoints,reviewImageIdentity,reviewImageReady,onReviewImageDecoded,onReviewImageError } = props;
  const reviewImageRef=useRef<HTMLImageElement>(null);
  const decodeAttemptRef=useRef(0);
  const [magnification,setMagnification] = useState({ imageUrl:'',value:1 });
  const zoom = selectedSample && magnification.imageUrl===imageUrl ? magnification.value : 1;
  const changeZoom = (value:number) => setMagnification({ imageUrl,value });
  const stageInteractive = !busyAction && (selectedSample ? reviewImageReady : captureReady && Boolean(selectedMarker));
  const frameSize=selectedSample ? [selectedSample.image.width,selectedSample.image.height] : undefined;
  const overlayPoints=selectedSample ? points.filter((point) => point.sampleId===selectedSample.sampleId) : [];
  const projections=selectedSample ? result?.projections.filter((point) => point.sampleId===selectedSample.sampleId) ?? [] : [];

  const decodeReviewImage=async (image:HTMLImageElement) => {
    const attempt=++decodeAttemptRef.current;
    try {
      // load plus native dimensions is the fallback for older Image implementations.
      // decode() additionally waits for the pixels that this exact element will draw.
      if (typeof image.decode==='function') await image.decode();
      if (reviewImageRef.current!==image || decodeAttemptRef.current!==attempt) return;
      if (image.naturalWidth<1 || image.naturalHeight<1) throw new Error('Image has no decoded pixels');
      onReviewImageDecoded(reviewImageIdentity,image.naturalWidth,image.naturalHeight);
    } catch {
      if (reviewImageRef.current===image && decodeAttemptRef.current===attempt) onReviewImageError(reviewImageIdentity);
    }
  };

  return <CameraCalibrationRuntimeLayout kind="extrinsic" processInstanceId={processInstanceId}
    dataMode={selectedSample ? 'frozen' : serverState ? 'live' : 'loading'}
    stage={<div className="panels-camera-extrinsic-zoom-layout">
      <div className="panels-camera-extrinsic-zoom-tools">
        <ControlButton dataXgcRole="camera-calibration-refresh" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction)} onClick={onRefresh}><RotateCcw size={14} />Refresh</ControlButton>
        <ControlButton dataXgcRole="camera-extrinsic-zoom-out" dataXgcId={processInstanceId}
          disabled={zoom===1} title={t('Zoom out')} onClick={() => changeZoom(Math.max(1,zoom/2))}>
          <ZoomOut size={14} />{t('Zoom out')}
        </ControlButton>
        <ControlButton dataXgcRole="camera-extrinsic-zoom-in" dataXgcId={processInstanceId}
          disabled={!selectedSample || !imageUrl || zoom===8} title={t('Zoom in')} onClick={() => changeZoom(Math.min(8,zoom*2))}>
          <ZoomIn size={14} />{t('Zoom in')}
        </ControlButton>
        <ControlButton dataXgcRole="camera-extrinsic-zoom-fit" dataXgcId={processInstanceId}
          disabled={zoom===1} onClick={() => changeZoom(1)}>{t('Fit image')}</ControlButton>
      </div>
      <div className="panels-camera-extrinsic-zoom-viewport">
      <div className="panels-camera-extrinsic-zoom-scroll">
      <div ref={stageRef} style={{ width:`${zoom*100}%`,height:`${zoom*100}%` }}
        className="panels-camera-calibration-stage panels-camera-extrinsic-stage"
        data-xgc-interactive={stageInteractive ? 'true' : undefined}
        data-xgc-role="camera-calibration-image" data-xgc-id={processInstanceId}
        role={stageInteractive ? 'button' : undefined}
        tabIndex={stageInteractive ? 0 : undefined}
        aria-label={stageInteractive
          ? t('Calibration image: place {marker} at the selected image position', { marker:selectedSample?.marker ?? selectedMarker })
          : t('Calibration camera image')}
        onClick={(event) => onStageActivate(event.clientX,event.clientY)}
        onKeyDown={(event) => {
          if (!stageInteractive || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          onStageActivate(bounds.left + bounds.width / 2,bounds.top + bounds.height / 2);
        }}>
        <div className="panels-camera-extrinsic-live" hidden={Boolean(selectedSample)}>{liveStage}</div>
        {selectedSample && imageUrl ? <img key={reviewImageIdentity} ref={reviewImageRef} src={imageUrl} alt={t('Captured calibration image')} draggable={false}
          onLoad={(event) => void decodeReviewImage(event.currentTarget)}
          onError={() => { decodeAttemptRef.current++;onReviewImageError(reviewImageIdentity); }} />
          : (selectedSample || !liveStage) && <CalibrationImagePlaceholder text={t('Waiting for the camera stream')} />}
        {frameSize && <svg className="panels-camera-extrinsic-overlay"
          viewBox={`0 0 ${frameSize[0]} ${frameSize[1]}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {projections.map((projection) => <CalibrationPointOverlay key={`projection:${projection.sampleId}`}
            marker={projection.marker} pixel={projection.pixel} kind="projection" />)}
          {overlayPoints.map((point) => <CalibrationPointOverlay key={`point:${point.sampleId}`}
            marker={point.marker} pixel={point.pixel} kind="selected" />)}
        </svg>}
      </div></div></div></div>}
    frameMetadata={<>
        <span>{selectedSample
          ? `${selectedSample.image.width}×${selectedSample.image.height} · ${selectedSample.marker}`
          : serverState?.source.imageReady ? t('Gazebo live camera') : t('Camera input pending')}</span>
      </>}>
      <div className="panels-camera-extrinsic-correspondence-control">
        <span className="panels-camera-extrinsic-step"><b>1</b>{t('Select a rigid body')}</span>
        <SelectControl value={selectedMarker}
          options={availableMarkers.map((name) => ({ value: name,label: name }))}
          onChange={onSelectMarker}
          placeholder={t('Select marker')}
          icon={<Crosshair size={14} />} ariaLabel={t('Rigid body pose')} dataXgcRole="camera-calibration-marker"
          dataXgcId={processInstanceId} fill
          disabled={Boolean(busyAction) || Boolean(selectedSample) || availableMarkers.length === 0} />
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
        {points.length ? <ol>{points.map((point,index) => <li key={point.sampleId}>
          <span className="panels-camera-extrinsic-point-index">{index + 1}</span>
          <ControlButton size="compact" aria-label={t('View sample {index}: {marker}',{ index:index+1,marker:point.marker })}
            className="panels-camera-extrinsic-review-point"
            dataXgcRole="camera-calibration-review-point" dataXgcId={`${processInstanceId}:${point.sampleId}`}
            disabled={Boolean(busyAction)} onClick={() => onReviewSample(point.sampleId)}>{point.marker}</ControlButton>
          <span>{point.pixel[0].toFixed(1)}, {point.pixel[1].toFixed(1)}</span>
          <span className="panels-camera-extrinsic-point-error" data-xgc-outlier={point.inlier === false ? 'true' : undefined}>
            {point.reprojectionErrorPx == null ? '—' : `${point.reprojectionErrorPx.toFixed(2)} px`}
          </span>
          <ControlButton iconOnly size="compact" aria-label={t('Remove sample {index}: {marker}', { index:index+1,marker:point.marker })}
            title={t('Remove {marker}', { marker:point.marker })}
            dataXgcRole="camera-calibration-remove-point" dataXgcId={`${processInstanceId}:${point.sampleId}`}
            disabled={Boolean(busyAction)} onClick={() => onRemovePoint(point.sampleId)}><Trash2 size={11} /></ControlButton>
        </li>)}</ol> : <div className="panels-camera-extrinsic-points-empty">{t('No points selected')}</div>}
      </div>

      <div className="panels-camera-calibration-actions panels-camera-extrinsic-actions">
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-resample" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || !selectedSample} onClick={onResample}>
          <Camera size={14} />{t('Resample')}
        </ControlButton>
        <ControlButton dataXgcRole="camera-calibration-live" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || !selectedSample} onClick={onLive}>
          <RotateCcw size={14} />{t('Live')}
        </ControlButton>
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-solve" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || Boolean(solvePreflightReason)}
          title={solvePreflightReason
            ? localizeCameraMessage(t,solvePreflightReason) : t('Solve the camera transform candidate without saving.')}
          onClick={onSolve}>
          {busyAction === 'solve' ? <LoaderCircle className="spin" size={14} /> : <Crosshair size={14} />}{t('Solve')}
        </ControlButton>
        <ControlButton tone="primary" className="panels-camera-extrinsic-primary-action"
          dataXgcRole="camera-calibration-save" dataXgcId={processInstanceId}
          disabled={Boolean(busyAction) || !result || (result.saved && result.application?.status!=='unavailable')}
          title={result?.application?.status==='conflict' ? 'A newer calibration was selected.' : result?.saved ? 'Calibration saved.' : t('Save the current solved candidate.')}
          onClick={onSave}>
          {busyAction === 'save' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{result?.application?.status==='unavailable' ? 'Retry apply' : result?.application?.status==='applied' ? 'Applied' : result?.saved ? t('Saved') : t('Save')}
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

function formatVector(values: readonly number[]) { return `[${values.map((value) => value.toFixed(5)).join(', ')}]`; }
