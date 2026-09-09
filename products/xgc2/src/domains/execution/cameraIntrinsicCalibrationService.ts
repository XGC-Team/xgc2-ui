import { request,requestBlob,waitForTransportRetry } from '../../api/http';
import { openReplayJSONStream,type ReplayJSONStream } from '../../api/streams';
import { createCameraCalibrationProtocol } from './cameraCalibrationProtocol';

const {
  array,boolean,invalid,nonNegativeInteger,number,positiveInteger,record,string,tuple3,
} = createCameraCalibrationProtocol('camera intrinsic calibration');

/** Typed transport adapter for the managed ROS intrinsic-calibration service. */

export type CameraIntrinsicCoverage = {
  label: 'X' | 'Y' | 'Size' | 'Skew';
  progress: number;
};

export type CameraIntrinsicDetectionMetric = {
  label: 'X' | 'Y' | 'Size' | 'Skew';
  value: number;
};

export type CameraIntrinsicDetection = {
  status: 'waiting' | 'detected' | 'not_detected';
  cornerCount: number;
  expectedCornerCount: number;
  frameWidth: number;
  frameHeight: number;
  sequence: number;
  metrics: readonly CameraIntrinsicDetectionMetric[];
  accepted: boolean;
  duplicate: boolean;
};

export type CameraIntrinsicTarget = {
  name: string;
  position: readonly [number,number,number];
  done: boolean;
  hasRef: boolean;
};

export type CameraIntrinsicPose = {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};

export type CameraIntrinsicAction = {
  name: 'auto_run';
  status: 'running' | 'failed' | 'succeeded';
  targetIndex: number | null;
  targetName: string | null;
  error: string | null;
  result?: {
    candidateId:string;
    quality:CameraIntrinsicCandidateQuality;
  };
};

export type CameraIntrinsicAutoCapture = {
  enabled: boolean;
  intervalSeconds: number;
  lastError: string | null;
  coverageComplete: boolean;
};

export type CameraIntrinsicGuidance = {
  complete: boolean;
  dimension: CameraIntrinsicCoverage['label'] | null;
  direction: 'center' | 'left' | 'right' | 'top' | 'bottom' | 'closer' | 'tilt' | 'complete';
  progress: number;
};

export type CameraIntrinsicRecovery = {
  checkpointFile: string;
  checkpointAvailable: boolean;
  resultRestored: boolean;
  lastError: string | null;
};

export type CameraIntrinsicEvidence = {
  available: boolean;
  sampleCount: number;
  filename: string;
};

export type CameraCalibrationAssetPin = {
  resourceId: string;
  commitId: string;
  version: number;
  digest: string;
};

export type CameraIntrinsicParameters = {
  cameraMatrix: readonly [number,number,number,number,number,number,number,number,number];
  distortion: readonly number[];
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  imageWidth: number;
  imageHeight: number;
  rmsReprojectionErrorPx: number;
  sampleCount: number;
};

export type CameraIntrinsicCandidateQualityAssessment = {
  method: string;
  detectorUncertaintyPx: number;
  trainingPerViewMedianPx: number | null;
  trainingRobustSigmaPx: number | null;
  confidenceLimitPx: number | null;
  heldOutRmsMaximumPx: number | null;
  undistortedRayMaximumEquivalentPx: number | null;
  normalizedRayConfidenceLimitPx: number | null;
  passed: boolean;
};

export type CameraIntrinsicCandidateQuality = {
  status: 'save_ready' | 'unstable';
  reasons: readonly string[];
  assessment: CameraIntrinsicCandidateQualityAssessment;
};

export type CameraIntrinsicCandidate = CameraIntrinsicParameters & {
  candidateId: string;
  phase: 'candidate_ready';
  sessionRevision: number;
  collectionRevision: number;
  saved: false;
  saveBlocked: 'explicit_save_required' | 'stability_validation_failed';
  diagnostics: Readonly<Record<string,unknown>>;
  quality: CameraIntrinsicCandidateQuality;
  outputFile: null;
};

export type CameraIntrinsicResult = CameraIntrinsicParameters & {
  candidateId: string;
  phase: 'saved';
  sessionRevision: number;
  collectionRevision: number;
  saved: true;
  outputFile: string;
};

export type CameraIntrinsicCandidatePool = {
  count: number;
  imageSize: readonly [number,number] | null;
  solveFrozen: boolean;
};

export type CameraIntrinsicCalibrationFile = {
  id: string;
  createdAt: string;
  imageWidth: number;
  imageHeight: number;
  rmsReprojectionErrorPx: number;
  sampleCount: number;
  latest: boolean;
  validated: boolean;
  fileSha256: string;
  boardProfile: string;
  featureModel: string;
  qualityContract: string;
  qualityPassed: boolean;
  algorithmSha256: string;
};

export type CameraIntrinsicValidationView = {
  id: string;
  label: string;
  description: string;
};

export type CameraIntrinsicValidationConfiguration =
  | { kind: 'raw' }
  | {
    kind: 'calibration';
    calibrationId: string;
    calibrationCreatedAt?: string;
    calibrationSha256?: string;
    boardProfile?: string;
    featureModel?: string;
    qualityContract?: string;
    qualityPassed?: boolean;
    algorithmSha256?: string;
  };

export type CameraIntrinsicValidationRequest = {
  reference: CameraIntrinsicValidationConfiguration;
  comparison: CameraIntrinsicValidationConfiguration;
};

