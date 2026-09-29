import { request,requestBlob } from '../../api/http';
import { createCameraCalibrationProtocol } from './cameraCalibrationProtocol';

const {
  array,boolean,integer,invalid,nonNegativeInteger,number,positiveInteger,record,string,tuple3,
} = createCameraCalibrationProtocol('camera calibration');

/** Typed transport adapter for the managed ROS extrinsic-calibration service. */

export type CameraExtrinsicPixel = readonly [number,number];

export type CameraExtrinsicMarker = {
  name: string;
  position: readonly [number,number,number];
};

export type CameraExtrinsicPoint = {
  sampleId?: string;
  marker: string;
  pixel: CameraExtrinsicPixel;
  world?: readonly [number,number,number];
  inlier?: boolean;
  reprojectionErrorPx?: number;
};

export type CameraExtrinsicProjection = {
  sampleId?: string;
  marker: string;
  pixel: CameraExtrinsicPixel;
};

export type CameraExtrinsicResult = {
  datasetRevision?: number;
  candidateId: string;
  saved: boolean;
  application?: { status: 'pending' | 'applied' | 'conflict' | 'unavailable' };
  translation: readonly [number,number,number];
  quaternionXyzw: readonly [number,number,number,number];
  meanReprojectionErrorPx: number;
  maxReprojectionErrorPx: number;
  inlierIndices: readonly number[];
  warnings: readonly string[];
  projections: readonly CameraExtrinsicProjection[];
  points: readonly CameraExtrinsicPoint[];
  outputFile?: string;
};

export type CameraExtrinsicState = {
  samplingSessionId: string;
  datasetRevision: number;
  samples: readonly CameraExtrinsicSample[];
  sampleLimits: { imageBytes:number;imagePixels:number;samples:number;pending:number;totalImageBytes:number;pendingSeconds:number };
  mode: 'live' | 'frozen';
  generation: number;
  outputFile?: string;
  resultRestored: boolean;
  recoveryError?: string;
  parentFrame: string;
  childFrame: string;
  source: {
    sourceId: string;
    imageTopic: string;
    intrinsicFile: string;
    intrinsicSource?: string;
    idealHorizontalFovDegrees?: number;
    posePrefix: string;
    imageReady: boolean;
    intrinsicReady: boolean;
    markerCount: number;
    markerNames: readonly string[];
    latestImageStampSec?: number;
  };
  frame?: {
    stampSec: number;
    frameId: string;
    width: number;
    height: number;
  };
  markers: readonly CameraExtrinsicMarker[];
  result?: CameraExtrinsicResult;
};

export type CameraExtrinsicDisplay = {
  id:string;sourceId:string;sourceEpoch:string;width:number;height:number;
  clockDomain:'browser-performance';presentedAtMs:number;timeOriginMs?:number;
  mediaTimeSec?:number;presentedFrames?:number;captureTimeMs?:number;receiveTimeMs?:number;rtpTimestamp?:number;
};

export type CameraExtrinsicSample = CameraExtrinsicPoint & {
  sampleId:string;world:readonly [number,number,number];sourceWorld:readonly [number,number,number];
  display:CameraExtrinsicDisplay;
  poseObservation:{ observationId:string;frameId:string;sourceStampSec:number;sourceClock:'ros';
    receivedAtSec:number;receivedClock:'unix';receivedMonotonicSec:number };
  cameraModelId:string;poseCoordinateId:string;
  image:{ path:string;mimeType:'image/png'|'image/jpeg';sha256:string;width:number;height:number };
};

export type CameraExtrinsicDatasetRef = { samplingSessionId:string;expectedRevision:number };
export type CameraExtrinsicSampleInput = CameraExtrinsicDatasetRef & {
  requestId:string;marker:string;pixel:CameraExtrinsicPixel;display:CameraExtrinsicDisplay;replacesSampleId?:string;
};
export type CameraExtrinsicPendingSample = { sampleId:string;samplingSessionId:string;datasetRevision:number;expiresInSeconds:number };

