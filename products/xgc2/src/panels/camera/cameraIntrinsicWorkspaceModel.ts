import { processReady } from '../../domains/experiment/experimentPublic';
import {
  CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID,cameraIntrinsicCalibrationProcessForRun,
} from '../../domains/execution/cameraCalibrationProcessPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import { cameraIntrinsicPanelOptions } from './cameraIntrinsicPanelModel';
import { ownedCameraSourceProcess } from './gazeboWorldCameraWorkspaceModel';
import type { PanelActionPortRuntime,PanelWorkflowRuntimeProjection } from '../types';

export type IntrinsicWorkflowRuntime = PanelWorkflowRuntimeProjection;
export const INTRINSIC_LIFECYCLE_STAGE_IDS = ['run','camera','media','calibrator'] as const;
export type IntrinsicLifecycleStageId = typeof INTRINSIC_LIFECYCLE_STAGE_IDS[number];
export type IntrinsicLifecyclePhase = 'stopped' | 'starting' | 'stopping';
export type IntrinsicLifecycleStageStatus = 'idle' | 'pending' | 'active' | 'ready' | 'failed' | 'stopping';
export type IntrinsicLifecycleStage = {
  id: IntrinsicLifecycleStageId;
  status: IntrinsicLifecycleStageStatus;
  detail?: string;
  identity?: string;
  observedState?: string;
};
export type IntrinsicLifecyclePipeline = {
  phase: IntrinsicLifecyclePhase;
  stages: readonly IntrinsicLifecycleStage[];
};
const MEDIA_EDGE_DEFINITION_ID='xgc-media-edge';

export function intrinsicWorkflowRuntime(value: unknown): IntrinsicWorkflowRuntime | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<IntrinsicWorkflowRuntime>;
  if (!Array.isArray(candidate.documents) || !Array.isArray(candidate.catalog)
    || !Array.isArray(candidate.runSummaries) || !isRecord(candidate.runDetailsById)) return undefined;
  return candidate as IntrinsicWorkflowRuntime;
}

