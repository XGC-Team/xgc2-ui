import { useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { useGroundStationErrorNotification,useGroundStationNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import {
  beginCameraExtrinsicSample,cancelCameraExtrinsicSample,cameraExtrinsicSolvePreflight,clearCameraExtrinsicSamples,
  commitCameraExtrinsicSampleImage,loadCameraExtrinsicSampleImage,loadCameraExtrinsicState,
  removeCameraExtrinsicSample,saveCameraExtrinsicCandidate,solveCameraExtrinsic,updateCameraExtrinsicSamplePixel,
  type CameraExtrinsicDatasetRef,type CameraExtrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { useExecutionTarget } from '../../domains/execution/executionPublic';
import { useDocumentVisibility } from '../../hooks/useDocumentVisibility';
import { randomId } from '../../shared/utils/randomId';
import { CameraExtrinsicCalibrationRuntimeView } from './CameraExtrinsicCalibrationRuntimeView';
import { cameraPixelForClientPoint } from './cameraExtrinsicPixel';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';
import { useCameraCalibrationImageSnapshot } from './useCameraCalibrationImageSnapshot';
import { useCameraCalibrationStateSnapshot } from './useCameraCalibrationStateSnapshot';
import type { CameraVideoLatchedFrame,CameraVideoObservationPort } from './cameraVideoSurfaceTypes';

type Action = {
  identity:string;sourceId:string;displayIdentity?:string;controller:AbortController;capture?:CameraVideoLatchedFrame;pendingId?:string;
  samplingSessionId:string;targetId:string;processInstanceId:string;
};

export function CameraExtrinsicCalibrationRuntimePanel({ processInstanceId,targetId,panelId,liveStage,observationPort }: {
  processInstanceId:string;targetId:string;panelId:string;liveStage?:ReactNode;observationPort?:CameraVideoObservationPort;
}) {
  const [selectedMarker,setSelectedMarker]=useState('');
  const [selectedSampleId,setSelectedSampleId]=useState('');
  const [replacesSampleId,setReplacesSampleId]=useState('');
  const [busyAction,setBusyAction]=useState('');
  const [actionError,setActionError]=useState('');
  const [successMessage,setSuccessMessage]=useState('');
  const [decodedReviewIdentity,setDecodedReviewIdentity]=useState('');
  const stageRef=useRef<HTMLDivElement>(null);
  const actionRef=useRef<Action|undefined>(undefined);
  const processKey=JSON.stringify([targetId,processInstanceId]);
  const currentProcessRef=useRef(processKey);
  currentProcessRef.current=processKey;
  const acceptedStateRef=useRef<{ processKey:string;state:CameraExtrinsicState }|undefined>(undefined);
  const mutationSequenceRef=useRef(0);
  const documentVisible=useDocumentVisibility();
  const execution=useExecutionTarget(targetId,false,Boolean(targetId && processInstanceId));
  const processRevision=execution.processInstances.find((instance) => instance.id===processInstanceId)?.revision ?? 0;
  const loadState=useCallback(async (signal:AbortSignal) => {
    const sequence=mutationSequenceRef.current;
    const next=await loadCameraExtrinsicState(targetId,processInstanceId,signal);
    if (signal.aborted || currentProcessRef.current!==processKey) return next;
    const accepted=acceptedStateRef.current;
    if (accepted?.processKey===processKey && accepted.state.samplingSessionId===next.samplingSessionId
      && (accepted.state.datasetRevision>next.datasetRevision
        || (accepted.state.datasetRevision===next.datasetRevision && sequence!==mutationSequenceRef.current))) return accepted.state;
    acceptedStateRef.current={ processKey,state:next };return next;
  },[processInstanceId,processKey,targetId]);
  const { state:serverState,setState:setServerState,error:stateError,refresh:refreshState }=useCameraCalibrationStateSnapshot<CameraExtrinsicState>({
    sessionKey:processKey,enabled:documentVisible,revision:processRevision,load:loadState,
  });
  // Dataset writes belong to the service session/source, not a transient display buffer.
  // Captures additionally retain the exact displayed source epoch they latched.
  const identity=JSON.stringify([processKey,serverState?.samplingSessionId,serverState?.source.sourceId]);
  const identityRef=useRef(identity);
  identityRef.current=identity;
  const displayIdentity=JSON.stringify([observationPort?.sourceId,observationPort?.sourceEpoch]);
  const displayRef=useRef({ identity:displayIdentity,sourceId:observationPort?.sourceId });
  displayRef.current={ identity:displayIdentity,sourceId:observationPort?.sourceId };
  const selectedSample=serverState?.samples.find((sample) => sample.sampleId===selectedSampleId);
  const reviewedSampleId=selectedSample?.sampleId;
  const loadImage=useCallback((signal:AbortSignal) => loadCameraExtrinsicSampleImage(targetId,processInstanceId,selectedSampleId,signal),[processInstanceId,selectedSampleId,targetId]);
  const { imageUrl,error:imageError,refresh:refreshImage }=useCameraCalibrationImageSnapshot({
    sessionKey:JSON.stringify([processKey,serverState?.samplingSessionId,selectedSampleId]),load:loadImage,enabled:Boolean(selectedSample),
  });
  const reviewImageIdentity=JSON.stringify([processKey,serverState?.samplingSessionId,reviewedSampleId,imageUrl]);
  const reviewImageIdentityRef=useRef(reviewImageIdentity);
  reviewImageIdentityRef.current=reviewImageIdentity;
  const reviewImageReady=Boolean(selectedSample && imageUrl && decodedReviewIdentity===reviewImageIdentity);
  useEffect(() => { if (reviewedSampleId) void refreshImage(); },[refreshImage,reviewedSampleId]);

  useEffect(() => {
    setBusyAction('');
    return () => {
      const action=actionRef.current;
      if (!action || action.identity!==identity) return;
      actionRef.current=undefined;
      action.controller.abort();action.capture?.release();
      if (action.pendingId) void cancelPending(action);
    };
  },[identity]);
  useEffect(() => {
    const action=actionRef.current;
    if (!action || ((!action.capture || action.displayIdentity===displayIdentity)
      && (!observationPort || observationPort.sourceId===action.sourceId))) return;
    actionRef.current=undefined;
    action.controller.abort();action.capture?.release();
    if (action.pendingId) void cancelPending(action);
    setBusyAction('');
  },[displayIdentity,observationPort]);
  useEffect(() => {
    setSelectedSampleId('');setReplacesSampleId('');setSelectedMarker('');setActionError('');setSuccessMessage('');
  },[processKey,serverState?.samplingSessionId]);
  const availableMarkers=useMemo(() => serverState?.source.markerNames ?? [],[serverState?.source.markerNames]);
  useEffect(() => {
    if (!availableMarkers.includes(selectedMarker)) setSelectedMarker(availableMarkers[0] ?? '');
  },[availableMarkers,selectedMarker]);

  const notificationError=[actionError,stateError,serverState?.recoveryError,imageError]
    .find((message) => message && !isCameraCalibrationTeardownError(message)) ?? '';
  useGroundStationErrorNotification(targetId,notificationError,{ title:'Camera calibration',source:panelId,dedupeKey:`${panelId}:calibration-api` });
  useGroundStationNotification(targetId,successMessage,{ title:'Camera calibration',severity:'success',source:panelId,dedupeKey:`${panelId}:calibration-saved`,durationMs:8_000 });

  const dataset=():CameraExtrinsicDatasetRef => ({ samplingSessionId:serverState!.samplingSessionId,expectedRevision:serverState!.datasetRevision });
  const acceptMutation=(next:CameraExtrinsicState) => {
    const accepted=acceptedStateRef.current;
    if (accepted?.processKey===processKey && accepted.state.samplingSessionId===next.samplingSessionId
      && accepted.state.datasetRevision>next.datasetRevision) return;
    mutationSequenceRef.current++;acceptedStateRef.current={ processKey,state:next };setServerState(next);
  };
  const isCurrent=(action:Action) => actionRef.current===action && !action.controller.signal.aborted
    && identityRef.current===action.identity
    && (!action.capture || displayRef.current.identity===action.displayIdentity)
    && (!displayRef.current.sourceId || displayRef.current.sourceId===action.sourceId);
  const beginAction=(name:string,capture?:CameraVideoLatchedFrame) => {
    if (actionRef.current || !serverState) return;
    const action:Action={ identity,sourceId:serverState.source.sourceId,displayIdentity:capture ? displayIdentity : undefined,controller:new AbortController(),samplingSessionId:serverState.samplingSessionId,targetId,processInstanceId,capture };
    actionRef.current=action;setBusyAction(name);setActionError('');setSuccessMessage('');return action;
  };
  const finishAction=(action:Action) => {
    action.capture?.release();
    if (isCurrent(action)) { actionRef.current=undefined;setBusyAction(''); }
  };
  const failAction=async (action:Action,cause:unknown) => {
    if (!isCurrent(action)) return;
    if (!(cause instanceof DOMException && cause.name==='AbortError')) {
      setActionError(messageOf(cause));
      // A conflicting editor owns the next state; do not overwrite it with local points.
      await refreshState();
    }
  };
  const mutate=async (name:string,operation:(ref:CameraExtrinsicDatasetRef,signal:AbortSignal) => Promise<CameraExtrinsicState>) => {
    const action=beginAction(name);if (!action) return;
    try { const next=await operation(dataset(),action.controller.signal);if (isCurrent(action)) acceptMutation(next); }
    catch (cause) { await failAction(action,cause); }
    finally { finishAction(action); }
  };
  const capturePoint=(clientX:number,clientY:number) => {
    if (actionRef.current || !serverState || !selectedMarker || !observationPort
      || observationPort.sourceId!==serverState.source.sourceId) return;
    let capture:CameraVideoLatchedFrame|undefined;
    try { capture=observationPort.latch(clientX,clientY); }
    catch (cause) { setActionError(messageOf(cause));return; }
    if (!capture) return;
    const action=beginAction('capture',capture);
    if (!action) { capture.release();return; }
    // Start pose fixation before invoking the potentially expensive native-frame encoder.
    const pending=beginCameraExtrinsicSample(targetId,processInstanceId,{
      ...dataset(),requestId:randomId(),marker:selectedMarker,pixel:capture.pixel,display:capture.display,
      ...(replacesSampleId ? { replacesSampleId } : {}),
    },action.controller.signal).then(async (value) => {
      action.pendingId=value.sampleId;
      if (!isCurrent(action)) { await cancelPending(action);throw new DOMException('Capture superseded','AbortError'); }
      return value;
    });
    const encoding=capture.encode();
    void (async () => {
      try {
        const [sample,image]=await Promise.all([pending,encoding]);
        if (!isCurrent(action)) return;
        const next=await commitCameraExtrinsicSampleImage(targetId,processInstanceId,sample.sampleId,image,action.controller.signal);
        if (!isCurrent(action)) return;
        action.pendingId=undefined;acceptMutation(next);setReplacesSampleId('');
      } catch (cause) {
        if (action.pendingId) await cancelPending(action);
        // Even when encoding fails before begin settles, cancel its late pending receipt.
        else void pending.then(() => cancelPending(action)).catch(() => undefined);
        await failAction(action,cause);
      } finally { finishAction(action); }
    })();
  };
  const activateStage=(clientX:number,clientY:number) => {
    if (actionRef.current) return;
    if (!selectedSample) { capturePoint(clientX,clientY);return; }
    if (!reviewImageReady || !stageRef.current) return;
    const pixel=cameraPixelForClientPoint(clientX,clientY,stageRef.current.getBoundingClientRect(),selectedSample.image.width,selectedSample.image.height);
    if (pixel) void mutate('pixel',(ref,signal) => updateCameraExtrinsicSamplePixel(targetId,processInstanceId,ref,selectedSample.sampleId,pixel,signal));
  };
  const solve=async () => {
    if (cameraExtrinsicSolvePreflight(serverState)) return;
    const action=beginAction('solve');if (!action) return;
    try {
      const result=await solveCameraExtrinsic(targetId,processInstanceId,dataset(),action.controller.signal);
      if (isCurrent(action) && serverState) acceptMutation({ ...serverState,result });
    } catch (cause) { await failAction(action,cause); }
    finally { finishAction(action); }
  };
  const save=async () => {
    const candidate=serverState?.result;if (!candidate || (candidate.saved && candidate.application?.status!=='unavailable')) return;
    const action=beginAction('save');if (!action) return;
    try {
      const result=await saveCameraExtrinsicCandidate(targetId,processInstanceId,candidate.candidateId,action.controller.signal);
      if (isCurrent(action)) {
        if (serverState) acceptMutation({ ...serverState,result });
        setSuccessMessage('Calibration saved.');
      }
    } catch (cause) { await failAction(action,cause); }
    finally { finishAction(action); }
  };
  const remove=(sampleId:string) => void mutate('remove',(ref,signal) => removeCameraExtrinsicSample(targetId,processInstanceId,ref,sampleId,signal));
  const points=useMemo(() => {
    const solved=new Map(serverState?.result?.points.map((point) => [point.sampleId,point]));
    return serverState?.samples.map((sample) => ({ ...sample,...solved.get(sample.sampleId) })) ?? [];
  },[serverState]);
  return <CameraExtrinsicCalibrationRuntimeView
    processInstanceId={processInstanceId} serverState={serverState} imageUrl={imageUrl} liveStage={liveStage}
    points={points} result={serverState?.result} selectedSample={selectedSample} availableMarkers={availableMarkers}
    reviewImageIdentity={reviewImageIdentity} reviewImageReady={reviewImageReady}
    onReviewImageDecoded={(identity,width,height) => {
      if (identity!==reviewImageIdentityRef.current || !selectedSample) return;
      if (width===selectedSample.image.width && height===selectedSample.image.height) setDecodedReviewIdentity(identity);
      else { setDecodedReviewIdentity('');setActionError('The captured image dimensions do not match this sample.'); }
    }}
    onReviewImageError={(identity) => {
      if (identity!==reviewImageIdentityRef.current) return;
      setDecodedReviewIdentity('');setActionError('The captured image could not be decoded.');
    }}
    selectedMarker={selectedMarker} busyAction={busyAction} stageRef={stageRef}
    captureReady={Boolean(observationPort && observationPort.sourceId===serverState?.source.sourceId)}
    solvePreflightReason={cameraExtrinsicSolvePreflight(serverState)}
    onStageActivate={activateStage} onSelectMarker={setSelectedMarker}
    onReviewSample={(id) => { setSelectedSampleId(id);setReplacesSampleId(''); }}
    onResample={() => { if (selectedSample) { setReplacesSampleId(selectedSample.sampleId);setSelectedMarker(selectedSample.marker);setSelectedSampleId(''); } }}
    onLive={() => { setSelectedSampleId('');setReplacesSampleId(''); }}
    onRefresh={() => void refreshState()}
    onSolve={() => void solve()} onSave={() => void save()} onRemovePoint={remove}
    onUndoPoint={() => { const last=serverState?.samples.at(-1);if (last) remove(last.sampleId); }}
    onClearPoints={() => void mutate('clear',(ref,signal) => clearCameraExtrinsicSamples(targetId,processInstanceId,ref,signal))}
  />;
}

async function cancelPending(action:Action) {
  if (!action.pendingId) return;
  await cancelCameraExtrinsicSample(action.targetId,action.processInstanceId,action.samplingSessionId,action.pendingId).catch(() => undefined);
}
function messageOf(error:unknown) { return error instanceof Error ? error.message : String(error); }
