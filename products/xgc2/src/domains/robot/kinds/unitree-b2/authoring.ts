import {
  UNITREE_B2_KIND,
  UNITREE_B2_ROS_DOMAIN_ID_MAX,
  UNITREE_B2_ROS_DOMAIN_ID_MIN,
  type UnitreeB2InventoryPayload,
  type UnitreeB2RobotAssetSpec,
} from './contracts';

/** Trim string inventory facts; leave rosDomainId as authored integer. */
export function normalizeUnitreeB2Payload(
  payload: UnitreeB2InventoryPayload,
): UnitreeB2InventoryPayload {
  const robotAddress = payload.robotAddress.trim();
  return {
    // serialNumber is not operator-authored; always mirrors address.
    serialNumber: robotAddress,
    robotAddress,
    rosDomainId: payload.rosDomainId,
    sshUsername: payload.sshUsername.trim(),
    sshPassword: payload.sshPassword.trim(),
  };
}

/** Normalize base fields + B2 arm; preserves explicit kind constant. */
export function normalizeUnitreeB2RobotAssetSpec(
  spec: UnitreeB2RobotAssetSpec,
  common: {
    name: string;
    description: string;
    tags: string[];
    profileId: string;
  },
): UnitreeB2RobotAssetSpec {
  return {
    ...common,
    kind: UNITREE_B2_KIND,
    unitreeB2: normalizeUnitreeB2Payload(spec.unitreeB2),
  };
}

/**
 * Validate B2 inventory arm. Returns empty string when valid.
 *
 * Address, ROS domain and companion SSH are mandatory in the current epoch.
 */
export function validateUnitreeB2RobotAssetSpec(spec: UnitreeB2RobotAssetSpec): string {
  if (!spec.unitreeB2.robotAddress.trim()) {
    return 'Unitree B2 robotAddress is required.';
  }
  if (!Number.isInteger(spec.unitreeB2.rosDomainId)
    || spec.unitreeB2.rosDomainId < UNITREE_B2_ROS_DOMAIN_ID_MIN
    || spec.unitreeB2.rosDomainId > UNITREE_B2_ROS_DOMAIN_ID_MAX) {
    return `Unitree B2 rosDomainId must be between ${UNITREE_B2_ROS_DOMAIN_ID_MIN} and ${UNITREE_B2_ROS_DOMAIN_ID_MAX}.`;
  }
  if (!spec.unitreeB2.sshUsername.trim()) {
    return 'Unitree B2 sshUsername is required.';
  }
  if (!spec.unitreeB2.sshPassword.trim()) {
    return 'Unitree B2 sshPassword is required.';
  }
  return '';
}
