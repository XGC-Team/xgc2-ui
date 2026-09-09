/**
 * Static leaf owner contracts for Unitree B2 Robot.Asset.
 *
 * Frozen wire identity:
 * - kind = unitree_b2
 * - profileId = unitree.b2.v1
 * - payload arm = unitreeB2 with serialNumber, robotAddress, rosDomainId,
 *   sshUsername, sshPassword
 *
 * B2: inventory pin + Experiment physical projection for instruments/adapter.
 * No simulation product, no agent/trust/endpoint or manipulator fields.
 * Companion SSH is present so Terminal can quick-connect like PX4/Scout.
 */

import { defineContributedRobotAssetKind } from '../../robotAssetKindComposition';

export const UNITREE_B2_KIND = defineContributedRobotAssetKind('unitree_b2');
export const UNITREE_B2_PROFILE_ID = 'unitree.b2.v1' as const;
/** UI / catalog folder id (camelCase). Distinct from protocol kind. */
export const UNITREE_B2_CATALOG_KIND = 'unitreeB2' as const;
export const UNITREE_B2_LABEL = 'Unitree B2';
/** Wire JSON arm name for the inventory facts. */
export const UNITREE_B2_WIRE_ARM = 'unitreeB2' as const;

/** Inclusive ROS 2 domain range owned by this leaf. */
export const UNITREE_B2_ROS_DOMAIN_ID_MIN = 0;
export const UNITREE_B2_ROS_DOMAIN_ID_MAX = 232;

/** Exact inventory payload; all five fields must be explicitly present on write. */
export type UnitreeB2InventoryPayload = {
  serialNumber: string;
  robotAddress: string;
  /** Inclusive ROS 2 domain 0..232. */
  rosDomainId: number;
  sshUsername: string;
  sshPassword: string;
};

export const UNITREE_B2_PAYLOAD_FIELDS = [
  'serialNumber',
  'robotAddress',
  'rosDomainId',
  'sshUsername',
  'sshPassword',
] as const;

type RobotAssetSpecBase = {
  name: string;
  description: string;
  tags: string[];
  profileId: string;
};

/**
 * Unitree B2 pin: serial number, network address (IP or hostname), ROS domain
 * ID, and companion SSH. No agent/trust/endpoint, manipulator, simulation, or runtime.
 */
export type UnitreeB2RobotAssetSpec = RobotAssetSpecBase & {
  kind: 'unitree_b2';
  unitreeB2: UnitreeB2InventoryPayload;
  px4?: never;
  scout?: never;
  mecanum?: never;
  // Structural conformance with shared ContributedRobotAssetSpec.
  [leafPayloadArm: string]: unknown;
};

declare module '../../robotAssetKindComposition' {
  interface ContributedRobotAssetSpecRegistry {
    unitree_b2: UnitreeB2RobotAssetSpec;
  }
}

/** Narrow kind or document/spec carrier to the B2 leaf. */
export function isUnitreeB2RobotAsset(
  value: { kind: string } | { spec: { kind: string } },
): value is UnitreeB2RobotAssetSpec | { spec: UnitreeB2RobotAssetSpec } {
  return ('spec' in value ? value.spec.kind : value.kind) === UNITREE_B2_KIND;
}

export function isUnitreeB2Kind(kind: string): kind is typeof UNITREE_B2_KIND {
  return kind === UNITREE_B2_KIND;
}