export function intrinsicWorkflowDocument(
  runtime: IntrinsicWorkflowRuntime | undefined,
  port: PanelActionPortRuntime | undefined,
) {
  const resourceId = port?.trace.automationResourceId;
  if (!runtime || !resourceId) return undefined;
  const candidates = runtime.documents.filter((document) => document.head.resourceId === resourceId);
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function intrinsicLiveCameraOptions(
  panelOptions: Record<string, unknown>,
) {
  const configured = cameraIntrinsicPanelOptions(panelOptions);
  return {
    edgeUrl: configured.edgeUrl,
    sourceId: configured.sourceId,
    imageFit: 'contain' as const,
    showMetadata: false,
    reconnectPolicy: 'automatic' as const,
  };
}

export function resolveIntrinsicCalibratorProcess(
  instances: readonly ProcessInstance[],
  runId: string,
  runtime?: IntrinsicWorkflowRuntime,
) {
  const selected=resolveIntrinsicCalibratorOwnerProcess(instances,runId,runtime);
  return selected && intrinsicCalibratorReady(selected) ? selected : undefined;
}

export function resolveIntrinsicCalibratorOwnerProcess(
  instances:readonly ProcessInstance[],
  runId:string,
  runtime?:IntrinsicWorkflowRuntime,
) {
  if (!runId) return undefined;
  const runIds = intrinsicDescendantRunIds(runtime,runId);
  const owned = instances
    .filter((instance) => instance.definitionId === CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID
      && isWorkflowRunProcess(instance)
      && runIds.has(instance.ownerId))
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  // Keep the standalone provider path usable when no relation projection was
  // requested. The Panel router path always supplies runtime and therefore
  // resolves only exact relation descendants.
  const direct = runtime ? undefined : cameraIntrinsicCalibrationProcessForRun(instances,runId);
  return owned ?? direct;
}

export function resolveIntrinsicMediaEdgeOwnerProcess(
  instances:readonly ProcessInstance[],runId:string,runtime?:IntrinsicWorkflowRuntime,
) {
  if (!runId) return undefined;
  const runIds=intrinsicDescendantRunIds(runtime,runId);
  return instances.filter((instance) => instance.definitionId===MEDIA_EDGE_DEFINITION_ID
    && isWorkflowRunProcess(instance) && runIds.has(instance.ownerId))
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

export function resolveIntrinsicCalibratorOwnerProcessFromRuntime(
  instances:readonly ProcessInstance[],runtime?:IntrinsicWorkflowRuntime,
) {
  return latestRunningProcess(instances,runtime,CAMERA_INTRINSIC_CALIBRATION_DEFINITION_ID);
}

export function resolveIntrinsicMediaEdgeOwnerProcessFromRuntime(
  instances:readonly ProcessInstance[],runtime?:IntrinsicWorkflowRuntime,
) {
  return latestRunningProcess(instances,runtime,MEDIA_EDGE_DEFINITION_ID);
}

export function resolveIntrinsicCameraSourceOwnerProcess(
  instances:readonly ProcessInstance[],
  runId:string,
  runtime?:IntrinsicWorkflowRuntime,
) {
  if (!runId) return undefined;
  const runIds=intrinsicDescendantRunIds(runtime,runId);
  return ownedCameraSourceProcess(instances.filter((instance) => (
    isWorkflowRunProcess(instance) && runIds.has(instance.ownerId)
  )));
}

export function projectIntrinsicLifecyclePipeline(input: {
  phase: IntrinsicLifecyclePhase;
  runActive: boolean;
  camera?: ProcessInstance;
  media?: ProcessInstance;
  calibrator?: ProcessInstance;
  sourceId?: string;
  edgeUrl?: string;
}): IntrinsicLifecyclePipeline {
  const run: IntrinsicLifecycleStage = {
    id: 'run',
    status: input.phase === 'stopped' ? 'idle'
      : input.phase === 'stopping' ? 'stopping'
      : input.runActive ? 'ready' : 'pending',
  };
  const camera = processStage('camera',input.camera,input.phase);
  const media = processStage('media',input.media,input.phase);
  const calibrator = processStage('calibrator',input.calibrator,input.phase);
  camera.identity = input.sourceId?.trim() || undefined;
  media.identity = edgeHost(input.edgeUrl);
  return { phase: input.phase,stages:[run,camera,media,calibrator] };
}

function edgeHost(url?: string) {
  if (!url?.trim()) return undefined;
  try { return new URL(url).host; } catch { return undefined; }
}

function latestRunningProcess(
  instances:readonly ProcessInstance[],runtime:IntrinsicWorkflowRuntime|undefined,definitionId:string,
) {
  if (!runtime) return undefined;
  const runIds=new Set(runtime.runSummaries.map((run) => run.id));
  return instances.filter((instance) => instance.definitionId===definitionId
    && isWorkflowRunProcess(instance) && runIds.has(instance.ownerId)
    && instance.desiredState==='running' && instance.observedState==='running')
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function intrinsicDescendantRunIds(runtime:IntrinsicWorkflowRuntime|undefined,anchorRunId:string) {
  const selected = new Set<string>([anchorRunId]);
  if (!runtime) return selected;
  let changed = true;
  while (changed) {
    changed = false;
    runtime.runSummaries.forEach((run) => {
      if (run.parentRunId && selected.has(run.parentRunId) && !selected.has(run.id)) {
        selected.add(run.id);changed = true;
      }
    });
    Object.values(runtime.runDetailsById).forEach((detail) => {
      detail.relations?.childRuns.forEach((relation) => {
        if (selected.has(relation.parentRunId) && !selected.has(relation.childRunId)) {
          selected.add(relation.childRunId);changed = true;
        }
      });
    });
  }
  return selected;
}

export function intrinsicWorkflowDetail(
  runtime:IntrinsicWorkflowRuntime|undefined,
  runId:string,
) {
  return runId ? runtime?.runDetailsById[runId] : undefined;
}

export function intrinsicWorkflowRunMode(
  runtime:IntrinsicWorkflowRuntime|undefined,
  runId:string,
) {
  const value = intrinsicWorkflowDetail(runtime,runId)?.run?.parameters.runMode;
  return typeof value === 'string' ? value : '';
}

function processStage(
  id: Exclude<IntrinsicLifecycleStageId,'run'>,
  process: ProcessInstance | undefined,
  phase: IntrinsicLifecyclePhase,
): IntrinsicLifecycleStage {
  const detail = process?.lastError?.trim();
  const observedState = process?.observedState;
  const extra = {
    ...(detail ? { detail } : {}),
    ...(observedState ? { observedState } : {}),
  };
  if (phase === 'stopped') return { id,status:'idle',...extra };
  if (phase === 'stopping') return { id,status:'stopping',...extra };
  if (processFailed(process)) return { id,status:'failed',...extra };
  if (process && processReady(process)) return { id,status:'ready',...extra };
  if (process) return { id,status:'active',...extra };
  return { id,status:'pending',...extra };
}

function processFailed(process?: ProcessInstance) {
  return Boolean(process && (
    process.readiness.status === 'failing' || process.observedState === 'failed'
  ));
}

function intrinsicCalibratorReady(instance: ProcessInstance) {
  return processReady(instance);
}

function isWorkflowRunProcess(instance:ProcessInstance) {
  return instance.ownerType === 'orchestration-run';
}

function isRecord(value:unknown):value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