export type CameraIntrinsicValidationReport = {
  schema: 'xgc2.camera.intrinsic-validation.v2';
  generation: number;
  referenceConfiguration: CameraIntrinsicValidationConfiguration;
  comparisonConfiguration: CameraIntrinsicValidationConfiguration;
  capturedAt: string;
  sourceImageSize: readonly [number,number];
  analysisImageSize: readonly [number,number];
  remapMeanPx: number;
  remapMaximumPx: number;
  defaultView: string;
  views: readonly CameraIntrinsicValidationView[];
};

type CameraIntrinsicSolveJob = {
  id:string;
  status:'running' | 'failed' | 'succeeded';
  stage:'solving' | 'filtering' | 'validating' | 'complete';
  completed:number;
  total:number;
  error:string | null;
};

type CameraIntrinsicStateBase = {
  solveJob?:CameraIntrinsicSolveJob;
  mode: 'intrinsic';
  sessionRevision: number;
  collectionRevision: number;
  samples: number;
  coverage: readonly CameraIntrinsicCoverage[];
  guidance: CameraIntrinsicGuidance;
  resultRestored: boolean;
  imageReady: boolean;
  imageTopic: string;
  board: {
    size: readonly [number,number];
    squareSizeM: number;
    type?: 'checkerboard' | 'aprilgrid';
    tagFamily?: string;
    tagSpacingM?: number;
    startId?: number;
    endId?: number;
  };
  targets: readonly CameraIntrinsicTarget[];
  next: number | null;
  pose: CameraIntrinsicPose | null;
  cameraControl: boolean;
  autoCapture: CameraIntrinsicAutoCapture;
  recovery: CameraIntrinsicRecovery;
  evidence: CameraIntrinsicEvidence;
  action?: CameraIntrinsicAction;
  detection: CameraIntrinsicDetection;
};

export type CameraIntrinsicState = CameraIntrinsicStateBase & (
  | {
    phase:'collecting';
    candidatePool:CameraIntrinsicCandidatePool;
    candidate?:never;
    result?:never;
    outputFile?:never;
    savedCandidateId?:never;
  }
  | {
    phase:'candidate_ready';
    candidatePool:CameraIntrinsicCandidatePool;
    candidate:CameraIntrinsicCandidate;
    result?:never;
    outputFile?:never;
    savedCandidateId?:never;
  }
  | {
    phase:'saved';
    candidatePool?:never;
    candidate?:never;
    result:CameraIntrinsicResult;
    outputFile:string;
    savedCandidateId:string;
  }
);

export type CameraIntrinsicActionResult = { ok: true };
export type CameraIntrinsicGotoResult = CameraIntrinsicActionResult & { name: string };
export type CameraIntrinsicAutoRunResult = { accepted: true;action: CameraIntrinsicAction };
export type CameraIntrinsicAutoCaptureResult = { ok: true;autoCapture: CameraIntrinsicAutoCapture };

export async function loadCameraIntrinsicState(targetId: string, processInstanceId: string, signal?: AbortSignal) {
  const payload = await request<unknown>(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/state`,
    { cache: 'no-store',signal },
  );
  return decodeCameraIntrinsicState(payload);
}

export function loadCameraIntrinsicImage(targetId: string, processInstanceId: string, signal?: AbortSignal) {
  return requestBlob(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/image.jpg`,
    { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal },
  );
}

export function loadCameraIntrinsicEvidence(targetId:string,processInstanceId:string,signal?:AbortSignal) {
  return requestBlob(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/evidence.zip`,
    { cache:'no-store',headers:{ Accept:'application/zip' },signal },
  );
}

export function openCameraIntrinsicStateStream(
  targetId:string,
  processInstanceId:string,
  onState:(state:CameraIntrinsicState) => void,
  onError?:(cause:unknown) => void,
):ReplayJSONStream {
  return openReplayJSONStream<unknown>({
    path:() => `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/events`,
    lastEventId:() => '',
    reconnectDelayMs:1_000,
    onValue:(value) => onState(decodeCameraIntrinsicState(value)),
    onError,
  });
}

export function loadCameraIntrinsicReference(targetId: string, processInstanceId: string, index: number, signal?: AbortSignal) {
  const targetIndex = nonNegativeInteger(index, 'reference index');
  return requestBlob(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/ref/${targetIndex}.jpg`,
    { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal },
  );
}

