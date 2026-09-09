import { describe, expect, it } from 'vitest';
import {
  ROBOT_CHASSIS_MECANUM,
  ROBOT_CHASSIS_MULTIROTOR,
  ROBOT_CHASSIS_UNICYCLE,
  robotAssetChassisClass,
  robotAssetVendorLabel,
  robotChassisFilterOptions,
  robotChassisFolderEntries,
  robotChassisSelectOptions,
  robotVendorOptionsForChassis,
} from './robotAssetChassis';
import { builtInRobotAssetKindComposition } from './builtInRobotAssetKindContributions';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';
import type { RobotAssetSpec } from './robotAssetContracts';

describe('robotAssetChassis', () => {
  it('maps protocol stacks onto the three product chassis folders', () => {
    expect(robotAssetChassisClass(px4Spec())).toBe(ROBOT_CHASSIS_MULTIROTOR);
    expect(robotAssetChassisClass(mecanumSpec())).toBe(ROBOT_CHASSIS_MECANUM);
    expect(robotAssetChassisClass(scoutSpec())).toBe(ROBOT_CHASSIS_UNICYCLE);
    expect(robotAssetVendorLabel(px4Spec())).toBe('PX4');
    expect(robotAssetVendorLabel(mecanumSpec())).toBe('Wheeltec');
    expect(robotAssetVendorLabel(scoutSpec())).toBe('Scout');
  });

  it('lists exactly Multirotor, Mecanum, and Unicycle — never Differential or a brand', () => {
    const builtIn = robotChassisFolderEntries(builtInRobotAssetKindComposition());
    expect(builtIn.map((folder) => folder.id)).toEqual([
      ROBOT_CHASSIS_MULTIROTOR,
      ROBOT_CHASSIS_MECANUM,
      ROBOT_CHASSIS_UNICYCLE,
    ]);
    expect(builtIn.map((folder) => folder.title)).toEqual([
      'Multirotor',
      'Mecanum',
      'Unicycle',
    ]);
    expect(builtIn.some((folder) => /PX4|Wheeltec|Scout|Differential|Ackermann|Unitree/i.test(folder.title)))
      .toBe(false);

    const withB2 = robotChassisFolderEntries(robotAssetKindCompositionWithUnitreeB2);
    expect(withB2.map((folder) => folder.id)).toEqual(builtIn.map((folder) => folder.id));
  });

  it('offers Unicycle + Scout firmware, not a Differential chassis', () => {
    const builtIn = builtInRobotAssetKindComposition();
    expect(robotChassisSelectOptions(builtIn).map((option) => option.id)).toEqual([
      ROBOT_CHASSIS_MULTIROTOR,
      ROBOT_CHASSIS_MECANUM,
      ROBOT_CHASSIS_UNICYCLE,
    ]);
    const composition = robotAssetKindCompositionWithUnitreeB2;
    expect(robotChassisSelectOptions(composition).slice(0, 3).map((option) => option.id)).toEqual([
      ROBOT_CHASSIS_MULTIROTOR,
      ROBOT_CHASSIS_MECANUM,
      ROBOT_CHASSIS_UNICYCLE,
    ]);
    expect(robotVendorOptionsForChassis(ROBOT_CHASSIS_MULTIROTOR, composition)).toEqual([
      { id: 'px4', label: 'PX4' },
    ]);
    expect(robotVendorOptionsForChassis(ROBOT_CHASSIS_MECANUM, composition)).toEqual([
      { id: 'mecanum', label: 'Wheeltec' },
    ]);
    expect(robotVendorOptionsForChassis(ROBOT_CHASSIS_UNICYCLE, composition)).toEqual([
      { id: 'scout', label: 'Scout' },
    ]);
    expect(robotChassisSelectOptions(composition).some((option) => option.id === 'differential')).toBe(false);
    expect(robotChassisSelectOptions(composition).some((option) => option.label === 'Differential')).toBe(false);
  });

  it('offers All plus the three chassis folders as list filter options', () => {
    expect(robotChassisFilterOptions().map((option) => option.value)).toEqual([
      'all',
      ROBOT_CHASSIS_MULTIROTOR,
      ROBOT_CHASSIS_MECANUM,
      ROBOT_CHASSIS_UNICYCLE,
    ]);
    expect(robotChassisFilterOptions().map((option) => option.label)).toEqual([
      'All', 'Multirotor', 'Mecanum', 'Unicycle',
    ]);
  });
});

function px4Spec(): RobotAssetSpec {
  return {
    name: 'UAV 01',
    description: '',
    tags: [],
    kind: 'px4_multirotor',
    profileId: 'px4.multirotor.ros1.v9',
    px4: {
      modelId:'fs150',
      mavSystemId: 1,
      managementIp: '192.0.2.10',
      sshUsername: 'pilot',
      sshPassword: 'secret',
      mocapRigidBodyName: 'uav1',
      physicalMavrosLocalPort: 9010,
      physicalFcuRemotePort: 14550,
      simulationLocalPort: 15000,
      simulationRemotePort: 15300,
      simulation: {
        productId: 'xgc2-gazebo-sim-fs150-sitl',
        launchPackage: 'gazebo_sim_fs150_sitl',
        launchFile: 'fs150.launch',
      },
    },
  };
}

function scoutSpec(): RobotAssetSpec {
  return {
    name: 'Scout 01',
    description: '',
    tags: [],
    kind: 'scout_mini',
    profileId: 'scout-mini.ros1.v6',
    scout: {
      managementAddress: '192.0.2.20',
      connector: 'swarm_ros_bridge',
      sshUsername: 'agilex',
      sshPassword: 'agx',
      telemetryRemotePort: 3001,
      controlLocalPort: 3001,
      mocapRigidBodyName: 'ugv1',
      simulation: {
        productId: 'xgc2-gazebo-sim-scout',
        launchPackage: 'gazebo_sim_scout',
        launchFile: 'spawn_accurate.launch',
      },
    },
  };
}

function mecanumSpec(): RobotAssetSpec {
  return {
    name: 'Mecanum 01',
    description: '',
    tags: [],
    kind: 'mecanum_ugv',
    profileId: 'mecanum-ugv.ros1.v3',
    mecanum: {
      managementAddress: '192.0.2.30',
      connector: 'swarm_ros_bridge',
      sshUsername: 'wheeltec',
      sshPassword: 'dongguan',
      telemetryRemotePort: 3001,
      controlLocalPort: 3001,
      mocapRigidBodyName: 'ugv1',
      simulation: {
        productId: 'xgc2-gazebo-sim-mecanum',
        launchPackage: 'gazebo_sim_mecanum',
        launchFile: 'spawn.launch',
      },
    },
  };
}
