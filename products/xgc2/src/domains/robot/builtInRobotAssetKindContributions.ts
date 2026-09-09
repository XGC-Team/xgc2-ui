/**
 * Explicit experiment-capable built-in Robot asset kind contributions
 * (PX4 Multirotor, Scout Mini, Mecanum UGV).
 */

import {
  protocolField,
  protocolObject,
  protocolRequiredInteger,
  protocolRequiredNumber,
  protocolRequiredString,
} from '../../shared/strictProtocolDecoder';
import {
  assembleRobotAssetKindComposition,
  defineRobotAssetKindContributionIdentity,
  EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  type RobotAssetCommonFields,
  type RobotAssetKindComposition,
  type RobotAssetKindContribution,
  type RobotProductModelOption,
  type RobotAssetWireResult,
} from './robotAssetKindComposition';
import {
  DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
  DEFAULT_POSITIONING_FRAME_NUMBER,
  DEFAULT_SCOUT_CONNECTOR,
  MECANUM_UGV_KIND,
  PX4_MULTIROTOR_KIND,
  PX4_MODEL_FS150,
  PX4_MODEL_MOCAP_ROTOR,
  PX4_MOCAP_ROTOR_PROFILE_ID,
  SCOUT_CONNECTORS,
  SCOUT_MINI_KIND,
  px4RobotModelId,
  type MecanumRobotAssetSpec,
  type PX4RobotAssetSpec,
  type RobotSimulationConfig,
  type ScoutRobotAssetSpec,
} from './robotAssetContracts';
import {
  defaultPhysicalMavrosLocalPort,
  defaultSimulationMavrosLocalPort,
  defaultSimulationPx4RemotePort,
} from './robotAssetDecoderPorts';

const px4Identity = defineRobotAssetKindContributionIdentity('robot.asset.kind.px4-multirotor');
const scoutIdentity = defineRobotAssetKindContributionIdentity('robot.asset.kind.scout-mini');
const mecanumIdentity = defineRobotAssetKindContributionIdentity('robot.asset.kind.mecanum-ugv');

function decodeSimulation(value: unknown, path: string): RobotSimulationConfig {
  const simulation = protocolObject(value, path, ['productId', 'launchPackage', 'launchFile']);
  return {
    productId: protocolRequiredString(simulation, 'productId', path),
    launchPackage: protocolRequiredString(simulation, 'launchPackage', path),
    launchFile: protocolRequiredString(simulation, 'launchFile', path),
  };
}

function normalizeSimulation(simulation: RobotSimulationConfig): RobotSimulationConfig {
  return {
    productId: simulation.productId.trim(),
    launchPackage: simulation.launchPackage.trim(),
    launchFile: simulation.launchFile.trim(),
  };
}

function validPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function positioningHealthIssue(frameNumber: number | undefined, comparisonThresholdM: number | undefined) {
  if (typeof frameNumber !== 'number'
    || !Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > 999) {
    return 'positioning frame number must be between 1 and 999.';
  }
  if (typeof comparisonThresholdM !== 'number' || !Number.isFinite(comparisonThresholdM)
    || comparisonThresholdM < 1e-10 || comparisonThresholdM > 10) {
    return 'positioning comparison threshold must be between 1e-10 and 10 metres.';
  }
  return '';
}

function asPx4(spec: RobotAssetWireResult): PX4RobotAssetSpec {
  return spec as PX4RobotAssetSpec;
}
function asScout(spec: RobotAssetWireResult): ScoutRobotAssetSpec {
  return spec as ScoutRobotAssetSpec;
}
function asMecanum(spec: RobotAssetWireResult): MecanumRobotAssetSpec {
  return spec as MecanumRobotAssetSpec;
}

function commonFields(common: RobotAssetCommonFields) {
  return {
    name: common.name,
    description: common.description,
    tags: [...common.tags],
    profileId: common.profileId,
  };
}

const fs150Simulation = Object.freeze({
  id: 'xgc2-gazebo-sim-fs150-sitl',
  label: 'FS150',
  launchPackage: 'gazebo_sim_fs150_sitl',
  launchFile: 'fs150.launch',
});

