import type {
  ConfigResourceBranch,
  ConfigResourceHead,
  ConfigResourceNamespace,
} from '../../shared/configResource';
import type { ContributedRobotAssetSpec } from './robotAssetKindComposition';

export const ROBOT_DOMAIN = 'robot';
export const PX4_MULTIROTOR_KIND = 'px4_multirotor';
export const PX4_MODEL_FS150 = 'fs150';
export const PX4_MODEL_MOCAP_ROTOR = 'mocap_rotor';
export const PX4_MOCAP_ROTOR_PROFILE_ID = 'px4.mocap-rotor.ros1.v1';
export const SCOUT_MINI_KIND = 'scout_mini';
export const MECANUM_UGV_KIND = 'mecanum_ugv';
export const DEFAULT_POSITIONING_FRAME_NUMBER = 5;
export const DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M = 1e-10;

export type { ContributedRobotAssetSpec };

export type RobotSimulationConfig = {
  productId: string;
  launchPackage: string;
  launchFile: string;
};

type RobotAssetSpecBase = {
  name: string;
  description: string;
  tags: string[];
  profileId: string;
};

export type PX4RobotAssetSpec = RobotAssetSpecBase & {
  kind: typeof PX4_MULTIROTOR_KIND;
  px4: {
    modelId: typeof PX4_MODEL_FS150 | typeof PX4_MODEL_MOCAP_ROTOR;
    mavSystemId: number;
    managementIp: string;
    sshUsername: string;
    sshPassword: string;
    mocapRigidBodyName: string;
    positioningFrameNumber?: number;
    positioningComparisonThresholdM?: number;
    /** Ground-station MAVROS bind port for physical FCU (owned by the Robot). */
    physicalMavrosLocalPort: number;
    /** Vehicle-side MAVLink UDP port reached by physical MAVROS. */
    physicalFcuRemotePort: number;
    /** Ground-station MAVROS bind port for SITL (owned by the Robot). */
    simulationLocalPort: number;
    /** SITL PX4 remote UDP port (owned by the Robot). */
    simulationRemotePort: number;
    simulation: RobotSimulationConfig;
  };
  scout?: never;
  mecanum?: never;
};

export function px4RobotModelId(spec: PX4RobotAssetSpec) {
  return spec.px4.modelId;
}

/** Shipped Scout physical connectors (Combobox allow-list). */
export const SCOUT_CONNECTORS = ['swarm_ros_bridge'] as const;
export type ScoutConnector = (typeof SCOUT_CONNECTORS)[number];
export const DEFAULT_SCOUT_CONNECTOR: ScoutConnector = 'swarm_ros_bridge';

export type ScoutRobotAssetSpec = RobotAssetSpecBase & {
  kind: typeof SCOUT_MINI_KIND;
  scout: {
    managementAddress: string;
    /** Physical link connector (e.g. swarm_ros_bridge). */
    connector: string;
    sshUsername: string;
    sshPassword: string;
    /** Vehicle-side telemetry listen port (shared default 3001). */
    telemetryRemotePort: number;
    /** Ground-station local control bind port (partitioned 3000+N). */
    controlLocalPort: number;
    mocapRigidBodyName: string;
    positioningFrameNumber?: number;
    positioningComparisonThresholdM?: number;
    simulation: RobotSimulationConfig;
  };
  px4?: never;
  mecanum?: never;
};

/** Mecanum physical fields match Scout (UGV link model); only kind / display name differ. */
export type MecanumRobotAssetSpec = RobotAssetSpecBase & {
  kind: typeof MECANUM_UGV_KIND;
  mecanum: {
    managementAddress: string;
    connector: string;
    sshUsername: string;
    sshPassword: string;
    telemetryRemotePort: number;
    controlLocalPort: number;
    mocapRigidBodyName: string;
    positioningFrameNumber?: number;
    positioningComparisonThresholdM?: number;
    simulation: RobotSimulationConfig;
  };
  px4?: never;
  scout?: never;
};

/**
 * Built-in experiment-capable kinds plus composition-contributed extension specs.
 * Optional leaf kinds (when composed) are structural members of ContributedRobotAssetSpec.
 */
export type RobotAssetSpec =
  | PX4RobotAssetSpec
  | ScoutRobotAssetSpec
  | MecanumRobotAssetSpec
  | ContributedRobotAssetSpec;

export type RobotAssetDocument = {
  head: ConfigResourceHead;
  branch: ConfigResourceBranch;
  spec: RobotAssetSpec;
};

export type RobotNamespace = ConfigResourceNamespace & {
  domain: typeof ROBOT_DOMAIN;
};

type MutationIdentity = {
  requestId?: string;
  idempotencyKey?: string;
};

export type CreateRobotAssetInput = MutationIdentity & {
  namespaceId?: string;
  spec: RobotAssetSpec;
  reason: string;
};

export type CommitRobotAssetInput = MutationIdentity & {
  spec: RobotAssetSpec;
  baseCommitId: string;
  expectedBranchRevision: number;
  expectedResourceRevision: number;
  namespaceId?: string;
  reason: string;
};

export type ArchiveRobotAssetInput = MutationIdentity & {
  expectedRevision: number;
  reason: string;
};

export type CreateRobotNamespaceInput = MutationIdentity & {
  parentNamespaceId?: string;
  name: string;
};

export type UpdateRobotNamespaceInput = MutationIdentity & {
  name?: string;
  parentNamespaceId?: string;
  expectedRevision: number;
};

export type ArchiveRobotNamespaceInput = MutationIdentity & {
  expectedRevision: number;
};

export function isPX4RobotAsset(
  value: RobotAssetSpec | RobotAssetDocument,
): value is PX4RobotAssetSpec | (RobotAssetDocument & { spec: PX4RobotAssetSpec }) {
  return carriedRobotAssetSpec(value).kind === PX4_MULTIROTOR_KIND;
}

export function isScoutRobotAsset(
  value: RobotAssetSpec | RobotAssetDocument,
): value is ScoutRobotAssetSpec | (RobotAssetDocument & { spec: ScoutRobotAssetSpec }) {
  return carriedRobotAssetSpec(value).kind === SCOUT_MINI_KIND;
}

export function isMecanumRobotAsset(
  value: RobotAssetSpec | RobotAssetDocument,
): value is MecanumRobotAssetSpec | (RobotAssetDocument & { spec: MecanumRobotAssetSpec }) {
  return carriedRobotAssetSpec(value).kind === MECANUM_UGV_KIND;
}

/** True when the carrier is not one of the three built-in physical kinds. */
export function isContributedRobotAsset(
  value: RobotAssetSpec | RobotAssetDocument,
): value is ContributedRobotAssetSpec | (RobotAssetDocument & { spec: ContributedRobotAssetSpec }) {
  return !isPX4RobotAsset(value) && !isScoutRobotAsset(value) && !isMecanumRobotAsset(value);
}

export function robotAssetProtocolKind(
  value: RobotAssetSpec | RobotAssetDocument,
): string {
  return carriedRobotAssetSpec(value).kind;
}

function carriedRobotAssetSpec(
  value: RobotAssetSpec | RobotAssetDocument,
): RobotAssetSpec {
  // Contributed payload arms are structurally open, so `spec in value` alone
  // is not a safe document discriminator. Resource documents always carry all
  // three envelope fields.
  if ('head' in value && 'branch' in value && 'spec' in value) {
    return value.spec as RobotAssetSpec;
  }
  return value as RobotAssetSpec;
}
