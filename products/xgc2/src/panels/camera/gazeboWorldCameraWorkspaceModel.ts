import {
  isAutomationExecutionRunActive,
  type AutomationRunSummaryView,
} from '../../domains/automation/automationPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import { isRunStatusTerminal } from '../../shared/executionStatusVocabulary';
import {
  experimentDescendantRunIds,
  experimentOwnedProcessInstances,
  experimentPanelWorkflowRunIds,
  processReady,
  type ExperimentProcessRuntimeProjection,
} from '../../domains/experiment/experimentPublic';

export const GAZEBO_STATIC_CAMERA_DEFINITION_ID = 'gazebo-static-camera';
export const PHYSICAL_CAMERA_DEFINITION_ID = 'xgc2-camera-v4l2-ros1';
export const PHYSICAL_RTP_ADAPTER_DEFINITION_ID = 'xgc2-ros1-image-rtp-adapter';
export const MEDIA_EDGE_DEFINITION_ID = 'xgc-media-edge';
export const EXTRINSIC_CALIBRATOR_DEFINITION_ID = 'xgc2-camera-extrinsic-calibrator-ros1';

export const CAMERA_SOURCE_DEFINITION_IDS = [
  GAZEBO_STATIC_CAMERA_DEFINITION_ID,
  PHYSICAL_CAMERA_DEFINITION_ID,
  PHYSICAL_RTP_ADAPTER_DEFINITION_ID,
] as const;

export type CalibrationCameraLifecycle =
  | 'ready'
  | 'stopping'
  | 'source-failed'
  | 'source-preparing'
  | 'media-preparing'
  | 'stopped';

export type CalibrationCameraEmptyState = {
  lifecycle: CalibrationCameraLifecycle;
  title: string;
  description?: string;
};

export type WorldCameraStartupStage = {
  id: 'run' | 'camera' | 'media' | 'calibrator';
  status: 'idle' | 'pending' | 'active' | 'ready' | 'failed' | 'stopping';
  detail?: string;
  identity?: string;
  observedState?: string;
};

export type CalibrationCameraViewerMemory = {
  runId: string;
  processId: string;
  mounted: boolean;
  stopRequested: boolean;
};

