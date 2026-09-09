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
  marker: string;
  pixel: CameraExtrinsicPixel;
  world?: readonly [number,number,number];
  inlier?: boolean;
  reprojectionErrorPx?: number;
};

export type CameraExtrinsicProjection = {
  marker: string;
  pixel: CameraExtrinsicPixel;
};

export type CameraExtrinsicResult = {
  candidateId: string;
  saved: boolean;
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
  mode: 'live' | 'frozen';
  generation: number;
  outputFile?: string;
  resultRestored: boolean;
  recoveryError?: string;
  parentFrame: string;
  childFrame: string;
  source: {
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

export type CameraExtrinsicSolvePoint = Pick<CameraExtrinsicPoint,'marker' | 'pixel'>;

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
  generation: number,
  points: readonly CameraExtrinsicSolvePoint[],
) {
  const payload = await post(targetId, processInstanceId, 'solve', { generation,points });
  return decodeCameraExtrinsicResult(payload);
}

export async function saveCameraExtrinsicCandidate(
  targetId: string,
  processInstanceId: string,
  candidateId: string,
) {
  const payload = await post(targetId, processInstanceId, 'save', { candidate_id:candidateId });
  return decodeCameraExtrinsicResult(payload);
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
  return {
    mode: mode as CameraExtrinsicState['mode'],
    generation: integer(root.generation, 'state.generation'),
    outputFile: optionalString(root.output_file, 'state.output_file'),
    resultRestored:root.result_restored == null
      ? false : boolean(root.result_restored,'state.result_restored'),
    recoveryError:optionalString(root.recovery_error,'state.recovery_error'),
    parentFrame: string(root.parent_frame, 'state.parent_frame'),
    childFrame: string(root.child_frame, 'state.child_frame'),
    source: {
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
  return {
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

function post(targetId: string, processInstanceId: string, resource: string, body: unknown) {
  return request<unknown>(`/visualization/targets/${encodeURIComponent(targetId)}/camera-calibration/${encodeURIComponent(processInstanceId)}/api/v1/${resource}`, {
    method: 'POST',cache: 'no-store',body: JSON.stringify(body),
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
  return { marker: string(projection.marker, `${path}.marker`),pixel: tuple2(projection.pixel, `${path}.pixel`) };
}

function decodePoint(value: unknown, index: number): CameraExtrinsicPoint {
  const path = `result.points[${index}]`;
  const point = record(value, path);
  return {
    marker: string(point.marker, `${path}.marker`),
    pixel: tuple2(point.pixel, `${path}.pixel`),
    world: point.world == null ? undefined : tuple3(point.world, `${path}.world`),
    inlier: point.inlier == null ? undefined : boolean(point.inlier, `${path}.inlier`),
    reprojectionErrorPx: optionalNumber(point.reprojection_error_px, `${path}.reprojection_error_px`),
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