export async function loadCameraIntrinsicCalibrationFiles(
  targetId:string,
  processInstanceId:string,
  signal?:AbortSignal,
) {
  const payload = await request<unknown>(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/calibrations`,
    { cache:'no-store',signal },
  );
  const root = record(payload, 'intrinsic calibration history');
  const items = array(root.items, 'intrinsic calibration history.items').map((value,index) => {
    const path = `intrinsic calibration history.items[${index}]`;
    const item = record(value,path);
    return {
      id:string(item.id,`${path}.id`),
      createdAt:string(item.created_at,`${path}.created_at`),
      imageWidth:positiveInteger(item.image_width,`${path}.image_width`),
      imageHeight:positiveInteger(item.image_height,`${path}.image_height`),
      rmsReprojectionErrorPx:nonNegativeNumber(item.rms_reprojection_error_px,`${path}.rms_reprojection_error_px`),
      sampleCount:nonNegativeInteger(item.sample_count,`${path}.sample_count`),
      latest:boolean(item.latest,`${path}.latest`),
      validated:boolean(item.validated,`${path}.validated`),
      fileSha256:nonEmptyString(item.file_sha256,`${path}.file_sha256`),
      boardProfile:string(item.board_profile,`${path}.board_profile`),
      featureModel:string(item.feature_model,`${path}.feature_model`),
      qualityContract:string(item.quality_contract,`${path}.quality_contract`),
      qualityPassed:boolean(item.quality_passed,`${path}.quality_passed`),
      algorithmSha256:string(record(item.algorithm ?? {},`${path}.algorithm`).sha256 ?? '',`${path}.algorithm.sha256`),
    } satisfies CameraIntrinsicCalibrationFile;
  });
  const selected = nullableString(root.selected, 'intrinsic calibration history.selected');
  if (selected !== null && !items.some((item) => item.id === selected)) {
    invalid('intrinsic calibration history.selected must identify an item');
  }
  return { items,selected };
}

export async function captureCameraIntrinsicValidation(
  targetId:string,
  processInstanceId:string,
  comparison:CameraIntrinsicValidationRequest,
) {
  const payload = await post(targetId,processInstanceId,'validation',{
    reference:encodeCameraIntrinsicValidationConfiguration(comparison.reference),
    comparison:encodeCameraIntrinsicValidationConfiguration(comparison.comparison),
  },{ timeoutMs:30_000 });
  return decodeCameraIntrinsicValidationReport(payload);
}

export function loadCameraIntrinsicValidationImage(
  targetId:string,
  processInstanceId:string,
  viewId:string,
  generation:number,
  signal?:AbortSignal,
) {
  const revision = nonNegativeInteger(generation,'intrinsic validation generation');
  return requestBlob(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/validation/image/${encodeURIComponent(viewId)}.jpg?generation=${revision}`,
    { cache:'no-store',headers:{ Accept:'image/jpeg' },signal },
  );
}

/** Start analysis only. Completion is observed through the existing state stream. */
export async function startCameraIntrinsicAnalysis(targetId:string,processInstanceId:string) {
  const payload=await post(targetId,processInstanceId,'candidate',{});
  const receipt=record(payload,'candidate response');
  if (receipt.accepted===true) return { accepted:true as const,job:decodeSolveJob(receipt.job) };
  return { accepted:false as const,candidate:decodeCameraIntrinsicCandidate(payload) };
}

export async function analyzeCameraIntrinsicCandidate(
  targetId:string,processInstanceId:string,signal?:AbortSignal,
) {
  signal?.throwIfAborted();
  const payload = await post(targetId, processInstanceId, 'candidate', {});
  const receipt=record(payload,'candidate response');
  if (receipt.accepted!==true) return decodeCameraIntrinsicCandidate(payload);
  const submitted=decodeSolveJob(receipt.job);
  let consecutiveReadFailures=0;
  while (true) {
    signal?.throwIfAborted();
    let state:CameraIntrinsicState;
    try {
      state=await loadCameraIntrinsicState(targetId,processInstanceId,signal);
      consecutiveReadFailures=0;
    } catch (cause) {
      signal?.throwIfAborted();
      const transient=cause instanceof TypeError || (cause instanceof Error && cause.message.startsWith('request timeout after '));
      // Only retry read transport failures, never candidate submission or protocol/identity errors.
      if (!transient || ++consecutiveReadFailures>2) throw cause;
      await waitForTransportRetry(1_000);
      continue;
    }
    if (state.solveJob?.id!==submitted.id) throw new Error('Calibration session changed while solving.');
    if (state.solveJob.status==='failed') throw new Error(state.solveJob.error || 'Calibration solve failed.');
    if (state.solveJob.status==='succeeded') {
      if (state.phase!=='candidate_ready') throw new Error('Calibration completed without a candidate.');
      return state.candidate;
    }
    await waitForTransportRetry(1_000);
  }
}

function decodeSolveJob(value:unknown):CameraIntrinsicSolveJob {
  const job=record(value,'solve job');
  const status=string(job.status,'solve job status');
  const stage=string(job.stage,'solve job stage');
  if (status!=='running' && status!=='failed' && status!=='succeeded') invalid('unsupported solve job status');
  if (stage!=='solving' && stage!=='filtering' && stage!=='validating' && stage!=='complete') invalid('unsupported solve job stage');
  const completed=nonNegativeInteger(job.completed,'solve job completed');
  const total=nonNegativeInteger(job.total,'solve job total');
  if (completed>total) invalid('solve job progress exceeds total');
  return { id:nonEmptyString(job.id,'solve job id'),
    status:status as CameraIntrinsicSolveJob['status'],stage:stage as CameraIntrinsicSolveJob['stage'],completed,total,
    error:nullableString(job.error,'solve job error') };
}

export async function saveCameraIntrinsicCandidate(
  targetId:string,
  processInstanceId:string,
  candidateId:string,
) {
  const identity=nonEmptyString(candidateId,'candidate id');
  const payload=await post(targetId,processInstanceId,'save',{ candidate_id:identity });
  return decodeCameraIntrinsicResult(payload);
}

export async function continueCameraIntrinsicCollection(targetId:string,processInstanceId:string) {
  const payload=await post(targetId,processInstanceId,'continue',{});
  return decodeCameraIntrinsicState(payload);
}

export async function commitCameraIntrinsicAsset(
  targetId: string,
  processInstanceId: string,
  input: { assetName:string;cameraSourceId:string;idempotencyKey:string;namespacePath?:string },
) {
  const payload = await post(targetId, processInstanceId, 'commit-asset', {
    namespacePath:input.namespacePath ?? '/',assetName:input.assetName,
    cameraSourceId:input.cameraSourceId,idempotencyKey:input.idempotencyKey,
  });
  const root = record(payload, 'calibration asset pin');
  return {
    resourceId:string(root.resourceId, 'calibration asset pin.resourceId'),
    commitId:string(root.commitId, 'calibration asset pin.commitId'),
    version:positiveInteger(root.version, 'calibration asset pin.version'),
    digest:string(root.digest, 'calibration asset pin.digest'),
  } satisfies CameraCalibrationAssetPin;
}

