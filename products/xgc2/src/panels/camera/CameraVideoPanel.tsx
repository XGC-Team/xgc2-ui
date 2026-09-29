import { useCallback,useMemo } from 'react';
import { createMediaEdgeSession,createStationMediaEdgeSignaling } from '../../domains/execution/executionPublic';
import { useExperimentSurfaceVisible } from '../../domains/experiment/experimentPublic';
import type { PanelPluginProps } from '../types';
import { cameraVideoPanelRuntime } from './cameraVideoPanelModel';
import { localizeCameraValidationIssue,useCameraText } from './cameraMessages';
import { CameraVideoSurface } from './CameraVideoSurface';
import type { CameraVideoSessionFactory,CameraVideoSource,CameraVideoSurfaceProps } from './cameraVideoSurfaceTypes';

export type { CameraVideoPlaybackMetrics,CameraVideoPlaybackState } from './cameraVideoSurfaceTypes';

type CameraVideoPanelProps = PanelPluginProps<readonly ['visualization']>
  & Omit<CameraVideoSurfaceProps,'id'|'source'|'presentation'>
  & {
    /** Exact supervised owner. An empty instance waits; it never falls back to edgeUrl. */
    mediaEdgeProcess?:{ targetId:string;instanceId:string };
  };

/** Station panel adapter. The shared surface never parses authoring or selects its own authority. */
export function CameraVideoPanel({ panel,context,mediaEdgeProcess,surfaceVisible=true,...viewer }:CameraVideoPanelProps) {
  void context;
  const t=useCameraText();
  // A hidden Experiment dashboard tab or parked Experiment page releases the
  // WebRTC session (decoder and bytes) like any hidden host surface, and
  // renegotiates when shown; the Panel Workflow lifecycle is unaffected.
  const dashboardVisible=useExperimentSurfaceVisible();
  const requestedEdgeUrl=panel.options.edgeUrl;
  const requestedSourceId=panel.options.sourceId;
  const stationSignaling=mediaEdgeProcess!==undefined;
  const mediaTargetId=mediaEdgeProcess?.targetId??'';
  const mediaInstanceId=mediaEdgeProcess?.instanceId??'';
  const runtime=useMemo(() => cameraVideoPanelRuntime({
    requestedEdgeUrl,requestedSourceId,stationSignaling,
  }),[requestedEdgeUrl,requestedSourceId,stationSignaling]);
  const edgeUrl=runtime.kind==='ready' ? runtime.edgeUrl : '';
  const sourceId=runtime.kind==='ready' ? runtime.sourceId : '';
  const openSession=useCallback<CameraVideoSessionFactory>((callbacks) => createMediaEdgeSession({
    ...callbacks,
    ...(stationSignaling
      ? { signaling:createStationMediaEdgeSignaling(mediaTargetId,mediaInstanceId,sourceId) }
      : { edgeUrl,sourceId }),
  }),[edgeUrl,mediaInstanceId,mediaTargetId,sourceId,stationSignaling]);
  const source:CameraVideoSource=runtime.kind!=='ready'
    ? { kind:runtime.kind,title:t(runtime.title),description:localizeCameraValidationIssue(t,runtime.issue) }
    : stationSignaling && !mediaInstanceId
      ? { kind:'waiting',id:sourceId,title:t('Waiting for {sourceId}',{ sourceId }),
        description:t('Waiting for the workflow-owned Media Edge process.') }
      : { kind:'ready',id:sourceId,
        sessionKey:JSON.stringify(stationSignaling
          ? ['station',mediaTargetId,mediaInstanceId,sourceId]
          : ['external',edgeUrl,sourceId]),openSession };
  return <CameraVideoSurface
    {...viewer}
    surfaceVisible={surfaceVisible && dashboardVisible}
    id={panel.id}
    source={source}
    presentation={{
      imageFit:panel.options.imageFit==='cover' ? 'cover' : 'contain',
      showMetadata:panel.options.showMetadata!==false,
      reconnectPolicy:panel.options.reconnectPolicy==='automatic' ? 'automatic' : 'manual',
    }}
  />;
}
