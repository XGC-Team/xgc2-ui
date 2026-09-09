import {
  isContributedRobotAsset,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  robotAssetExperimentDisabledReason,
  robotAssetProtocolKind,
  type RobotAssetDocument,
  type RobotAssetKindComposition,
} from '../robot/robotAssetPublic';
import type { ExperimentRobotBinding } from './experimentModel';

/**
 * Creates one logical slot for an explicitly selected physical Robot. The
 * defaults live in one place so callers and tests cannot drift apart.
 * Asset-only / unknown kinds are refused via generic robot admission metadata.
 */
export function newExperimentRobotBinding(
  robot: RobotAssetDocument,
  existing: readonly ExperimentRobotBinding[],
  composition?: RobotAssetKindComposition,
): ExperimentRobotBinding {
  assertExperimentRobotAssetSupported(robot, composition);
  const contributed = contributedBindingAdapter(robot, composition);
  const slotPrefix = isPX4RobotAsset(robot)
    ? 'px4'
    : contributed?.authoring.slotIdPrefix ?? 'ugv';
  const sequence = nextSlotSequence(existing,slotPrefix);
  const namespacePrefix = contributed?.authoring.namespacePrefix
    ?? (slotPrefix === 'px4' ? 'uav' : 'ugv');
  return experimentRobotBindingForAssetKind({
    id: `${slotPrefix}-${String(sequence).padStart(2,'0')}`,
    ref: { domain: 'robot',resourceId: robot.head.resourceId,branch: robot.branch.name },
    namespace: `/${namespacePrefix}${sequence}`,
    hybridSource: 'physical',
    runtimeParameters: {},
    initialPose: {
      x: existing.length * 2,
      y: 0,
      z: contributed?.authoring.initialPoseZ ?? (!isMecanumRobotAsset(robot) && !isPX4RobotAsset(robot) ? 0.181 : 0),
      yaw: 0,
    },
  },robot,composition);
}

/** Stable group identity for a sequential Experiment slot family. */
export function experimentRobotSlotGroup(binding: Pick<ExperimentRobotBinding,'id'>) {
  return /^(.*?)-(\d+)$/.exec(binding.id)?.[1] ?? binding.id;
}

/**
 * Reorders physical assignments inside one slot family while preserving every
 * slot-owned Experiment field at its authored position.
 */
export function reorderExperimentRobotAssets(
  bindings: readonly ExperimentRobotBinding[],
  assets: readonly RobotAssetDocument[],
  fromIndex: number,
  toIndex: number,
  composition?: RobotAssetKindComposition,
) {
  if (fromIndex < 0 || fromIndex >= bindings.length
    || toIndex < 0 || toIndex >= bindings.length || fromIndex === toIndex) return [...bindings];
  const source = bindings[fromIndex]!;
  if (experimentRobotSlotGroup(source) !== experimentRobotSlotGroup(bindings[toIndex]!)) {
    return [...bindings];
  }
  const groupIndexes = bindings.flatMap((binding,index) => (
    experimentRobotSlotGroup(binding) === experimentRobotSlotGroup(source) ? [index] : []
  ));
  const sourcePosition = groupIndexes.indexOf(fromIndex);
  const targetPosition = groupIndexes.indexOf(toIndex);
  if (sourcePosition < 0 || targetPosition < 0) return [...bindings];
  const assignments = groupIndexes.map((index) => assetForBinding(bindings[index]!,assets));
  if (assignments.some((asset) => !asset)) return [...bindings];
  const [moved] = assignments.splice(sourcePosition,1);
  assignments.splice(targetPosition,0,moved!);
  const next = [...bindings];
  groupIndexes.forEach((slotIndex,position) => {
    next[slotIndex] = replaceExperimentRobotBindingAsset(
      bindings[slotIndex]!,assignments[position]!,composition,
    );
  });
  return next;
}

