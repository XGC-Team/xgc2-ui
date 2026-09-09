import { RefreshCw,Video,VideoOff } from 'lucide-react';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { EmptyState,Notice } from '@xgc2/ui-react';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelPluginProps } from '../types';
import { usePanelFrameControl } from '../usePanelFrameControl';
import { CameraVideoPanel,type CameraVideoPlaybackState } from './CameraVideoPanel';
import { cameraVideoPanelOptions } from './cameraVideoPanelModel';
import {
  decodeMultiCameraMonitorStreams,
  type MultiCameraMonitorStream,
} from './multiCameraMonitorModel';
import {
  useCameraVideoFrame,
  type CameraVideoViewerControl,
} from './cameraVideoPanelFrameContext';
import { useCameraVideoMediaControl } from './useCameraVideoMediaControl';
import '../../styles/multi-camera-monitor.css';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

type ManagedContext = PanelPluginProps<readonly ['visualization','experiment','execution','automation']>['context'];
type ViewerIntent = 'auto' | 'connected' | 'disconnected';

export function ManagedCameraVideoPanel({ panel,context }: PanelPluginProps<readonly ['visualization','experiment','execution','automation']>) {
  const t = useCameraText();
  const frame = useCameraVideoFrame(panel.id);
  const panelOptions = cameraVideoPanelOptions(panel.options);
  const media = useCameraVideoMediaControl(context,panelOptions.mediaBindingId);
  const streams = useMemo(
    () => configuredStreams(panel).filter((stream) => stream.enabled),
    [panel],
  );
  const [viewers,setViewers] = useState<Record<string,CameraVideoViewerControl>>({});
  const setViewer = useCallback((streamId: string, viewer: CameraVideoViewerControl | null) => {
    setViewers((current) => {
      if (viewer && current[streamId] === viewer) return current;
      if (!viewer && !current[streamId]) return current;
      const next = { ...current };
      if (viewer) next[streamId] = viewer;
      else delete next[streamId];
      return next;
    });
  }, []);
  const activeViewers = useMemo(
    () => streams.map((stream) => viewers[stream.id])
      .filter((viewer): viewer is CameraVideoViewerControl => Boolean(viewer)),
    [streams,viewers],
  );
  const aggregateViewer = useMemo<CameraVideoViewerControl>(() => ({
    requested:activeViewers.some((viewer) => viewer.requested),
    state:aggregateViewerState(activeViewers),
    connect:() => activeViewers.forEach((viewer) => viewer.connect()),
    disconnect:() => activeViewers.forEach((viewer) => viewer.disconnect()),
    retry:() => activeViewers.forEach((viewer) => viewer.retry()),
  }), [activeViewers]);
  usePanelFrameControl(frame.setViewer, aggregateViewer);
  usePanelFrameControl(frame.setMedia, media.control);

  if (streams.length === 0) {
    return <EmptyState appearance="plain" fill
      title={t('Configure camera sources')} description={t('Enable at least one camera source in the panel settings.')}
      data-xgc-role="managed-camera-video-empty" data-xgc-id={panel.id} />;
  }

  return <div className="managed-camera-video-panel" data-xgc-role="managed-camera-video-panel" data-xgc-id={panel.id}>
    <section className="multi-camera-monitor-root" data-xgc-role="camera-video-grid" data-xgc-id={panel.id}>
      <div className="multi-camera-monitor-grid"
        data-columns={String(panel.options.layoutColumns || 'auto')}
        data-aspect-ratio={String(panel.options.tileAspectRatio || '16:9')}>
        {streams.map((stream) => <ManagedCameraVideoTile key={stream.id}
          parentPanel={panel} stream={stream} context={context}
          experimentRunning={media.control.running}
          mediaState={media.control.state} mediaRunning={media.control.running}
          onViewerChange={setViewer} />)}
      </div>
    </section>
    {media.error && <Notice className="camera-video-panel-error" density="compact" tone="danger"
      data-xgc-role="camera-video-media-error" data-xgc-id={panel.id}>{localizeCameraMessage(t,media.error)}</Notice>}
  </div>;
}