export async function resetCameraIntrinsic(targetId: string, processInstanceId: string) {
  const payload = await post(targetId, processInstanceId, 'reset', {});
  return decodeCameraIntrinsicState(payload);
}

export async function startCameraIntrinsicAutoCapture(targetId: string, processInstanceId: string) {
  return updateCameraIntrinsicAutoCapture(targetId, processInstanceId, 'auto_capture/start');
}

export async function stopCameraIntrinsicAutoCapture(targetId: string, processInstanceId: string) {
  return updateCameraIntrinsicAutoCapture(targetId, processInstanceId, 'auto_capture/stop');
}

export async function gotoCameraIntrinsicTarget(targetId: string, processInstanceId: string, index: number) {
  const targetIndex = nonNegativeInteger(index, 'target index');
  const payload = await post(targetId, processInstanceId, 'goto', { index: targetIndex });
  const root = record(payload, 'goto result');
  return { ok: ok(root.ok, 'goto result.ok'),name: string(root.name, 'goto result.name') } satisfies CameraIntrinsicGotoResult;
}

export async function resetCameraIntrinsicPose(targetId: string, processInstanceId: string) {
  const payload = await post(targetId, processInstanceId, 'reset_pose', {});
  const root = record(payload, 'reset pose result');
  return { ok: ok(root.ok, 'reset pose result.ok') } satisfies CameraIntrinsicActionResult;
}

export async function autoRunCameraIntrinsic(targetId: string, processInstanceId: string) {
  const payload = await post(targetId, processInstanceId, 'auto_run', {}, { timeoutMs: 30_000 });
  const root = record(payload, 'auto-run result');
  if (root.accepted !== true) invalid('auto-run result.accepted must be true');
  return {
    accepted: true,
    action: decodeAction(root.action),
  } satisfies CameraIntrinsicAutoRunResult;
}

export function decodeCameraIntrinsicState(value: unknown): CameraIntrinsicState {
  const root = record(value, 'state');
  const mode = string(root.mode, 'state.mode');
  if (mode !== 'intrinsic') invalid('state.mode must be intrinsic');
  const phase=intrinsicPhase(root.phase,'state.phase');
  const board = record(root.board, 'state.board');
  const pose = root.pose == null ? null : decodePose(root.pose);
  const action = root.action == null ? undefined : decodeAction(root.action);
  const autoCapture=decodeAutoCapture(root.auto_capture);
  const detection = decodeDetection(root.detection);
  const coverage = array(root.coverage, 'state.coverage').map((item,index) => decodeCoverage(item, index));
  const guidance=decodeGuidance(root.guidance);
  const recovery=decodeRecovery(root.recovery);
  const evidence = decodeEvidence(root.evidence);
  const next = nullableNonNegativeInteger(root.next, 'state.next');
  const targets = array(root.targets, 'state.targets').map((item,index) => decodeTarget(item, index));
  if (next !== null && next >= targets.length) invalid('state.next must identify a target');
  const common:CameraIntrinsicStateBase = {
    mode: mode as CameraIntrinsicState['mode'],
    sessionRevision:nonNegativeInteger(root.session_revision,'state.session_revision'),
    collectionRevision:nonNegativeInteger(root.collection_revision,'state.collection_revision'),
    samples: nonNegativeInteger(root.samples, 'state.samples'),
    ...(root.solve_job == null ? {} : { solveJob:decodeSolveJob(root.solve_job) }),
    coverage,
    guidance,
    resultRestored:root.result_restored == null ? false : boolean(root.result_restored, 'state.result_restored'),
    imageReady: boolean(root.image_ready, 'state.image_ready'),
    imageTopic:string(root.media_source ?? root.image_topic, 'state.media_source'),
    board: decodeBoard(board),
    targets,
    next,
    pose,
    cameraControl: boolean(root.camera_control, 'state.camera_control'),
    autoCapture,
    recovery,
    evidence,
    action,
    detection,
  };
  const hasCandidate=own(root,'candidate');
  const hasCandidatePool=own(root,'candidate_pool');
  const hasResult=own(root,'result');
  const hasOutputFile=own(root,'output_file');
  const hasSavedCandidateId=own(root,'saved_candidate_id');
  if (phase==='collecting') {
    if (hasCandidate || !hasCandidatePool || hasResult || hasOutputFile || hasSavedCandidateId) {
      invalid('state.collecting must omit candidate, result, output_file, and saved_candidate_id');
    }
    const candidatePool=decodeCandidatePool(root.candidate_pool);
    if (candidatePool.solveFrozen !== (common.solveJob?.status==='running')) {
      invalid('state.collecting pool must be frozen exactly while its solve job runs');
    }
    return { ...common,phase,candidatePool };
  }
  if (phase==='candidate_ready') {
    if (!hasCandidate || !hasCandidatePool || hasResult || hasOutputFile || hasSavedCandidateId) {
      invalid('state.candidate_ready must expose only one frozen candidate');
    }
    const candidatePool=decodeCandidatePool(root.candidate_pool);
    if (!candidatePool.solveFrozen) invalid('state.candidate_ready candidate pool must be frozen');
    return {
      ...common,phase,candidatePool,candidate:decodeCameraIntrinsicCandidate(root.candidate),
    };
  }
  if (hasCandidate || hasCandidatePool || !hasResult || !hasOutputFile || !hasSavedCandidateId) {
    invalid('state.saved must expose result, output_file, and saved_candidate_id only');
  }
  const result=decodeCameraIntrinsicResult(root.result);
  const outputFile=nonEmptyString(root.output_file,'state.output_file');
  const savedCandidateId=nonEmptyString(root.saved_candidate_id,'state.saved_candidate_id');
  if (outputFile!==result.outputFile || savedCandidateId!==result.candidateId) {
    invalid('state.saved identity must match its saved result');
  }
  return { ...common,phase,result,outputFile,savedCandidateId };
}

