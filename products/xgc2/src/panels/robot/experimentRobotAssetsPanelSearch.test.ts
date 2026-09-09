import { describe,expect,it } from 'vitest';
import {
  PX4_MODEL_FS150,
  builtInRobotAssetKindComposition,
} from '../../domains/robot/robotAssetPublic';
import type { RobotAssetDocument } from '../../domains/robot/robotAssetPublic';
import {
  normalizeRobotAssetsSearchQuery,
  robotAssetMatchesQuery,
} from './experimentRobotAssetsPanelSearch';

const composition = builtInRobotAssetKindComposition();

describe('experiment robot assets panel search', () => {
  it('matches assets by name, kind, model, and catalog metadata without a second catalog', () => {
    const query = normalizeRobotAssetsSearchQuery('fs150');
    expect(robotAssetMatchesQuery(px4Asset(), query, composition)).toBe(true);
    expect(robotAssetMatchesQuery(scoutAsset(), query, composition)).toBe(false);
    expect(robotAssetMatchesQuery(px4Asset(), normalizeRobotAssetsSearchQuery('px4_multirotor'), composition)).toBe(true);
    expect(robotAssetMatchesQuery(px4Asset(), normalizeRobotAssetsSearchQuery('192.0.2.1'), composition)).toBe(true);
    expect(robotAssetMatchesQuery(px4Asset(), normalizeRobotAssetsSearchQuery('secret'), composition)).toBe(false);
  });

});

function px4Asset(): RobotAssetDocument {
  return {
    head: {
      domain: 'robot', resourceId: 'uav-01', name: 'UAV 01', tags: [], mainCommitId: 'uav-01-commit',
      currentVersion: 1, digest: 'uav-01', revision: 1, createdAt: '', updatedAt: '',
    },
    branch: {
      domain: 'robot', resourceId: 'uav-01', name: 'main', headCommitId: 'uav-01-commit',
      headVersion: 1, revision: 1, createdAt: '', updatedAt: '',
    },
    spec: {
      kind: 'px4_multirotor', name: 'UAV 01', description: '', tags: [], profileId: 'px4.profile',
      px4: {
        modelId: PX4_MODEL_FS150,
        mavSystemId: 1, managementIp: '192.0.2.1', sshUsername: 'robot', sshPassword: 'secret',
        mocapRigidBodyName: 'uav-01', physicalMavrosLocalPort: 9010, physicalFcuRemotePort: 14560,
        simulationLocalPort: 15000, simulationRemotePort: 15300,
        simulation: { productId: 'px4', launchPackage: 'px4', launchFile: 'sitl.launch' },
      },
    },
  };
}

function scoutAsset(): RobotAssetDocument {
  return {
    head: {
      domain: 'robot', resourceId: 'scout-1', name: 'Scout Mini', tags: [], mainCommitId: 'scout-1-commit',
      currentVersion: 1, digest: 'scout-1', revision: 1, createdAt: '', updatedAt: '',
    },
    branch: {
      domain: 'robot', resourceId: 'scout-1', name: 'main', headCommitId: 'scout-1-commit',
      headVersion: 1, revision: 1, createdAt: '', updatedAt: '',
    },
    spec: {
      kind: 'scout_mini', name: 'Scout Mini', description: '', tags: [], profileId: 'scout.profile',
      scout: {
        managementAddress: '192.0.2.10', connector: 'swarm_ros_bridge',
        sshUsername: 'wheeltec', sshPassword: 'dongguan',
        telemetryRemotePort: 3001, controlLocalPort: 3001, mocapRigidBodyName: 'scout-1',
        simulation: { productId: 'scout', launchPackage: 'scout', launchFile: 'spawn.launch' },
      },
    },
  };
}