const fs150Telemetry = Object.freeze({
  instrumentFamily: 'flight' as const,
  presentation: 'fs150' as const,
  instrumentChannels: Object.freeze([
    'state.flight', 'state.pose', 'state.velocity', 'state.speed',
    'state.localization.error', 'state.imu', 'state.power', 'state.health',
    'state.mocap.pose', 'state.mocap.velocity', 'state.mocap.speed',
    'setpoint.local', 'diagnostic.fcu-link',
    'diagnostic.stream-health',
  ]),
  listChannels: Object.freeze([
    'state.flight', 'state.pose', 'state.velocity', 'state.speed',
    'state.localization.error', 'state.power', 'state.health', 'state.mocap.pose',
    'state.mocap.velocity', 'state.mocap.speed', 'setpoint.local',
    'diagnostic.fcu-link', 'diagnostic.stream-health',
  ]),
  poseChannelId: 'state.pose',
  velocityChannelId: 'state.velocity',
  speedChannelId: 'state.speed',
  linkChannelId: 'diagnostic.fcu-link',
  mocapPoseChannelId: 'state.mocap.pose',
  localizationErrorChannelId: 'state.localization.error',
  setpointChannelId: 'setpoint.local',
});

const mocapRotorTelemetry = Object.freeze({
  instrumentFamily: 'flight' as const,
  presentation: 'mocap_rotor' as const,
  instrumentChannels: Object.freeze([
    'state.flight', 'state.pose', 'state.velocity', 'state.speed', 'state.imu',
    'state.power', 'state.health', 'diagnostic.link', 'diagnostic.stream-health',
  ]),
  listChannels: Object.freeze([
    'state.flight', 'state.pose', 'state.velocity', 'state.speed', 'state.power',
    'state.health', 'diagnostic.link', 'diagnostic.stream-health',
  ]),
  poseChannelId: 'state.pose',
  velocityChannelId: 'state.velocity',
  speedChannelId: 'state.speed',
  linkChannelId: 'diagnostic.link',
});

const fs150ProductModel: RobotProductModelOption = Object.freeze({
  id: PX4_MODEL_FS150,
  label: 'FS150',
  profileId: 'px4.multirotor.ros1.v9',
  simulation: fs150Simulation,
  directMavros: true,
  telemetry: fs150Telemetry,
});

const mocapRotorProductModel: RobotProductModelOption = Object.freeze({
  id: PX4_MODEL_MOCAP_ROTOR,
  label: 'Mocap Rotor',
  profileId: PX4_MOCAP_ROTOR_PROFILE_ID,
  directMavros: false,
  telemetry: mocapRotorTelemetry,
});

export type PX4ProductModelSelection = {
  readonly fs150: boolean;
  readonly mocapRotor: boolean;
  readonly simulation: boolean;
};

/**
 * Profile-selected PX4 contribution. The shared kind and wire arm stay stable;
 * exact model/profile validation prevents Mocap Rotor from entering FS150
 * MAVROS/SITL wiring.
 */