function ManagedCameraVideoTile({
  parentPanel,stream,context,experimentRunning,mediaState,mediaRunning,onViewerChange,
}: {
  parentPanel: PanelInstance;
  stream: MultiCameraMonitorStream;
  context: ManagedContext;
  experimentRunning: boolean;
  mediaState: string;
  mediaRunning: boolean;
  onViewerChange: (streamId: string,viewer: CameraVideoViewerControl | null) => void;
}) {
  const t = useCameraText();
  const options = cameraVideoPanelOptions(parentPanel.options);
  const [viewerIntent,setViewerIntent] = useState<ViewerIntent>('auto');
  const [viewerState,setViewerState] = useState<CameraVideoPlaybackState>('connecting');
  const [viewerAttempt,setViewerAttempt] = useState(0);
  const autoRequested = options.autoConnect || (options.autoConnectOnExperimentRun && experimentRunning);
  const viewerRequested = viewerIntent === 'connected' || (viewerIntent === 'auto' && autoRequested);
  const onStateChange = useCallback((state: CameraVideoPlaybackState) => {
    setViewerState((current) => current === state ? current : state);
  }, []);
  const viewer = useMemo<CameraVideoViewerControl>(() => ({
    requested:viewerRequested,
    state:viewerRequested ? viewerState : 'disconnected',
    connect:() => { setViewerIntent('connected');setViewerAttempt((current) => current + 1); },
    disconnect:() => setViewerIntent('disconnected'),
    retry:() => { setViewerIntent('connected');setViewerAttempt((current) => current + 1); },
  }), [viewerRequested,viewerState]);
  useEffect(() => {
    onViewerChange(stream.id,viewer);
    return () => onViewerChange(stream.id,null);
  }, [onViewerChange,stream.id,viewer]);

  const streamPanel: PanelInstance = {
    ...parentPanel,
    id:`${parentPanel.id}:${stream.id}`,
    title:stream.name,
    options:{
      ...parentPanel.options,
      edgeUrl:stream.edgeUrl,
      sourceId:stream.sourceId,
    },
  };
  const viewerLabel = viewer.state === 'failed' ? t('Retry {name}', { name:stream.name })
    : viewer.requested ? t('Disconnect {name}', { name:stream.name }) : t('Connect {name}', { name:stream.name });
  const markId = `${parentPanel.id}:${stream.id}`;
  return <article className="multi-camera-monitor-tile" data-xgc-role="camera-video-tile" data-xgc-id={markId}>
    <CameraVideoPanel panel={streamPanel} context={context}
      connectionEnabled={viewerRequested && mediaState!=='stopping'} connectionAttempt={viewerAttempt}
      automaticReconnectEnabled={mediaRunning && mediaState!=='stopping'}
      ownerLifecycle={mediaState==='stopping' ? 'stopping' : 'running'}
      onPlaybackStateChange={onStateChange}
      lifecycleStatus={{
        media:mediaState,
        source:sourceState(viewerRequested,viewerState),
        viewer:viewerRequested ? viewerState : 'disconnected',
      }} />
    <span className="multi-camera-monitor-tile-name" data-xgc-role="camera-video-tile-name" data-xgc-id={markId}>{stream.name}</span>
    <div className="camera-video-tile-actions" data-xgc-role="camera-video-tile-actions" data-xgc-id={markId}>
      <ControlButton iconOnly size="compact" aria-label={viewerLabel} title={viewerLabel}
        dataXgcRole="camera-video-tile-viewer-toggle" dataXgcId={markId}
        onClick={() => {
          if (viewer.state === 'failed') viewer.retry();
          else if (viewer.requested) viewer.disconnect();
          else viewer.connect();
        }}>
        {viewer.state === 'failed' ? <RefreshCw size={14} />
          : viewer.requested ? <VideoOff size={14} /> : <Video size={14} />}
      </ControlButton>
    </div>
  </article>;
}

function configuredStreams(panel: PanelInstance): MultiCameraMonitorStream[] {
  const decoded = decodeMultiCameraMonitorStreams(panel.options.streamsJson);
  return decoded.streams;
}

function aggregateViewerState(viewers: CameraVideoViewerControl[]): CameraVideoPlaybackState {
  if (viewers.length === 0 || viewers.every((viewer) => !viewer.requested)) return 'disconnected';
  if (viewers.some((viewer) => viewer.state === 'failed')) return 'failed';
  if (viewers.every((viewer) => !viewer.requested || viewer.state === 'playing')) return 'playing';
  if (viewers.some((viewer) => viewer.state === 'waiting')) return 'waiting';
  return 'connecting';
}

function sourceState(requested: boolean, viewer: CameraVideoPlaybackState) {
  if (!requested) return 'unknown';
  if (viewer === 'playing') return 'ready';
  if (viewer === 'failed') return 'offline';
  return 'pending';
}
