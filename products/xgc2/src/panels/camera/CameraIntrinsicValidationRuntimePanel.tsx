import { Camera,Download,RotateCcw,ScanSearch,ZoomIn } from 'lucide-react';
import { EmptyState,Notice } from '@xgc2/ui-react';
import {
  useEffect,useMemo,useRef,useState,
  type PointerEvent,type ReactNode,type WheelEvent,
} from 'react';
import { FormField } from '../../components/FormPrimitives';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import {
  captureCameraIntrinsicValidation,
  loadCameraIntrinsicCalibrationFiles,
  loadCameraIntrinsicValidationImage,
  type CameraIntrinsicCalibrationFile,
  type CameraIntrinsicValidationConfiguration,
  type CameraIntrinsicValidationReport,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

type CachedIntrinsicValidation = {
  panelId:string;
  report:CameraIntrinsicValidationReport;
  blobs:Readonly<Record<string,Blob>>;
  activeView:string;
};

const MAX_CACHED_INTRINSIC_VALIDATIONS=2;
const intrinsicValidationCache=new Map<string,CachedIntrinsicValidation>();
const RAW_CONFIGURATION_VALUE='__raw__';
const VALIDATION_ZOOM_MIN=1;
const VALIDATION_ZOOM_MAX=16;
const VALIDATION_ZOOM_STEP=0.25;
const INTRINSIC_VALIDATION_VIEW_PLACEHOLDERS=[
  { id:'overlay_checker',label:'Grid comparison' },
  { id:'overlay_redcyan',label:'Red / cyan overlay' },
  { id:'overlay_corner_zoom',label:'Maximum-warp detail' },
  { id:'overlay_diff',label:'Difference heatmap' },
  { id:'displacement',label:'Distortion displacement' },
  { id:'compare',label:'Reference / comparison' },
  { id:'reference',label:'Raw' },
  { id:'comparison',label:'Target' },
] as const;

export function CameraIntrinsicValidationRuntimePanel({
  targetId,processInstanceId,panelId,enabled,liveStage,
}: {
  targetId:string;
  processInstanceId:string;
  panelId:string;
  enabled:boolean;
  liveStage:ReactNode;
}) {
  const t=useCameraText();
  const language=useAppLanguage();
  const [files,setFiles]=useState<readonly CameraIntrinsicCalibrationFile[]>([]);
  const [referenceSelected,setReferenceSelected]=useState(RAW_CONFIGURATION_VALUE);
  const [comparisonSelected,setComparisonSelected]=useState('');
  const [report,setReport]=useState<CameraIntrinsicValidationReport>();
  const [activeView,setActiveView]=useState('');
  const [imageUrls,setImageUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(false);
  const [capturing,setCapturing]=useState(false);
  const [zoom,setZoom]=useState(VALIDATION_ZOOM_MIN);
  const [dragging,setDragging]=useState(false);
  const [error,setError]=useState('');
  const imageUrlsRef=useRef<Record<string,string>>({});
  const imageStageRef=useRef<HTMLDivElement>(null);
  const dragOriginRef=useRef<{
    pointerId:number;x:number;y:number;scrollLeft:number;scrollTop:number;
  }|undefined>(undefined);
  const requestRevision=useRef(0);
  const processKey=`${targetId}:${processInstanceId}`;
  const validationCacheKey=`${processKey}:${panelId}`;

  useEffect(() => {
    revokeImages(imageUrlsRef.current);
    imageUrlsRef.current={};
    const cached=enabled ? intrinsicValidationCache.get(validationCacheKey) : undefined;
    const cachedUrls=cached ? objectUrlsFor(cached.blobs) : {};
    imageUrlsRef.current=cachedUrls;
    setImageUrls(cachedUrls);setReport(cached?.report);setActiveView(cached?.activeView ?? '');
    setFiles([]);
    setReferenceSelected(cached
      ? configurationValue(cached.report.referenceConfiguration) : RAW_CONFIGURATION_VALUE);
    setComparisonSelected(cached
      ? configurationValue(cached.report.comparisonConfiguration) : '');
    setLoading(false);setCapturing(false);setError('');
    setZoom(VALIDATION_ZOOM_MIN);setDragging(false);dragOriginRef.current=undefined;
    if (!enabled || !targetId || !processInstanceId) return;
    const revision=++requestRevision.current;
    const controller=new AbortController();
    setLoading(true);
    void loadCameraIntrinsicCalibrationFiles(targetId,processInstanceId,controller.signal)
      .then((history) => {
        if (requestRevision.current!==revision) return;
        setFiles(history.items);
        setReferenceSelected((current) => configurationValueIsAvailable(current,history.items)
          ? current : RAW_CONFIGURATION_VALUE);
        setComparisonSelected((current) => configurationValueIsAvailable(current,history.items)
          ? current : history.selected ?? RAW_CONFIGURATION_VALUE);
      })
      .catch((cause:unknown) => {
        if (requestRevision.current===revision && !controller.signal.aborted) setError(messageOf(cause));
      })
      .finally(() => { if (requestRevision.current===revision) setLoading(false); });
    return () => { controller.abort();requestRevision.current+=1; };
  },[enabled,panelId,processInstanceId,processKey,targetId,validationCacheKey]);

  useEffect(() => () => revokeImages(imageUrlsRef.current),[]);

  const currentView=report?.views.find((view) => view.id===activeView);
  const galleryViews=report?.views ?? INTRINSIC_VALIDATION_VIEW_PLACEHOLDERS;
  const labeledReference=report?.referenceConfiguration ?? configurationForValue(referenceSelected);
  const labeledComparison=report?.comparisonConfiguration ?? configurationForValue(comparisonSelected);
  const viewTitle=currentView
    ? validationViewLabel(currentView,labeledReference,labeledComparison,files,t,language)
    : activeView;
  const options=useMemo(() => [{
    value:RAW_CONFIGURATION_VALUE,
    label:t('No intrinsics (raw)'),
  },...files.map((file) => ({
    value:file.id,
    label:`${file.latest ? t('Latest · ') : ''}${formatTimestamp(file.createdAt,language)} · ${file.imageWidth}×${file.imageHeight} · ${file.rmsReprojectionErrorPx.toFixed(3)} px`,
  }))],[files,language,t]);
  const selectionsAvailable=configurationValueIsAvailable(referenceSelected,files)
    && configurationValueIsAvailable(comparisonSelected,files);

  async function captureComparison() {
    if (!enabled || loading || capturing || !selectionsAvailable) return;
    const revision=++requestRevision.current;
    setCapturing(true);setError('');
    try {
      const next=await captureCameraIntrinsicValidation(targetId,processInstanceId,{
        reference:configurationForValue(referenceSelected),
        comparison:configurationForValue(comparisonSelected),
      });
      const blobs=await Promise.all(next.views.map((view) => (
        loadCameraIntrinsicValidationImage(targetId,processInstanceId,view.id,next.generation)
      )));
      if (requestRevision.current!==revision) return;
      const blobsByView=Object.fromEntries(next.views.map((view,index) => [view.id,blobs[index]!]));
      const urls=objectUrlsFor(blobsByView);
      revokeImages(imageUrlsRef.current);
      imageUrlsRef.current=urls;
      cacheIntrinsicValidation(validationCacheKey,{
        panelId,report:next,blobs:blobsByView,activeView:next.defaultView,
      });
      setImageUrls(urls);setReport(next);setActiveView(next.defaultView);
      setZoom(VALIDATION_ZOOM_MIN);setDragging(false);dragOriginRef.current=undefined;
      if (imageStageRef.current) {
        imageStageRef.current.scrollLeft=0;imageStageRef.current.scrollTop=0;
      }
    } catch (cause:unknown) {
      if (requestRevision.current===revision) setError(messageOf(cause));
    } finally {
      if (requestRevision.current===revision) setCapturing(false);
    }
  }

  function selectView(viewId:string) {
    setActiveView(viewId);
    resetImageView();
    const cached=intrinsicValidationCache.get(validationCacheKey);
    if (cached) cacheIntrinsicValidation(validationCacheKey,{ ...cached,activeView:viewId });
  }

  function resetImageView() {
    setZoom(VALIDATION_ZOOM_MIN);setDragging(false);dragOriginRef.current=undefined;
    if (imageStageRef.current) {
      imageStageRef.current.scrollLeft=0;imageStageRef.current.scrollTop=0;
    }
  }

  function showActualPixels() {
    const stage=imageStageRef.current;
    const image=stage?.querySelector<HTMLImageElement>(
      '[data-xgc-role="camera-intrinsic-validation-main-image"]',
    );
    if (!stage || !image || image.naturalWidth<=0 || image.naturalHeight<=0) return;
    const stageWidth=stage.clientWidth;
    const stageHeight=stage.clientHeight;
    if (stageWidth<=0 || stageHeight<=0) return;
    const sourceAspect=image.naturalWidth/image.naturalHeight;
    const stageAspect=stageWidth/stageHeight;
    const fittedWidth=stageAspect>sourceAspect ? stageHeight*sourceAspect : stageWidth;
    const fittedHeight=stageAspect>sourceAspect ? stageHeight : stageWidth/sourceAspect;
    const nativeZoom=Math.max(
      image.naturalWidth/fittedWidth,
      image.naturalHeight/fittedHeight,
    );
    setZoom(Math.min(VALIDATION_ZOOM_MAX,Math.max(VALIDATION_ZOOM_MIN,nativeZoom)));
    setDragging(false);dragOriginRef.current=undefined;
    requestAnimationFrame(() => {
      stage.scrollLeft=Math.max(0,(stage.scrollWidth-stage.clientWidth)/2);
      stage.scrollTop=Math.max(0,(stage.scrollHeight-stage.clientHeight)/2);
    });
  }

  function downloadActiveImage() {
    const imageUrl=imageUrls[activeView];
    if (!imageUrl) return;
    const link=document.createElement('a');
    link.href=imageUrl;
    link.download=validationImageDownloadName(
      report?.referenceConfiguration ?? configurationForValue(referenceSelected),
      report?.comparisonConfiguration ?? configurationForValue(comparisonSelected),
      activeView,
    );
    document.body.append(link);link.click();link.remove();
  }

  function zoomImage(event:WheelEvent<HTMLDivElement>) {
    if (!report) return;
    event.preventDefault();
    const direction=event.deltaY<0 ? 1 : event.deltaY>0 ? -1 : 0;
    if (!direction) return;
    setZoom((current) => Math.min(
      VALIDATION_ZOOM_MAX,
      Math.max(VALIDATION_ZOOM_MIN,current+direction*VALIDATION_ZOOM_STEP),
    ));
  }

  function beginImageDrag(event:PointerEvent<HTMLDivElement>) {
    if (zoom<=VALIDATION_ZOOM_MIN || event.button!==0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragOriginRef.current={
      pointerId:event.pointerId,x:event.clientX,y:event.clientY,
      scrollLeft:event.currentTarget.scrollLeft,scrollTop:event.currentTarget.scrollTop,
    };
    setDragging(true);
  }

  function dragImage(event:PointerEvent<HTMLDivElement>) {
    const origin=dragOriginRef.current;
    if (!origin || origin.pointerId!==event.pointerId) return;
    event.currentTarget.scrollLeft=origin.scrollLeft-(event.clientX-origin.x);
    event.currentTarget.scrollTop=origin.scrollTop-(event.clientY-origin.y);
  }

  function endImageDrag(event:PointerEvent<HTMLDivElement>) {
    if (dragOriginRef.current?.pointerId!==event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragOriginRef.current=undefined;setDragging(false);
  }

  return <section className="panels-camera-intrinsic-validation" data-xgc-role="camera-intrinsic-validation-runtime"
    data-xgc-id={panelId} data-enabled={enabled ? 'true' : 'false'}
    data-has-report={report ? 'true' : 'false'} data-xgc-zoom={zoom.toFixed(2)}>
    <main className="panels-camera-intrinsic-validation-main"
      data-xgc-role="camera-intrinsic-validation-main" data-xgc-id={panelId}>
      {report && activeView && imageUrls[activeView] ? <>
        <header className="panels-camera-intrinsic-validation-heading">
          <div className="panels-camera-intrinsic-validation-heading-title">
            <ScanSearch size={14} aria-hidden="true" />
            <strong>{viewTitle}</strong>
          </div>
          <div className="panels-camera-intrinsic-validation-heading-actions">
            <dl>
              <div><dt>{t('Mean remap')}</dt><dd>{report.remapMeanPx.toFixed(2)} px</dd></div>
              <div><dt>{t('Maximum')}</dt><dd>{report.remapMaximumPx.toFixed(2)} px</dd></div>
              <div><dt>{t('Analysis')}</dt><dd>{report.analysisImageSize[0]}×{report.analysisImageSize[1]}</dd></div>
            </dl>
          </div>
        </header>
        <div ref={imageStageRef} className="panels-camera-intrinsic-validation-image-stage"
          data-xgc-role="camera-intrinsic-validation-image-stage" data-xgc-id={activeView}
          data-zoomed={zoom>VALIDATION_ZOOM_MIN ? 'true' : 'false'} data-dragging={dragging ? 'true' : 'false'}
          onWheel={zoomImage} onPointerDown={beginImageDrag} onPointerMove={dragImage}
          onPointerUp={endImageDrag} onPointerCancel={endImageDrag}>
          <div className="panels-camera-intrinsic-validation-zoom-surface"
            style={{ width:`${zoom*100}%`,height:`${zoom*100}%` }}>
            <img src={imageUrls[activeView]} alt={viewTitle || t('Intrinsic validation comparison')}
              draggable={false} data-xgc-role="camera-intrinsic-validation-main-image"
              data-xgc-id={activeView} />
          </div>
        </div>
        <footer className="panels-camera-intrinsic-validation-zoom-controls">
          <ControlButton size="compact"
            dataXgcRole="camera-intrinsic-validation-download" dataXgcId={activeView}
            onClick={downloadActiveImage}>
            <Download size={14} />{t('Download')}
          </ControlButton>
          <ControlButton size="compact"
            dataXgcRole="camera-intrinsic-validation-zoom-actual" dataXgcId={activeView}
            onClick={showActualPixels}>
            <ZoomIn size={14} />{t('Actual pixels')}
          </ControlButton>
          <ControlButton size="compact"
            dataXgcRole="camera-intrinsic-validation-zoom-reset" dataXgcId={activeView}
            onClick={resetImageView}>
            <RotateCcw size={14} />{t('Reset')}
          </ControlButton>
        </footer>
      </> : <EmptyState appearance="plain" density="compact" fill icon={<ScanSearch size={28} />}
        className="panels-camera-intrinsic-validation-empty"
        data-xgc-role="camera-intrinsic-validation-empty" data-xgc-id={panelId}
        title={t('Capture a validation frame')}
        description={t('Choose two camera configurations, then capture one frame for grid, overlay, heatmap, displacement, and detail comparisons.')} />}
    </main>
    <aside className="panels-camera-intrinsic-validation-side">
      <section className="panels-camera-intrinsic-validation-controls" data-xgc-role="camera-intrinsic-validation-controls"
        data-xgc-id={panelId}>
        <header data-xgc-role="camera-intrinsic-validation-controls-title" data-xgc-id={panelId}>
          <Camera size={14} aria-hidden="true" /><strong>{t('Validation capture')}</strong>
        </header>
        {error && <Notice tone="danger" density="compact">{localizeCameraMessage(t,error)}</Notice>}
        <FormField className="panels-camera-intrinsic-validation-field" label={t('Reference configuration')}
          dataXgcRole="camera-intrinsic-validation-reference-field" dataXgcId={panelId}
          tooltip={t('Raw camera pixels or a saved intrinsic result for the reference side.')}>
          <SelectControl value={referenceSelected} options={options} ariaLabel={t('Reference configuration')}
            dataXgcRole="camera-intrinsic-validation-calibration-select" dataXgcId={panelId}
            disabled={!enabled || loading || capturing} fill onChange={setReferenceSelected} />
        </FormField>
        <FormField className="panels-camera-intrinsic-validation-field" label={t('Comparison configuration')}
          dataXgcRole="camera-intrinsic-validation-comparison-field" dataXgcId={panelId}
          tooltip={t('Raw camera pixels or a saved intrinsic result to compare against the reference.')}>
          <SelectControl value={comparisonSelected} options={options} ariaLabel={t('Comparison configuration')}
            dataXgcRole="camera-intrinsic-validation-comparison-select" dataXgcId={panelId}
            disabled={!enabled || loading || capturing} fill onChange={setComparisonSelected} />
        </FormField>
        <ControlButton tone="primary" dataXgcRole="camera-intrinsic-validation-capture" dataXgcId={panelId}
          disabled={!enabled || loading || capturing || !selectionsAvailable}
          aria-busy={capturing || undefined}
          onClick={() => void captureComparison()}>
          <Camera size={14} aria-hidden="true" />{t('Capture & compare')}
        </ControlButton>
      </section>
      <section className="panels-camera-intrinsic-validation-live" data-xgc-role="camera-intrinsic-validation-live"
        data-xgc-id={panelId}>
        {liveStage}
      </section>
      <nav className="panels-camera-intrinsic-validation-gallery" aria-label={t('Intrinsic validation images')}
        aria-disabled={!report} data-enabled={report ? 'true' : 'false'}
        data-xgc-role="camera-intrinsic-validation-gallery" data-xgc-id={panelId}>
        <header data-xgc-role="camera-intrinsic-validation-gallery-title" data-xgc-id={panelId}>
          <ScanSearch size={16} aria-hidden="true" /><strong>{t('Comparison views')}</strong>
        </header>
        <div>
          {galleryViews.map((view) => {
            const viewMarkId=`${panelId}:${view.id}`;
            return <button type="button" key={view.id}
              className={view.id===activeView ? 'is-active' : ''}
              data-xgc-role="camera-intrinsic-validation-view" data-xgc-id={viewMarkId}
              data-available={imageUrls[view.id] ? 'true' : 'false'}
              disabled={!imageUrls[view.id]} aria-pressed={view.id===activeView}
              onClick={() => selectView(view.id)}>
              {imageUrls[view.id]
                ? <img src={imageUrls[view.id]} alt="" />
                : <span className="panels-camera-intrinsic-validation-view-placeholder"
                    aria-hidden="true"><ScanSearch size={16} /></span>}
              <span className="panels-camera-intrinsic-validation-view-label"
                data-xgc-role="camera-intrinsic-validation-view-label"
                data-xgc-id={viewMarkId}>{validationViewLabel(view,labeledReference,labeledComparison,files,t,language)}</span>
            </button>;
          })}
        </div>
      </nav>
    </aside>
  </section>;
}

function revokeImages(images:Record<string,string>) {
  Object.values(images).forEach((url) => URL.revokeObjectURL(url));
}

function objectUrlsFor(blobs:Readonly<Record<string,Blob>>) {
  return Object.fromEntries(Object.entries(blobs).map(([id,blob]) => [id,URL.createObjectURL(blob)]));
}

function cacheIntrinsicValidation(key:string,value:CachedIntrinsicValidation) {
  for (const [cachedKey,cached] of intrinsicValidationCache) {
    if (cached.panelId===value.panelId && cachedKey!==key) intrinsicValidationCache.delete(cachedKey);
  }
  intrinsicValidationCache.delete(key);
  intrinsicValidationCache.set(key,value);
  while (intrinsicValidationCache.size>MAX_CACHED_INTRINSIC_VALIDATIONS) {
    const oldest=intrinsicValidationCache.keys().next().value;
    if (typeof oldest!=='string') break;
    intrinsicValidationCache.delete(oldest);
  }
}

function formatTimestamp(value:string,language:string) {
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(language) : value;
}

function isRawConfiguration(configuration?:CameraIntrinsicValidationConfiguration) {
  return !configuration || configuration.kind==='raw';
}

function configurationViewLabel(
  configuration:CameraIntrinsicValidationConfiguration|undefined,
  other:CameraIntrinsicValidationConfiguration|undefined,
  files:readonly CameraIntrinsicCalibrationFile[],
  t:ReturnType<typeof useCameraText>,
  language:string,
) {
  if (isRawConfiguration(configuration)) return t('Raw');
  if (isRawConfiguration(other)) return t('Target');
  const calibrationId=configuration?.kind==='calibration' ? configuration.calibrationId : '';
  const file=files.find((item) => item.id===calibrationId);
  if (file?.latest) return t('Target');
  return file ? formatTimestamp(file.createdAt,language) : t('Target');
}

function validationViewLabel(
  view:{ id:string;label:string },
  reference:CameraIntrinsicValidationConfiguration,
  comparison:CameraIntrinsicValidationConfiguration,
  files:readonly CameraIntrinsicCalibrationFile[],
  t:ReturnType<typeof useCameraText>,
  language:string,
) {
  if (view.id==='reference') return configurationViewLabel(reference,comparison,files,t,language);
  if (view.id==='comparison') return configurationViewLabel(comparison,reference,files,t,language);
  return t(view.label);
}

function configurationValue(configuration:CameraIntrinsicValidationConfiguration) {
  return configuration.kind==='raw' ? RAW_CONFIGURATION_VALUE : configuration.calibrationId;
}

function configurationForValue(value:string):CameraIntrinsicValidationConfiguration {
  return value===RAW_CONFIGURATION_VALUE ? { kind:'raw' } : { kind:'calibration',calibrationId:value };
}

function configurationValueIsAvailable(
  value:string,
  files:readonly CameraIntrinsicCalibrationFile[],
) {
  return value===RAW_CONFIGURATION_VALUE || files.some((file) => file.id===value);
}

function validationImageDownloadName(
  reference:CameraIntrinsicValidationConfiguration,
  comparison:CameraIntrinsicValidationConfiguration,
  viewId:string,
) {
  const safe=(value:string,fallback:string) => value.replace(/[^A-Za-z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'') || fallback;
  const stem=(configuration:CameraIntrinsicValidationConfiguration) => configuration.kind==='raw'
    ? 'raw'
    : configuration.calibrationId.split('/').pop()?.replace(/\.[^.]+$/,'') ?? 'intrinsic';
  const comparisonStem=stem(comparison);
  const pairStem=reference.kind==='raw' && comparison.kind==='calibration'
    ? comparisonStem : `${stem(reference)}-vs-${comparisonStem}`;
  return `${safe(pairStem,'intrinsic-validation')}-${safe(viewId,'view')}.jpg`;
}

function messageOf(error:unknown) {
  return error instanceof Error ? error.message : String(error);
}