/** Removes one physical assignment and compacts its slot family without gaps. */
export function removeExperimentRobotAsset(
  bindings: readonly ExperimentRobotBinding[],
  assets: readonly RobotAssetDocument[],
  removeIndex: number,
  composition?: RobotAssetKindComposition,
) {
  const removing = bindings[removeIndex];
  if (!removing) return [...bindings];
  const group = experimentRobotSlotGroup(removing);
  const groupIndexes = bindings.flatMap((binding,index) => (
    experimentRobotSlotGroup(binding) === group ? [index] : []
  ));
  const remainingAssignments = groupIndexes
    .filter((index) => index !== removeIndex)
    .map((index) => assetForBinding(bindings[index]!,assets));
  if (remainingAssignments.some((asset) => !asset)) return [...bindings];
  const droppedSlotIndex = groupIndexes.at(-1)!;
  const next = [...bindings];
  groupIndexes.slice(0,-1).forEach((slotIndex,position) => {
    next[slotIndex] = replaceExperimentRobotBindingAsset(
      bindings[slotIndex]!,remainingAssignments[position]!,composition,
    );
  });
  next.splice(droppedSlotIndex,1);
  return next;
}

/**
 * Rebinds a logical slot without rewriting its authored identity, namespace,
 * pose, Hybrid source, or runtime parameters. Only kind-specific overrides change.
 */
export function replaceExperimentRobotBindingAsset(
  binding: ExperimentRobotBinding,
  robot: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
): ExperimentRobotBinding {
  assertExperimentRobotAssetSupported(robot, composition);
  return experimentRobotBindingForAssetKind({
    ...binding,
    ref: { domain: 'robot',resourceId: robot.head.resourceId,branch: robot.branch.name },
  },robot,composition);
}

/** True when the next bindings add, remove, replace, or reorder physical assignments. */
export function experimentRobotBindingsChangeRoster(
  current: readonly ExperimentRobotBinding[],
  next: readonly ExperimentRobotBinding[],
) {
  if (current.length !== next.length) return true;
  return current.some((binding, index) => {
    const candidate = next[index];
    return !candidate
      || binding.id !== candidate.id
      || binding.ref.resourceId !== candidate.ref.resourceId
      || binding.ref.branch !== candidate.ref.branch;
  });
}

/**
 * Empty when the robot may bind into Experiment; otherwise the contribution-
 * owned refusal reason from robot admission (kind-agnostic for Experiment code).
 */
export function experimentRobotAssetDisabledReason(
  robot: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
) {
  return robotAssetExperimentDisabledReason(robot, composition);
}

function assertExperimentRobotAssetSupported(
  robot: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
) {
  const reason = experimentRobotAssetDisabledReason(robot, composition);
  if (reason) throw new Error(reason);
}

function experimentRobotBindingForAssetKind(
  binding: ExperimentRobotBinding,
  robot: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
): ExperimentRobotBinding {
  // Drop any previous kind marker; exactly one arm must match the new asset.
  const {
    px4: _oldPX4,
    scout: _oldScout,
    mecanum: _oldMecanum,
    ...base
  } = binding;
  for (const wireArm of composition?.experimentBindingArms ?? []) {
    delete base[wireArm];
  }
  if (isPX4RobotAsset(robot)) {
    return {
      ...base,
      // Kind marker only — Robot asset owns ports and MAV identity.
      px4: {},
    };
  }
  if (isMecanumRobotAsset(robot)) {
    return {
      ...base,
      // Empty kind marker only — Robot asset owns physical UGV transport.
      mecanum: {},
    };
  }
  const contributed = contributedBindingAdapter(robot, composition);
  if (contributed) {
    return {
      ...base,
      [contributed.wireArm]: contributed.authoring.emptySettings(),
    };
  }
  return {
    ...base,
    scout: binding.scout ?? {
      lidarSimulationEnabled: false,
      imageSimulationEnabled: false,
    },
  };
}

function contributedBindingAdapter(
  robot: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
) {
  if (!isContributedRobotAsset(robot)) return undefined;
  return composition
    ?.contributionByProtocolKind(robotAssetProtocolKind(robot))
    ?.experimentBinding;
}

function nextSlotSequence(bindings: readonly ExperimentRobotBinding[],prefix: string) {
  const used = new Set(bindings.flatMap((binding) => {
    if (experimentRobotSlotGroup(binding) !== prefix) return [];
    const match = /-(\d+)$/.exec(binding.id);
    return match ? [Number(match[1])] : [];
  }));
  let sequence = 1;
  while (used.has(sequence)) sequence += 1;
  return sequence;
}

function assetForBinding(
  binding: ExperimentRobotBinding,
  assets: readonly RobotAssetDocument[],
) {
  return assets.find((asset) => asset.head.resourceId === binding.ref.resourceId);
}