export function px4RobotAssetKindContributionForModels(
  selection: PX4ProductModelSelection,
): RobotAssetKindContribution {
  const productModels = [
    ...(selection.fs150 ? [fs150ProductModel] : []),
    ...(selection.mocapRotor ? [mocapRotorProductModel] : []),
  ];
  if (productModels.length === 0) {
    throw new Error('PX4 contribution requires at least one selected product model.');
  }
  const allowedModels = new Set(productModels.map((model) => model.id));
  const simulationEnabled = selection.simulation && selection.fs150;
  const admission = simulationEnabled
    ? EXPERIMENT_CAPABLE_ROBOT_ADMISSION
    : Object.freeze({
      ...EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
      simulation: false,
    });

  return Object.freeze({
    identity: px4Identity,
    catalog: Object.freeze({
      id: 'px4',
      label: 'PX4 Multirotor',
      chassisClass: 'multirotor',
      vendorLabel: 'PX4',
    }),
    defaultProfileId: productModels[0]!.profileId,
    admission,
    productModels: Object.freeze(productModels),
    wire: Object.freeze({
      protocolKind: PX4_MULTIROTOR_KIND,
      wireArms: Object.freeze(['px4'] as const),
      decode(common: RobotAssetCommonFields, spec: Readonly<Record<string, unknown>>, path: string): PX4RobotAssetSpec {
        const px4Path = `${path}.px4`;
        const px4 = protocolObject(
          protocolField(spec as Record<string, unknown>, 'px4', path),
          px4Path,
          [
            'modelId', 'mavSystemId', 'managementIp', 'sshUsername', 'sshPassword', 'mocapRigidBodyName',
            'positioningFrameNumber', 'positioningComparisonThresholdM',
            'physicalMavrosLocalPort', 'physicalFcuRemotePort',
            'simulationLocalPort', 'simulationRemotePort', 'simulation',
          ],
        );
        const mavSystemId = protocolRequiredInteger(px4, 'mavSystemId', px4Path);
        const modelId = protocolRequiredString(px4, 'modelId', px4Path);
        if (!allowedModels.has(modelId)) {
          throw new Error(`Protocol error: ${px4Path}.modelId is disabled in this Product Profile.`);
        }
        if (Object.hasOwn(px4, 'experimentLocalPort') || Object.hasOwn(px4, 'experimentRemotePort')) {
          throw new Error(
            `Protocol error: ${px4Path} must use physicalMavrosLocalPort/physicalFcuRemotePort `
            + '(experimentLocalPort/experimentRemotePort are not allowed).',
          );
        }
        const directMavros = modelId === PX4_MODEL_FS150;
        return {
          ...commonFields(common),
          kind: PX4_MULTIROTOR_KIND,
          px4: {
            modelId: modelId as PX4RobotAssetSpec['px4']['modelId'],
            mavSystemId,
            managementIp: protocolRequiredString(px4, 'managementIp', px4Path),
            sshUsername: protocolRequiredString(px4, 'sshUsername', px4Path),
            sshPassword: protocolRequiredString(px4, 'sshPassword', px4Path),
            mocapRigidBodyName: protocolRequiredString(px4, 'mocapRigidBodyName', px4Path),
            positioningFrameNumber: Object.hasOwn(px4, 'positioningFrameNumber')
              ? protocolRequiredInteger(px4, 'positioningFrameNumber', px4Path)
              : directMavros ? DEFAULT_POSITIONING_FRAME_NUMBER : 0,
            positioningComparisonThresholdM: Object.hasOwn(px4, 'positioningComparisonThresholdM')
              ? protocolRequiredNumber(px4, 'positioningComparisonThresholdM', px4Path)
              : directMavros ? DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M : 0,
            physicalMavrosLocalPort: Object.hasOwn(px4, 'physicalMavrosLocalPort')
              ? protocolRequiredInteger(px4, 'physicalMavrosLocalPort', px4Path)
              : directMavros ? defaultPhysicalMavrosLocalPort(mavSystemId) : 0,
            physicalFcuRemotePort: Object.hasOwn(px4, 'physicalFcuRemotePort')
              ? protocolRequiredInteger(px4, 'physicalFcuRemotePort', px4Path)
              : directMavros ? 14560 : 0,
            simulationLocalPort: Object.hasOwn(px4, 'simulationLocalPort')
              ? protocolRequiredInteger(px4, 'simulationLocalPort', px4Path)
              : directMavros ? defaultSimulationMavrosLocalPort(mavSystemId) : 0,
            simulationRemotePort: Object.hasOwn(px4, 'simulationRemotePort')
              ? protocolRequiredInteger(px4, 'simulationRemotePort', px4Path)
              : directMavros ? defaultSimulationPx4RemotePort(mavSystemId) : 0,
            simulation: Object.hasOwn(px4, 'simulation')
              ? decodeSimulation(protocolField(px4, 'simulation', px4Path), `${px4Path}.simulation`)
              : { productId: '', launchPackage: '', launchFile: '' },
          },
        };
      },
      normalize(spec: RobotAssetWireResult, common: RobotAssetCommonFields): PX4RobotAssetSpec {
        const px4 = asPx4(spec);
        return {
          ...commonFields(common),
          kind: PX4_MULTIROTOR_KIND,
          px4: {
            ...px4.px4,
            modelId: px4RobotModelId(px4),
            managementIp: px4.px4.managementIp.trim(),
            sshUsername: px4.px4.sshUsername.trim(),
            mocapRigidBodyName: px4.px4.mocapRigidBodyName.trim(),
            positioningFrameNumber: px4RobotModelId(px4) === PX4_MODEL_FS150
              ? px4.px4.positioningFrameNumber || DEFAULT_POSITIONING_FRAME_NUMBER : 0,
            positioningComparisonThresholdM: px4RobotModelId(px4) === PX4_MODEL_FS150
              ? px4.px4.positioningComparisonThresholdM || DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M : 0,
            simulation: normalizeSimulation(px4.px4.simulation),
          },
        };
      },
      validate(spec: RobotAssetWireResult): string {
        const px4 = asPx4(spec);
        const modelId = px4RobotModelId(px4);
        const simulation = px4.px4.simulation;
        if (!allowedModels.has(modelId)) return 'PX4 model is disabled in this Product Profile.';
        if (modelId === PX4_MODEL_MOCAP_ROTOR && px4.profileId !== PX4_MOCAP_ROTOR_PROFILE_ID) {
          return `Mocap Rotor requires Profile ${PX4_MOCAP_ROTOR_PROFILE_ID}.`;
        }
        if (modelId === PX4_MODEL_FS150 && px4.profileId === PX4_MOCAP_ROTOR_PROFILE_ID) {
          return 'FS150 cannot use the Mocap Rotor Profile.';
        }
        if (!Number.isInteger(px4.px4.mavSystemId) || px4.px4.mavSystemId < 1 || px4.px4.mavSystemId > 245) {
          return 'PX4 MAV system ID must be between 1 and 245.';
        }
        if (!px4.px4.managementIp || !px4.px4.sshUsername
          || !px4.px4.sshPassword || !px4.px4.mocapRigidBodyName) {
          return 'PX4 requires IP, SSH credentials and a mocap rigid body.';
        }
        if (modelId === PX4_MODEL_MOCAP_ROTOR) {
          if (px4.px4.physicalMavrosLocalPort !== 0 || px4.px4.physicalFcuRemotePort !== 0
            || px4.px4.simulationLocalPort !== 0 || px4.px4.simulationRemotePort !== 0
            || simulation.productId || simulation.launchPackage || simulation.launchFile) {
            return 'Mocap Rotor must not carry FS150 MAVROS or SITL configuration.';
          }
          return '';
        }
        if (!simulation.productId.trim() || !simulation.launchPackage.trim() || !simulation.launchFile.trim()) {
          return 'FS150 requires a typed simulation product.';
        }
        const positioningIssue = positioningHealthIssue(
          px4.px4.positioningFrameNumber,
          px4.px4.positioningComparisonThresholdM,
        );
        if (positioningIssue) return `PX4 ${positioningIssue}`;
        if (!validPort(px4.px4.physicalMavrosLocalPort)) return 'PX4 MAVLink local port must be between 1 and 65535.';
        if (!validPort(px4.px4.physicalFcuRemotePort)) return 'PX4 MAVLink remote port must be between 1 and 65535.';
        if (!validPort(px4.px4.simulationLocalPort)) return 'PX4 simulation MAVLink local port must be between 1 and 65535.';
        if (!validPort(px4.px4.simulationRemotePort)) return 'PX4 simulation MAVLink remote port must be between 1 and 65535.';
        return '';
      },
    }),
    endpoint: (spec) => asPx4(spec).px4.managementIp,
    overviewAttributes: (spec) => {
      const px4Spec = asPx4(spec);
      const px4 = px4Spec.px4;
      const modelId = px4RobotModelId(px4Spec);
      const model = productModels.find((candidate) => candidate.id === modelId);
      const directMavros = modelId === PX4_MODEL_FS150;
      const rows = [
        { id: 'model', label: 'Model', value: model?.label ?? modelId },
        { id: 'mav-system-id', label: 'MAV sys ID', value: String(px4.mavSystemId) },
        {
          id: 'remote-ip',
          label: directMavros ? 'Remote IP' : 'Onboard IP',
          value: px4.managementIp || '—',
        },
        {
          id: 'mocap',
          label: directMavros ? 'Mocap' : 'Onboard mocap',
          value: px4.mocapRigidBodyName || '—',
        },
      ];
      if (directMavros) {
        rows.splice(3, 0,
          { id: 'mavlink-local', label: 'MAVLink local port', value: String(px4.physicalMavrosLocalPort) },
          { id: 'mavlink-remote', label: 'MAVLink remote port', value: String(px4.physicalFcuRemotePort) },
          { id: 'positioning-frames', label: 'Positioning frames', value: String(px4.positioningFrameNumber) },
          { id: 'positioning-threshold', label: 'Positioning threshold', value: `${px4.positioningComparisonThresholdM} m` },
        );
      } else {
        rows.push({ id: 'telemetry', label: 'Ground telemetry', value: 'Zenoh · read only' });
      }
      return Object.freeze(rows);
    },
    defaultName: (sequence) => selection.mocapRotor && !selection.fs150
      ? `Mocap Rotor ${String(sequence).padStart(2, '0')}`
      : `UAV ${String(sequence).padStart(2, '0')}`,
    simulationModels: simulationEnabled ? Object.freeze([fs150Simulation]) : undefined,
  });
}

