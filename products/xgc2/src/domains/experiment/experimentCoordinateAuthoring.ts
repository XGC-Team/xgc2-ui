import { getRunRobots,type RunRobot } from '../robot/robotPublic';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';
import {
  currentCanonicalPoseForBinding,
  type CanonicalRobotPose,
} from './experimentInitialPoseFill';
import type { ExperimentLocalizationOffset,ExperimentRobotBinding } from './experimentModel';
import { getExperimentAtCommit } from './experimentService';

export type ExperimentCoordinatePosition = { x:number;y:number;z:number };

export type ExperimentCoordinateSample = {
  bindingId:string;
  robotAssetId:string;
  namespace:string;
  name:string;
  /** Current world coordinates, including the offset frozen for this Session. */
  pose:CanonicalRobotPose;
  /** Physical tracking coordinates before that frozen offset was applied. */
  rawPosition?:ExperimentCoordinatePosition;
  physical:boolean;
  /** Earliest Core deadline for online authority and the sampled pose. */
  expiresAt:number;
};

export type ExperimentCoordinateSamples = {
  targetId:string;
  runId:string;
  experimentResourceId:string;
  experimentCommitId:string;
  /** When this exact projection was read; only use for its captured preview. */
  capturedAt:number;
  frozenOffset?:ExperimentLocalizationOffset;
  samples:ExperimentCoordinateSample[];
  originUnavailableReason?:string;
};

/**
 * The caller supplies the exact active Session member Run and its frozen run
 * mode. This reader never infers a physical source from an editable draft.
 */
export async function loadExperimentCoordinateSamples({
  targetId,runId,experimentResourceId,bindings,runMode,expectedCommitId,composition,signal,
}: {
  targetId:string;
  runId:string;
  experimentResourceId:string;
  bindings:readonly ExperimentRobotBinding[];
  runMode:string;
  expectedCommitId?:string;
  composition?:RobotAssetKindComposition;
  signal?:AbortSignal;
}):Promise<ExperimentCoordinateSamples> {
  const initialProjection = await getRunRobots(targetId,runId,signal);
  signal?.throwIfAborted();
  if (initialProjection.pending || initialProjection.experimentResourceId !== experimentResourceId
    || (expectedCommitId !== undefined && initialProjection.experimentCommitId !== expectedCommitId)) {
    throw new Error('The Robot samples do not belong to the selected Experiment Session.');
  }
  let frozenOffset:ExperimentLocalizationOffset | undefined;
  let originUnavailableReason:string | undefined;
  try {
    const frozen = await getExperimentAtCommit(
      experimentResourceId,initialProjection.experimentCommitId,signal,composition,
    );
    signal?.throwIfAborted();
    if (frozen.head.resourceId !== experimentResourceId
      || frozen.branch.headCommitId !== initialProjection.experimentCommitId) {
      throw new Error('The frozen Experiment configuration does not match the Robot samples.');
    }
    frozenOffset = { ...frozen.spec.localizationOffset };
  } catch (cause) {
    signal?.throwIfAborted();
    originUnavailableReason = cause instanceof Error ? cause.message : String(cause);
  }
  if (!['physical','simulation','hybrid'].includes(runMode)) {
    originUnavailableReason = 'This Session does not declare a supported physical tracking source.';
  }
  // Immutable document reads can outlast a pose's short freshness deadline.
  // Sample only after that lookup, while keeping its exact frozen identity.
  const projection = await getRunRobots(targetId,runId,signal);
  signal?.throwIfAborted();
  if (projection.pending || projection.experimentResourceId !== experimentResourceId
    || projection.experimentCommitId !== initialProjection.experimentCommitId) {
    throw new Error('The Robot samples do not belong to the selected Experiment Session.');
  }
  const capturedAt = Date.now();
  const samples = bindings.flatMap((binding):ExperimentCoordinateSample[] => {
    const matches = projection.robots.filter((robot) => robot.id === binding.id);
    if (matches.length !== 1) return [];
    const robot = matches[0]!;
    if (robot.robotAssetId !== binding.ref.resourceId || robot.namespace !== binding.namespace) return [];
    const channel = canonicalPoseChannel(binding,robot);
    const expiresAt = Math.min(Date.parse(robot.onlineUntil ?? ''),Date.parse(channel?.staleAt ?? ''));
    if (!robot.online || robot.connectionState !== 'live'
      || !channel || channel.stale || !Number.isFinite(expiresAt) || expiresAt <= capturedAt) return [];
    const pose = currentCanonicalPoseForBinding(binding,[robot]);
    if (!pose) return [];
    const physical = runMode === 'physical' || (runMode === 'hybrid' && robot.hybridSource === 'physical');
    const rawPosition = physical && frozenOffset ? {
      x:pose.x - frozenOffset.x,
      y:pose.y - frozenOffset.y,
      z:pose.z - frozenOffset.z,
    } : undefined;
    return [{
      bindingId:binding.id,robotAssetId:robot.robotAssetId,namespace:robot.namespace,
      name:robot.name,pose,rawPosition,physical,expiresAt,
    }];
  });
  return {
    targetId,runId,experimentResourceId,experimentCommitId:projection.experimentCommitId,capturedAt,
    frozenOffset,samples,originUnavailableReason,
  };
}

