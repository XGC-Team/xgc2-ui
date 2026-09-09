import { useEffect,useMemo,useRef,useState,type CSSProperties } from 'react';
import {
  createMediaEdgeSession,
  type MediaEdgeSessionHandle,
  type MediaEdgeSessionCloseReason,
  type MediaEdgeSourceDescription,
} from '../../domains/execution/executionPublic';
import { EmptyState } from '@xgc2/ui-react';
import { createDeadlineTimer } from '../../shared/eventCoalescer';
import type { PanelPluginProps } from '../types';
import { cameraVideoPanelRuntime,containedVideoSize } from './cameraVideoPanelModel';
import {
  localizeCameraMessage,
  localizeCameraValidationIssue,
  useCameraText,
} from './cameraMessages';
import '../../styles/camera-video-panel.css';

export type CameraVideoPlaybackState = 'connecting' | 'disconnected' | 'failed' | 'playing' | 'waiting';
type VideoDimensions = { width: number;height: number };
export type CameraVideoPlaybackMetrics = VideoDimensions & { fps?: number };

export function CameraVideoPanel({
  panel,
  connectionEnabled = true,
  connectionAttempt = 0,
  automaticReconnectEnabled = true,
  lifecycleStatus,
  ownerLifecycle = 'running',
  surfaceVisible = true,
  onPlaybackStateChange,
  onPlaybackMetricsChange,
  expectedSourceSize,
}: PanelPluginProps<readonly ['visualization']> & {
  connectionEnabled?: boolean;
  connectionAttempt?: number;
  automaticReconnectEnabled?: boolean;
  lifecycleStatus?: { media:string;source:string;viewer:string };
  ownerLifecycle?: 'running'|'stopping';
  surfaceVisible?: boolean;
  onPlaybackStateChange?: (state: CameraVideoPlaybackState) => void;
  onPlaybackMetricsChange?: (metrics: CameraVideoPlaybackMetrics | undefined) => void;
  expectedSourceSize?: VideoDimensions;
}) {
  const t = useCameraText();
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  const requestedEdgeUrl = panel.options.edgeUrl;
  const requestedSourceId = panel.options.sourceId;
  const automaticReconnect = panel.options.reconnectPolicy === 'automatic';
  const showMetadata = panel.options.showMetadata !== false;
  const imageFit = panel.options.imageFit === 'cover' ? 'cover' : 'contain';
  const runtime = useMemo(() => cameraVideoPanelRuntime({
    requestedEdgeUrl,
    requestedSourceId,
  }), [requestedEdgeUrl,requestedSourceId]);
  const edgeUrl = runtime.kind === 'ready' ? runtime.edgeUrl : '';
  const sourceId = runtime.kind === 'ready' ? runtime.sourceId : '';

  useEffect(() => {
    const root = rootRef.current;
    if (!root || imageFit !== 'contain') return;
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
  }, [imageFit]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setConnectionError('');
    setSourceDescription(undefined);
    setNaturalVideoSize(undefined);
    setPlaybackMetrics(undefined);
    if (!connectionEnabled) {
      setPlaybackState('disconnected');
      return;
    }
    if (ownerLifecycle==='stopping') {
      setPlaybackState('disconnected');
      return;
    }
    if (!edgeUrl || !sourceId) {
      setPlaybackState('connecting');
      return;
    }

    const abort = new AbortController();
    let session: MediaEdgeSessionHandle | undefined;
    const trackCleanups=new Map<MediaStreamTrack,() => void>();
    setPlaybackState('connecting');
    void createMediaEdgeSession({
      edgeUrl,
      sourceId,
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
        if (abort.signal.aborted) return;
        if (video) video.srcObject = stream;
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
    }).then((opened) => {
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
      trackCleanups.forEach((cleanup) => cleanup());
      trackCleanups.clear();
      if (video) video.srcObject = null;
      if (session) void session.close(reason).catch(() => undefined);
    };
  }, [attempt,connectionAttempt,connectionEnabled,edgeUrl,ownerLifecycle,sourceId]);

  useEffect(() => {
    onPlaybackStateChange?.(playbackState);
  }, [onPlaybackStateChange,playbackState]);

  useEffect(() => {
    onPlaybackMetricsChange?.(playbackMetrics);
  }, [onPlaybackMetricsChange,playbackMetrics]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || playbackState !== 'playing') return;
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
  }, [playbackState]);

  useEffect(() => {
    if (!connectionEnabled || !automaticReconnectEnabled || !automaticReconnect
      || playbackState !== 'failed' || !edgeUrl || !sourceId) return;
    const timer = createDeadlineTimer(() => setAttempt((current) => current + 1));
    timer.schedule(reconnectDelayMilliseconds(attempt));
    return () => timer.cancel();
  }, [attempt,automaticReconnect,automaticReconnectEnabled,connectionEnabled,edgeUrl,playbackState,sourceId]);

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
  const state = runtime.kind === 'ready' ? playbackState : runtime.kind;
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
      data-xgc-id={panel.id}
      data-state={state}
      data-image-fit={imageFit}
      data-has-frame={naturalVideoSize ? 'true' : 'false'}
    >
      <video
        ref={videoRef}
        className="camera-video-panel-stream"
        aria-label={sourceId ? t('Live video from {sourceId}', { sourceId }) : t('Live camera video')}
        autoPlay
        muted
        playsInline
        poster={TRANSPARENT_VIDEO_POSTER}
        data-xgc-role="camera-video-stream"
        data-xgc-id={sourceId ? `${panel.id}:${sourceId}` : panel.id}
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
        style={containedStyle ? { ...containedStyle,objectFit:'contain' } : undefined}
      />
      {showMetadata && lifecycleStatus && (
        <div className="camera-video-panel-lifecycle" data-xgc-role="camera-video-lifecycle" data-xgc-id={panel.id}>
          <CameraVideoLifecycleState label={t('MEDIA')} state={lifecycleStatus.media} />
          <CameraVideoLifecycleState label={t('SOURCE')} state={lifecycleStatus.source} />
          <CameraVideoLifecycleState label={t('VIEW')} state={lifecycleStatus.viewer} />
        </div>
      )}
      {runtime.kind !== 'ready' ? (
        <CameraVideoState title={t(runtime.title)}
          description={localizeCameraValidationIssue(t,runtime.issue)} style={containedStyle} markId={panel.id} />
      ) : playbackState !== 'playing' ? (
        <CameraVideoState
          title={playbackTitle(t,playbackState, sourceId)}
          description={playbackDescription(t,playbackState, connectionError)}
          style={containedStyle}
          markId={panel.id}
        />
      ) : showMetadata ? (
        <div className="camera-video-panel-live" data-xgc-role="camera-video-live" data-xgc-id={panel.id}>
          <span>{t('LIVE')}</span>
          <span>{sourceId}</span>
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
  return <span className="camera-video-panel-lifecycle-item" data-state={state}>
    <span>{label}</span><strong>{t(state)}</strong>
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
