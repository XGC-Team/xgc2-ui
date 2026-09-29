import { Notice } from '@xgc2/ui-react';
import { useCallback,useEffect,useRef,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import {
  createMediaEdgeSession,decodeMediaEdgeSessionAnswer,
} from '../../domains/execution/mediaEdgePublic';
import { useLocalizedText } from '../../shared/localization/localizedText';
import type { SharedSurfaceClient,SharedSurfaceEndpoint,SharedSurfaceProps } from '../../shared/sharedSurface';
import { CameraVideoSurface,type CameraVideoSessionFactory } from './cameraVideoPublic';
import './SharedCameraSurface.css';

const messages={
  'This camera entry is unavailable.':'此相机入口不可用。',
  'This entry does not include camera images.':'此入口未授权相机画面。',
  'Live camera is unavailable.':'实时画面暂不可用。',
  'Refresh snapshot':'刷新快照',
  'Camera snapshot':'相机快照',
  'The snapshot could not be loaded. Try again.':'快照获取失败，请重试。',
};

type CameraBinding = {
  title:string;
  panelId:string;
  sourceId:string;
  liveKey?:string;
  snapshotKey?:string;
  liveGranted:boolean;
};

/** Camera-owned scoped adapter. All requests use the host's exact endpoint client. */
export function SharedCameraSurface({ projection,client }:SharedSurfaceProps) {
  const t=useLocalizedText(messages);
  const binding=cameraBinding(projection);
  if (!binding) return <Notice tone="danger" density="compact">{t('This camera entry is unavailable.')}</Notice>;
  return <SharedCameraViewer binding={binding} client={client} />;
}

function SharedCameraViewer({ binding,client }:{ binding:CameraBinding;client:SharedSurfaceClient }) {
  const t=useLocalizedText(messages);
  const openSession=useCallback<CameraVideoSessionFactory>((callbacks) => createMediaEdgeSession({
    ...callbacks,
    signaling:{
      open:async (sdp,signal) => {
        const response=await client.request('media.open',{ body:{ sdp },signal });
        return decodeMediaEdgeSessionAnswer(await response.json(),binding.sourceId);
      },
      close:async (sessionId,signal) => {
        await client.request('media.close',{ params:{ sessionId },signal });
      },
    },
  }).catch(() => { throw new Error(t('Live camera is unavailable.')); }),[binding.sourceId,client,t]);
  return <section className="shared-camera-surface" data-xgc-role="shared-camera-surface" data-xgc-id={binding.panelId}>
    {binding.liveKey ? <div className="shared-camera-live">
      <CameraVideoSurface
        id={binding.panelId}
        source={{ kind:'ready',id:binding.sourceId,label:binding.title,sessionKey:binding.liveKey,openSession }}
        presentation={{ imageFit:'contain',showMetadata:true,reconnectPolicy:'automatic' }}
      />
    </div> : binding.liveGranted ? <Notice tone="warning" density="compact">{t('Live camera is unavailable.')}</Notice> : null}
    {binding.snapshotKey ? <SharedCameraSnapshot key={binding.snapshotKey} binding={binding} client={client} /> : null}
    {!binding.liveGranted && !binding.snapshotKey
      ? <Notice density="compact">{t('This entry does not include camera images.')}</Notice> : null}
  </section>;
}

function SharedCameraSnapshot({ binding,client }:{ binding:CameraBinding;client:SharedSurfaceClient }) {
  const t=useLocalizedText(messages);
  const pending=useRef<AbortController|null>(null);
  const objectUrl=useRef('');
  const [url,setUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  useEffect(() => () => {
    pending.current?.abort();
    pending.current=null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current='';
  },[]);
  const refresh=async () => {
    if (pending.current) return;
    const controller=new AbortController();
    pending.current=controller;
    setBusy(true);
    setFailed(false);
    try {
      const response=await client.request('media.snapshot',{ signal:controller.signal });
      const blob=await response.blob();
      if (controller.signal.aborted || pending.current!==controller) return;
      if (!blob.type.startsWith('image/')) throw new Error('Snapshot is not an image.');
      const nextUrl=URL.createObjectURL(blob);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current=nextUrl;
      setUrl(nextUrl);
    } catch {
      if (!controller.signal.aborted && pending.current===controller) setFailed(true);
    } finally {
      if (pending.current===controller) {
        pending.current=null;
        setBusy(false);
      }
    }
  };
  return <section className="shared-camera-snapshot" aria-label={t('Camera snapshot')}
    data-xgc-role="shared-camera-snapshot" data-xgc-id={binding.panelId}>
    <div className="shared-camera-actions">
      <ControlButton disabled={busy} onClick={() => void refresh()}
        dataXgcRole="shared-camera-snapshot-refresh" dataXgcId={binding.panelId}>
        {t('Refresh snapshot')}
      </ControlButton>
    </div>
    {failed ? <Notice tone="danger" density="compact">{t('The snapshot could not be loaded. Try again.')}</Notice> : null}
    {url ? <img className="shared-camera-snapshot-image" src={url} alt={binding.title}
      data-xgc-role="shared-camera-snapshot-image" data-xgc-id={binding.panelId} /> : null}
  </section>;
}

function cameraBinding(projection:SharedSurfaceProps['projection']):CameraBinding|undefined {
  if (projection.contractVersion!==1 || projection.moduleId!=='experiment.camera' || projection.viewContractVersion!==1
    || !opaque(projection.entryId) || !projection.actions.includes('surface.read')) return undefined;
  const surface=record(projection.surface);
  const panel=record(projection.panel);
  const media=record(projection.media);
  if (surface?.kind!=='experiment-panel' || !opaque(surface.experimentId) || !opaque(surface.sessionId)
    || !opaque(surface.panelId) || panel?.id!==surface.panelId
    || !opaque(media?.sourceId) || !opaque(media?.processInstanceId)) return undefined;
  const title=displayName(panel.title)||displayName(projection.name);
  if (!title) return undefined;
  const scopeKey=JSON.stringify([projection.entryId,surface.experimentId,surface.sessionId,surface.panelId,
    media.sourceId,media.processInstanceId]);
  const open=endpoint(projection,'media.open','POST','webrtc','camera.live');
  const close=endpoint(projection,'media.close','DELETE','webrtc','camera.live');
  const snapshot=endpoint(projection,'media.snapshot','GET','http','camera.snapshot');
  return {
    title,panelId:surface.panelId,sourceId:media.sourceId,
    liveGranted:projection.actions.includes('camera.live'),
    liveKey:open && close ? JSON.stringify([scopeKey,endpointIdentity(open),endpointIdentity(close)]) : undefined,
    snapshotKey:snapshot ? JSON.stringify([scopeKey,endpointIdentity(snapshot)]) : undefined,
  };
}

function endpoint(
  projection:SharedSurfaceProps['projection'],id:string,method:SharedSurfaceEndpoint['method'],
  protocol:SharedSurfaceEndpoint['protocol'],action:string,
) {
  if (!projection.actions.includes(action)) return undefined;
  const matches=projection.endpoints.filter((item) => item.id===id);
  if (matches.length!==1) return undefined;
  const value=matches[0]!;
  return value.method===method && value.protocol===protocol && value.action===action ? value : undefined;
}

function endpointIdentity(value:SharedSurfaceEndpoint) {
  return [value.id,value.method,value.path,value.protocol,value.action];
}
function record(value:unknown):Record<string,unknown>|undefined {
  return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}
function opaque(value:unknown):value is string {
  return typeof value==='string' && value.length>0 && value.trim()===value;
}
function displayName(value:unknown) {
  return typeof value==='string' ? value.trim() : '';
}