/** Legacy/generic Product default: FS150 only, unchanged. */
export const px4RobotAssetKindContribution = px4RobotAssetKindContributionForModels({
  fs150: true,
  mocapRotor: false,
  simulation: true,
});

/** Explicit experiment-capable Scout Mini contribution. */
export const scoutRobotAssetKindContribution: RobotAssetKindContribution = Object.freeze({
  identity: scoutIdentity,
  catalog: Object.freeze({ id: 'scout', label: 'Scout Mini' }),
  defaultProfileId: 'scout-mini.ros1.v10',
  admission: EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  wire: Object.freeze({
    protocolKind: SCOUT_MINI_KIND,
    wireArms: Object.freeze(['scout'] as const),
    decode(common: RobotAssetCommonFields, spec: Readonly<Record<string, unknown>>, path: string): ScoutRobotAssetSpec {
      const scoutPath = `${path}.scout`;
      const scout = protocolObject(
        protocolField(spec as Record<string, unknown>, 'scout', path),
        scoutPath,
        [
          'managementAddress', 'connector', 'sshUsername', 'sshPassword',
          'telemetryRemotePort', 'controlLocalPort', 'mocapRigidBodyName',
          'positioningFrameNumber', 'positioningComparisonThresholdM', 'simulation',
        ],
      );
      return {
        ...commonFields(common),
        kind: SCOUT_MINI_KIND,
        scout: {
          managementAddress: protocolRequiredString(scout, 'managementAddress', scoutPath),
          connector: Object.hasOwn(scout, 'connector') && String(scout.connector ?? '').trim()
            ? protocolRequiredString(scout, 'connector', scoutPath)
            : DEFAULT_SCOUT_CONNECTOR,
          sshUsername: protocolRequiredString(scout, 'sshUsername', scoutPath),
          sshPassword: protocolRequiredString(scout, 'sshPassword', scoutPath),
          telemetryRemotePort: protocolRequiredInteger(scout, 'telemetryRemotePort', scoutPath),
          controlLocalPort: protocolRequiredInteger(scout, 'controlLocalPort', scoutPath),
          mocapRigidBodyName: protocolRequiredString(scout, 'mocapRigidBodyName', scoutPath),
          positioningFrameNumber: Object.hasOwn(scout, 'positioningFrameNumber')
            ? protocolRequiredInteger(scout, 'positioningFrameNumber', scoutPath)
            : DEFAULT_POSITIONING_FRAME_NUMBER,
          positioningComparisonThresholdM: Object.hasOwn(scout, 'positioningComparisonThresholdM')
            ? protocolRequiredNumber(scout, 'positioningComparisonThresholdM', scoutPath)
            : DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
          simulation: decodeSimulation(protocolField(scout, 'simulation', scoutPath), `${scoutPath}.simulation`),
        },
      };
    },
    normalize(spec: RobotAssetWireResult, common: RobotAssetCommonFields): ScoutRobotAssetSpec {
      const scout = asScout(spec);
      return {
        ...commonFields(common),
        kind: SCOUT_MINI_KIND,
        scout: {
          managementAddress: scout.scout.managementAddress.trim(),
          connector: scout.scout.connector.trim() || DEFAULT_SCOUT_CONNECTOR,
          sshUsername: scout.scout.sshUsername.trim(),
          sshPassword: scout.scout.sshPassword,
          telemetryRemotePort: scout.scout.telemetryRemotePort,
          controlLocalPort: scout.scout.controlLocalPort,
          mocapRigidBodyName: scout.scout.mocapRigidBodyName.trim(),
          positioningFrameNumber: scout.scout.positioningFrameNumber || DEFAULT_POSITIONING_FRAME_NUMBER,
          positioningComparisonThresholdM: scout.scout.positioningComparisonThresholdM || DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
          simulation: normalizeSimulation(scout.scout.simulation),
        },
      };
    },
    validate(spec: RobotAssetWireResult): string {
      const scout = asScout(spec);
      const simulation = scout.scout.simulation;
      if (!simulation.productId.trim() || !simulation.launchPackage.trim() || !simulation.launchFile.trim()) {
        return 'Robot asset requires a typed simulation product.';
      }
      if (!scout.scout.managementAddress || !scout.scout.sshUsername
        || !scout.scout.sshPassword || !scout.scout.mocapRigidBodyName) {
        return 'Scout requires IP, SSH credentials and a mocap rigid body.';
      }
      if (!(SCOUT_CONNECTORS as readonly string[]).includes(scout.scout.connector.trim())) {
        return 'Scout requires a supported connector.';
      }
      if (!validPort(scout.scout.telemetryRemotePort)) {
        return 'Scout telemetry remote port must be between 1 and 65535.';
      }
      if (!validPort(scout.scout.controlLocalPort)) {
        return 'Scout control local port must be between 1 and 65535.';
      }
      const positioningIssue = positioningHealthIssue(
        scout.scout.positioningFrameNumber,
        scout.scout.positioningComparisonThresholdM,
      );
      if (positioningIssue) return `Scout ${positioningIssue}`;
      return '';
    },
  }),
  endpoint: (spec) => asScout(spec).scout.managementAddress,
  overviewAttributes: (spec) => {
    const scout = asScout(spec).scout;
    return Object.freeze([
      { id: 'remote-ip', label: 'Remote IP', value: scout.managementAddress || '—' },
      { id: 'connector', label: 'Connector', value: scout.connector || '—' },
      { id: 'telemetry-remote', label: 'Telemetry', value: String(scout.telemetryRemotePort || '—') },
      { id: 'control-local', label: 'Control local', value: String(scout.controlLocalPort || '—') },
      { id: 'mocap', label: 'Mocap', value: scout.mocapRigidBodyName || '—' },
      { id: 'positioning-frames', label: 'Positioning frames', value: String(scout.positioningFrameNumber) },
      { id: 'positioning-threshold', label: 'Positioning threshold', value: `${scout.positioningComparisonThresholdM} m` },
    ]);
  },
  defaultName: (sequence) => `Scout ${String(sequence).padStart(2, '0')}`,
  nameSequence: (name) => {
    const match = name.trim().match(/^Scout(?:\s+Mini)?\s*0*(\d+)$/i);
    return match ? Number(match[1]) : undefined;
  },
  simulationModels: Object.freeze([
    Object.freeze({
      id: 'xgc2-gazebo-sim-scout',
      label: 'Scout Mini',
      launchPackage: 'gazebo_sim_scout',
      launchFile: 'spawn_accurate.launch',
    }),
  ]),
});

