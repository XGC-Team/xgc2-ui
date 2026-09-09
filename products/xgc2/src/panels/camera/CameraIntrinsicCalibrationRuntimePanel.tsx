import { useCallback,useEffect,useRef,useState,type ReactNode } from 'react';
import {
  startCameraIntrinsicAnalysis,autoRunCameraIntrinsic,commitCameraIntrinsicAsset,
  gotoCameraIntrinsicTarget,
  loadCameraIntrinsicEvidence,loadCameraIntrinsicImage,loadCameraIntrinsicState,
  openCameraIntrinsicStateStream,
  resetCameraIntrinsic,
  saveCameraIntrinsicCandidate,
  startCameraIntrinsicAutoCapture,stopCameraIntrinsicAutoCapture,
  type CameraCalibrationAssetPin,type CameraIntrinsicResult,type CameraIntrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { useExecutionTarget } from '../../domains/execution/executionPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { useDocumentVisibility } from '../../hooks/useDocumentVisibility';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import {
  CameraIntrinsicCalibrationRuntimeView,type CameraIntrinsicAction,
} from './CameraIntrinsicCalibrationRuntimeView';
import type { CameraVideoPlaybackMetrics } from './CameraVideoPanel';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';
import { useCameraCalibrationImageSnapshot } from './useCameraCalibrationImageSnapshot';
import { useCameraCalibrationStateSnapshot } from './useCameraCalibrationStateSnapshot';