function decodeEvidence(value:unknown):CameraIntrinsicEvidence {
  const evidence=record(value,'state.evidence');
  const available=boolean(evidence.available,'state.evidence.available');
  const sampleCount=nonNegativeInteger(evidence.sample_count,'state.evidence.sample_count');
  const filename=string(evidence.filename,'state.evidence.filename');
  if (available && (!filename.endsWith('-evidence.zip') || sampleCount < 1)) {
    invalid('state.evidence available bundle must have samples and a ZIP filename');
  }
  if (!available && filename) invalid('state.evidence unavailable bundle must not have a filename');
  return { available,sampleCount,filename };
}

function decodeGuidance(value: unknown): CameraIntrinsicGuidance {
  const guidance = record(value, 'state.guidance');
  const dimension = nullableString(guidance.dimension, 'state.guidance.dimension');
  if (dimension !== null && dimension !== 'X' && dimension !== 'Y' && dimension !== 'Size' && dimension !== 'Skew') {
    invalid('state.guidance.dimension is unsupported');
  }
  const direction = string(guidance.direction, 'state.guidance.direction');
  if (!['center','left','right','top','bottom','closer','tilt','complete'].includes(direction)) {
    invalid('state.guidance.direction is unsupported');
  }
  return {
    complete:boolean(guidance.complete, 'state.guidance.complete'),
    dimension:dimension as CameraIntrinsicGuidance['dimension'],
    direction:direction as CameraIntrinsicGuidance['direction'],
    progress:unitInterval(guidance.progress, 'state.guidance.progress'),
  };
}

function decodeRecovery(value: unknown): CameraIntrinsicRecovery {
  const recovery = record(value, 'state.recovery');
  return {
    checkpointFile:string(recovery.checkpoint_file, 'state.recovery.checkpoint_file'),
    checkpointAvailable:boolean(recovery.checkpoint_available, 'state.recovery.checkpoint_available'),
    resultRestored:boolean(recovery.result_restored, 'state.recovery.result_restored'),
    lastError:nullableString(recovery.last_error, 'state.recovery.last_error'),
  };
}

function decodeAutoCapture(value: unknown): CameraIntrinsicAutoCapture {
  const autoCapture = record(value, 'state.auto_capture');
  return {
    enabled:boolean(autoCapture.enabled, 'state.auto_capture.enabled'),
    intervalSeconds:autoCaptureInterval(autoCapture.interval_seconds, 'state.auto_capture.interval_seconds'),
    lastError:nullableString(autoCapture.last_error, 'state.auto_capture.last_error'),
    coverageComplete:boolean(autoCapture.coverage_complete, 'state.auto_capture.coverage_complete'),
  };
}

function autoCaptureInterval(value:unknown,path:string) {
  const result=nonNegativeNumber(value,path);
  if (result>10) invalid(`${path} must be at most 10 seconds`);
  return result;
}

async function updateCameraIntrinsicAutoCapture(
  targetId: string,
  processInstanceId: string,
  resource: 'auto_capture/start' | 'auto_capture/stop',
) {
  const payload = await post(targetId, processInstanceId, resource, {});
  const root = record(payload, 'auto capture result');
  return {
    ok:ok(root.ok, 'auto capture result.ok'),
    autoCapture:decodeAutoCapture(root.auto_capture),
  } satisfies CameraIntrinsicAutoCaptureResult;
}

export function decodeCameraIntrinsicResult(value: unknown): CameraIntrinsicResult {
  const root = record(value, 'result');
  if (intrinsicPhase(root.phase,'result.phase')!=='saved') invalid('result.phase must be saved');
  if (root.saved!==true) invalid('result.saved must be true');
  return {
    ...decodeIntrinsicParameters(root,'result'),
    candidateId:nonEmptyString(root.candidate_id,'result.candidate_id'),
    phase:'saved',
    sessionRevision:nonNegativeInteger(root.session_revision,'result.session_revision'),
    collectionRevision:nonNegativeInteger(root.collection_revision,'result.collection_revision'),
    saved:true,
    outputFile:nonEmptyString(root.output_file,'result.output_file'),
  };
}

export function decodeCameraIntrinsicCandidate(value:unknown):CameraIntrinsicCandidate {
  const root=record(value,'candidate');
  if (intrinsicPhase(root.phase,'candidate.phase')!=='candidate_ready') {
    invalid('candidate.phase must be candidate_ready');
  }
  if (root.saved!==false) invalid('candidate.saved must be false');
  if (root.output_file!==null) invalid('candidate.output_file must be null');
  const saveBlocked=string(root.save_blocked,'candidate.save_blocked');
  if (saveBlocked!=='explicit_save_required' && saveBlocked!=='stability_validation_failed') {
    invalid('candidate.save_blocked is unsupported');
  }
  const quality=decodeCandidateQuality(root.quality);
  if (
    (quality.status==='save_ready') !== (saveBlocked==='explicit_save_required')
    || (quality.status==='save_ready') !== quality.assessment.passed
  ) {
    invalid('candidate quality and save_blocked must agree');
  }
  return {
    ...decodeIntrinsicParameters(root,'candidate'),
    candidateId:nonEmptyString(root.candidate_id,'candidate.candidate_id'),
    phase:'candidate_ready',
    sessionRevision:nonNegativeInteger(root.session_revision,'candidate.session_revision'),
    collectionRevision:nonNegativeInteger(root.collection_revision,'candidate.collection_revision'),
    saved:false,
    saveBlocked:saveBlocked as CameraIntrinsicCandidate['saveBlocked'],
    diagnostics:record(root.diagnostics,'candidate.diagnostics'),
    quality,
    outputFile:null,
  };
}

