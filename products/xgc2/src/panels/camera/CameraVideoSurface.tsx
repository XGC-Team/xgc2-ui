import { useEffect,useRef,useState,type CSSProperties } from 'react';
import { EmptyState,StatusText } from '@xgc2/ui-react';
import type {
  MediaEdgeSessionHandle,
  MediaEdgeSessionCloseReason,
  MediaEdgeSourceDescription,
} from '../../domains/execution/executionPublic';
import { useDocumentVisibility } from '../../hooks/useDocumentVisibility';
import { createDeadlineTimer } from '../../shared/eventCoalescer';
import { randomId } from '../../shared/utils/randomId';
import { cameraPixelForClientPoint } from './cameraExtrinsicPixel';
import { containedVideoSize } from './cameraVideoGeometry';
import { localizeCameraMessage,useCameraText } from './cameraMessages';
import type {
  CameraVideoDimensions,CameraVideoPlaybackMetrics,CameraVideoPlaybackState,CameraVideoSurfaceProps,
  CameraVideoDisplayObservation,CameraVideoObservationPort,
} from './cameraVideoSurfaceTypes';
import '../../styles/camera-video-panel.css';

type VideoDimensions = CameraVideoDimensions;

/** Shared camera viewer. Its host owns resource identity and the bound session transport. */
export function CameraVideoSurface({
  id,
  source,
  presentation,
  connectionEnabled = true,
  connectionAttempt = 0,
  automaticReconnectEnabled = true,
  lifecycleStatus,
  ownerLifecycle = 'running',
  surfaceVisible = true,
  onPlaybackStateChange,
  onPlaybackMetricsChange,
  expectedSourceSize,
  onObservationPortChange,
}: CameraVideoSurfaceProps) {
  const t = useCameraText();
  const documentVisible = useDocumentVisibility();
  // Pause presentation work in background tabs without renegotiating a healthy session.
  const viewerVisible = surfaceVisible && documentVisible;
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef=useRef<HTMLCanvasElement>(null);
  const sourceEpochRef=useRef('');
  const displaySequenceRef=useRef(0);
  const observationCallbackRef=useRef(onObservationPortChange);
  observationCallbackRef.current=onObservationPortChange;
  const observationEnabled=Boolean(onObservationPortChange);
  const ownerLifecycleRef=useRef(ownerLifecycle);
  ownerLifecycleRef.current=ownerLifecycle;
  const [attempt,setAttempt] = useState(0);
  const [playbackState,setPlaybackState] = useState<CameraVideoPlaybackState>(
    connectionEnabled ? 'connecting' : 'disconnected',
  );
  const [connectionError,setConnectionError] = useState('');
  const [sourceDescription,setSourceDescription] = useState<MediaEdgeSourceDescription>();
  const [containerSize,setContainerSize] = useState<VideoDimensions>();
  const [naturalVideoSize,setNaturalVideoSize] = useState<VideoDimensions>();
  const [playbackMetrics,setPlaybackMetrics] = useState<CameraVideoPlaybackMetrics>();
  const { imageFit,showMetadata,reconnectPolicy } = presentation;
  const automaticReconnect = reconnectPolicy === 'automatic';
  const sourceId = source.id ?? '';
  const sourceLabel = source.label || sourceId;
  const sessionKey = source.kind === 'ready' ? source.sessionKey : '';
  const sourceReady = source.kind === 'ready';
  const currentBindingRef=useRef('');
  currentBindingRef.current=JSON.stringify([sessionKey,connectionAttempt,attempt,connectionEnabled,ownerLifecycle,surfaceVisible]);
  const openSessionRef = useRef(source.kind === 'ready' ? source.openSession : undefined);
  openSessionRef.current = source.kind === 'ready' ? source.openSession : undefined;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !viewerVisible || imageFit !== 'contain') return;
    const update = () => {
      const bounds = root.getBoundingClientRect();
      const next = { width:bounds.width,height:bounds.height };
      setContainerSize((current) => sameDimensions(current, next) ? current : next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [imageFit,viewerVisible]);

  useEffect(() => {
    const video = videoRef.current;
    sourceEpochRef.current='';
    observationCallbackRef.current?.(undefined);
    if (video) video.srcObject = null;
    setConnectionError('');
    setSourceDescription(undefined);
    setNaturalVideoSize(undefined);
    setPlaybackMetrics(undefined);
    if (!connectionEnabled || !surfaceVisible) {
      setPlaybackState('disconnected');
      return;
    }
    if (ownerLifecycle==='stopping') {
      setPlaybackState('disconnected');
      return;
    }
    const openSession = openSessionRef.current;
    if (!sourceReady || !sessionKey || !sourceId || !openSession) {
      setPlaybackState('connecting');
      return;
    }

    const abort = new AbortController();
    let session: MediaEdgeSessionHandle | undefined;
    const trackCleanups=new Map<MediaStreamTrack,() => void>();
    setPlaybackState('connecting');
    void (async () => openSession({
      signal: abort.signal,
      onStateChange: (state) => {
        if (abort.signal.aborted) return;
        if (state === 'connected') {
          setPlaybackState((current) => current === 'playing' ? current : 'waiting');
        }
        if (state === 'failed') {
          setConnectionError('The WebRTC connection failed after it was established.');
          setPlaybackState('failed');
        }
      },
      onTrack: (stream,track) => {
        if (abort.signal.aborted) {
          track.stop?.();
          return;
        }
        if (video) video.srcObject = stream;
        sourceEpochRef.current=observationCallbackRef.current ? randomId() : '';
        observationCallbackRef.current?.(undefined);
        // A delivered track is transport evidence, not decoded-frame evidence.
        // The video element's playing event below is the viewer truth.
        setPlaybackState('waiting');
        const onMute=() => {
          if (abort.signal.aborted) return;
          setPlaybackState('waiting');
        };
        const onEnded=() => {
          if (abort.signal.aborted) return;
          setConnectionError('The remote video track ended.');
          setPlaybackState('failed');
        };
        track.addEventListener('mute',onMute);
        track.addEventListener('ended',onEnded,{ once:true });
        trackCleanups.set(track,() => {
          track.removeEventListener('mute',onMute);
          track.removeEventListener('ended',onEnded);
          track.stop?.();
        });
      },
    }))().then((opened) => {
      session = opened;
      if (abort.signal.aborted) {
        void opened.close(mediaEdgeCloseReason(abort.signal.reason)).catch(() => undefined);
        return;
      }
      setSourceDescription(opened.answer.source);
    }).catch((cause: unknown) => {
      if (abort.signal.aborted || isAbort(cause)) return;
      setConnectionError(messageOf(cause));
      setPlaybackState('failed');
    });

    return () => {
      const reason:MediaEdgeSessionCloseReason=ownerLifecycleRef.current==='stopping'
        ? 'owner-stopping' : 'consumer-unmounted';
      abort.abort(reason);
      sourceEpochRef.current='';
      observationCallbackRef.current?.(undefined);
      trackCleanups.forEach((cleanup) => cleanup());
      trackCleanups.clear();
      if (video) video.srcObject = null;
      if (session) void session.close(reason).catch(() => undefined);
    };
  }, [attempt,connectionAttempt,connectionEnabled,ownerLifecycle,sessionKey,sourceId,sourceReady,surfaceVisible]);

  useEffect(() => {
    onPlaybackStateChange?.(playbackState);
  }, [onPlaybackStateChange,playbackState]);

  useEffect(() => {
    onPlaybackMetricsChange?.(playbackMetrics);
  }, [onPlaybackMetricsChange,playbackMetrics]);

  useEffect(() => {
    // Measured FPS is live presentation evidence, not durable source metadata.
    // Once frames stop presenting (or the viewer is hidden), retain dimensions
    // for layout but expire the last healthy rate instead of reporting it stale.
    if (viewerVisible && playbackState === 'playing') return;
    setPlaybackMetrics((current) => current?.fps === undefined
      ? current : { width:current.width,height:current.height });
  }, [playbackState,viewerVisible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !viewerVisible || playbackState !== 'playing') return;
    let cancelled = false;
    let frameCallbackId: number | undefined;
    let baselineTime: number | undefined;
    let baselineFrames: number | undefined;

    const publish = (now: number, presentedFrames: number) => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width < 1 || height < 1) return;
      if (baselineTime === undefined || baselineFrames === undefined) {
        baselineTime = now;
        baselineFrames = presentedFrames;
        setPlaybackMetrics((current) => current?.width === width && current.height === height
          ? current : { width,height });
        return;
      }
      const elapsed = now - baselineTime;
      if (elapsed < PLAYBACK_FPS_SAMPLE_MILLISECONDS) return;
      const fps = Math.max(0, (presentedFrames - baselineFrames) * 1_000 / elapsed);
      baselineTime = now;
      baselineFrames = presentedFrames;
      if (!Number.isFinite(fps)) return;
      setPlaybackMetrics((current) => samePlaybackMetrics(current, { width,height,fps })
        ? current : { width,height,fps });
    };

    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame: VideoFrameRequestCallback = (now,metadata) => {
        if (cancelled) return;
        publish(now,metadata.presentedFrames);
        frameCallbackId = video.requestVideoFrameCallback(onFrame);
      };
      frameCallbackId = video.requestVideoFrameCallback(onFrame);
    }

    return () => {
      cancelled = true;
      if (frameCallbackId !== undefined && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
    };
  }, [playbackState,viewerVisible]);

  useEffect(() => {
    const canvas=displayCanvasRef.current,video=videoRef.current;
    if (!observationEnabled || !canvas || !video || !viewerVisible || playbackState!=='playing') return;
    const context=canvas.getContext('2d');
    if (!context) {
      setConnectionError('This browser cannot capture the displayed camera image.');
      setPlaybackState('failed');
      return;
    }
    const sourceEpoch=sourceEpochRef.current || randomId();
    sourceEpochRef.current=sourceEpoch;
    const binding=currentBindingRef.current;
    let active=true,published=false;
    let display:CameraVideoDisplayObservation|undefined;
    let callbackId:number|undefined,animationId:number|undefined;
    const port:CameraVideoObservationPort={ sourceId,sourceEpoch,latch(clientX,clientY) {
      if (!active || binding!==currentBindingRef.current || sourceEpoch!==sourceEpochRef.current || !display) return;
      const pixel=cameraPixelForClientPoint(clientX,clientY,canvas.getBoundingClientRect(),display.width,display.height);
      if (!pixel) return;
      const copy=document.createElement('canvas');
      copy.width=display.width;copy.height=display.height;
      const copyContext=copy.getContext('2d');
      if (!copyContext) throw new Error('This browser cannot capture the displayed camera image.');
      copyContext.drawImage(canvas,0,0);
      const captured={ ...display };
      let released=false;
      return { display:captured,pixel,
        encode:() => new Promise<Blob>((resolve,reject) => {
          if (released) { reject(new DOMException('Capture released','AbortError'));return; }
          copy.toBlob((blob) => {
            if (released) reject(new DOMException('Capture released','AbortError'));
            else if (blob) resolve(blob);
            else reject(new Error('The camera image could not be encoded.'));
          },'image/png');
        }),
        release:() => { released=true;copy.width=0;copy.height=0; },
      };
    } };
    const present=(now:number,metadata?:VideoFrameCallbackMetadata) => {
      if (!active || binding!==currentBindingRef.current || sourceEpoch!==sourceEpochRef.current) return;
      const width=video.videoWidth,height=video.videoHeight;
      if (width<1 || height<1 || width>8192 || height>8192 || width*height>16_777_216) return;
      if (canvas.width!==width || canvas.height!==height) { canvas.width=width;canvas.height=height; }
      context.drawImage(video,0,0,width,height);
      display={ id:`${sourceEpoch}:${++displaySequenceRef.current}`,sourceId,sourceEpoch,width,height,
        clockDomain:'browser-performance',presentedAtMs:now,timeOriginMs:performance.timeOrigin,
        ...(metadata ? { mediaTimeSec:metadata.mediaTime,presentedFrames:metadata.presentedFrames,
          captureTimeMs:metadata.captureTime,receiveTimeMs:metadata.receiveTime,rtpTimestamp:metadata.rtpTimestamp } : {}) };
      if (!published) { published=true;observationCallbackRef.current?.(port); }
    };
    if (typeof video.requestVideoFrameCallback==='function') {
      const frame:VideoFrameRequestCallback=(now,metadata) => {
        if (!active) return;
        present(now,metadata);callbackId=video.requestVideoFrameCallback(frame);
      };
      callbackId=video.requestVideoFrameCallback(frame);
    } else {
      const frame:FrameRequestCallback=(now) => {
        if (!active) return;
        present(now);animationId=requestAnimationFrame(frame);
      };
      animationId=requestAnimationFrame(frame);
    }
    return () => {
      active=false;display=undefined;observationCallbackRef.current?.(undefined);
      if (callbackId!==undefined) video.cancelVideoFrameCallback?.(callbackId);
      if (animationId!==undefined) cancelAnimationFrame(animationId);
      canvas.width=0;canvas.height=0;
    };
  },[attempt,connectionAttempt,observationEnabled,playbackState,sessionKey,sourceId,viewerVisible]);

  useEffect(() => {
    if (!viewerVisible || !connectionEnabled || !automaticReconnectEnabled || !automaticReconnect
      || playbackState !== 'failed' || !sourceReady || !sessionKey || !sourceId) return;
    const timer = createDeadlineTimer(() => setAttempt((current) => current + 1));
    timer.schedule(reconnectDelayMilliseconds(attempt));
    return () => timer.cancel();
  }, [attempt,automaticReconnect,automaticReconnectEnabled,connectionEnabled,playbackState,sessionKey,sourceId,sourceReady,viewerVisible]);

  if (!surfaceVisible) return null;

  const sourceSize = naturalVideoSize || sourceDescription || expectedSourceSize;
  const containedSize = imageFit === 'contain' && containerSize && sourceSize
    ? containedVideoSize({
      containerWidth:containerSize.width,
      containerHeight:containerSize.height,
      sourceWidth:sourceSize.width,
      sourceHeight:sourceSize.height,
    })
    : undefined;
  const state = source.kind === 'ready' ? playbackState : source.kind;
  const containedStyle:CSSProperties|undefined = containedSize ? {
    width:containedSize.width,
    height:containedSize.height,
    maxWidth:'none',
    maxHeight:'none',
    justifySelf:'center',
    alignSelf:'center',
  } : undefined;
  return (
    <section
      ref={rootRef}
      className="camera-video-panel-root"
      data-xgc-role="camera-video-panel"
      data-xgc-id={id}
      data-state={state}
      data-image-fit={imageFit}
      data-has-frame={naturalVideoSize ? 'true' : 'false'}
    >
      <video
        ref={videoRef}
        className="camera-video-panel-stream"
        aria-label={sourceId ? t('Live video from {sourceId}', { sourceId:sourceLabel }) : t('Live camera video')}
        autoPlay
        muted
        playsInline
        poster={TRANSPARENT_VIDEO_POSTER}
        aria-hidden={observationEnabled || undefined}
        data-xgc-role="camera-video-stream"
        data-xgc-id={sourceId ? `${id}:${sourceId}` : id}
        onPlaying={() => setPlaybackState('playing')}
        onWaiting={() => setPlaybackState('waiting')}
        onStalled={() => setPlaybackState('waiting')}
        onPause={() => setPlaybackState('waiting')}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const next = { width:video.videoWidth,height:video.videoHeight };
          if (next.width > 0 && next.height > 0) {
            setNaturalVideoSize((current) => sameDimensions(current, next) ? current : next);
            setPlaybackMetrics((current) => current?.width === next.width && current.height === next.height
              ? current : next);
          }
        }}
        style={observationEnabled ? { ...containedStyle,visibility:'hidden' }
          : containedStyle ? { ...containedStyle,objectFit:'contain' } : undefined}
      />
      {observationEnabled && <canvas ref={displayCanvasRef} className="camera-video-panel-stream"
        data-xgc-role="camera-video-observation" data-xgc-id={id}
        aria-label={t('Calibration camera image')} style={{ ...containedStyle,objectFit:'contain' }} />}
      {showMetadata && lifecycleStatus && (
        <div className="camera-video-panel-lifecycle" data-xgc-role="camera-video-lifecycle" data-xgc-id={id}>
          <CameraVideoLifecycleState label={t('MEDIA')} state={lifecycleStatus.media} />
          <CameraVideoLifecycleState label={t('SOURCE')} state={lifecycleStatus.source} />
          <CameraVideoLifecycleState label={t('VIEW')} state={lifecycleStatus.viewer} />
        </div>
      )}
      {source.kind !== 'ready' ? (
        <CameraVideoState title={source.title}
          description={source.description} style={containedStyle} markId={id} />
      ) : playbackState !== 'playing' ? (
        <CameraVideoState
          title={playbackTitle(t,playbackState,sourceLabel)}
          description={playbackDescription(t,playbackState,connectionError)}
          style={containedStyle}
          markId={id}
        />
      ) : showMetadata ? (
        <div className="camera-video-panel-live" data-xgc-role="camera-video-live" data-xgc-id={id}>
          <span>{t('LIVE')}</span>
          <span>{sourceLabel}</span>
          {sourceDescription && (
            <span>{sourceDescription.width}×{sourceDescription.height} · {formatFPS(sourceDescription.fps)} fps</span>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** 1×1 transparent GIF so the UA does not flash a black poster while connecting. */
const TRANSPARENT_VIDEO_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const PLAYBACK_FPS_SAMPLE_MILLISECONDS = 1_000;

function sameDimensions(current: VideoDimensions | undefined, next: VideoDimensions) {
  return current?.width === next.width && current.height === next.height;
}

function samePlaybackMetrics(
  current: CameraVideoPlaybackMetrics | undefined,
  next: CameraVideoPlaybackMetrics,
) {
  return sameDimensions(current,next) && current?.fps !== undefined && next.fps !== undefined
    && Math.abs(current.fps - next.fps) < 0.05;
}

function CameraVideoState({
  title,
  description,
  style,
  markId,
}: {
  title: string;
  description: string;
  style?:CSSProperties;
  markId?: string;
}) {
  return (
    <div className="camera-video-panel-state" data-xgc-role="camera-video-state" data-xgc-id={markId} style={style}>
      <EmptyState
        className="camera-video-panel-empty"
        appearance="plain"
        density="compact"
        fill
        title={title}
        description={description}
      />
    </div>
  );
}

function CameraVideoLifecycleState({ label,state }: { label:string;state:string }) {
  const t = useCameraText();
  const tone = state === 'failed' || state === 'offline' ? 'danger'
    : state === 'playing' || state === 'ready' || state === 'running' || state === 'attached' ? 'success'
    : 'neutral';
  return <span className="camera-video-panel-lifecycle-item" data-state={state}>
    <span>{label}</span><StatusText className="camera-video-panel-lifecycle-value" status={state} tone={tone}>{t(state)}</StatusText>
  </span>;
}

function playbackTitle(t: ReturnType<typeof useCameraText>,state: CameraVideoPlaybackState, sourceId: string) {
  if (state === 'disconnected') return t('Viewer disconnected from {sourceId}', { sourceId });
  if (state === 'failed') return t('Could not open {sourceId}', { sourceId });
  if (state === 'waiting') return t('Waiting for {sourceId}', { sourceId });
  return t('Connecting to {sourceId}', { sourceId });
}

function playbackDescription(t: ReturnType<typeof useCameraText>,state: CameraVideoPlaybackState, error: string) {
  if (state === 'disconnected') return t('Use Connect to open this browser\'s WebRTC receive session.');
  if (state === 'failed') return error
    ? localizeCameraMessage(t,error) : t('The WebRTC session could not be established.');
  if (state === 'waiting') return t('The WebRTC session is connected and waiting for its first video frame.');
  return t('Negotiating a direct WebRTC receive session with the configured Media Edge.');
}

function formatFPS(fps: number) {
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(1);
}

function reconnectDelayMilliseconds(attempt: number) {
  return Math.min(30000, 2000 * (2 ** Math.min(attempt, 4)));
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function mediaEdgeCloseReason(value:unknown):MediaEdgeSessionCloseReason {
  return value==='owner-stopping' ? value : 'consumer-unmounted';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
