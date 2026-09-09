import { describe,expect,it } from 'vitest';
import type { RobotAssetDocument } from '../robot/robotAssetPublic';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';

const b2Composition = robotAssetKindCompositionWithUnitreeB2;
import type { ExperimentRobotBinding } from './experimentModel';
import {
  experimentRobotBindingsChangeRoster,
  newExperimentRobotBinding,
  removeExperimentRobotAsset,
  reorderExperimentRobotAssets,
  replaceExperimentRobotBindingAsset,
} from './experimentRobotBindingAuthoring';

describe('Experiment Robot binding authoring', () => {
  it('treats add, remove, replace, and reorder as roster changes but not pose edits', () => {
    const first = px4Binding('px4-01','uav-01');
    const second = px4Binding('px4-02','uav-02');
    const posed = { ...first,initialPose:{ ...first.initialPose,x:3 } };
    expect(experimentRobotBindingsChangeRoster([], [first])).toBe(true);
    expect(experimentRobotBindingsChangeRoster([first,second], [first])).toBe(true);
    expect(experimentRobotBindingsChangeRoster([first,second], [second,first])).toBe(true);
    expect(experimentRobotBindingsChangeRoster([first], [{ ...first,ref:{ ...first.ref,resourceId:'uav-09' } }])).toBe(true);
    expect(experimentRobotBindingsChangeRoster([first], [posed])).toBe(false);
  });

  it('uses an empty PX4 kind marker; transport stays on the Robot asset', () => {
    const created = newExperimentRobotBinding(px4Asset('robot-2',2),[]);

    expect(created.px4).toEqual({});
    expect(created.ref.resourceId).toBe('robot-2');
    expect(created.namespace).toBe('/uav1');
    expect(created.hybridSource).toBe('physical');
  });

  it('assigns any selected physical PX4 to the first continuous UAV slot',() => {
    const created = newExperimentRobotBinding(px4Asset('fs150-04',4),[]);
    expect(created.id).toBe('px4-01');
    expect(created.namespace).toBe('/uav1');
    expect(created.ref.resourceId).toBe('fs150-04');
  });

  it('forms independent continuous UAV and shared UGV slots from arbitrary physical assets',() => {
    const assetNumbers = [14,16,18,13,11,6];
    const selected = assetNumbers.flatMap((number,index) => [
      px4Asset(`fs150-${String(number).padStart(2,'0')}`,number),
      index % 2 === 0
        ? scoutAsset(`scout-${String(number).padStart(2,'0')}`)
        : mecanumAsset(`mecanum-${String(number).padStart(2,'0')}`),
    ]);
    const bindings = selected.reduce<ExperimentRobotBinding[]>((current,asset) => (
      [...current,newExperimentRobotBinding(asset,current)]
    ),[]);

    expect(bindings.filter((binding) => binding.px4).map(({ id,namespace,ref }) => ({
      id,namespace,asset:ref.resourceId,
    }))).toEqual([
      { id:'px4-01',namespace:'/uav1',asset:'fs150-14' },
      { id:'px4-02',namespace:'/uav2',asset:'fs150-16' },
      { id:'px4-03',namespace:'/uav3',asset:'fs150-18' },
      { id:'px4-04',namespace:'/uav4',asset:'fs150-13' },
      { id:'px4-05',namespace:'/uav5',asset:'fs150-11' },
      { id:'px4-06',namespace:'/uav6',asset:'fs150-06' },
    ]);
    expect(bindings.filter((binding) => binding.scout || binding.mecanum)
      .map(({ id,namespace,ref }) => ({ id,namespace,asset:ref.resourceId }))).toEqual([
      { id:'ugv-01',namespace:'/ugv1',asset:'scout-14' },
      { id:'ugv-02',namespace:'/ugv2',asset:'mecanum-16' },
      { id:'ugv-03',namespace:'/ugv3',asset:'scout-18' },
      { id:'ugv-04',namespace:'/ugv4',asset:'mecanum-13' },
      { id:'ugv-05',namespace:'/ugv5',asset:'scout-11' },
      { id:'ugv-06',namespace:'/ugv6',asset:'mecanum-06' },
    ]);
  });

  it('reorders physical PX4 assignments without moving slot-owned parameters',() => {
    const first = px4Binding('px4-01','fs150-01');
    first.namespace='/uav1';first.initialPose.x=1;
    const second = px4Binding('px4-02','fs150-04');
    second.namespace='/uav2';second.initialPose.x=2;
    const reordered = reorderExperimentRobotAssets(
      [first,second],[px4Asset('fs150-01',1),px4Asset('fs150-04',4)],0,1,
    );
    expect(reordered.map(({ id,namespace,initialPose,ref }) => ({
      id,namespace,x:initialPose.x,asset:ref.resourceId,
    }))).toEqual([
      { id:'px4-01',namespace:'/uav1',x:1,asset:'fs150-04' },
      { id:'px4-02',namespace:'/uav2',x:2,asset:'fs150-01' },
    ]);
  });

  it('reorders Scout and Mecanum assets inside the shared UGV slot family',() => {
    const scout = newExperimentRobotBinding(scoutAsset('scout-14'),[]);
    scout.initialPose.x=1;
    const mecanum = newExperimentRobotBinding(mecanumAsset('mecanum-16'),[scout]);
    mecanum.initialPose.x=2;

    const reordered = reorderExperimentRobotAssets(
      [scout,mecanum],[scoutAsset('scout-14'),mecanumAsset('mecanum-16')],0,1,
    );

    expect(reordered.map(({ id,namespace,initialPose,ref,scout:scoutArm,mecanum:mecanumArm }) => ({
      id,namespace,x:initialPose.x,asset:ref.resourceId,
      kind:scoutArm ? 'scout' : mecanumArm ? 'mecanum' : 'unknown',
    }))).toEqual([
      { id:'ugv-01',namespace:'/ugv1',x:1,asset:'mecanum-16',kind:'mecanum' },
      { id:'ugv-02',namespace:'/ugv2',x:2,asset:'scout-14',kind:'scout' },
    ]);
  });

  it('removes one assignment and compacts same-family slots without gaps',() => {
    const bindings = [
      px4Binding('px4-01','fs150-01'),
      px4Binding('px4-02','fs150-04'),
      px4Binding('px4-03','fs150-06'),
    ];
    const compacted = removeExperimentRobotAsset(bindings,[
      px4Asset('fs150-01',1),px4Asset('fs150-04',4),px4Asset('fs150-06',6),
    ],1);
    expect(compacted.map(({ id,ref }) => ({ id,asset:ref.resourceId }))).toEqual([
      { id:'px4-01',asset:'fs150-01' },
      { id:'px4-02',asset:'fs150-06' },
    ]);
  });

  it('rebinds the Robot asset without inventing experiment transport fields', () => {
    const replacing = px4Binding('wingman','robot-old');
    replacing.runtimeParameters = { camera_profile: 'wide' };

    const replaced = replaceExperimentRobotBindingAsset(
      replacing,px4Asset('robot-new',3),
    );

    expect(replaced.ref.resourceId).toBe('robot-new');
    expect(replaced.runtimeParameters).toEqual({ camera_profile: 'wide' });
    expect(replaced.px4).toEqual({});
  });

  it('keeps Scout sensor toggles as the only experiment-owned override arm', () => {
    const scout = newExperimentRobotBinding(scoutAsset('scout-1'),[]);
    expect(scout.id).toBe('ugv-01');
    expect(scout.namespace).toBe('/ugv1');
    expect(scout.scout).toEqual({
      lidarSimulationEnabled: false,
      imageSimulationEnabled: false,
    });
    expect(scout.px4).toBeUndefined();
    expect(scout.mecanum).toBeUndefined();
  });

  it('uses an empty Mecanum kind marker; transport stays on the Robot asset', () => {
    const created = newExperimentRobotBinding(mecanumAsset('mecanum-1'),[]);
    expect(created.mecanum).toEqual({});
    expect(created.px4).toBeUndefined();
    expect(created.scout).toBeUndefined();
    expect(created.id).toBe('ugv-01');
    expect(created.namespace).toBe('/ugv1');
    expect(created.ref.resourceId).toBe('mecanum-1');
  });

  it('clears prior kind markers when rebinding to a different Robot kind', () => {
    const fromScout = newExperimentRobotBinding(scoutAsset('scout-1'),[]);
    const asMecanum = replaceExperimentRobotBindingAsset(fromScout,mecanumAsset('mecanum-2'));
    expect(asMecanum.ref.resourceId).toBe('mecanum-2');
    expect(asMecanum.mecanum).toEqual({});
    expect(asMecanum.scout).toBeUndefined();
    expect(asMecanum.px4).toBeUndefined();
  });

  it('uses an empty Unitree B2 kind marker; inventory stays on the Robot asset', () => {
    const b2 = unitreeB2Asset('robot-b2');
    const created = newExperimentRobotBinding(b2,[], b2Composition);
    expect(created.unitreeB2).toEqual({});
    expect(created.px4).toBeUndefined();
    expect(created.scout).toBeUndefined();
    expect(created.mecanum).toBeUndefined();
    expect(created.namespace).toBe('/b21');
    expect(created.initialPose.z).toBe(0.55);
    expect(created.ref.resourceId).toBe('robot-b2');

    const replaced = replaceExperimentRobotBindingAsset(
      px4Binding('leader','robot-old'),
      b2,
      b2Composition,
    );
    expect(replaced.ref.resourceId).toBe('robot-b2');
    expect(replaced.unitreeB2).toEqual({});
    expect(replaced.px4).toBeUndefined();
    expect(replaced.id).toBe('leader');
  });
});

