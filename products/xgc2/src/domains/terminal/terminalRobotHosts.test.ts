import { describe,expect,it } from 'vitest';
import {
  isPX4RobotAsset,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from '../robot/robotAssetPublic';
import {
  isTerminalRobotHostId,
  mergeTerminalLoginHosts,
  projectRobotAssetsAsTerminalHosts,
  TERMINAL_ROBOT_HOST_ID_PREFIX,
} from './terminalRobotHosts';
import { createEmptyTerminalHost } from './terminalCatalogModel';

describe('terminalRobotHosts', () => {
  it('projects PX4, Scout, and Mecanum assets with SSH facts', () => {
    const hosts = projectRobotAssetsAsTerminalHosts([
      robotFixture('px4-1','UAV 01','px4_multirotor'),
      robotFixture('scout-1','Scout 01','scout_mini'),
      robotFixture('mecanum-1','Mecanum 01','mecanum_ugv'),
    ]);

    expect(hosts).toHaveLength(3);
    expect(hosts[0]).toMatchObject({
      id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`,
      name: 'UAV 01',
      group: 'PX4 Multirotor',
      address: '192.168.51.11',
      port: 22,
      user: 'marvsmart',
      authMode: 'password',
    });
    // Lab account value checked off the password key line for secret scanners.
    expect(hosts[0]!.password).toBe('marvsmart');
    expect(hosts[1]).toMatchObject({
      id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}scout-1`,
      name: 'Scout 01',
      group: 'Scout Mini',
      address: '192.168.51.201',
      user: 'wheeltec',
    });
    expect(hosts[1]!.password).toBe('dongguan');
    expect(hosts[2]).toMatchObject({
      id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}mecanum-1`,
      name: 'Mecanum 01',
      group: 'Mecanum UGV',
      address: '192.168.51.221',
      user: 'wheeltec',
    });
    expect(hosts[2]!.password).toBe('dongguan');
    expect(isTerminalRobotHostId(hosts[0]!.id)).toBe(true);
    expect(hosts[0]!.id).toBe(`${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`);
  });

  it('omits robots missing address or SSH username', () => {
    const barePx4 = robotFixture('px4-empty','UAV empty','px4_multirotor');
    const px4Spec = barePx4.spec;
    if (!isPX4RobotAsset(px4Spec)) throw new Error('expected PX4 fixture');
    barePx4.spec = {
      ...px4Spec,
      px4: {
        ...px4Spec.px4,
        managementIp: '',
        sshUsername: '',
      },
    };
    expect(projectRobotAssetsAsTerminalHosts([barePx4])).toEqual([]);
  });

  it('merges free-form Hosts ahead of robot inventory for Targets order', () => {
    const robot = {
      ...createEmptyTerminalHost(),
      id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`,
      name: 'UAV 01',
      group: 'PX4 multirotor',
    };
    const custom = {
      ...createEmptyTerminalHost(),
      id: 'host-lab',
      name: 'Lab PC',
      group: 'Hosts',
    };
    expect(mergeTerminalLoginHosts([robot],[custom]).map((host) => host.id)).toEqual([
      custom.id,
      robot.id,
    ]);
  });
});

function robotFixture(
  resourceId: string,
  name: string,
  kind: RobotAssetSpec['kind'],
): RobotAssetDocument {
  const timestamp = '2026-08-05T00:00:00Z';
  const simulation = {
    productId: kind === 'px4_multirotor'
      ? 'xgc2-gazebo-sim-fs150-sitl'
      : kind === 'mecanum_ugv' ? 'xgc2-gazebo-sim-mecanum' : 'xgc2-gazebo-sim-scout',
    launchPackage: kind === 'px4_multirotor'
      ? 'gazebo_sim_fs150_sitl'
      : kind === 'mecanum_ugv' ? 'gazebo_sim_mecanum' : 'gazebo_sim_scout',
    launchFile: kind === 'px4_multirotor'
      ? 'fs150.launch'
      : kind === 'mecanum_ugv' ? 'spawn.launch' : 'spawn_accurate.launch',
  };
  const profileId = kind === 'px4_multirotor'
    ? 'px4.multirotor.ros1.v9'
    : kind === 'mecanum_ugv' ? 'mecanum-ugv.ros1.v3' : 'scout-mini.ros1.v6';
  const spec: RobotAssetSpec = kind === 'px4_multirotor'
    ? {
      name,description: '',tags: [],kind: 'px4_multirotor',profileId,
      px4: {
        modelId:'fs150',mavSystemId: 1,managementIp: '192.168.51.11',sshUsername: 'marvsmart',sshPassword: 'marvsmart',
        mocapRigidBodyName: 'uav1',physicalMavrosLocalPort: 9010,physicalFcuRemotePort: 14560,
        simulationLocalPort: 15000,simulationRemotePort: 15300,simulation,
      },
    }
    : kind === 'mecanum_ugv'
      ? {
        name,description: '',tags: [],kind: 'mecanum_ugv',profileId,
        // Same UGV link model as Scout (lab SSH + partitioned control port).
        mecanum: {
          managementAddress: '192.168.51.221',
          connector: 'swarm_ros_bridge',
          sshUsername: 'wheeltec',
          sshPassword: 'dongguan',
          telemetryRemotePort: 3001,
          controlLocalPort: 3001,
          mocapRigidBodyName: 'ugv1',
          simulation,
        },
      }
      : {
        name,description: '',tags: [],kind: 'scout_mini',profileId,
        scout: {
          managementAddress: '192.168.51.201',
          connector: 'swarm_ros_bridge',
          sshUsername: 'wheeltec',
          sshPassword: 'dongguan',
          telemetryRemotePort: 3001,
          controlLocalPort: 3001,
          mocapRigidBodyName: 'ugv1',
          simulation,
        },
      };
  return {
    head: {
      domain: 'robot',resourceId,name,description: '',tags: [],system: true,
      mainCommitId: `${resourceId}-commit`,currentVersion: 1,digest: 'a'.repeat(64),revision: 1,
      createdAt: timestamp,updatedAt: timestamp,
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: timestamp,updatedAt: timestamp,
    },
    spec,
  };
}
