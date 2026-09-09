import { describe, expect, it } from 'vitest';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import { px4RobotAssetKindContributionForModels } from './builtInRobotAssetKindContributions';
import { robotAssetOverviewAttributes } from './robotAssetCatalog';
import type { UnitreeB2RobotAssetSpec } from './kinds/unitree-b2';
import { normalizeRobotAssetSpec, validateRobotAssetSpec } from './robotAssetAuthoring';
import type { RobotAssetSpec } from './robotAssetContracts';
import { decodeRobotAssetDocument } from './robotAssetDecoder';
import { assembleRobotAssetKindComposition } from './robotAssetKindComposition';

const composition = robotAssetKindCompositionWithUnitreeB2;
const mocapRotorComposition = assembleRobotAssetKindComposition(
  px4RobotAssetKindContributionForModels({ fs150: false,mocapRotor: true,simulation: false }),
);
const timestamp = '2026-07-30T00:00:00Z';

describe('Robot asset contracts', () => {
  it.each([
    px4(),
    scout(),
    mecanum(),
    unitreeB2(),
  ])('strictly decodes a canonical $kind Robot asset', (spec) => {
    expect(decodeRobotAssetDocument(document(spec), composition).spec).toEqual(spec);
  });

  it('normalizes metadata without changing physical identity fields', () => {
    const normalized = normalizeRobotAssetSpec({
      ...px4(),
      name: '  UAV 1  ',
      description: '  flight test  ',
      tags: [' field ', 'field', 'uav'],
      px4: {
        ...px4().px4,
        managementIp: ' 192.0.2.10 ',
        sshUsername: ' pilot ',
      },
    }, composition);

    expect(normalized).toMatchObject({
      name: 'UAV 1',
      description: 'flight test',
      tags: ['field', 'uav'],
      px4: {
        mavSystemId: 1,
        managementIp: '192.0.2.10',
        sshUsername: 'pilot',
        physicalMavrosLocalPort: 9010,
        physicalFcuRemotePort: 14550,
      },
    });
  });

  it('accepts only the exact Mocap Rotor model/profile pair with zero FS150 wiring', () => {
    const spec = mocapRotor();
    expect(decodeRobotAssetDocument(document(spec),mocapRotorComposition).spec).toEqual(spec);
    expect(() => decodeRobotAssetDocument(document(spec),composition)).toThrow(/disabled in this Product Profile/);
    expect(validateRobotAssetSpec({
      ...spec,
      px4: { ...spec.px4,physicalMavrosLocalPort: 9010 },
    },mocapRotorComposition)).toContain('must not carry FS150 MAVROS or SITL');
    const overview = robotAssetOverviewAttributes(document(spec),mocapRotorComposition);
    expect(overview).toEqual(expect.arrayContaining([
      { id: 'remote-ip',label: 'Onboard IP',value: '0.0.0.0' },
      { id: 'telemetry',label: 'Ground telemetry',value: 'Zenoh · read only' },
    ]));
    expect(overview.map((row) => row.id)).not.toEqual(expect.arrayContaining([
      'mavlink-local','mavlink-remote','mavros-fcu','vrpn-pose',
    ]));
  });

  it('rejects unknown aggregate fields, mixed kinds and malformed physical identity', () => {
    expect(() => decodeRobotAssetDocument({
      ...document(px4()),
      spec: { ...px4(), robots: [] },
    }, composition)).toThrow(/unknown field/);

    expect(() => decodeRobotAssetDocument({
      ...document(px4()),
      spec: { ...px4(), scout: scout().scout },
    }, composition)).toThrow(/wrong robot kind/);

    expect(validateRobotAssetSpec({
      ...px4(),
      px4: { ...px4().px4, mavSystemId: 0 },
    }, composition)).toContain('between 1 and 245');
  });

  it('normalizes Unitree B2 by trimming string inventory facts', () => {
    const normalized = normalizeRobotAssetSpec({
      ...unitreeB2(),
      name: '  B2 01  ',
      unitreeB2: {
        serialNumber: '  B2-SN-001  ',
        robotAddress: '  b2-01.lab.local  ',
        rosDomainId: 7,
        sshUsername: '  thor  ',
        sshPassword: '  1  ',
      },
    }, composition);
    expect(normalized).toEqual({
      name: 'B2 01',
      description: '',
      tags: ['quadruped'],
      kind: 'unitree_b2',
      profileId: 'unitree.b2.v1',
      unitreeB2: {
        serialNumber: 'b2-01.lab.local',
        robotAddress: 'b2-01.lab.local',
        rosDomainId: 7,
        sshUsername: 'thor',
        sshPassword: '1',
      },
    });
  });

  it('rejects Unitree B2 out-of-range, non-integer ROS domain, and empty required strings', () => {
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, rosDomainId: -1 },
    }, composition)).toContain('between 0 and 232');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, rosDomainId: 233 },
    }, composition)).toContain('between 0 and 232');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, rosDomainId: 1.5 },
    }, composition)).toContain('between 0 and 232');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, robotAddress: '' },
    }, composition)).toContain('robotAddress is required');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, sshUsername: '' },
    }, composition)).toContain('sshUsername is required');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, sshPassword: '' },
    }, composition)).toContain('sshPassword is required');
    // Inclusive bounds are accepted.
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, rosDomainId: 0 },
    }, composition)).toBe('');
    expect(validateRobotAssetSpec({
      ...unitreeB2(),
      unitreeB2: { ...unitreeB2().unitreeB2, rosDomainId: 232 },
    }, composition)).toBe('');
  });

  it('rejects Unitree B2 wrong arms, unknown nested keys, and non-canonical padding', () => {
    expect(() => decodeRobotAssetDocument({
      ...document(unitreeB2()),
      spec: { ...unitreeB2(), px4: px4().px4 },
    }, composition)).toThrow(/wrong robot kind/);
    expect(() => decodeRobotAssetDocument({
      ...document(unitreeB2()),
      spec: { ...unitreeB2(), scout: scout().scout },
    }, composition)).toThrow(/wrong robot kind/);
    expect(() => decodeRobotAssetDocument({
      ...document(unitreeB2()),
      spec: { ...unitreeB2(), mecanum: mecanum().mecanum },
    }, composition)).toThrow(/wrong robot kind/);
    expect(() => decodeRobotAssetDocument({
      ...document(px4()),
      spec: { ...px4(), unitreeB2: unitreeB2().unitreeB2 },
    }, composition)).toThrow(/wrong robot kind/);

    for (const forbidden of [
      { agentTargetId: 'agent-1' },
      { trust: 'trusted' },
      { endpoint: 'https://agent.example' },
      { manipulatorARXR5A: {} },
      { simulation: { productId: 'x', launchPackage: 'y', launchFile: 'z' } },
      { runtime: {} },
    ]) {
      expect(() => decodeRobotAssetDocument({
        ...document(unitreeB2()),
        spec: {
          ...unitreeB2(),
          unitreeB2: { ...unitreeB2().unitreeB2, ...forbidden },
        },
      }, composition)).toThrow(/unknown field/);
    }

    // Decoder requires already-canonical strings (no trim-on-decode defaulting).
    expect(() => decodeRobotAssetDocument({
      ...document(unitreeB2()),
      spec: {
        ...unitreeB2(),
        unitreeB2: {
          ...unitreeB2().unitreeB2,
          serialNumber: '  B2-SN-001  ',
        },
      },
    }, composition)).toThrow(/must already be canonical/);
  });
});