function decodeIntrinsicParameters(root:Record<string,unknown>,path:string):CameraIntrinsicParameters {
  return {
    cameraMatrix:tuple9(root.camera_matrix,`${path}.camera_matrix`),
    distortion:numberArray(root.distortion,`${path}.distortion`),
    fx:number(root.fx,`${path}.fx`),fy:number(root.fy,`${path}.fy`),
    cx:number(root.cx,`${path}.cx`),cy:number(root.cy,`${path}.cy`),
    imageWidth:positiveInteger(root.image_width,`${path}.image_width`),
    imageHeight:positiveInteger(root.image_height,`${path}.image_height`),
    rmsReprojectionErrorPx:nonNegativeNumber(
      root.rms_reprojection_error_px,`${path}.rms_reprojection_error_px`,
    ),
    sampleCount:positiveInteger(root.sample_count,`${path}.sample_count`),
  };
}

function decodeCandidateQuality(value:unknown):CameraIntrinsicCandidateQuality {
  const quality=record(value,'candidate.quality');
  const status=string(quality.status,'candidate.quality.status');
  if (status!=='save_ready' && status!=='unstable') invalid('candidate.quality.status is unsupported');
  const reasons=array(quality.reasons,'candidate.quality.reasons').map((reason,index) => (
    nonEmptyString(reason,`candidate.quality.reasons[${index}]`)
  ));
  if (status==='save_ready' ? reasons.length!==0 : reasons.length===0) {
    invalid('candidate.quality reasons must agree with status');
  }
  const assessment=record(quality.assessment,'candidate.quality.assessment');
  return {
    status:status as CameraIntrinsicCandidateQuality['status'],
    reasons,
    assessment:{
      method:nonEmptyString(assessment.method,'candidate.quality.assessment.method'),
      detectorUncertaintyPx:nonNegativeNumber(
        assessment.detector_uncertainty_px,'candidate.quality.assessment.detector_uncertainty_px',
      ),
      trainingPerViewMedianPx:nullableNonNegativeNumber(
        assessment.training_per_view_median_px,'candidate.quality.assessment.training_per_view_median_px',
      ),
      trainingRobustSigmaPx:nullableNonNegativeNumber(
        assessment.training_robust_sigma_px,'candidate.quality.assessment.training_robust_sigma_px',
      ),
      confidenceLimitPx:nullableNonNegativeNumber(
        assessment.confidence_limit_px,'candidate.quality.assessment.confidence_limit_px',
      ),
      heldOutRmsMaximumPx:nullableNonNegativeNumber(
        assessment.held_out_rms_max_px,'candidate.quality.assessment.held_out_rms_max_px',
      ),
      undistortedRayMaximumEquivalentPx:nullableNonNegativeNumber(
        assessment.undistorted_ray_max_equivalent_px,
        'candidate.quality.assessment.undistorted_ray_max_equivalent_px',
      ),
      normalizedRayConfidenceLimitPx:nullableNonNegativeNumber(
        assessment.normalized_ray_confidence_limit_px,
        'candidate.quality.assessment.normalized_ray_confidence_limit_px',
      ),
      passed:boolean(assessment.passed,'candidate.quality.assessment.passed'),
    },
  };
}

function decodeCandidatePool(value:unknown):CameraIntrinsicCandidatePool {
  const pool=record(value,'state.candidate_pool');
  const count=nonNegativeInteger(pool.count,'state.candidate_pool.count');
  const imageSize=pool.image_size===null
    ? null : positiveIntegerTuple2(pool.image_size,'state.candidate_pool.image_size');
  if ((count===0)!==(imageSize===null)) {
    invalid('state.candidate_pool.image_size must exist exactly when observations exist');
  }
  return {
    count,imageSize,solveFrozen:boolean(pool.solve_frozen,'state.candidate_pool.solve_frozen'),
  };
}

export function decodeCameraIntrinsicValidationReport(value:unknown):CameraIntrinsicValidationReport {
  const root=record(value,'intrinsic validation');
  const schema=string(root.schema,'intrinsic validation.schema');
  if (schema!=='xgc2.camera.intrinsic-validation.v2') invalid('intrinsic validation.schema must be v2');
  const remapPath='intrinsic validation.remap_delta_px';
  const remap=record(root.remap_delta_px,remapPath);
  const views=array(root.views,'intrinsic validation.views').map((value,index) => {
    const path=`intrinsic validation.views[${index}]`;
    const view=record(value,path);
    return {
      id:string(view.id,`${path}.id`),
      label:string(view.label,`${path}.label`),
      description:string(view.description,`${path}.description`),
    } satisfies CameraIntrinsicValidationView;
  });
  const defaultView=string(root.default_view,'intrinsic validation.default_view');
  if (!views.some((view) => view.id===defaultView)) invalid('intrinsic validation.default_view must identify a view');
  const configurations=record(root.configurations,'intrinsic validation.configurations');
  return {
    schema:'xgc2.camera.intrinsic-validation.v2',
    generation:positiveInteger(root.generation,'intrinsic validation.generation'),
    referenceConfiguration:decodeCameraIntrinsicValidationConfiguration(
      configurations.reference,'intrinsic validation.configurations.reference',
    ),
    comparisonConfiguration:decodeCameraIntrinsicValidationConfiguration(
      configurations.comparison,'intrinsic validation.configurations.comparison',
    ),
    capturedAt:string(root.captured_at,'intrinsic validation.captured_at'),
    sourceImageSize:positiveIntegerTuple2(root.source_image_size,'intrinsic validation.source_image_size'),
    analysisImageSize:positiveIntegerTuple2(root.analysis_image_size,'intrinsic validation.analysis_image_size'),
    remapMeanPx:nonNegativeNumber(remap.mean,`${remapPath}.mean`),
    remapMaximumPx:nonNegativeNumber(remap.maximum,`${remapPath}.maximum`),
    defaultView,
    views,
  };
}

