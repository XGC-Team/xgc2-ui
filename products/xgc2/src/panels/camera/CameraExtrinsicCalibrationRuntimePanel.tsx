import { useCallback,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import {
  useGroundStationErrorNotification,useGroundStationNotification,
} from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import {
  cameraExtrinsicSolvePreflight,freezeCameraExtrinsicFrame,loadCameraExtrinsicImage,loadCameraExtrinsicState,
  resumeCameraExtrinsicLive,saveCameraExtrinsicCandidate,solveCameraExtrinsic,
  type CameraExtrinsicPoint,type CameraExtrinsicResult,type CameraExtrinsicState,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import { useExecutionTarget } from '../../domains/execution/executionPublic';
import { useDocumentVisibility } from '../../hooks/useDocumentVisibility';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { CameraExtrinsicCalibrationRuntimeView } from './CameraExtrinsicCalibrationRuntimeView';
import { cameraPixelForClientPoint } from './cameraExtrinsicPixel';
import { isCameraCalibrationTeardownError } from './cameraCalibrationTeardownError';
import { useCameraCalibrationImageSnapshot } from './useCameraCalibrationImageSnapshot';
import { useCameraCalibrationStateSnapshot } from './useCameraCalibrationStateSnapshot';

export function CameraExtrinsicCalibrationRuntimePanel({
  processInstanceId,targetId,panelId,liveStage,
}: {
  processInstanceId: string;
  targetId: string;
  panelId: string;
  liveStage?: ReactNode;
}) {
  const [imageSize,setImageSize] = useState<readonly [number,number]>();
  const [points,setPoints] = useState<readonly CameraExtrinsicPoint[]>([]);
  const [projections,setProjections] = useState<CameraExtrinsicResult['projections']>([]);
  const [result,setResult] = useState<CameraExtrinsicResult>();
  const [selectedMarker,setSelectedMarker] = useState('');
  const [busyAction,setBusyAction] = useState<'freeze' | 'live' | 'solve' | 'save' | ''>('');
  const [actionError,setActionError] = useState('');
  const [successMessage,setSuccessMessage] = useState('');
  const processKey = JSON.stringify([targetId,processInstanceId]);
  const beginActionRequest = useLatestAsyncRequest(processKey);
  const documentVisible = useDocumentVisibility();
  const execution = useExecutionTarget(targetId, false, Boolean(targetId && processInstanceId));
  const processRevision = execution.processInstances
    .find((instance) => instance.id === processInstanceId)?.revision ?? 0;
  const stageRef = useRef<HTMLDivElement>(null);
  const serverStateRef = useRef<CameraExtrinsicState | undefined>(undefined);
  const sessionKeyRef = useRef('');
  const handledResultGenerationRef = useRef<number | undefined>(undefined);
  const loadState = useCallback(
    (signal: AbortSignal) => loadCameraExtrinsicState(targetId, processInstanceId, signal),
    [processInstanceId,targetId],
  );
  const {
    state: serverState,
    setState: setServerState,
    error: stateError,
  } = useCameraCalibrationStateSnapshot<CameraExtrinsicState>({
    sessionKey: processKey,
    enabled: documentVisible,
    revision: processRevision,
    load: loadState,
  });
  const loadImage = useCallback(
    (signal: AbortSignal) => loadCameraExtrinsicImage(targetId, processInstanceId, signal),
    [processInstanceId,targetId],
  );
  const {
    imageUrl,
    error: imageError,
    refresh: refreshImage,
    clear: clearImage,
  } = useCameraCalibrationImageSnapshot({
    sessionKey: processKey,
    load: loadImage,
  });

  serverStateRef.current = serverState;
  const notificationError = [actionError,stateError,serverState?.recoveryError,liveStage ? '' : imageError]
    .find((message) => message && !isCameraCalibrationTeardownError(message)) ?? '';
  useGroundStationErrorNotification(targetId, notificationError, {
    title: 'Camera calibration',source: panelId,dedupeKey: `${panelId}:calibration-api`,
  });
  useGroundStationNotification(targetId, successMessage, {
    title: 'Camera calibration',severity: 'success',source: panelId,
    dedupeKey: `${panelId}:calibration-saved`,durationMs: 8_000,
  });

  useEffect(() => {
    setPoints([]);setProjections([]);setResult(undefined);
    setSelectedMarker('');setBusyAction('');setActionError('');setSuccessMessage('');
    setImageSize(undefined);sessionKeyRef.current = '';handledResultGenerationRef.current = undefined;
  }, [processInstanceId,targetId]);

  useEffect(() => {
    if (!documentVisible || serverState?.mode !== 'frozen') return;
    void refreshImage();
  }, [documentVisible,refreshImage,serverState?.generation,serverState?.mode]);

  useEffect(() => {
    if (!serverState) return;
    const sessionKey = `${serverState.mode}:${serverState.generation}`;
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey;
      handledResultGenerationRef.current = undefined;
      setSelectedMarker('');
      if (serverState.mode === 'live') {
        setPoints([]);setProjections([]);
        setResult(serverState.resultRestored ? serverState.result : undefined);
      } else if (serverState.result) {
        restoreResult(serverState.result);
      } else {
        setPoints([]);setProjections([]);setResult(undefined);
      }
    } else if (serverState.mode === 'frozen'
      && serverState.result
      && handledResultGenerationRef.current !== serverState.generation) {
      restoreResult(serverState.result);
    }

    function restoreResult(next: CameraExtrinsicResult) {
      handledResultGenerationRef.current = serverState!.generation;
      setPoints(next.points);setProjections(next.projections);setResult(next);
    }
  }, [serverState]);

  const availableMarkers = useMemo(() => {
    if (serverState?.mode !== 'frozen') return [];
    const used = new Set(points.map((point) => point.marker));
    return serverState.markers.map((marker) => marker.name).filter((name) => !used.has(name));
  }, [points,serverState]);

  useEffect(() => {
    if (availableMarkers.includes(selectedMarker)) return;
    setSelectedMarker(availableMarkers[0] ?? '');
  }, [availableMarkers,selectedMarker]);

  const clearSolvedOverlay = useCallback(() => {
    handledResultGenerationRef.current = serverStateRef.current?.generation;
    setProjections([]);setResult(undefined);setSuccessMessage('');setActionError('');
  }, []);

  const freeze = useCallback(async () => {
    if (busyAction) return;
    const isCurrent = beginActionRequest();
    setBusyAction('freeze');setActionError('');setSuccessMessage('');
    try {
      const next = await freezeCameraExtrinsicFrame(targetId, processInstanceId);
      if (!isCurrent()) return;
      setPoints([]);setProjections([]);setResult(undefined);setSelectedMarker('');
      handledResultGenerationRef.current = next.generation;
      setServerState(next);
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,busyAction,processInstanceId,setServerState,targetId]);

  const resumeLive = useCallback(async () => {
    if (busyAction) return;
    const isCurrent = beginActionRequest();
    setBusyAction('live');setActionError('');setSuccessMessage('');
    try {
      const next = await resumeCameraExtrinsicLive(targetId, processInstanceId);
      if (!isCurrent()) return;
      setPoints([]);setProjections([]);setResult(undefined);setSelectedMarker('');
      handledResultGenerationRef.current = undefined;
      clearImage();
      setServerState(next);
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,busyAction,clearImage,processInstanceId,setServerState,targetId]);

  const solve = useCallback(async () => {
    if (busyAction || serverState?.mode !== 'frozen' || points.length < 4) return;
    const preflightReason = cameraExtrinsicSolvePreflight(serverState, points);
    if (preflightReason) { setActionError(preflightReason);return; }
    const isCurrent = beginActionRequest();
    setBusyAction('solve');setActionError('');setSuccessMessage('');
    try {
      const solved = await solveCameraExtrinsic(targetId, processInstanceId, serverState.generation, points);
      if (!isCurrent()) return;
      const solvedByMarker = new Map(solved.points.map((point) => [point.marker,point]));
      setPoints(points.map((point) => solvedByMarker.get(point.marker) ?? point));
      setProjections(solved.projections);setResult(solved);
      handledResultGenerationRef.current = serverState.generation;
      setSuccessMessage('Extrinsic candidate is ready; review it and save explicitly.');
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,busyAction,points,processInstanceId,serverState,targetId]);

  const save = useCallback(async () => {
    if (busyAction || !result || result.saved) return;
    const isCurrent = beginActionRequest();
    setBusyAction('save');setActionError('');setSuccessMessage('');
    try {
      const saved = await saveCameraExtrinsicCandidate(targetId,processInstanceId,result.candidateId);
      if (!isCurrent()) return;
      setResult(saved);setProjections(saved.projections);
      setSuccessMessage(`Calibration saved to ${saved.outputFile}; camera AR transform is now active`);
    } catch (cause) { if (isCurrent()) setActionError(messageOf(cause)); }
    finally { if (isCurrent()) setBusyAction(''); }
  }, [beginActionRequest,busyAction,processInstanceId,result,targetId]);

  const solvePreflightReason = useMemo(
    () => cameraExtrinsicSolvePreflight(serverState, points),
    [points,serverState],
  );

  const frameSize = serverState?.frame
    ? [serverState.frame.width,serverState.frame.height] as const
    : imageSize;
  const addPoint = (clientX: number,clientY: number) => {
    if (busyAction || serverState?.mode !== 'frozen' || !selectedMarker || !frameSize || !stageRef.current) return;
    const pixel = cameraPixelForClientPoint(
      clientX,clientY,stageRef.current.getBoundingClientRect(),frameSize[0],frameSize[1],
    );
    if (!pixel) return;
    clearSolvedOverlay();
    setPoints((current) => [...current,{ marker: selectedMarker,pixel }]);
  };

  const removePoint = (index: number) => {
    clearSolvedOverlay();
    setPoints((current) => current.filter((_,candidate) => candidate !== index));
  };
  const undoPoint = () => {
    clearSolvedOverlay();
    setPoints((current) => current.slice(0,-1));
  };
  const clearPoints = () => {
    clearSolvedOverlay();setPoints([]);
  };

  return <CameraExtrinsicCalibrationRuntimeView
    processInstanceId={processInstanceId} serverState={serverState} imageUrl={imageUrl} frameSize={frameSize}
    liveStage={liveStage}
    points={points} projections={projections} result={result} availableMarkers={availableMarkers}
    selectedMarker={selectedMarker} busyAction={busyAction} stageRef={stageRef} onImageSize={setImageSize}
    solvePreflightReason={solvePreflightReason}
    onStageActivate={addPoint} onSelectMarker={setSelectedMarker} onFreeze={() => void freeze()}
    onLive={() => void resumeLive()} onSolve={() => void solve()} onSave={() => void save()} onRemovePoint={removePoint}
    onUndoPoint={undoPoint} onClearPoints={clearPoints}
  />;
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }
