import { GAZEBO_WORLD_CAMERA_DEFAULTS } from './gazeboWorldCameraPanelModel';
import {
  degreesToRadians,
  radiansToDegrees,
  type GazeboWorldCameraPose,
} from './gazeboWorldCameraPoseModel';

export type WorldCameraPoseSource = 'authored' | 'file';

export type WorldCameraIntrinsicSelection = {
  simulationIntrinsicFile: string;
  physicalIntrinsicFile: string;
  simulationPoseSource: WorldCameraPoseSource;
  simulationExtrinsicFile: string;
  calibrationRoot: string;
  cameraName: string;
};

/** Read the operator-owned YAML paths from the world-camera Action schema. */
export function worldCameraIntrinsicSelection(inputs: Record<string, unknown>): WorldCameraIntrinsicSelection {
  return {
    simulationIntrinsicFile: typeof inputs.simulationIntrinsicFile === 'string' ? inputs.simulationIntrinsicFile : '',
    physicalIntrinsicFile: typeof inputs.physicalIntrinsicFile === 'string' ? inputs.physicalIntrinsicFile : '',
    simulationPoseSource: inputs.simulationPoseSource === 'file' ? 'file' : 'authored',
    simulationExtrinsicFile: typeof inputs.simulationExtrinsicFile === 'string' ? inputs.simulationExtrinsicFile : '',
    calibrationRoot: typeof inputs.calibrationRoot === 'string' ? inputs.calibrationRoot : '',
    cameraName: typeof inputs.cameraName === 'string' && inputs.cameraName ? inputs.cameraName : 'usb_cam',
  };
}

/** Write the two optional timestamped YAML selections back to the flat Action schema. */
export function withWorldCameraIntrinsicSelection(
  inputs: Record<string, unknown>,
  next: {
    simulationIntrinsicFile: string;
    physicalIntrinsicFile: string;
    simulationPoseSource?: WorldCameraPoseSource;
    simulationExtrinsicFile?: string;
  },
): Record<string, unknown> {
  return {
    ...inputs,
    simulationIntrinsicFile: next.simulationIntrinsicFile,
    physicalIntrinsicFile: next.physicalIntrinsicFile,
    simulationPoseSource: next.simulationPoseSource ?? worldCameraIntrinsicSelection(inputs).simulationPoseSource,
    simulationExtrinsicFile: next.simulationExtrinsicFile
      ?? worldCameraIntrinsicSelection(inputs).simulationExtrinsicFile,
  };
}

export function worldCameraIntrinsicPartitionPath(
  calibrationRoot: string,
  mode: 'sim' | 'phy',
  cameraName: string,
): string {
  const root = calibrationRoot.replace(/\/+$/, '');
  if (!root) return '';
  return `${root}/${mode}/${cameraName}`;
}

/** UI admission; the backend still resolves symlinks and enforces the partition. */
export function worldCameraIntrinsicPathMatches(path:string,root:string,mode:'sim'|'phy',cameraName:string):boolean {
  if (!path) return true;
  const directory=worldCameraIntrinsicPartitionPath(root,mode,cameraName);
  if (!directory.startsWith('/') || !path.startsWith(`${directory}/`)) return false;
  const leaf=path.slice(directory.length+1);
  return /^intrinsics-\d{8}T\d{6}(?:\.\d+)?Z(?:-\d{2})?\.yaml$/.test(leaf);
}

/** Spawn pose YAML may come from the sim or phy camera partition. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Operator-facing authored spawn pose. Action angles are radians; the form uses degrees. */
export function worldCameraAuthoredPose(
  inputs: Record<string, unknown>,
  options: Record<string, unknown> = {},
): GazeboWorldCameraPose {
  const defaults = GAZEBO_WORLD_CAMERA_DEFAULTS;
  const roll = finiteNumber(inputs.roll);
  const pitch = finiteNumber(inputs.pitch);
  const yaw = finiteNumber(inputs.yaw);
  return {
    x: finiteNumber(inputs.x) ?? finiteNumber(options.x) ?? defaults.x,
    y: finiteNumber(inputs.y) ?? finiteNumber(options.y) ?? defaults.y,
    z: finiteNumber(inputs.z) ?? finiteNumber(options.z) ?? defaults.z,
    rollDegrees: roll !== undefined ? radiansToDegrees(roll)
      : finiteNumber(options.rollDegrees) ?? defaults.rollDegrees,
    pitchDegrees: pitch !== undefined ? radiansToDegrees(pitch)
      : finiteNumber(options.pitchDegrees) ?? defaults.pitchDegrees,
    yawDegrees: yaw !== undefined ? radiansToDegrees(yaw)
      : finiteNumber(options.yawDegrees) ?? defaults.yawDegrees,
  };
}

export function worldCameraAuthoredPoseActionInputs(pose: GazeboWorldCameraPose): Record<string, number> {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    roll: degreesToRadians(pose.rollDegrees),
    pitch: degreesToRadians(pose.pitchDegrees),
    yaw: degreesToRadians(pose.yawDegrees),
  };
}

export function worldCameraAuthoredPoseOptions(pose: GazeboWorldCameraPose): Record<string, number> {
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    rollDegrees: pose.rollDegrees,
    pitchDegrees: pose.pitchDegrees,
    yawDegrees: pose.yawDegrees,
  };
}

export function worldCameraExtrinsicPathMatches(path:string,root:string,cameraName:string):boolean {
  if (!path) return true;
  return (['sim','phy'] as const).some((mode) => {
    const directory=worldCameraIntrinsicPartitionPath(root,mode,cameraName);
    if (!directory.startsWith('/') || !path.startsWith(`${directory}/`)) return false;
    return /^extrinsics-\d{8}T\d{6}(?:\.\d+)?Z(?:-\d{2})?\.yaml$/.test(path.slice(directory.length+1));
  });
}