export function latestByUpdatedAt<T extends { updatedAt:string }>(items: readonly T[]): T | undefined {
  return [...items].sort((left,right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function calibrationCameraRunIds(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  automationResourceId: string,
  activeRunId: string,
  retainedRunId = '',
) {
  const anchors = [activeRunId,retainedRunId].filter((runId,index,all) => (
    runId && all.indexOf(runId) === index
  ));
  const projectedPanelRuns = runtime
    ? [...(runtime.activeRuns ?? [])]
      .filter((run) => run.automationResourceId === automationResourceId)
      .map((run) => run.id)
    : [];
  if (anchors.length || projectedPanelRuns.length) {
    return experimentDescendantRunIds(runtime,[...anchors,...projectedPanelRuns]);
  }
  return experimentPanelWorkflowRunIds(runtime, automationResourceId);
}

export function calibrationCameraViewerProjection(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  automationResourceId: string,
  invocation: { id: string; status: AutomationRunSummaryView['status']; revision: number } | undefined,
  memory: CalibrationCameraViewerMemory | undefined,
) {
  const runIds = calibrationCameraRunIds(
    runtime,automationResourceId,invocation?.id ?? '',memory?.runId ?? '',
  );
  const owned = calibrationCameraOwnedProcesses(runtime,runIds);
  const projectedSelectedRun = selectedCalibrationCameraRun(
    runtime,runIds,invocation?.id ?? memory?.runId ?? '',
  );
  const processOwnerRunId = owned.mediaEdge?.ownerId || owned.camera?.ownerId || '';
  const selectedRun = runtime?.runSummaries.find((run) => run.id === processOwnerRunId)
    ?? projectedSelectedRun;
  const invocationActive = Boolean(invocation && isAutomationExecutionRunActive(invocation));
  const selectedRunActive = Boolean(selectedRun && isAutomationExecutionRunActive(selectedRun));
  const invocationStopping = invocation?.status === 'stopping';
  const selectedRunStopping = !invocationActive && selectedRun?.status === 'stopping';
  const invocationTerminal = Boolean(
    invocation && !invocationActive && invocation.status !== 'stopping',
  );
  const selectedRunTerminal = Boolean(
    !invocationActive && selectedRun && isRunStatusTerminal(selectedRun.status),
  );
  const mediaProcessStopped = Boolean(
    memory?.processId && owned.mediaEdge?.id === memory.processId
      && (owned.mediaEdge.desiredState === 'stopped' || owned.mediaEdge.observedState === 'stopped'),
  );
  const stopping = invocationStopping || selectedRunStopping;
  const stopRequested = stopping || (!invocationActive && Boolean(
    memory?.stopRequested || invocationTerminal || selectedRunTerminal || mediaProcessStopped,
  ));
  const activeOwnerRunId = selectedRunActive && selectedRun
    ? selectedRun.id : invocationActive ? invocation!.id : '';
  const ownerRunId = activeOwnerRunId || memory?.runId || selectedRun?.id || invocation?.id || '';
  const ownerProcessId = owned.mediaEdge?.id || memory?.processId || '';
  const ownerKnown = Boolean(
    invocationActive || selectedRunActive || (selectedRun && !selectedRunTerminal)
      || (memory?.runId && !memory.stopRequested),
  );
  const running = !stopRequested && ownerKnown;
  const viewerVisible = running && Boolean(memory?.mounted || (ownerRunId && owned.mediaReady));
  // Keep one lifecycle-only render when the workflow owner begins teardown.
  // CameraVideoPanel must observe owner-stopping before it leaves the tree so
  // it closes local WebRTC state without issuing DELETE against a stopped Edge.
  const viewerMounted = viewerVisible || Boolean(stopRequested && memory?.mounted);
  const nextMemory = ownerRunId || memory?.mounted
    ? {
      runId:ownerRunId || memory?.runId || '',
      processId:ownerProcessId,
      mounted:viewerVisible,
      stopRequested,
    }
    : undefined;
  return {
    runIds,owned,selectedRun,running,stopping,stopRequested,viewerVisible,viewerMounted,
    ownerRunId,ownerProcessId,memory:nextMemory,
  };
}

export function ownedProcessByDefinition(
  processes: readonly ProcessInstance[],
  definitionId: string,
) {
  const matches = processes.filter((instance) => instance.definitionId === definitionId);
  const ready = matches.filter(processReady);
  return latestByUpdatedAt(ready.length ? ready : matches);
}

export function ownedCameraSourceProcess(processes: readonly ProcessInstance[]) {
  const sources = processes.filter((instance) => (
    CAMERA_SOURCE_DEFINITION_IDS.some((definitionId) => instance.definitionId === definitionId)
  ));
  const ready = sources.filter(processReady);
  return latestByUpdatedAt(ready.length ? ready : sources);
}

export function calibrationCameraSourceError(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  run: AutomationRunSummaryView | undefined,
  camera: ProcessInstance | undefined,
) {
  if (!run) return camera?.lastError?.trim() || '';
  const detail = runtime?.runDetailsById[run.id];
  return detail?.run?.primaryError?.trim()
    || detail?.nodeSummaries.find((node) => node.nodeId === 'camera' && node.status === 'failed')?.error?.trim()
    || camera?.lastError?.trim()
    || '';
}

export function calibrationCameraEmptyState(input: {
  stopping: boolean;
  running: boolean;
  cameraReady: boolean;
  mediaReady: boolean;
  runFailed: boolean;
  sourceError: string;
  disabledReason: string;
}): CalibrationCameraEmptyState {
  const sourceError = input.sourceError.trim();
  if (input.stopping) {
    return {
      lifecycle: 'stopping',
      title: 'Stopping calibration camera',
    };
  }
  if (input.runFailed || (!input.running && sourceError)) {
    return {
      lifecycle: 'source-failed',
      title: 'Calibration camera source failed',
    };
  }
  if (input.running && !input.cameraReady) {
    return {
      lifecycle: 'source-preparing',
      title: 'Preparing calibration camera',
    };
  }
  if (input.running && !input.mediaReady) {
    return {
      lifecycle: 'media-preparing',
      title: 'Preparing calibration camera',
    };
  }
  return {
    lifecycle: 'stopped',
    title: 'Calibration camera is stopped',
    ...(input.disabledReason ? { description: input.disabledReason } : {}),
  };
}

export function projectWorldCameraStartup(input: {
  lifecycle: CalibrationCameraLifecycle;
  running: boolean;
  camera?: ProcessInstance;
  media?: ProcessInstance;
  calibrator?: ProcessInstance;
  includeCalibrator?: boolean;
  sourceId?: string;
  edgeUrl?: string;
}): { phase: 'stopped' | 'starting' | 'stopping'; stages: WorldCameraStartupStage[] } {
  const phase: 'stopped' | 'starting' | 'stopping' = input.lifecycle === 'stopped'
    ? 'stopped' : input.lifecycle === 'stopping' ? 'stopping' : 'starting';
  const camera = processStage('camera',input.camera,input.lifecycle === 'source-failed',phase);
  const media = processStage('media',input.media,false,phase);
  const calibrator = processStage('calibrator',input.calibrator,false,phase);
  camera.identity = input.sourceId?.trim() || undefined;
  media.identity = edgeHost(input.edgeUrl);
  const run: WorldCameraStartupStage = {
    id: 'run',
    status: phase === 'stopped' ? 'idle'
      : phase === 'stopping' ? 'stopping'
      : input.running || input.lifecycle !== 'stopped' ? 'ready' : 'pending',
  };
  if (input.lifecycle === 'source-preparing' && camera.status === 'pending') camera.status = 'active';
  if (input.lifecycle === 'media-preparing' && media.status === 'pending') media.status = 'active';
  return {
    phase,
    stages: input.includeCalibrator ? [run,camera,media,calibrator] : [run,camera,media],
  };
}

function edgeHost(url?: string) {
  if (!url?.trim()) return undefined;
  try { return new URL(url).host; } catch { return undefined; }
}

function processStage(
  id: Exclude<WorldCameraStartupStage['id'],'run'>,
  process: ProcessInstance | undefined,
  failed: boolean,
  phase: 'stopped' | 'starting' | 'stopping',
): WorldCameraStartupStage {
  const detail = process?.lastError?.trim();
  const observedState = process?.observedState;
  const extra = {
    ...(detail ? { detail } : {}),
    ...(observedState ? { observedState } : {}),
  };
  if (failed) return { id,status:'failed',...extra };
  if (phase === 'stopped') return { id,status:'idle',...extra };
  if (phase === 'stopping') return { id,status:'stopping',...extra };
  if (process && processReady(process)) return { id,status:'ready',...extra };
  if (process) return { id,status:'active',...extra };
  return { id,status:'pending',...extra };
}

export function calibrationCameraOwnedProcesses(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  runIds: ReadonlySet<string>,
) {
  const owned = experimentOwnedProcessInstances(runtime, runIds);
  const camera = ownedCameraSourceProcess(owned);
  const mediaEdge = ownedProcessByDefinition(owned, MEDIA_EDGE_DEFINITION_ID);
  const calibrator = ownedProcessByDefinition(owned, EXTRINSIC_CALIBRATOR_DEFINITION_ID);
  return {
    camera,
    mediaEdge,
    calibrator,
    cameraReady: Boolean(camera && processReady(camera)),
    mediaReady: Boolean(mediaEdge && processReady(mediaEdge)),
    calibratorReady: Boolean(calibrator && processReady(calibrator)),
  };
}

export function selectedCalibrationCameraRun(
  runtime: ExperimentProcessRuntimeProjection | undefined,
  runIds: ReadonlySet<string>,
  activeRunId: string,
) {
  const runs = (runtime?.runSummaries ?? []).filter((run) => runIds.has(run.id));
  const active = runs.filter((run) => isAutomationExecutionRunActive(run));
  if (active.length > 0) return latestByUpdatedAt(active);
  if (activeRunId) return runs.find((run) => run.id === activeRunId) ?? latestByUpdatedAt(runs);
  return latestByUpdatedAt(runs);
}