function encodeCameraIntrinsicValidationConfiguration(configuration:CameraIntrinsicValidationConfiguration) {
  return configuration.kind==='raw'
    ? { kind:'raw' as const }
    : { kind:'calibration' as const,calibration_id:configuration.calibrationId };
}

function decodeCameraIntrinsicValidationConfiguration(
  value:unknown,
  path:string,
):CameraIntrinsicValidationConfiguration {
  const configuration=record(value,path);
  const kind=string(configuration.kind,`${path}.kind`);
  if (kind==='raw') return { kind:'raw' };
  if (kind!=='calibration') invalid(`${path}.kind is unsupported`);
  const calibrationId=string(configuration.calibration_id,`${path}.calibration_id`);
  if (!calibrationId) invalid(`${path}.calibration_id must not be empty`);
  const calibrationCreatedAt=configuration.calibration_created_at == null
    ? undefined : string(configuration.calibration_created_at,`${path}.calibration_created_at`);
  const optionalText=(name:string) => configuration[name] == null
    ? undefined : string(configuration[name],`${path}.${name}`);
  const qualityPassed=configuration.quality_passed == null
    ? undefined : boolean(configuration.quality_passed,`${path}.quality_passed`);
  return {
    kind:'calibration',calibrationId,
    ...(calibrationCreatedAt===undefined ? {} : { calibrationCreatedAt }),
    ...(optionalText('calibration_sha256')===undefined ? {} : { calibrationSha256:optionalText('calibration_sha256') }),
    ...(optionalText('board_profile')===undefined ? {} : { boardProfile:optionalText('board_profile') }),
    ...(optionalText('feature_model')===undefined ? {} : { featureModel:optionalText('feature_model') }),
    ...(optionalText('quality_contract')===undefined ? {} : { qualityContract:optionalText('quality_contract') }),
    ...(qualityPassed===undefined ? {} : { qualityPassed }),
    ...(optionalText('algorithm_sha256')===undefined ? {} : { algorithmSha256:optionalText('algorithm_sha256') }),
  };
}

function post(
  targetId: string,
  processInstanceId: string,
  resource: string,
  body: unknown,
  options?: { timeoutMs?: number },
) {
  return request<unknown>(`/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/intrinsic/${resource}`, {
    method: 'POST',cache: 'no-store',body: JSON.stringify(body),
  }, options);
}

function decodeBoard(board: Record<string, unknown>): CameraIntrinsicState['board'] {
  const decoded: CameraIntrinsicState['board'] = {
    size: positiveIntegerTuple2(board.size, 'state.board.size'),
    squareSizeM: positiveNumber(board.square_size_m, 'state.board.square_size_m'),
  };
  if (board.type != null) {
    const type = string(board.type, 'state.board.type');
    if (type !== 'checkerboard' && type !== 'aprilgrid') invalid('state.board.type is unsupported');
    decoded.type = type as 'checkerboard' | 'aprilgrid';
  }
  if (board.tag_family != null) decoded.tagFamily = string(board.tag_family, 'state.board.tag_family');
  if (board.tag_spacing_m != null) {
    decoded.tagSpacingM = nonNegativeNumber(board.tag_spacing_m, 'state.board.tag_spacing_m');
  }
  if (board.start_id != null) decoded.startId = nonNegativeInteger(board.start_id, 'state.board.start_id');
  if (board.end_id != null) decoded.endId = nonNegativeInteger(board.end_id, 'state.board.end_id');
  return decoded;
}

function decodeCoverage(value: unknown, index: number): CameraIntrinsicCoverage {
  const path = `state.coverage[${index}]`;
  const coverage = record(value, path);
  const label = string(coverage.label, `${path}.label`);
  if (label !== 'X' && label !== 'Y' && label !== 'Size' && label !== 'Skew') invalid(`${path}.label is unsupported`);
  return {
    label: label as CameraIntrinsicCoverage['label'],
    progress: unitInterval(coverage.progress, `${path}.progress`),
  };
}

function decodeDetection(value: unknown): CameraIntrinsicDetection {
  const detection = record(value, 'state.detection');
  const status = string(detection.status, 'state.detection.status');
  if (status !== 'waiting' && status !== 'detected' && status !== 'not_detected') {
    invalid('state.detection.status is unsupported');
  }
  const metrics = array(detection.metrics, 'state.detection.metrics').map((item,index) => {
    const path = `state.detection.metrics[${index}]`;
    const metric = record(item, path);
    const label = string(metric.label, `${path}.label`);
    if (label !== 'X' && label !== 'Y' && label !== 'Size' && label !== 'Skew') {
      invalid(`${path}.label is unsupported`);
    }
    return {
      label:label as CameraIntrinsicDetectionMetric['label'],
      value:unitInterval(metric.value, `${path}.value`),
    };
  });
  return {
    status:status as CameraIntrinsicDetection['status'],
    cornerCount:nonNegativeInteger(detection.corner_count, 'state.detection.corner_count'),
    expectedCornerCount:positiveInteger(detection.expected_corner_count, 'state.detection.expected_corner_count'),
    frameWidth:nonNegativeInteger(detection.frame_width, 'state.detection.frame_width'),
    frameHeight:nonNegativeInteger(detection.frame_height, 'state.detection.frame_height'),
    sequence:nonNegativeInteger(detection.sequence, 'state.detection.sequence'),
    metrics,
    accepted:boolean(detection.accepted, 'state.detection.accepted'),
    duplicate:boolean(detection.duplicate, 'state.detection.duplicate'),
  };
}