function px4Binding(id: string,resourceId: string): ExperimentRobotBinding {
  return {
    id,
    ref: { domain: 'robot',resourceId,branch: 'main' },
    namespace: `/${id}`,
    hybridSource: 'physical',
    runtimeParameters: {},
    initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
    px4: {},
  };
}

function px4Asset(resourceId: string,mavSystemId = 1): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId,name: resourceId,tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: resourceId,revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      kind: 'px4_multirotor',name: resourceId,description: '',tags: [],profileId: 'px4.profile',
      px4: {
        modelId:'fs150',mavSystemId,managementIp: '192.0.2.1',sshUsername: 'robot',sshPassword: 'secret',
        mocapRigidBodyName: resourceId,physicalMavrosLocalPort: 9000 + mavSystemId * 10,
        physicalFcuRemotePort: 14560,
        simulationLocalPort: 15000 + mavSystemId - 1,
        simulationRemotePort: 15300 + mavSystemId - 1,
        simulation: { productId: 'px4',launchPackage: 'px4',launchFile: 'sitl.launch' },
      },
    },
  };
}

function scoutAsset(resourceId: string): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId,name: resourceId,tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: resourceId,revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      kind: 'scout_mini',name: resourceId,description: '',tags: [],profileId: 'scout.profile',
      scout: {
        managementAddress: '192.0.2.10',
        connector: 'swarm_ros_bridge',
        sshUsername: 'wheeltec',
        sshPassword: 'dongguan',
        telemetryRemotePort: 3001,
        controlLocalPort: 3001,
        mocapRigidBodyName: resourceId,
        simulation: { productId: 'scout',launchPackage: 'scout',launchFile: 'spawn.launch' },
      },
    },
  };
}

function mecanumAsset(resourceId: string): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId,name: resourceId,tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: resourceId,revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      kind: 'mecanum_ugv',name: resourceId,description: '',tags: [],profileId: 'mecanum.profile',
      mecanum: {
        managementAddress: '192.0.2.20',
        connector: 'swarm_ros_bridge',
        sshUsername: 'wheeltec',
        sshPassword: 'dongguan',
        telemetryRemotePort: 3001,
        controlLocalPort: 3301,
        mocapRigidBodyName: resourceId,
        simulation: {
          productId: 'xgc2-gazebo-sim-mecanum',
          launchPackage: 'gazebo_sim_mecanum',
          launchFile: 'spawn.launch',
        },
      },
    },
  };
}

function unitreeB2Asset(resourceId: string): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId,name: resourceId,tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: resourceId,revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'robot',resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      kind: 'unitree_b2',name: 'B2 01',description: '',tags: [],profileId: 'unitree.b2.v1',
      unitreeB2: {
        serialNumber: 'b2-01.lab.local',
        robotAddress: 'b2-01.lab.local',
        rosDomainId: 42,
        sshUsername: 'thor',
        sshPassword: '1',
      },
    },
  };
}
