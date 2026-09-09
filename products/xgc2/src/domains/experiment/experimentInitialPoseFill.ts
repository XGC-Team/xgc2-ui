import type { RunRobot } from '../robot/robotPublic';
import type { ExperimentLocalizationOffset,ExperimentRobotBinding } from './experimentModel';

export type CanonicalRobotPose = { x:number;y:number;z:number;yaw:number };

export type ExperimentInitialPoseFillResult = {
  bindings: ExperimentRobotBinding[];
  filled: number;
  skipped: number;
};

/** Copy Go's source-aware canonical Robot pose into one slot's simulation XY/yaw. */
export function fillExperimentInitialPoseFromCurrentRobot(
  bindings: readonly ExperimentRobotBinding[],
  bindingId: string,
  robots: readonly RunRobot[],
): ExperimentInitialPoseFillResult {
  const target = bindings.find((binding) => binding.id === bindingId);
  if (!target) return { bindings:[...bindings],filled:0,skipped:1 };
  const pose = currentCanonicalPoseForBinding(target,robots);
  if (!pose) {
    return { bindings:[...bindings],filled:0,skipped:1 };
  }
  return {
    bindings: bindings.map((binding) => binding.id === bindingId ? {
      ...binding,
      initialPose:{ ...binding.initialPose,x:pose.x,y:pose.y,yaw:pose.yaw },
    } : binding),
    filled:1,
    skipped:0,
  };
}

/** Copy Go's source-aware canonical Robot poses into simulation XY/yaw drafts. */
export function fillExperimentInitialPosesFromCurrentRobots(
  bindings: readonly ExperimentRobotBinding[],
  robots: readonly RunRobot[],
): ExperimentInitialPoseFillResult {
  let filled = 0;
  const next = bindings.map((binding) => {
    const pose = currentCanonicalPoseForBinding(binding,robots);
    if (!pose) return binding;
    filled += 1;
    return {
      ...binding,
      initialPose: {
        ...binding.initialPose,
        x:pose.x,
        y:pose.y,
        yaw:pose.yaw,
      },
    };
  });
  return { bindings:next,filled,skipped:bindings.length-filled };
}

export function currentCanonicalPoseForBinding(
  binding: ExperimentRobotBinding,
  robots: readonly RunRobot[],
): CanonicalRobotPose | undefined {
  const robot = robots.find((item) => item.id === binding.id);
  if (!robot
    || robot.robotAssetId !== binding.ref.resourceId
    || robot.namespace !== binding.namespace) return undefined;
  const channel = binding.px4
    ? robot.channels['state.mocap.pose']
    : binding.scout || binding.mecanum
      ? robot.channels['vrpn.position']
      : undefined;
  return canonicalPose(channel?.value);
}

/** Shift Experiment origin so this Robot's current canonical pose lands at 0. */
export function worldOriginOffsetFromCurrentRobotPose(
  currentOffset: ExperimentLocalizationOffset,
  pose: CanonicalRobotPose,
): ExperimentLocalizationOffset {
  return {
    x: currentOffset.x - pose.x,
    y: currentOffset.y - pose.y,
    z: currentOffset.z - pose.z,
  };
}

export function experimentRobotBindingsChangeOnlyInitialXYYaw(
  current:readonly ExperimentRobotBinding[],
  next:readonly ExperimentRobotBinding[],
) {
  if (current.length!==next.length) return false;
  let changed=false;
  const valid=current.every((binding,index) => {
    const candidate=next[index];
    if (!candidate || binding.initialPose.z!==candidate.initialPose.z) return false;
    if (
      binding.initialPose.x!==candidate.initialPose.x
      || binding.initialPose.y!==candidate.initialPose.y
      || binding.initialPose.yaw!==candidate.initialPose.yaw
    ) changed=true;
    return JSON.stringify(binding)===JSON.stringify({
      ...candidate,
      initialPose:{
        ...candidate.initialPose,
        x:binding.initialPose.x,
        y:binding.initialPose.y,
        yaw:binding.initialPose.yaw,
      },
    });
  });
  return valid && changed;
}

function canonicalPose(value:unknown):CanonicalRobotPose|undefined {
  const record = objectValue(value);
  const position = objectValue(record?.position);
  const orientation = objectValue(record?.orientation);
  const x = finiteNumber(position?.x);
  const y = finiteNumber(position?.y);
  const z = finiteNumber(position?.z);
  const qx = finiteNumber(orientation?.x);
  const qy = finiteNumber(orientation?.y);
  const qz = finiteNumber(orientation?.z);
  const qw = finiteNumber(orientation?.w);
  if (x == null || y == null || z == null || qx == null || qy == null || qz == null || qw == null) {
    return undefined;
  }
  const norm = Math.hypot(qx,qy,qz,qw);
  if (!Number.isFinite(norm) || norm < 1e-12) return undefined;
  const nx=qx/norm,ny=qy/norm,nz=qz/norm,nw=qw/norm;
  const yaw = Math.atan2(2*(nw*nz+nx*ny),1-2*(ny*ny+nz*nz));
  return Number.isFinite(yaw) ? { x,y,z,yaw } : undefined;
}

function objectValue(value:unknown):Record<string,unknown>|undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string,unknown>
    : undefined;
}

function finiteNumber(value:unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
