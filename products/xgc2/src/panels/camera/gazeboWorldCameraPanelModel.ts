import { mediaSourceID,normalizeMediaEdgeURL } from '../../domains/execution/executionPublic';
import {
  DEFAULT_LOCAL_MEDIA_EDGE_URL,
  localMediaEdgeURLForPort,
} from '../../config/urls';
import {
  cameraValidationIssueMessage,
  type CameraValidationIssue,
} from './cameraValidationIssue';
import { validateGazeboWorldCameraPoseIssue } from './gazeboWorldCameraPoseModel';

export const GAZEBO_WORLD_CAMERA_SOURCE_ID = 'gazebo_world_camera';

export function worldCameraIntrinsicFileField(runMode: string) {
  if (runMode === 'simulation') return 'simulationIntrinsicFile' as const;
  if (runMode === 'physical' || runMode === 'hybrid') return 'physicalIntrinsicFile' as const;
  return '';
}

export type GazeboWorldCameraOptions = {
  x: number;
  y: number;
  z: number;
  rollDegrees: number;
  pitchDegrees: number;
  yawDegrees: number;
  edgeUrl: string;
  sourceId: string;
  iceServerUrls: string;
  publicIPs: string;
};

const defaultWorldCameraPosition = { x:-4,y:0,z:1.5 };
const defaultWorldCameraAttitude = cameraAttitudeTowardOrigin(defaultWorldCameraPosition);

export const GAZEBO_WORLD_CAMERA_DEFAULTS: GazeboWorldCameraOptions = {
  ...defaultWorldCameraPosition,
  ...defaultWorldCameraAttitude,
  edgeUrl: DEFAULT_LOCAL_MEDIA_EDGE_URL,
  sourceId: GAZEBO_WORLD_CAMERA_SOURCE_ID,
  iceServerUrls: '',
  publicIPs: '',
};

export function gazeboWorldCameraOptions(options: Record<string,unknown>): GazeboWorldCameraOptions {
  return {
    x: numberOption(options.x, GAZEBO_WORLD_CAMERA_DEFAULTS.x),
    y: numberOption(options.y, GAZEBO_WORLD_CAMERA_DEFAULTS.y),
    z: numberOption(options.z, GAZEBO_WORLD_CAMERA_DEFAULTS.z),
    rollDegrees: numberOption(options.rollDegrees, GAZEBO_WORLD_CAMERA_DEFAULTS.rollDegrees),
    pitchDegrees: numberOption(options.pitchDegrees, GAZEBO_WORLD_CAMERA_DEFAULTS.pitchDegrees),
    yawDegrees: numberOption(options.yawDegrees, GAZEBO_WORLD_CAMERA_DEFAULTS.yawDegrees),
    edgeUrl: stringOption(options.edgeUrl, GAZEBO_WORLD_CAMERA_DEFAULTS.edgeUrl),
    sourceId: stringOption(options.sourceId, GAZEBO_WORLD_CAMERA_DEFAULTS.sourceId),
    iceServerUrls: stringOption(options.iceServerUrls, ''),
    publicIPs: stringOption(options.publicIPs, ''),
  };
}

export function validateGazeboWorldCameraOptions(options: Record<string,unknown>) {
  const issue=validateGazeboWorldCameraOptionsIssue(options);
  return issue ? cameraValidationIssueMessage(issue) : '';
}

export function validateGazeboWorldCameraOptionsIssue(
  options: Record<string,unknown>,
): CameraValidationIssue | undefined {
  const value = gazeboWorldCameraOptions(options);
  const poseIssue=validateGazeboWorldCameraPoseIssue(value);
  if (poseIssue) return poseIssue;
  let normalized:string;
  try {
    normalized=normalizeMediaEdgeURL(value.edgeUrl);
  } catch {
    return { code:'media-edge-url-invalid' };
  }
  const url=new URL(normalized);
  if (url.protocol !== 'http:') return { code:'managed-direct-media-edge-http-required' };
  if (!url.port) return { code:'media-edge-explicit-port-required' };
  const port=Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { code:'media-edge-port-invalid' };
  }
  if (mediaSourceID(value.sourceId) !== value.sourceId) {
    return { code:'world-camera-source-id-invalid' };
  }
  return undefined;
}

export function gazeboWorldCameraRunParameters(
  options: Record<string,unknown>,
  browserOrigin: string,
) {
  const value = gazeboWorldCameraOptions(options);
  const issue=validateGazeboWorldCameraOptionsIssue(options);
  if (issue) throw new Error(cameraValidationIssueMessage(issue));
  const endpoint = directEdgeEndpoint(value.edgeUrl);
  return {
    x: value.x,y: value.y,z: value.z,
    roll: degreesToRadians(value.rollDegrees),
    pitch: degreesToRadians(value.pitchDegrees),
    yaw: degreesToRadians(value.yawDegrees),
    controlPort: endpoint.port,
    mediaEdgeAddress: localMediaEdgeURLForPort(endpoint.port),
    mediaSourceId: value.sourceId,
    allowedOrigins: normalizeBrowserOrigin(browserOrigin),
    iceServerUrls: value.iceServerUrls,
    publicIPs: value.publicIPs,
  };
}

function directEdgeEndpoint(value: string) {
  const normalized = normalizeMediaEdgeURL(value);
  const url = new URL(normalized);
  if (url.protocol !== 'http:') {
    throw new Error('Managed direct Media Edge URL must use HTTP; place HTTPS termination in front of a separately configured Edge.');
  }
  if (!url.port) throw new Error('Media Edge URL must include its explicit control port.');
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Media Edge URL contains an invalid port.');
  return { url: normalized,port };
}

function normalizeBrowserOrigin(value: string) {
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('The WebUI origin must use HTTP or HTTPS.');
  return url.origin;
}

function stringOption(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function numberOption(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback;
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function cameraAttitudeTowardOrigin(position: { x:number;y:number;z:number }) {
  const horizontalDistance = Math.hypot(position.x, position.y);
  return {
    rollDegrees:0,
    // Gazebo rotates the camera's +X forward axis toward -Z for positive pitch.
    pitchDegrees:Math.atan2(position.z, horizontalDistance) * 180 / Math.PI,
    yawDegrees:Math.atan2(-position.y, -position.x) * 180 / Math.PI,
  };
}