export function CameraIntrinsicCalibrationRuntimePanel({
  processInstanceId,targetId,panelId,runMode = 'simulation',liveStage,livePlaybackMetrics,enabled = true,
}: {
  processInstanceId: string;
  targetId: string;
  panelId: string;
  runMode?: string;
  liveStage?: ReactNode;
  livePlaybackMetrics?: CameraVideoPlaybackMetrics;
  enabled?: boolean;
}) {
  const [assetPin,setAssetPin] = useState<CameraCalibrationAssetPin>();
  const [selectedTargetIndex,setSelectedTargetIndex] = useState<number | null>(null);
  const [busyAction,setBusyAction] = useState<CameraIntrinsicAction>('');
  const [stateStreamError,setStateStreamError] = useState('');
  const [actionError,setActionError] = useState('');
  const processKey = JSON.stringify([targetId,processInstanceId]);
  const beginActionRequest = useLatestAsyncRequest(processKey);
  const documentVisible = useDocumentVisibility();
  const execution = useExecutionTarget(targetId, false, Boolean(targetId && processInstanceId));
  const processRevision = execution.processInstances
    .find((instance) => instance.id === processInstanceId)?.revision ?? 0;
  const assetCommitAttemptRef = useRef('');
  const observedActionStatusRef = useRef<string | undefined>(undefined);
  const runtimeEnabledRef = useRef(enabled);
  runtimeEnabledRef.current = enabled;
  const loadState = useCallback(
    (signal: AbortSignal) => loadCameraIntrinsicState(targetId, processInstanceId, signal),
    [processInstanceId,targetId],
  );
  const {
    state: serverState,
    setState: setServerState,
    error: stateError,
    refresh: refreshState,
  } = useCameraCalibrationStateSnapshot<CameraIntrinsicState>({
    sessionKey: processKey,
    enabled: documentVisible && enabled,
    revision: processRevision,
    load: loadState,
  });

  const loadAnnotatedImage = useCallback(
    (signal: AbortSignal) => loadCameraIntrinsicImage(targetId, processInstanceId, signal),
    [processInstanceId,targetId],
  );
  const {
    imageUrl:annotatedImageUrl,error:annotatedImageError,refresh:refreshAnnotatedImage,
  } = useCameraCalibrationImageSnapshot({
    sessionKey:processKey,load:loadAnnotatedImage,enabled:documentVisible && enabled,
  });

  const serverAutoRunning = serverState?.action?.status === 'running';
  const effectiveBusyAction: CameraIntrinsicAction = serverState?.solveJob?.status==='running'
    ? 'analyze' : serverAutoRunning ? 'auto-run' : busyAction;
  const notificationError = enabled
    ? [actionError,serverState?.solveJob?.status==='failed' ? serverState.solveJob.error : '',stateError,stateStreamError,annotatedImageError]
      .find((message) => message && !isCameraCalibrationTeardownError(message)) ?? ''
    : '';
  useGroundStationErrorNotification(targetId, notificationError, {
    title: 'Camera intrinsic calibration',source: panelId,dedupeKey: `${panelId}:intrinsic-calibration-api`,
  });

  useEffect(() => {
    setAssetPin(undefined);setSelectedTargetIndex(null);setBusyAction('');
    assetCommitAttemptRef.current = '';
    observedActionStatusRef.current = undefined;
    setStateStreamError('');setActionError('');
  }, [processInstanceId,targetId]);

  useEffect(() => {
    if (!documentVisible || !enabled) return;
    setStateStreamError('');
    const stream = openCameraIntrinsicStateStream(
      targetId,processInstanceId,setServerState,
      (cause) => {
        if (runtimeEnabledRef.current && !isCameraCalibrationTeardownError(cause)) {
          setStateStreamError(messageOf(cause));
        }
      },
    );
    return () => stream.close();
  }, [documentVisible,enabled,processInstanceId,setServerState,targetId]);

  useEffect(() => {
    if (!enabled) setStateStreamError('');
  }, [enabled]);

  useEffect(() => {
    if (!documentVisible || !enabled || !serverState?.imageReady || serverState.detection.sequence < 1) return;
    void refreshAnnotatedImage();
  }, [documentVisible,enabled,refreshAnnotatedImage,serverState?.detection.sequence,serverState?.imageReady]);

  const persistResult = useCallback(async (solved: CameraIntrinsicResult) => {
    const intent = intrinsicCommitIntent(processInstanceId, runMode, solved);
    if (assetCommitAttemptRef.current === intent.idempotencyKey && assetPin) return assetPin;
    assetCommitAttemptRef.current = intent.idempotencyKey;
    try {
      const pin = await commitCameraIntrinsicAsset(targetId, processInstanceId, {
        assetName:intent.assetName,
        cameraSourceId:intent.cameraSourceId,
        namespacePath:intent.namespacePath,
        idempotencyKey:intent.idempotencyKey,
      });
      setAssetPin(pin);
      return pin;
    } catch (cause) {
      assetCommitAttemptRef.current = '';
      throw cause;
    }
  }, [assetPin,processInstanceId,runMode,targetId]);

  useEffect(() => {
    if (!serverState) return;
    const status = serverState.action?.status ?? '';
    const previous = observedActionStatusRef.current;
    observedActionStatusRef.current = status;
    const liveTransition = previous !== undefined;
    const error = serverState.action?.error?.trim() ?? '';
    if (liveTransition && status === 'failed' && previous !== 'failed' && error) {
      setActionError(error);
    }
  }, [serverState]);

  useEffect(() => {
    if (!serverState?.targets.length) { setSelectedTargetIndex(null);return; }
    const actionTarget = serverState.action?.status === 'running' ? serverState.action.targetIndex : null;
    setSelectedTargetIndex((current) => {
      if (actionTarget != null && serverState.targets[actionTarget]) return actionTarget;
      if (current == null || !serverState.targets[current]) return serverState.next ?? 0;
      if (serverState.targets[current]?.done && serverState.next != null) return serverState.next;
      return current;
    });
  }, [serverState]);

  const analyze = useCallback(async () => {
    if (effectiveBusyAction || serverState?.phase!=='collecting' || serverState.candidatePool.count<3) return;
    const isCurrent=beginActionRequest();
    setBusyAction('analyze');beginAction();
    try {
      await startCameraIntrinsicAnalysis(targetId,processInstanceId);
      if (isCurrent()) await refreshState();
    } catch (cause) {
      if (isCurrent()) {
        setActionError(messageOf(cause));
        try { await refreshState(); } catch { /* Keep the admission error. */ }
      }
    } finally {
      if (isCurrent()) setBusyAction('');
    }
  },[beginActionRequest,effectiveBusyAction,processInstanceId,refreshState,serverState,targetId]);

  const save = useCallback(async () => {
    if (effectiveBusyAction || !serverState) return;
    if (serverState.phase==='collecting') return;
    if (
      serverState.phase==='candidate_ready'
      && serverState.candidate.quality.status!=='save_ready'
    ) return;
    if (serverState.phase==='saved' && (assetPin || serverState.resultRestored)) return;
    const isCurrent=beginActionRequest();
    setBusyAction('save');beginAction();
    try {
      let saved: CameraIntrinsicResult;
      if (serverState.phase==='saved') {
        saved=serverState.result;
      } else {
        const candidateId=serverState.candidate.candidateId;
        saved=await saveCameraIntrinsicCandidate(targetId,processInstanceId,candidateId);
        if (!isCurrent()) return;
        await refreshState();
        if (!isCurrent()) return;
      }
      await persistResult(saved);
      if (!isCurrent()) return;
      await refreshState();
    } catch (cause) {
      if (isCurrent()) {
        setActionError(messageOf(cause));
        try { await refreshState(); } catch { /* Preserve the original save error. */ }
      }
    } finally {
      if (isCurrent()) setBusyAction('');
    }
  },[
    assetPin,beginActionRequest,effectiveBusyAction,persistResult,processInstanceId,refreshState,
    serverState,targetId,
  ]);

  const reset = useCallback(async () => {
    if (effectiveBusyAction) return;
    const isCurrent = beginActionRequest();
    setBusyAction('reset');beginAction();
    try {
      const next = await resetCameraIntrinsic(targetId, processInstanceId);
      if (!isCurrent()) return;
      assetCommitAttemptRef.current = '';
      setServerState(next);setAssetPin(undefined);setSelectedTargetIndex(next.next);
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,effectiveBusyAction,processInstanceId,setServerState,targetId]);

  const gotoTarget = useCallback(async (index: number) => {
    if (effectiveBusyAction) return;
    const isCurrent = beginActionRequest();
    setSelectedTargetIndex(index);setBusyAction('goto');beginAction();
    try {
      await gotoCameraIntrinsicTarget(targetId, processInstanceId, index);
      if (!isCurrent()) return;
      await refreshState();
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,effectiveBusyAction,processInstanceId,refreshState,targetId]);

  const autoRun = useCallback(async () => {
    if (effectiveBusyAction) return;
    const isCurrent = beginActionRequest();
    setBusyAction('auto-run');beginAction();
    try {
      const response = await autoRunCameraIntrinsic(targetId, processInstanceId);
      if (!isCurrent()) return;
      setServerState((current) => current ? { ...current,action: response.action } : current);
      await refreshState();
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,effectiveBusyAction,processInstanceId,refreshState,setServerState,targetId]);

  const toggleAutoCapture = useCallback(async () => {
    if (effectiveBusyAction || runMode !== 'physical') return;
    const isCurrent = beginActionRequest();
    const enabled = serverState?.autoCapture.enabled === true;
    setBusyAction('auto-capture');beginAction();
    try {
      const response = enabled
        ? await stopCameraIntrinsicAutoCapture(targetId, processInstanceId)
        : await startCameraIntrinsicAutoCapture(targetId, processInstanceId);
      if (!isCurrent()) return;
      setServerState((current) => current ? { ...current,autoCapture:response.autoCapture } : current);
      await refreshState();
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,effectiveBusyAction,processInstanceId,refreshState,runMode,serverState?.autoCapture.enabled,setServerState,targetId]);

  function beginAction() { setActionError(''); }

  const downloadEvidence = useCallback(async () => {
    if (effectiveBusyAction || !serverState?.evidence.available) return;
    const isCurrent = beginActionRequest();
    setBusyAction('download');beginAction();
    try {
      const bundle = await loadCameraIntrinsicEvidence(targetId,processInstanceId);
      if (!isCurrent()) return;
      downloadBlob(bundle,serverState.evidence.filename);
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,effectiveBusyAction,processInstanceId,serverState?.evidence,targetId]);

  return <CameraIntrinsicCalibrationRuntimeView
    processInstanceId={processInstanceId} serverState={serverState} liveStage={liveStage}
    livePlaybackMetrics={livePlaybackMetrics}
    annotatedImageUrl={annotatedImageUrl}
    runMode={runMode}
    selectedTargetIndex={selectedTargetIndex} assetPin={assetPin}
    busyAction={effectiveBusyAction} onAnalyze={() => void analyze()} onSave={() => void save()}
    onReset={() => void reset()}
    onGotoTarget={(index) => void gotoTarget(index)}
    onAutoRun={() => void autoRun()} onToggleAutoCapture={() => void toggleAutoCapture()}
    onDownloadEvidence={() => void downloadEvidence()}
  />;
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }

function downloadBlob(blob:Blob,filename:string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function intrinsicCommitIntent(
  processInstanceId: string,
  runMode: string,
  result: CameraIntrinsicResult,
) {
  const assetName = runMode === 'physical'
    ? 'LRCP imx415 physical intrinsics'
    : 'Gazebo camera simulation intrinsics';
  const cameraSourceId = 'usb_cam';
  const namespacePath = '/';
  const value = JSON.stringify([
    processInstanceId,result.candidateId,assetName,cameraSourceId,namespacePath,
    ...result.cameraMatrix,...result.distortion,result.imageWidth,result.imageHeight,
    result.rmsReprojectionErrorPx,result.sampleCount,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const digest = (hash >>> 0).toString(16).padStart(8, '0');
  return {
    assetName,cameraSourceId,namespacePath,
    idempotencyKey:`camera-intrinsic-ui-v3-${processInstanceId}-${digest}`,
  };
}
