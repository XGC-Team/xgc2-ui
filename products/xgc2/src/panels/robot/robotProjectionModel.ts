import type { RobotChannelProjection,RunRobot } from '../../domains/robot/robotPublic';
import type {
  ExperimentProcessRuntimeProjection,
  ExperimentRobotBinding,
} from '../../domains/experiment/experimentPublic';
import { experimentRobotRoleLabel } from '../../domains/experiment/experimentPublic';
import {
  MECANUM_UGV_KIND,
  PX4_MODEL_FS150,
  PX4_MODEL_MOCAP_ROTOR,
  PX4_MULTIROTOR_KIND,
  assertRobotAssetExperimentProjection,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  type RobotAssetDocument,
  type RobotAssetKindPanelProjection,
  type RobotAssetKindComposition,
} from '../../domains/robot/robotAssetPublic';
import { numberValue,stringValue,type RobotHealthTone } from './robotTelemetryValues';

export type RobotPanelItem = Omit<RunRobot,'adapterDefinitionId'> & { adapterDefinitionId?: string };

/**
 * Robot REST/SSE projection identity is the exact active Session/System root.
 * A Panel Automation child may own robot.ensure-connected deeper in its
 * relation tree, but Core aggregates those owners under this stable parent.
 */
export function robotProjectionSessionRunId(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  panelInvocationRunId:string|undefined,
  workflowInstanceId:string|undefined,
) {
  const invocationId = panelInvocationRunId?.trim() ?? '';
  const bindingId = workflowInstanceId?.trim() ?? '';
  if (!runtime || !invocationId || !bindingId || !runtime.targetId) return undefined;
  const activeRuns = runtime.activeRuns
    ?? (runtime.activeRun ? [runtime.activeRun] : []);
  // Session members are retained while lifecycle projections reconcile. Once
  // the Experiment has no non-stopping root on this target, an old active
  // member must not keep the Robot REST/SSE projection (and its telemetry
  // cache) alive. Total Stop projects every root as stopping before stop-set
  // removes the backend projection; a selected Panel Stop still leaves the
  // full Experiment root active and therefore keeps this aggregate parent.
  if (!activeRuns.some((run) => (
    run.targetId === runtime.targetId && run.status !== 'stopping'
  ))) return undefined;
  const matches = (runtime.sessionViews ?? []).flatMap((view) => (
    view.session.targetId === runtime.targetId
    && (view.session.state === 'opening' || view.session.state === 'active')
      ? view.members.filter((member) => (
        member.targetId === runtime.targetId
        && member.kind === 'workflow_run'
        && member.bindingId === bindingId
        && member.ownerId === invocationId
        && (member.status === 'attached' || member.status === 'running')
      ))
      : []
  ));
  return matches.length === 1 ? matches[0]!.ownerId : undefined;
}

export function staticRobot(
  binding: ExperimentRobotBinding,
  asset: RobotAssetDocument,
  composition?: RobotAssetKindComposition,
): RobotPanelItem {
  // Fail closed for asset-only / unknown kinds via generic robot admission.
  assertRobotAssetExperimentProjection(asset, composition);
  const px4 = isPX4RobotAsset(asset);
  const mecanum = isMecanumRobotAsset(asset);
  const scout = isScoutRobotAsset(asset);
  return {
    id: binding.id,
    robotAssetId: asset.head.resourceId,
    robotAssetCommitId: asset.branch.headCommitId,
    robotAssetDigest: asset.head.digest,
    name: experimentRobotRoleLabel(binding),
    kind: asset.spec.kind,
    hybridSource: binding.hybridSource,
    profileId: asset.spec.profileId,
    namespace: binding.namespace,
    px4: px4 ? {
      modelId: px4RobotModelId(asset.spec),
      mavSystemId: asset.spec.px4!.mavSystemId,
      managementIp: asset.spec.px4!.managementIp,
      mocapRigidBodyName: asset.spec.px4!.mocapRigidBodyName,
    } : undefined,
    scout: scout ? { managementAddress: asset.spec.scout.managementAddress } : undefined,
    mecanum: mecanum ? { mocapRigidBodyName: asset.spec.mecanum!.mocapRigidBodyName } : undefined,
    operationContracts: [],
    connectionEpoch: 0,
    connectionState: 'inactive',
    connectionRevision: 0,
    online: false,
    operationalReady: false,
    status: 'offline',
    channels: {},
  };
}

