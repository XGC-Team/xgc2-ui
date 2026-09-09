import { LoaderCircle,RefreshCw,RotateCw,Video,VideoOff } from 'lucide-react';
import { useMemo,useState } from 'react';
import { StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import type { PanelPluginFrameProviderProps,PanelPluginHeaderActionsProps } from '../types';
import {
  CameraVideoFrameContext,
  useCameraVideoFrame,
  type CameraVideoMediaControl,
  type CameraVideoViewerControl,
} from './cameraVideoPanelFrameContext';
import { localizeCameraMessage,useCameraText } from './cameraMessages';

export function CameraVideoFrameProvider({ panel,children }: PanelPluginFrameProviderProps) {
  const [viewer,setViewer] = useState<CameraVideoViewerControl | null>(null);
  const [media,setMedia] = useState<CameraVideoMediaControl | null>(null);
  const value = useMemo(() => ({ panelId:panel.id,viewer,setViewer,media,setMedia }), [media,panel.id,viewer]);
  return <CameraVideoFrameContext.Provider value={value}>{children}</CameraVideoFrameContext.Provider>;
}

export function CameraVideoHeaderStatus({ panel,editing }: PanelPluginHeaderActionsProps) {
  const t = useCameraText();
  const frame = useCameraVideoFrame(panel.id);
  const viewer = frame.viewer;
  const media = frame.media;
  if (editing) return null;
  return <StatusText className="camera-video-panel-header-status" data-xgc-role="camera-video-header-status"
    data-xgc-id={panel.id}
    status={viewer?.state === 'failed' || media?.state === 'failed' ? 'failed' : viewer?.state ?? media?.state ?? 'unavailable'}
    data-media-binding-id={media?.bindingId ?? ''} data-media-run-id={media?.runId ?? ''}
    data-media-state={media?.state ?? 'unavailable'} data-viewer-state={viewer?.state ?? 'unavailable'}>
    {t(media?.state ?? 'media unavailable')} · {t(viewer?.state ?? 'viewer unavailable')}
  </StatusText>;
}

export function CameraVideoHeaderActions({ panel,editing }: PanelPluginHeaderActionsProps) {
  const t = useCameraText();
  const frame = useCameraVideoFrame(panel.id);
  const viewer = frame.viewer;
  const media = frame.media;
  if (editing) return null;

  const viewerLabel = viewer?.state === 'failed'
    ? t('Retry camera viewer')
    : viewer?.requested
      ? t('Disconnect camera viewer')
      : t('Connect camera viewer');
  const ViewerIcon = viewer?.state === 'failed' ? RefreshCw : viewer?.requested ? VideoOff : Video;
  return <div className="camera-video-panel-header-actions" data-xgc-role="camera-video-header-actions" data-xgc-id={panel.id}>
    <ControlButton className="xgc-panel-runtime-action" iconOnly
      aria-label={viewerLabel} title={viewerLabel}
      dataXgcRole="camera-video-viewer-toggle" dataXgcId={panel.id}
      disabled={!viewer}
      onClick={(event) => {
        event.stopPropagation();
        if (viewer?.state === 'failed') viewer.retry();
        else if (viewer?.requested) viewer?.disconnect();
        else viewer?.connect();
      }}>
      <ViewerIcon size={14} aria-hidden="true" />
    </ControlButton>
    {media?.running && (
      <ControlButton className="xgc-panel-runtime-action" iconOnly
        aria-label={media?.restarting ? t('Restarting camera media workflow') : t('Restart camera media workflow')}
        title={media?.restartDisabledReason
          ? localizeCameraMessage(t,media.restartDisabledReason)
          : t('Restart the active camera media Action invocation.')}
        dataXgcRole="camera-video-media-restart" dataXgcId={panel.id}
        disabled={media.restarting || Boolean(media.restartDisabledReason)}
        onClick={(event) => { event.stopPropagation();void media?.restart().catch(() => undefined); }}>
        {media?.restarting ? <LoaderCircle className="spin" size={14} /> : <RotateCw size={14} />}
      </ControlButton>
    )}
  </div>;
}