/** Center selected physical trackers without applying an edited offset twice. */
export function computeExperimentWorldOrigin(
  samples:readonly ExperimentCoordinateSample[],
  selectedBindingIds:readonly string[],
  now = Date.now(),
):{ rawOrigin:ExperimentCoordinatePosition;offset:ExperimentLocalizationOffset;sampleIds:string[] } {
  const selected = selectedSamples(samples,selectedBindingIds,now);
  if (selected.some((sample) => !sample.physical || !sample.rawPosition)) {
    throw new Error('Select physical Robots with a current tracking position and a frozen world origin.');
  }
  const rawOrigin = selected.reduce((center,sample) => ({
    x:center.x + sample.rawPosition!.x / selected.length,
    y:center.y + sample.rawPosition!.y / selected.length,
    z:center.z + sample.rawPosition!.z / selected.length,
  }),{ x:0,y:0,z:0 });
  if (![rawOrigin.x,rawOrigin.y,rawOrigin.z].every(Number.isFinite)) {
    throw new Error('The selected tracking positions do not form a finite world origin.');
  }
  return {
    rawOrigin,
    offset:{ x:-rawOrigin.x || 0,y:-rawOrigin.y || 0,z:-rawOrigin.z || 0 },
    sampleIds:selected.map((sample) => sample.bindingId),
  };
}

/** Keep each slot's authored height while copying selected current XY/yaw. */
export function computeExperimentSimulationInitialPoses(
  bindings:readonly ExperimentRobotBinding[],
  samples:readonly ExperimentCoordinateSample[],
  selectedBindingIds:readonly string[],
  now = Date.now(),
):ExperimentRobotBinding[] {
  const selected = selectedSamples(samples,selectedBindingIds,now);
  for (const sample of selected) {
    const binding = bindings.find((item) => item.id === sample.bindingId);
    if (!binding || binding.ref.resourceId !== sample.robotAssetId || binding.namespace !== sample.namespace) {
      throw new Error('The Experiment Robot assignment changed after its position was sampled.');
    }
  }
  const selectedById = new Map(selected.map((sample) => [sample.bindingId,sample]));
  return bindings.map((binding) => {
    const sample = selectedById.get(binding.id);
    return sample ? {
      ...binding,
      initialPose:{ ...binding.initialPose,x:sample.pose.x,y:sample.pose.y,yaw:sample.pose.yaw },
    } : binding;
  });
}

function canonicalPoseChannel(binding:ExperimentRobotBinding,robot:RunRobot) {
  if (binding.px4) return robot.channels['state.mocap.pose'];
  if (binding.scout || binding.mecanum) return robot.channels['vrpn.position'];
  return undefined;
}

function selectedSamples(
  samples:readonly ExperimentCoordinateSample[],selectedBindingIds:readonly string[],now:number,
) {
  const selectedIds = [...new Set(selectedBindingIds)];
  if (selectedIds.length === 0) throw new Error('Select at least one Robot position.');
  return selectedIds.map((id) => {
    const matches = samples.filter((sample) => sample.bindingId === id);
    if (matches.length !== 1 || !Number.isFinite(matches[0]!.expiresAt) || matches[0]!.expiresAt <= now) {
      throw new Error('A selected Robot position is unavailable or expired. Refresh the positions.');
    }
    return matches[0]!;
  });
}