export function isPX4Multirotor(robot: Pick<RunRobot,'kind' | 'px4'>) {
  return robot.kind === PX4_MULTIROTOR_KIND || Boolean(robot.px4);
}

export function px4RuntimeModelId(robot: Pick<RunRobot,'px4'>) {
  return robot.px4?.modelId;
}

export function isMocapRotor(robot: Pick<RunRobot,'kind' | 'px4'>) {
  return isPX4Multirotor(robot) && px4RuntimeModelId(robot) === PX4_MODEL_MOCAP_ROTOR;
}

export function isFS150PX4Multirotor(robot: Pick<RunRobot,'kind' | 'px4'>) {
  return isPX4Multirotor(robot) && px4RuntimeModelId(robot) === PX4_MODEL_FS150;
}

export function isMecanumPanelRobot(robot: Pick<RunRobot,'kind' | 'mecanum'>) {
  return robot.kind === MECANUM_UGV_KIND || Boolean(robot.mecanum);
}

export function robotHealthTone(
  input: {
    hasRun: boolean;
    robot: Pick<RunRobot,'kind' | 'mecanum' | 'connectionState'>
      & Partial<Pick<RunRobot,'id' | 'name'>>;
    channels: Readonly<Record<string,RobotChannelProjection | undefined>>;
    healthChannel: RobotChannelProjection | undefined;
    health: Record<string,unknown>;
    online: boolean;
    operationalReady: boolean;
    kindProjection?: RobotAssetKindPanelProjection;
  },
): RobotHealthTone {
  if (!input.hasRun) return 'idle';
  if (input.robot.kind === MECANUM_UGV_KIND) return mecanumHealthTone(input);
  if (input.kindProjection) {
    return input.kindProjection.healthTone({
      hasRun: input.hasRun,
      robot: {
        id: input.robot.id ?? '',
        name: input.robot.name ?? '',
        connectionState: input.robot.connectionState,
      },
      status: {
        online: input.online,
        operationalReady: input.operationalReady,
        status: input.online ? 'online' : 'offline',
      },
      channels: input.channels,
    });
  }
  if (!input.healthChannel || input.healthChannel.stale || input.health.online !== true || !input.online) {
    return 'unavailable';
  }
  return Array.isArray(input.health.faults) && input.health.faults.length > 0 || !input.operationalReady
    ? 'fault'
    : 'healthy';
}

function mecanumHealthTone(input: {
  robot: Pick<RunRobot,'mecanum' | 'connectionState'>;
  channels: Readonly<Record<string,RobotChannelProjection | undefined>>;
  online: boolean;
  operationalReady: boolean;
}): RobotHealthTone {
  if (!input.robot.mecanum) return 'fault';
  if (input.robot.connectionState !== 'live' || !input.online) return 'unavailable';
  if (!input.operationalReady) return 'fault';
  return ['state.imu','vrpn.position','vrpn.velocity','vrpn.speed'].every((channelId) => {
    const channel = input.channels[channelId];
    return Boolean(channel && !channel.stale);
  }) ? 'healthy' : 'unavailable';
}

export function vector(value: Record<string,unknown>) {
  const axes = vectorAxes(value);
  return axes.every((axis) => axis.text === '-')
    ? '--'
    : axes.map((axis) => axis.text).join(', ');
}

/** Per-axis fixed-width tokens for compact list vector tiles (sign-stable tabular digits). */
export function vectorAxes(value: Record<string,unknown>) {
  return (['x','y','z'] as const).map((axis) => {
    const number = numberValue(value[axis]);
    return {
      axis,
      text: number == null ? '-' : signedFixedWidth(number),
    };
  });
}

export function topicRateLabel(rate: number) {
  return rate > 0 ? `${rate.toFixed(1)} Hz` : '-- Hz';
}

export function robotLabel(
  robot: Pick<RunRobot,'kind' | 'px4'>,
  composition?: RobotAssetKindComposition,
) {
  if (isPX4Multirotor(robot)) return 'PX4 multirotor';
  if (robot.kind === MECANUM_UGV_KIND) return 'Mecanum UGV';
  return composition?.contributionByProtocolKind(robot.kind)?.catalog.label ?? 'Scout Mini';
}