export async function loadCameraExtrinsicState(targetId: string, processInstanceId: string, signal?: AbortSignal) {
  const payload = await request<unknown>(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/state`,
    { cache: 'no-store',signal },
  );
  return decodeCameraExtrinsicState(payload);
}

export function loadCameraExtrinsicImage(targetId: string, processInstanceId: string, signal?: AbortSignal) {
  return requestBlob(
    `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/image.jpg`,
    { cache: 'no-store',headers: { Accept: 'image/jpeg' },signal },
  );
}

export async function freezeCameraExtrinsicFrame(targetId: string, processInstanceId: string) {
  const payload = await post(targetId, processInstanceId, 'freeze', {});
  return decodeCameraExtrinsicState(payload);
}

export async function resumeCameraExtrinsicLive(targetId: string, processInstanceId: string) {
  const payload = await post(targetId, processInstanceId, 'live', {});
  return decodeCameraExtrinsicState(payload);
}

export async function solveCameraExtrinsic(
  targetId: string,
  processInstanceId: string,
  dataset: CameraExtrinsicDatasetRef,
  signal?: AbortSignal,
) {
  const payload = await post(targetId, processInstanceId, 'solve', datasetBody(dataset),signal);
  return decodeCameraExtrinsicResult(payload);
}

export async function saveCameraExtrinsicCandidate(
  targetId: string,
  processInstanceId: string,
  candidateId: string,
  signal?: AbortSignal,
) {
  const payload = await post(targetId, processInstanceId, 'save', { candidate_id:candidateId },signal);
  return decodeCameraExtrinsicResult(payload);
}

export async function beginCameraExtrinsicSample(targetId:string,processInstanceId:string,input:CameraExtrinsicSampleInput,signal?:AbortSignal):Promise<CameraExtrinsicPendingSample> {
  const display=input.display;
  const value=record(await post(targetId,processInstanceId,'samples/begin',{
    ...datasetBody(input),request_id:input.requestId,marker:input.marker,pixel:input.pixel,
    ...(input.replacesSampleId ? { replaces_sample_id:input.replacesSampleId } : {}),
    display:{ id:display.id,source_id:display.sourceId,source_epoch:display.sourceEpoch,width:display.width,height:display.height,
      clock_domain:display.clockDomain,presented_at_ms:display.presentedAtMs,time_origin_ms:display.timeOriginMs,
      media_time_sec:display.mediaTimeSec,presented_frames:display.presentedFrames,
      capture_time_ms:display.captureTimeMs,receive_time_ms:display.receiveTimeMs,rtp_timestamp:display.rtpTimestamp },
  },signal),'pending');
  if (value.status!=='pending' && value.status!=='completed') invalid('pending.status is invalid');
  const pending={ sampleId:sampleId(value.sample_id,'pending.sample_id'),
    samplingSessionId:sampleId(value.sampling_session_id,'pending.sampling_session_id'),
    datasetRevision:nonNegativeInteger(value.dataset_revision,'pending.dataset_revision'),
    expiresInSeconds:nonNegativeInteger(value.expires_in_seconds ?? 0,'pending.expires_in_seconds') };
  if (pending.samplingSessionId!==input.samplingSessionId) invalid('pending session does not match the selected calibration');
  return pending;
}

export async function commitCameraExtrinsicSampleImage(targetId:string,processInstanceId:string,id:string,image:Blob,signal?:AbortSignal) {
  sampleId(id,'sample_id');
  if (!['image/png','image/jpeg'].includes(image.type) || image.size===0 || image.size>33_554_432) invalid('sample image must be a bounded PNG or JPEG');
  return decodeCameraExtrinsicState(await request<unknown>(`${processPath(targetId,processInstanceId)}/samples/${id}/image`,{
    method:'POST',cache:'no-store',headers:{ 'Content-Type':image.type },body:image,signal,
  }));
}

export function loadCameraExtrinsicSampleImage(targetId:string,processInstanceId:string,id:string,signal?:AbortSignal) {
  sampleId(id,'sample_id');
  return requestBlob(`${processPath(targetId,processInstanceId)}/samples/${id}/image`,{
    cache:'no-store',headers:{ Accept:'image/png, image/jpeg' },signal,
  });
}

export async function cancelCameraExtrinsicSample(targetId:string,processInstanceId:string,samplingSessionId:string,id:string) {
  await post(targetId,processInstanceId,'samples/cancel',{ sampling_session_id:samplingSessionId,sample_id:id });
}

export async function removeCameraExtrinsicSample(targetId:string,processInstanceId:string,dataset:CameraExtrinsicDatasetRef,id:string,signal?:AbortSignal) {
  return decodeCameraExtrinsicState(await post(targetId,processInstanceId,'samples/remove',{ ...datasetBody(dataset),sample_id:id },signal));
}

export async function updateCameraExtrinsicSamplePixel(targetId:string,processInstanceId:string,dataset:CameraExtrinsicDatasetRef,id:string,pixel:CameraExtrinsicPixel,signal?:AbortSignal) {
  return decodeCameraExtrinsicState(await post(targetId,processInstanceId,'samples/pixel',{ ...datasetBody(dataset),sample_id:id,pixel },signal));
}

export async function clearCameraExtrinsicSamples(targetId:string,processInstanceId:string,dataset:CameraExtrinsicDatasetRef,signal?:AbortSignal) {
  return decodeCameraExtrinsicState(await post(targetId,processInstanceId,'samples/clear',datasetBody(dataset),signal));
}

function datasetBody(dataset:CameraExtrinsicDatasetRef) {
  return { sampling_session_id:dataset.samplingSessionId,expected_revision:dataset.expectedRevision };
}

export function decodeCameraExtrinsicState(value: unknown): CameraExtrinsicState {
  const root = record(value, 'state');
  const mode = string(root.mode, 'state.mode');
  if (mode !== 'live' && mode !== 'frozen') invalid('state.mode must be live or frozen');
  const source = record(root.source, 'state.source');
  const frameValue = root.frame;
  const frame = frameValue == null ? undefined : decodeFrame(frameValue);
  const result = root.result == null ? undefined : decodeCameraExtrinsicResult(root.result);
  const frozenModel = root.frame && typeof root.frame === 'object' ? (root.frame as Record<string, unknown>).camera_model : undefined;
  const model = frozenModel == null ? source : record(frozenModel, 'frame.camera_model');
  const limits=record(root.sample_limits,'state.sample_limits');
  const samples=array(root.samples,'state.samples').map((value,index) => decodeSample(value,`state.samples[${index}]`));
  if (new Set(samples.map((sample) => sample.sampleId)).size!==samples.length) invalid('state.samples identities must be unique');
  return {
    samplingSessionId:sampleId(root.sampling_session_id,'state.sampling_session_id'),
    datasetRevision:nonNegativeInteger(root.dataset_revision,'state.dataset_revision'),
    samples,
    sampleLimits:{ imageBytes:positiveInteger(limits.image_bytes,'sample_limits.image_bytes'),imagePixels:positiveInteger(limits.image_pixels,'sample_limits.image_pixels'),
      samples:positiveInteger(limits.samples,'sample_limits.samples'),pending:positiveInteger(limits.pending,'sample_limits.pending'),
      totalImageBytes:positiveInteger(limits.total_image_bytes,'sample_limits.total_image_bytes'),pendingSeconds:positiveInteger(limits.pending_seconds,'sample_limits.pending_seconds') },
    mode: mode as CameraExtrinsicState['mode'],
    generation: integer(root.generation, 'state.generation'),
    outputFile: optionalString(root.output_file, 'state.output_file'),
    resultRestored:root.result_restored == null
      ? false : boolean(root.result_restored,'state.result_restored'),
    recoveryError:optionalString(root.recovery_error,'state.recovery_error'),
    parentFrame: string(root.parent_frame, 'state.parent_frame'),
    childFrame: string(root.child_frame, 'state.child_frame'),
    source: {
      sourceId:string(source.source_id,'state.source.source_id'),
      imageTopic: string(source.image_topic, 'state.source.image_topic'),
      intrinsicFile: string(model.intrinsic_file ?? source.intrinsic_file, 'state.source.intrinsic_file'),
      intrinsicSource: optionalString(model.intrinsic_source, 'state.source.intrinsic_source'),
      idealHorizontalFovDegrees: optionalNumber(model.ideal_horizontal_fov_degrees, 'state.source.ideal_horizontal_fov_degrees'),
      posePrefix: string(source.pose_prefix, 'state.source.pose_prefix'),
      imageReady: boolean(source.image_ready, 'state.source.image_ready'),
      intrinsicReady: boolean(source.intrinsic_ready, 'state.source.intrinsic_ready'),
      markerCount: nonNegativeInteger(source.marker_count, 'state.source.marker_count'),
      markerNames: stringArray(source.marker_names, 'state.source.marker_names'),
      latestImageStampSec: optionalNumber(source.latest_image_stamp_sec, 'state.source.latest_image_stamp_sec'),
    },
    frame,
    markers: array(root.markers, 'state.markers').map((item,index) => decodeMarker(item, index)),
    result,
  };
}

export function decodeCameraExtrinsicResult(value: unknown): CameraExtrinsicResult {
  const root = record(value, 'result');
  const saved = boolean(root.saved, 'result.saved');
  const outputFile = optionalString(root.output_file, 'result.output_file');
  if (saved && !outputFile) invalid('result.output_file is required when result.saved is true');
  let application: CameraExtrinsicResult['application'];
  if (root.application != null) {
    const status = record(root.application, 'result.application').status;
    if (status !== 'pending' && status !== 'applied' && status !== 'conflict' && status !== 'unavailable') {
      return invalid('result.application.status is invalid');
    }
    application = { status };
  }
  return {
    application,
    datasetRevision:root.dataset_revision==null ? undefined : nonNegativeInteger(root.dataset_revision,'result.dataset_revision'),
    candidateId: string(root.candidate_id, 'result.candidate_id'),
    saved,
    translation: tuple3(root.translation, 'result.translation'),
    quaternionXyzw: tuple4(root.quaternion_xyzw, 'result.quaternion_xyzw'),
    meanReprojectionErrorPx: number(root.mean_reprojection_error_px, 'result.mean_reprojection_error_px'),
    maxReprojectionErrorPx: number(root.max_reprojection_error_px, 'result.max_reprojection_error_px'),
    inlierIndices: array(root.inlier_indices, 'result.inlier_indices').map((item,index) => integer(item, `result.inlier_indices[${index}]`)),
    warnings: stringArray(root.warnings, 'result.warnings'),
    projections: array(root.projections, 'result.projections').map((item,index) => decodeProjection(item, index)),
    points: array(root.points, 'result.points').map((item,index) => decodePoint(item, index)),
    outputFile,
  };
}

function processPath(targetId:string,processInstanceId:string) {
  return `/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1`;
}

function post(targetId: string, processInstanceId: string, resource: string, body: unknown,signal?:AbortSignal) {
  return request<unknown>(`${processPath(targetId,processInstanceId)}/${resource}`, {
    method: 'POST',cache: 'no-store',body: JSON.stringify(body),...(signal ? { signal } : {}),
  });
}

function decodeFrame(value: unknown): NonNullable<CameraExtrinsicState['frame']> {
  const frame = record(value, 'state.frame');
  return {
    stampSec: number(frame.stamp_sec, 'state.frame.stamp_sec'),
    frameId: string(frame.frame_id, 'state.frame.frame_id'),
    width: positiveInteger(frame.width, 'state.frame.width'),
    height: positiveInteger(frame.height, 'state.frame.height'),
  };
}

function decodeMarker(value: unknown, index: number): CameraExtrinsicMarker {
  const path = `state.markers[${index}]`;
  const marker = record(value, path);
  return {
    name: string(marker.name, `${path}.name`),
    position: tuple3(marker.position, `${path}.position`),
  };
}

function decodeProjection(value: unknown, index: number): CameraExtrinsicProjection {
  const path = `result.projections[${index}]`;
  const projection = record(value, path);
  return { sampleId:projection.sample_id==null ? undefined : sampleId(projection.sample_id,`${path}.sample_id`),
    marker: string(projection.marker, `${path}.marker`),pixel: tuple2(projection.pixel, `${path}.pixel`) };
}

function decodePoint(value: unknown, index: number): CameraExtrinsicPoint {
  const path = `result.points[${index}]`;
  const point = record(value, path);
  return {
    sampleId:point.sample_id==null ? undefined : sampleId(point.sample_id,`${path}.sample_id`),
    marker: string(point.marker, `${path}.marker`),
    pixel: tuple2(point.pixel, `${path}.pixel`),
    world: point.world == null ? undefined : tuple3(point.world, `${path}.world`),
    inlier: point.inlier == null ? undefined : boolean(point.inlier, `${path}.inlier`),
    reprojectionErrorPx: optionalNumber(point.reprojection_error_px, `${path}.reprojection_error_px`),
  };
}

function sampleId(value:unknown,path:string) {
  const id=string(value,path);
  if (!/^[a-f0-9]{32}$/.test(id)) invalid(`${path} must identify one calibration sample`);
  return id;
}

function decodeSample(value:unknown,path:string):CameraExtrinsicSample {
  const point=record(value,path),display=record(point.display,`${path}.display`),pose=record(point.pose_observation,`${path}.pose_observation`),image=record(point.image,`${path}.image`);
  const id=sampleId(point.sample_id,`${path}.sample_id`);
  const imagePath=string(image.path,`${path}.image.path`);
  if (imagePath!==`api/v1/samples/${id}/image`) invalid(`${path}.image.path must match its sample`);
  const mime=string(image.mime_type,`${path}.image.mime_type`);
  if (mime!=='image/png' && mime!=='image/jpeg') invalid(`${path}.image.mime_type is invalid`);
  if (display.clock_domain!=='browser-performance' || pose.source_clock!=='ros' || pose.received_clock!=='unix') invalid(`${path} has invalid observation clocks`);
  const width=positiveInteger(image.width,`${path}.image.width`),height=positiveInteger(image.height,`${path}.image.height`);
  if (width!==display.width || height!==display.height) invalid(`${path} image and display dimensions must match`);
  const pixel=tuple2(point.pixel,`${path}.pixel`);
  if (pixel[0]<0 || pixel[1]<0 || pixel[0]>=width || pixel[1]>=height) invalid(`${path}.pixel lies outside its image`);
  const digest=string(image.sha256,`${path}.image.sha256`);
  if (!/^[a-f0-9]{64}$/.test(digest)) invalid(`${path}.image.sha256 is invalid`);
  return {
    sampleId:id,marker:string(point.marker,`${path}.marker`),pixel,world:tuple3(point.world,`${path}.world`),sourceWorld:tuple3(point.source_world,`${path}.source_world`),
    inlier:point.inlier==null ? undefined : boolean(point.inlier,`${path}.inlier`),reprojectionErrorPx:optionalNumber(point.reprojection_error_px,`${path}.reprojection_error_px`),
    cameraModelId:string(point.camera_model_id,`${path}.camera_model_id`),poseCoordinateId:string(point.pose_coordinate_id,`${path}.pose_coordinate_id`),
    display:{ id:string(display.id,`${path}.display.id`),sourceId:string(display.source_id,`${path}.display.source_id`),sourceEpoch:string(display.source_epoch,`${path}.display.source_epoch`),
      width,height,clockDomain:'browser-performance',presentedAtMs:number(display.presented_at_ms,`${path}.display.presented_at_ms`),
      timeOriginMs:optionalNumber(display.time_origin_ms,`${path}.display.time_origin_ms`),mediaTimeSec:optionalNumber(display.media_time_sec,`${path}.display.media_time_sec`),
      presentedFrames:optionalNumber(display.presented_frames,`${path}.display.presented_frames`),captureTimeMs:optionalNumber(display.capture_time_ms,`${path}.display.capture_time_ms`),
      receiveTimeMs:optionalNumber(display.receive_time_ms,`${path}.display.receive_time_ms`),rtpTimestamp:optionalNumber(display.rtp_timestamp,`${path}.display.rtp_timestamp`) },
    poseObservation:{ observationId:string(pose.observation_id,`${path}.pose_observation.observation_id`),frameId:string(pose.frame_id,`${path}.pose_observation.frame_id`),
      sourceStampSec:number(pose.source_stamp_sec,`${path}.pose_observation.source_stamp_sec`),sourceClock:'ros',receivedAtSec:number(pose.received_at_sec,`${path}.pose_observation.received_at_sec`),
      receivedClock:'unix',receivedMonotonicSec:number(pose.received_monotonic_sec,`${path}.pose_observation.received_monotonic_sec`) },
    image:{ path:imagePath,mimeType:mime as 'image/png'|'image/jpeg',sha256:digest,width,height },
  };
}

function optionalNumber(value: unknown, path: string): number | undefined {
  return value == null ? undefined : number(value, path);
}

function optionalString(value: unknown, path: string): string | undefined {
  return value == null ? undefined : string(value, path);
}

function stringArray(value: unknown, path: string) {
  return array(value ?? [], path).map((item,index) => string(item, `${path}[${index}]`));
}

function tuple2(value: unknown, path: string): CameraExtrinsicPixel {
  const values = array(value, path);
  if (values.length !== 2) invalid(`${path} must contain two numbers`);
  return [number(values[0], `${path}[0]`),number(values[1], `${path}[1]`)];
}

function tuple4(value: unknown, path: string): readonly [number,number,number,number] {
  const values = array(value, path);
  if (values.length !== 4) invalid(`${path} must contain four numbers`);
  return [
    number(values[0], `${path}[0]`),number(values[1], `${path}[1]`),
    number(values[2], `${path}[2]`),number(values[3], `${path}[3]`),
  ];
}