function px4(): Extract<RobotAssetSpec, { kind: 'px4_multirotor' }> {
  return {
    name: 'UAV 1', description: '', tags: ['uav'], kind: 'px4_multirotor',
    profileId: 'px4.multirotor.ros1.v9',
    px4: {
      modelId: 'fs150',
      mavSystemId: 1, managementIp: '192.0.2.10', sshUsername: 'pilot',
      sshPassword: 'secret', mocapRigidBodyName: 'uav1',
      positioningFrameNumber:5,positioningComparisonThresholdM:1e-10,
      physicalMavrosLocalPort: 9010, physicalFcuRemotePort: 14550,
      simulationLocalPort: 15000, simulationRemotePort: 15300,
      simulation: {
        productId: 'xgc2-gazebo-sim-fs150-sitl',
        launchPackage: 'gazebo_sim_fs150_sitl',
        launchFile: 'fs150.launch',
      },
    },
  };
}

function mocapRotor(): Extract<RobotAssetSpec, { kind: 'px4_multirotor' }> {
  return {
    name: 'Mocap Rotor 01',description: '',tags: ['mocap'],kind: 'px4_multirotor',
    profileId: 'px4.mocap-rotor.ros1.v1',
    px4: {
      modelId: 'mocap_rotor',mavSystemId: 1,managementIp: '0.0.0.0',
      sshUsername: 'operator',sshPassword: 'unset',mocapRigidBodyName: 'mocap_rotor1',
      positioningFrameNumber:0,positioningComparisonThresholdM:0,
      physicalMavrosLocalPort: 0,physicalFcuRemotePort: 0,
      simulationLocalPort: 0,simulationRemotePort: 0,
      simulation: { productId: '',launchPackage: '',launchFile: '' },
    },
  };
}

