import { getRunRobots,type RunRobot } from '../robot/robotPublic';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';
import {
  canonicalPose,
  type CanonicalRobotPose,
} from './experimentInitialPoseFill';
import type { ExperimentLocalizationOffset,ExperimentRobotBinding } from './experimentModel';
import { getExperimentAtCommit,getExperimentSessionROS1Poses } from './experimentService';

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
  /** Receipt time of this direct ROS subscription. Filling a pose rejects an expired receipt. */
  observedAt:string;
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

/** Read fresh poses from this Session's owned VRPN Processes, independently of Robot connections. */
export async function loadExperimentCoordinateSamples({
  targetId,runId,experimentResourceId,bindings,runMode,expectedCommitId,expectedDigest,sessionId,robotRunIds = [],composition,signal,
}: {
  targetId:string;
  runId:string;
  experimentResourceId:string;
  bindings:readonly ExperimentRobotBinding[];
  runMode:string;
  expectedCommitId:string;
  expectedDigest:string;
  sessionId:string;
  robotRunIds?:readonly string[];
  composition?:RobotAssetKindComposition;
  signal?:AbortSignal;
}):Promise<ExperimentCoordinateSamples> {
  if (!expectedCommitId || !expectedDigest || !['physical','simulation','hybrid'].includes(runMode)) {
    throw new Error('The selected Experiment Session has no frozen tracking configuration.');
  }
  const frozen = await getExperimentAtCommit(experimentResourceId,expectedCommitId,signal,composition);
  signal?.throwIfAborted();
  if (frozen.head.resourceId !== experimentResourceId || frozen.head.digest !== expectedDigest) {
    throw new Error('The frozen Experiment configuration does not match the selected Session.');
  }
  const frozenOffset = { ...frozen.spec.localizationOffset };
  const robots:RunRobot[] = [];
  const assignments = await Promise.allSettled([...new Set([runId,...robotRunIds])]
    .map((ownerId) => getRunRobots(targetId,ownerId,signal)));
  signal?.throwIfAborted();
  for (const assignment of assignments) {
    if (assignment.status !== 'fulfilled') continue;
    const projection = assignment.value;
    if (projection.pending) continue;
    if (projection.experimentResourceId !== experimentResourceId || projection.experimentCommitId !== expectedCommitId) {
      throw new Error('The Robot assignments do not belong to the selected Experiment Session.');
    }
    for (const robot of projection.robots) if (!robots.some((item) => item.id === robot.id)) robots.push(robot);
  }
  const current = await getExperimentSessionROS1Poses(targetId,sessionId,signal);
  if (current.sessionId !== sessionId || current.experimentCommitId !== expectedCommitId) {
    throw new Error('The tracking sources do not belong to the selected Experiment Session.');
  }
  signal?.throwIfAborted();
  const capturedAt = Date.now();
  const samples:ExperimentCoordinateSample[] = [];
  for (const snapshot of current.sources) {
    for (const raw of snapshot.samples) {
      const root = snapshot.roots.find((candidate) =>
        raw.topic === `${candidate}/pose` || raw.topic.startsWith(`${candidate}/`));
      if (!root || !raw.topic.endsWith('/pose')) continue;
      const rest = raw.topic.slice(root.length).replace(/^\//,'');
      const body = rest.endsWith('/pose') ? rest.slice(0,-'/pose'.length) : rest.slice(0,-'pose'.length);
      const namespaceName = root.replace(/^\//,'');
      const robotNamespacePose = body === '' || body === 'simulation/ground_truth';
      const physical = runMode === 'physical' || (runMode === 'hybrid' && root === '/vrpn_client_node_physical');
      const simVrpn = root === '/vrpn_client_node_simulation';
      if (runMode === 'hybrid' && !physical && !simVrpn && !robotNamespacePose) continue;
      if (!robotNamespacePose && (!body || body.includes('/'))) continue;
      const rawPose = canonicalPose(raw);
      if (!rawPose || !Number.isFinite(Date.parse(raw.observedAt))) continue;
      const assigned = robots.filter((robot) => {
        const isPhysical = runMode === 'physical' || (runMode === 'hybrid' && robot.hybridSource === 'physical');
        if (robotNamespacePose) {
          return !isPhysical && robot.namespace.replace(/^\//,'') === namespaceName;
        }
        const name = isPhysical ? robot.px4?.mocapRigidBodyName ?? robot.scout?.mocapRigidBodyName ?? robot.mecanum?.mocapRigidBodyName : robot.namespace.replace(/^\//,'');
        return isPhysical === physical && name === body;
      });
      const matched = assigned.filter((robot) => bindings.some((binding) => binding.id === robot.id
        && binding.ref.resourceId === robot.robotAssetId && binding.namespace === robot.namespace));
      const pose = physical ? { ...rawPose,x:rawPose.x+frozenOffset.x,y:rawPose.y+frozenOffset.y,z:rawPose.z+frozenOffset.z } : rawPose;
      const owners = matched.length ? matched : [undefined];
      for (const robot of owners) samples.push({
        bindingId:robot?.id ?? `${snapshot.instanceId}:${raw.topic}`,robotAssetId:robot?.robotAssetId ?? '',
        namespace:robot?.namespace ?? '',name:robot?.name ?? (robotNamespacePose ? namespaceName : body),pose,
        rawPosition:physical ? { ...raw.position } : undefined,physical,
        observedAt:raw.observedAt,
      });
    }
  }
  return { targetId,runId,experimentResourceId,experimentCommitId:expectedCommitId,capturedAt,frozenOffset,samples:preferCanonicalPoseSamples(samples) };
}

/** Center physical trackers in XY while preserving the authored world-origin height. */
export function computeExperimentWorldOrigin(
  samples:readonly ExperimentCoordinateSample[],
  selectedBindingIds:readonly string[],
  originZ:number,
):{ rawOrigin:ExperimentCoordinatePosition;offset:ExperimentLocalizationOffset;sampleIds:string[] } {
  const selected = selectedSamples(samples,selectedBindingIds);
  if (selected.some((sample) => !sample.physical || !sample.rawPosition)) {
    throw new Error('Select physical Robots with a current tracking position and a frozen world origin.');
  }
  const rawOrigin = selected.reduce((center,sample) => ({
    x:center.x + sample.rawPosition!.x / selected.length,
    y:center.y + sample.rawPosition!.y / selected.length,
    z:center.z,
  }),{ x:0,y:0,z:originZ });
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
  targetOffset:ExperimentLocalizationOffset,
):ExperimentRobotBinding[] {
  const selected = selectedSamples(samples,selectedBindingIds);
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
      initialPose:{ ...binding.initialPose,
        x:sample.rawPosition ? sample.rawPosition.x+targetOffset.x : sample.pose.x,
        y:sample.rawPosition ? sample.rawPosition.y+targetOffset.y : sample.pose.y,yaw:sample.pose.yaw },
    } : binding;
  });
}

function preferCanonicalPoseSamples(samples:readonly ExperimentCoordinateSample[]):ExperimentCoordinateSample[] {
  const rank = (sample:ExperimentCoordinateSample) => {
    if (!sample.physical && !sample.rawPosition) return 0;
    if (sample.physical) return 1;
    return 2;
  };
  const chosen = new Map<string,ExperimentCoordinateSample>();
  for (const sample of samples) {
    const current = chosen.get(sample.bindingId);
    if (!current || rank(sample) < rank(current)) chosen.set(sample.bindingId,sample);
  }
  return [...chosen.values()];
}

function selectedSamples(
  samples:readonly ExperimentCoordinateSample[],selectedBindingIds:readonly string[],
) {
  const selectedIds = [...new Set(selectedBindingIds)];
  if (selectedIds.length === 0) throw new Error('Select at least one Robot position.');
  return selectedIds.map((id) => {
    const matches = samples.filter((sample) => sample.bindingId === id);
    if (matches.length !== 1 || !Number.isFinite(Date.parse(matches[0]!.observedAt))) {
      throw new Error('A selected Robot position is unavailable or expired. Refresh the positions.');
    }
    return matches[0]!;
  });
}
