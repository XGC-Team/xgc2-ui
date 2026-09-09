import type { ExperimentRobotBinding } from './experimentModel';

type ExperimentRobotSlotOrder = {
  id: string;
  px4?: unknown;
  scout?: unknown;
  mecanum?: unknown;
};

const roleNameByBindingPrefix: Readonly<Record<string,string>> = {
  px4:'UAV',
  ugv:'UGV',
  scout:'UGV',
  mecanum:'UGV',
};

export function experimentRobotRoleLabel(binding: Pick<ExperimentRobotBinding,'id'>) {
  const match = /^([a-z][a-z0-9-]*)-(\d+)$/.exec(binding.id);
  if (!match) return binding.id;
  const roleName = roleNameByBindingPrefix[match[1]!];
  if (!roleName) return binding.id;
  return `${roleName}-${match[2]!.padStart(2,'0')}`;
}

export function experimentRobotAssignmentLabel(
  binding: Pick<ExperimentRobotBinding,'id'>,
  assetName: string,
) {
  const role = experimentRobotRoleLabel(binding);
  const asset = assetName.trim();
  return asset ? `${role} — ${asset}` : role;
}

/** Native Robot slots render and persist as one UAV cluster followed by one UGV cluster. */
export function compareExperimentRobotBindingSlots(
  left: ExperimentRobotSlotOrder,
  right: ExperimentRobotSlotOrder,
) {
  const rank = (binding: ExperimentRobotSlotOrder) => (
    binding.px4 ? 0 : binding.scout || binding.mecanum ? 1 : 2
  );
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  if (rank(left) > 1) return 0;
  return slotSequence(left.id) - slotSequence(right.id);
}

function slotSequence(id: string) {
  const sequence = /-(\d+)$/.exec(id)?.[1];
  return sequence ? Number(sequence) : Number.MAX_SAFE_INTEGER;
}