export function robotCategory(
  robot: Pick<RunRobot,'kind' | 'px4'>,
  composition?: RobotAssetKindComposition,
) {
  if (isPX4Multirotor(robot)) return 'uav';
  return composition?.contributionByProtocolKind(robot.kind)?.panelProjection?.category ?? 'ugv';
}

export function setpointLabel(channel: RobotChannelProjection | undefined, value: Record<string,unknown>) {
  if (!channel) return '--';
  if (channel.stale) return 'stale';
  const frame = (stringValue(value.coordinateFrame) ?? 'frame?').replace('LOCAL_COORDINATE_FRAME_', '');
  const fields = numberValue(value.validFields);
  return fields == null ? frame : `${frame} · 0x${fields.toString(16)}`;
}

/** LocalTrajectorySetpoint valid_fields: pxyz, vxyz, axyz, yaw, yaw_rate. */
export const SETPOINT_MASK_GROUPS = [
  { label: 'p',bits: [0,1,2] as const },
  { label: 'v',bits: [3,4,5] as const },
  { label: 'a',bits: [6,7,8] as const },
  { label: 'y',bits: [9] as const },
  { label: 'yr',bits: [10] as const },
] as const;

export type SetpointMaskLightState = 'unknown' | 'masked' | 'unmasked';

export function setpointMaskGroups(
  validFields: number | null | undefined,
  options: { available?: boolean } = {},
) {
  // Without a fresh setpoint sample, keep lights unknown (not "unmasked"/green).
  const available = options.available !== false
    && validFields != null
    && Number.isFinite(validFields);
  const fields = available ? validFields : null;
  return SETPOINT_MASK_GROUPS.map(({ label,bits }) => ({
    label,
    lights: bits.map((bit): SetpointMaskLightState => {
      if (fields == null) return 'unknown';
      return ((fields >> bit) & 1) === 1 ? 'masked' : 'unmasked';
    }),
  }));
}

/**
 * Fixed-width signed decimal for live readouts: non-negative values get a
 * leading figure space so the digits do not shift when the sign flips.
 */
export function signedFixedWidth(value: number, digits = 2) {
  const formatted = value.toFixed(digits);
  return formatted.startsWith('-') ? formatted : `\u2007${formatted}`;
}

/** Split polarity for a CSS-fixed sign column (1ch) + absolute digits. */
export function splitSignedFixed(value: number, digits = 2) {
  const formatted = signedFixedWidth(value, digits);
  if (formatted.startsWith('-')) {
    return { sign: '-', digits: formatted.slice(1) };
  }
  return { sign: '', digits: formatted.replace(/^\u2007/, '') };
}

/**
 * List vector axis: minus only when negative, no `+`.
 * Integer keeps two slots (leading 0 is not painted). Fraction is always two
 * digits, including trailing 0. Overflow past two integer digits stays visible.
 */
export function splitSignedArrayAxis(value: number, digits = 2) {
  const formatted = value.toFixed(digits);
  const sign = formatted.startsWith('-') ? '-' : '';
  const abs = sign ? formatted.slice(1) : formatted;
  const [integer, fraction = ''] = abs.split('.');
  return {
    sign,
    integer,
    fraction,
    digits: fraction ? `${integer}.${fraction}` : integer,
  };
}

/**
 * Frozen roster authority for the instrument board: `staticRobots` decides
 * the card set AND order; `runtimeRobots` only overrides/enriches matching
 * ids once they report. A pending/partial/empty runtime projection never
 * deletes static cards that have not reported yet. Runtime-only robots are
 * shown when the frozen roster is empty (e.g. assets still loading), so a
 * genuinely empty composition still reaches the empty state.
 */
export function resolveRobotInstrumentRoster<Row extends { id:string;name?:string }>(
  staticRobots:readonly Row[],
  runtimeRobots:readonly Row[] | undefined,
):Row[] {
  if (!runtimeRobots || runtimeRobots.length === 0) return [...staticRobots];
  // Frozen roster owns the set: unknown runtime ids are ignored, never
  // appended. Only when the frozen roster itself is empty (assets still
  // loading) does the runtime projection stand in for it.
  if (staticRobots.length === 0) return [...runtimeRobots];
  const reportedById = new Map(runtimeRobots.map((robot) => [robot.id,robot]));
  return staticRobots.map((robot) => {
    const reported = reportedById.get(robot.id);
    return reported ? { ...robot,...reported,name:robot.name } : robot;
  });
}