/** Explicit experiment-capable Mecanum UGV contribution. */
export const mecanumRobotAssetKindContribution: RobotAssetKindContribution = Object.freeze({
  identity: mecanumIdentity,
  catalog: Object.freeze({ id: 'mecanum', label: 'Mecanum UGV' }),
  defaultProfileId: 'mecanum-ugv.ros1.v7',
  admission: EXPERIMENT_CAPABLE_ROBOT_ADMISSION,
  wire: Object.freeze({
    protocolKind: MECANUM_UGV_KIND,
    wireArms: Object.freeze(['mecanum'] as const),
    decode(common: RobotAssetCommonFields, spec: Readonly<Record<string, unknown>>, path: string): MecanumRobotAssetSpec {
      const mecanumPath = `${path}.mecanum`;
      const mecanum = protocolObject(
        protocolField(spec as Record<string, unknown>, 'mecanum', path),
        mecanumPath,
        [
          'managementAddress', 'connector', 'sshUsername', 'sshPassword',
          'telemetryRemotePort', 'controlLocalPort', 'mocapRigidBodyName',
          'positioningFrameNumber', 'positioningComparisonThresholdM', 'simulation',
        ],
      );
      const mocap = protocolRequiredString(mecanum, 'mocapRigidBodyName', mecanumPath);
      return {
        ...commonFields(common),
        kind: MECANUM_UGV_KIND,
        mecanum: {
          managementAddress: Object.hasOwn(mecanum, 'managementAddress')
            ? protocolRequiredString(mecanum, 'managementAddress', mecanumPath)
            : '',
          connector: Object.hasOwn(mecanum, 'connector') && String(mecanum.connector ?? '').trim()
            ? protocolRequiredString(mecanum, 'connector', mecanumPath)
            : DEFAULT_SCOUT_CONNECTOR,
          sshUsername: Object.hasOwn(mecanum, 'sshUsername')
            ? protocolRequiredString(mecanum, 'sshUsername', mecanumPath)
            : '',
          sshPassword: Object.hasOwn(mecanum, 'sshPassword')
            ? protocolRequiredString(mecanum, 'sshPassword', mecanumPath)
            : '',
          telemetryRemotePort: Object.hasOwn(mecanum, 'telemetryRemotePort')
            ? protocolRequiredInteger(mecanum, 'telemetryRemotePort', mecanumPath)
            : 3001,
          controlLocalPort: Object.hasOwn(mecanum, 'controlLocalPort')
            ? protocolRequiredInteger(mecanum, 'controlLocalPort', mecanumPath)
            : 3001,
          mocapRigidBodyName: mocap,
          positioningFrameNumber: Object.hasOwn(mecanum, 'positioningFrameNumber')
            ? protocolRequiredInteger(mecanum, 'positioningFrameNumber', mecanumPath)
            : DEFAULT_POSITIONING_FRAME_NUMBER,
          positioningComparisonThresholdM: Object.hasOwn(mecanum, 'positioningComparisonThresholdM')
            ? protocolRequiredNumber(mecanum, 'positioningComparisonThresholdM', mecanumPath)
            : DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
          simulation: decodeSimulation(
            protocolField(mecanum, 'simulation', mecanumPath),
            `${mecanumPath}.simulation`,
          ),
        },
      };
    },
    normalize(spec: RobotAssetWireResult, common: RobotAssetCommonFields): MecanumRobotAssetSpec {
      const mecanum = asMecanum(spec);
      return {
        ...commonFields(common),
        kind: MECANUM_UGV_KIND,
        mecanum: {
          managementAddress: mecanum.mecanum.managementAddress.trim(),
          connector: mecanum.mecanum.connector.trim() || DEFAULT_SCOUT_CONNECTOR,
          sshUsername: mecanum.mecanum.sshUsername.trim(),
          sshPassword: mecanum.mecanum.sshPassword,
          telemetryRemotePort: mecanum.mecanum.telemetryRemotePort,
          controlLocalPort: mecanum.mecanum.controlLocalPort,
          mocapRigidBodyName: mecanum.mecanum.mocapRigidBodyName.trim(),
          positioningFrameNumber: mecanum.mecanum.positioningFrameNumber || DEFAULT_POSITIONING_FRAME_NUMBER,
          positioningComparisonThresholdM: mecanum.mecanum.positioningComparisonThresholdM || DEFAULT_POSITIONING_COMPARISON_THRESHOLD_M,
          simulation: normalizeSimulation(mecanum.mecanum.simulation),
        },
      };
    },
    validate(spec: RobotAssetWireResult): string {
      const mecanum = asMecanum(spec);
      const simulation = mecanum.mecanum.simulation;
      if (!simulation.productId.trim() || !simulation.launchPackage.trim() || !simulation.launchFile.trim()) {
        return 'Robot asset requires a typed simulation product.';
      }
      if (!mecanum.mecanum.managementAddress || !mecanum.mecanum.sshUsername
        || !mecanum.mecanum.sshPassword || !mecanum.mecanum.mocapRigidBodyName) {
        return 'Mecanum requires IP, SSH credentials and a mocap rigid body.';
      }
      if (!(SCOUT_CONNECTORS as readonly string[]).includes(mecanum.mecanum.connector.trim())) {
        return 'Mecanum requires a supported connector.';
      }
      if (!validPort(mecanum.mecanum.telemetryRemotePort)) {
        return 'Mecanum telemetry remote port must be between 1 and 65535.';
      }
      if (!validPort(mecanum.mecanum.controlLocalPort)) {
        return 'Mecanum control local port must be between 1 and 65535.';
      }
      const positioningIssue = positioningHealthIssue(
        mecanum.mecanum.positioningFrameNumber,
        mecanum.mecanum.positioningComparisonThresholdM,
      );
      if (positioningIssue) return `Mecanum ${positioningIssue}`;
      return '';
    },
  }),
  endpoint: (spec) => asMecanum(spec).mecanum.mocapRigidBodyName,
  overviewAttributes: (spec) => {
    const mecanum = asMecanum(spec).mecanum;
    return Object.freeze([
      { id: 'remote-ip', label: 'Remote IP', value: mecanum.managementAddress || '—' },
      { id: 'connector', label: 'Connector', value: mecanum.connector || '—' },
      { id: 'telemetry-remote', label: 'Telemetry', value: String(mecanum.telemetryRemotePort || '—') },
      { id: 'control-local', label: 'Control local', value: String(mecanum.controlLocalPort || '—') },
      { id: 'mocap', label: 'Mocap', value: mecanum.mocapRigidBodyName || '—' },
      { id: 'positioning-frames', label: 'Positioning frames', value: String(mecanum.positioningFrameNumber) },
      { id: 'positioning-threshold', label: 'Positioning threshold', value: `${mecanum.positioningComparisonThresholdM} m` },
    ]);
  },
  defaultName: (sequence) => `Mecanum ${String(sequence).padStart(2, '0')}`,
  nameSequence: (name) => {
    const match = name.trim().match(/^Mecanum(?:\s+UGV)?\s*0*(\d+)$/i);
    return match ? Number(match[1]) : undefined;
  },
  simulationModels: Object.freeze([
    Object.freeze({
      id: 'xgc2-gazebo-sim-mecanum',
      label: 'Mecanum UGV',
      launchPackage: 'gazebo_sim_mecanum',
      launchFile: 'spawn.launch',
    }),
  ]),
});

/** Built-in experiment-capable contributions in stable catalog order. */
export const builtInRobotAssetKindContributions: readonly RobotAssetKindContribution[] = Object.freeze([
  px4RobotAssetKindContribution,
  scoutRobotAssetKindContribution,
  mecanumRobotAssetKindContribution,
]);

const builtInComposition: RobotAssetKindComposition = assembleRobotAssetKindComposition(
  ...builtInRobotAssetKindContributions,
);

/** Frozen built-in-only composition (PX4 + Scout + Mecanum). Safe singleton. */
export function builtInRobotAssetKindComposition(): RobotAssetKindComposition {
  return builtInComposition;
}
