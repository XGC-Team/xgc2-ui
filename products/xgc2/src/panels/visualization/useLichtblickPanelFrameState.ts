import { useCallback,useLayoutEffect,useMemo,useRef,useState,type RefCallback } from 'react';
import { createDeadlineTimer } from '../../shared/eventCoalescer';
import { isLichtblickSceneCommandMessage,replayFrozenSceneCommandError,runLichtblickSceneCommand,sceneBindingMessage,sceneCommandRequestId,sceneHostSignature,sceneResultMessage,type LichtblickSceneHost,type LichtblickSceneResult } from './lichtblickSceneBridge';
import { isLichtblickEmbedReadyMessage,lichtblickEmbedToggleSurfaceMessage,type LichtblickEmbedSurface } from './lichtblickEmbedBridge';
import type { LichtblickWorkspaceView,LichtblickEmbedBridgeControl } from './LichtblickPanelFrame';

const noEmbedCapabilities: readonly LichtblickEmbedSurface[] = [];

export function useLichtblickPanelFrameState() {
  const [view,setView] = useState<LichtblickWorkspaceView>('lichtblick');
  const sceneHost = useRef<LichtblickSceneHost|undefined>(undefined);
  const sceneFrozen = useRef(false);
  const sceneGeneration = useRef(0);
  const sceneRequests = useRef(new Map<string,{ payload:string;result:Promise<LichtblickSceneResult> }>());
  const sceneControllers = useRef(new Set<AbortController>());
  const cancelSceneRequests=useCallback(() => {
    sceneGeneration.current++;
    sceneFrozen.current=false;
    sceneControllers.current.forEach((controller) => controller.abort());
    sceneControllers.current.clear();sceneRequests.current.clear();
  },[]);
  const iframeElement = useRef<HTMLIFrameElement | null>(null);
  const [embedReady,setEmbedReady] = useState(false);
  const [embedCapabilities,setEmbedCapabilities] = useState(noEmbedCapabilities);
  const [visibleSurfaces,setVisibleSurfaces] = useState(noEmbedCapabilities);
  const iframeRef = useCallback<RefCallback<HTMLIFrameElement>>((element) => {
    if (element === iframeElement.current) return;
    cancelSceneRequests();
    iframeElement.current = element;
    if (!element) return;
    setEmbedReady(false);
    setEmbedCapabilities(noEmbedCapabilities);
    setVisibleSurfaces(noEmbedCapabilities);
  },[cancelSceneRequests]);
  const postSceneBinding=useCallback(() => {
    const iframe=iframeElement.current;
    if (!iframe) return;
    const origin=trustedLichtblickFrameOrigin(iframe);
    if (origin) iframe.contentWindow?.postMessage(sceneBindingMessage(sceneHost.current),origin);
  },[]);
  const setSceneHost=useCallback((host:LichtblickSceneHost|undefined) => {
    const changed=sceneHostSignature(host)!==sceneHostSignature(sceneHost.current);
    sceneHost.current=host;
    if (changed) { cancelSceneRequests();postSceneBinding(); }
  },[cancelSceneRequests,postSceneBinding]);
  useLayoutEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const iframe = iframeElement.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const origin = trustedLichtblickFrameOrigin(iframe);
      if (!origin || event.origin !== origin) return;
      if (isLichtblickEmbedReadyMessage(event.data)) {
        setEmbedCapabilities([...event.data.capabilities]);
        setVisibleSurfaces([...event.data.visibleSurfaces]);
        setEmbedReady(true);
        postSceneBinding();
        return;
      }
      if (!isLichtblickSceneCommandMessage(event.data)) {
        const requestId=sceneCommandRequestId(event.data);
        if (requestId) iframe.contentWindow?.postMessage(sceneResultMessage(requestId,{ success:false,error:'Invalid scene edit. Refresh the viewer and check the selected geometry.' }),origin);
        return;
      }
      const message=event.data;
      const host=sceneHost.current;
      const generation=sceneGeneration.current;
      const reply=(result:LichtblickSceneResult) => {
        if (result.success && result.frozen!==undefined) sceneFrozen.current=result.frozen;
        if (sceneGeneration.current===generation && iframeElement.current===iframe) {
          iframe.contentWindow?.postMessage(sceneResultMessage(message.requestId,result),origin);
        }
      };
      if (!host?.editable) { reply({ success:false,error:'Scene editing is unavailable. Start the scene workflow and connect its Action.' });return; }
      const frozenError=replayFrozenSceneCommandError(sceneFrozen.current,message.command.operation);
      if (frozenError) { reply({ success:false,error:frozenError });return; }
      const payload=JSON.stringify(message.command);
      const previous=sceneRequests.current.get(message.requestId);
      if (previous && previous.payload!==payload) { reply({ success:false,error:'This scene request ID was already used for a different edit.' });return; }
      if (previous) { void previous.result.then(reply);return; }
      if (sceneControllers.current.size>=8) { reply({ success:false,error:'Scene updates are still pending. Wait for them to finish.' });return; }
      const controller=new AbortController();sceneControllers.current.add(controller);
      const timeout=createDeadlineTimer(() => controller.abort());timeout.schedule(25_000);
      const result=runLichtblickSceneCommand(host,message.command,controller.signal)
        .catch((error:unknown):LichtblickSceneResult => ({ success:false,error:error instanceof Error ? error.message : String(error) }))
        .finally(() => { timeout.cancel();sceneControllers.current.delete(controller); });
      sceneRequests.current.set(message.requestId,{ payload,result });
      if (sceneRequests.current.size>100) sceneRequests.current.delete(sceneRequests.current.keys().next().value!);
      void result.then(reply);
    };
    window.addEventListener('message', handleMessage);
    return () => { window.removeEventListener('message', handleMessage);cancelSceneRequests(); };
  },[cancelSceneRequests,postSceneBinding]);
  const toggleSurface = useCallback((surface: LichtblickEmbedSurface) => {
    const iframe = iframeElement.current;
    if (!iframe || !embedReady || !embedCapabilities.includes(surface)) return;
    const origin = trustedLichtblickFrameOrigin(iframe);
    if (!origin) return;
    iframe.contentWindow?.postMessage(lichtblickEmbedToggleSurfaceMessage(surface), origin);
  },[embedCapabilities,embedReady]);
  const embedBridge = useMemo<LichtblickEmbedBridgeControl>(() => ({
    iframeRef,
    ready: embedReady,
    capabilities: embedCapabilities,
    visibleSurfaces,
    toggleSurface,
  }),[embedCapabilities,embedReady,iframeRef,toggleSurface,visibleSurfaces]);
  return useMemo(() => ({ view,setView,embedBridge,setSceneHost }),[embedBridge,view,setSceneHost]);
}

function trustedLichtblickFrameOrigin(iframe: HTMLIFrameElement) {
  try {
    const origin = new URL(iframe.src, window.location.href).origin;
    return origin === window.location.origin ? origin : '';
  } catch {
    return '';
  }
}