function scout(): Extract<RobotAssetSpec, { kind: 'scout_mini' }> {
  return {
    name: 'Scout 1', description: '', tags: ['ugv'], kind: 'scout_mini',
    profileId: 'scout-mini.ros1.v6',
    scout: {
      managementAddress: '192.0.2.20',
      connector: 'swarm_ros_bridge',
      sshUsername: 'wheeltec',
      sshPassword: 'secret',
      telemetryRemotePort: 3001,
      controlLocalPort: 3001,
      mocapRigidBodyName: 'scout1',
      positioningFrameNumber:5,positioningComparisonThresholdM:1e-10,
      simulation: {
        productId: 'xgc2-gazebo-sim-scout',
        launchPackage: 'gazebo_sim_scout',
        launchFile: 'spawn_accurate.launch',
      },
    },
  };
}

function mecanum(): Extract<RobotAssetSpec, { kind: 'mecanum_ugv' }> {
  return {
    name: 'Mecanum 1', description: '', tags: ['ugv'], kind: 'mecanum_ugv',
    profileId: 'mecanum-ugv.ros1.v3',
    mecanum: {
      managementAddress: '192.0.2.30',
      connector: 'swarm_ros_bridge',
      sshUsername: 'wheeltec',
      sshPassword: 'secret',
      telemetryRemotePort: 3001,
      controlLocalPort: 3001,
      mocapRigidBodyName: 'ugv1',
      positioningFrameNumber:5,positioningComparisonThresholdM:1e-10,
      simulation: {
        productId: 'xgc2-gazebo-sim-mecanum',
        launchPackage: 'gazebo_sim_mecanum',
        launchFile: 'spawn.launch',
      },
    },
  };
}

function unitreeB2(): UnitreeB2RobotAssetSpec {
  return {
    name: 'B2 01', description: '', tags: ['quadruped'], kind: 'unitree_b2',
    profileId: 'unitree.b2.v1',
    unitreeB2: {
      serialNumber: 'b2-01.lab.local',
      robotAddress: 'b2-01.lab.local',
      rosDomainId: 42,
      sshUsername: 'thor',
      sshPassword: '1',
    },
  };
}

function document(spec: RobotAssetSpec) {
  return {
    head: {
      domain: 'robot', resourceId: 'robot-1', name: spec.name, description: '', tags: spec.tags,
      mainCommitId: 'commit-1', currentVersion: 1, digest: 'a'.repeat(64), revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    },
    branch: {
      domain: 'robot', resourceId: 'robot-1', name: 'main', headCommitId: 'commit-1',
      headVersion: 1, revision: 1, createdAt: timestamp, updatedAt: timestamp,
    },
    spec,
  };
}