function decodeTarget(value: unknown, index: number): CameraIntrinsicTarget {
  const path = `state.targets[${index}]`;
  const target = record(value, path);
  return {
    name: string(target.name, `${path}.name`),
    position: tuple3(target.position, `${path}.position`),
    done: boolean(target.done, `${path}.done`),
    hasRef: boolean(target.has_ref, `${path}.has_ref`),
  };
}

function decodePose(value: unknown): CameraIntrinsicPose {
  const pose = record(value, 'state.pose');
  return {
    x: number(pose.x, 'state.pose.x'),
    y: number(pose.y, 'state.pose.y'),
    z: number(pose.z, 'state.pose.z'),
    qx: number(pose.qx, 'state.pose.qx'),
    qy: number(pose.qy, 'state.pose.qy'),
    qz: number(pose.qz, 'state.pose.qz'),
    qw: number(pose.qw, 'state.pose.qw'),
  };
}

function decodeAction(value: unknown): CameraIntrinsicAction {
  const action = record(value, 'state.action');
  const name = string(action.name, 'state.action.name');
  if (name !== 'auto_run') invalid('state.action.name must be auto_run');
  const status = string(action.status, 'state.action.status');
  if (status !== 'running' && status !== 'failed' && status !== 'succeeded') {
    invalid('state.action.status must be running, failed, or succeeded');
  }
  return {
    name: name as CameraIntrinsicAction['name'],
    status: status as CameraIntrinsicAction['status'],
    targetIndex: nullableNonNegativeInteger(action.target_index, 'state.action.target_index'),
    targetName: nullableString(action.target_name, 'state.action.target_name'),
    error: nullableString(action.error, 'state.action.error'),
    result: action.result == null ? undefined : decodeIntrinsicActionResult(action.result),
  };
}

function decodeIntrinsicActionResult(value:unknown):NonNullable<CameraIntrinsicAction['result']> {
  const result=record(value,'state.action.result');
  if (!own(result,'candidate_id') || !own(result,'quality') || Object.keys(result).length!==2) {
    invalid('state.action.result must contain only candidate_id and quality');
  }
  return {
    candidateId:nonEmptyString(result.candidate_id,'state.action.result.candidate_id'),
    quality:decodeCandidateQuality(result.quality),
  };
}

function intrinsicPhase(value:unknown,path:string):CameraIntrinsicState['phase'] {
  const phase=string(value,path);
  if (phase!=='collecting' && phase!=='candidate_ready' && phase!=='saved') {
    invalid(`${path} is unsupported`);
  }
  return phase as CameraIntrinsicState['phase'];
}

function ok(value: unknown, path: string): true {
  if (value !== true) invalid(`${path} must be true`);
  return true;
}

function nonNegativeNumber(value: unknown, path: string) {
  const result = number(value, path);
  if (result < 0) invalid(`${path} must be non-negative`);
  return result;
}

function positiveNumber(value: unknown, path: string) {
  const result = number(value, path);
  if (result <= 0) invalid(`${path} must be positive`);
  return result;
}

function nullableNonNegativeInteger(value: unknown, path: string) {
  return value === null ? null : nonNegativeInteger(value, path);
}

function nullableString(value: unknown, path: string) {
  return value === null ? null : string(value, path);
}

function nullableNonNegativeNumber(value:unknown,path:string) {
  return value===null ? null : nonNegativeNumber(value,path);
}

function nonEmptyString(value:unknown,path:string) {
  const result=string(value,path);
  if (!result.trim()) invalid(`${path} must not be empty`);
  return result;
}

function own(value:Record<string,unknown>,key:string) {
  return Object.prototype.hasOwnProperty.call(value,key);
}

function unitInterval(value: unknown, path: string) {
  const result = number(value, path);
  if (result < 0 || result > 1) invalid(`${path} must be between zero and one`);
  return result;
}

function numberArray(value: unknown, path: string) {
  const values = array(value, path);
  if (values.length === 0) invalid(`${path} must not be empty`);
  return values.map((item,index) => number(item, `${path}[${index}]`));
}

function positiveIntegerTuple2(value: unknown, path: string): readonly [number,number] {
  const values = array(value, path);
  if (values.length !== 2) invalid(`${path} must contain two integers`);
  return [positiveInteger(values[0], `${path}[0]`),positiveInteger(values[1], `${path}[1]`)];
}

function tuple9(value: unknown, path: string): CameraIntrinsicResult['cameraMatrix'] {
  const values = array(value, path);
  if (values.length !== 9) invalid(`${path} must contain nine numbers`);
  return [
    number(values[0], `${path}[0]`),number(values[1], `${path}[1]`),number(values[2], `${path}[2]`),
    number(values[3], `${path}[3]`),number(values[4], `${path}[4]`),number(values[5], `${path}[5]`),
    number(values[6], `${path}[6]`),number(values[7], `${path}[7]`),number(values[8], `${path}[8]`),
  ];
}
