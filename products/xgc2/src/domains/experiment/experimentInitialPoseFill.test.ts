import { describe,expect,it } from 'vitest';
import type { RunRobot } from '../robot/robotPublic';
import type { ExperimentRobotBinding } from './experimentModel';
import {
  experimentRobotBindingsChangeOnlyInitialXYYaw,
  fillExperimentInitialPoseFromCurrentRobot,
  fillExperimentInitialPosesFromCurrentRobots,
  worldOriginOffsetFromCurrentRobotPose,
} from './experimentInitialPoseFill';

describe('fillExperimentInitialPosesFromCurrentRobots',() => {
  it('copies canonical PX4 and UGV XY/yaw, preserves z, and ignores channel stale state',() => {
    const bindings=[px4Binding(),scoutBinding()];
    const result=fillExperimentInitialPosesFromCurrentRobots(bindings,[
      robot(bindings[0]!, 'state.mocap.pose', pose(4,5,Math.PI/2), true),
      robot(bindings[1]!, 'vrpn.position', pose(-2,3,-Math.PI/4), false),
    ]);
    expect(result).toMatchObject({ filled:2,skipped:0 });
    expect(result.bindings[0]?.initialPose).toMatchObject({ x:4,y:5,z:1.25 });
    expect(result.bindings[0]?.initialPose.yaw).toBeCloseTo(Math.PI/2,12);
    expect(result.bindings[1]?.initialPose).toMatchObject({ x:-2,y:3,z:0.181 });
    expect(result.bindings[1]?.initialPose.yaw).toBeCloseTo(-Math.PI/4,12);
  });

  it('skips missing, non-finite, invalid-quaternion, and stale-asset projections independently',() => {
    const bindings=[px4Binding(),scoutBinding(),{ ...scoutBinding(),id:'scout-02' }];
    const badQuaternion=pose(1,2,0);
    badQuaternion.orientation={ x:0,y:0,z:0,w:0 };
    const result=fillExperimentInitialPosesFromCurrentRobots(bindings,[
      robot(bindings[0]!, 'state.mocap.pose', { ...pose(1,2,0),position:{ x:Number.NaN,y:2,z:0 } }, false),
      robot(bindings[1]!, 'vrpn.position', badQuaternion, false),
      { ...robot(bindings[2]!, 'vrpn.position', pose(8,9,0), false),robotAssetId:'another-asset' },
    ]);
    expect(result.filled).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.bindings).toEqual(bindings);
  });

  it('fills only the selected Robot and leaves siblings unchanged',() => {
    const bindings=[px4Binding(),scoutBinding()];
    const result=fillExperimentInitialPoseFromCurrentRobot(bindings,bindings[1]!.id,[
      robot(bindings[0]!, 'state.mocap.pose', pose(4,5,Math.PI/2), true),
      robot(bindings[1]!, 'vrpn.position', pose(-2,3,-Math.PI/4), false),
    ]);
    expect(result).toMatchObject({ filled:1,skipped:0 });
    expect(result.bindings[0]).toEqual(bindings[0]);
    expect(result.bindings[1]?.initialPose).toMatchObject({ x:-2,y:3,z:0.181 });
    expect(result.bindings[1]?.initialPose.yaw).toBeCloseTo(-Math.PI/4,12);
  });

  it('shifts world origin so the current canonical pose lands at zero',() => {
    expect(worldOriginOffsetFromCurrentRobotPose({ x:0,y:0,z:0 },{ x:10,y:-4,z:1.5,yaw:0.2 }))
      .toEqual({ x:-10,y:4,z:-1.5 });
    expect(worldOriginOffsetFromCurrentRobotPose({ x:-2,y:1,z:0.5 },{ x:8,y:5,z:0.5,yaw:0 }))
      .toEqual({ x:-10,y:-4,z:0 });
  });

  it('admits only XY/yaw changes while keeping z and Robot identity frozen',() => {
    const current=[px4Binding()];
    const next=structuredClone(current);
    expect(experimentRobotBindingsChangeOnlyInitialXYYaw(current,next)).toBe(false);
    next[0]!.initialPose.x=2;
    next[0]!.initialPose.y=-3;
    next[0]!.initialPose.yaw=0.4;
    expect(experimentRobotBindingsChangeOnlyInitialXYYaw(current,next)).toBe(true);
    next[0]!.initialPose.z=2;
    expect(experimentRobotBindingsChangeOnlyInitialXYYaw(current,next)).toBe(false);
    next[0]!.initialPose.z=current[0]!.initialPose.z;
    next[0]!.namespace='/other';
    expect(experimentRobotBindingsChangeOnlyInitialXYYaw(current,next)).toBe(false);
  });
});

function px4Binding():ExperimentRobotBinding {
  return {
    id:'px4-01',ref:{ domain:'robot',resourceId:'asset-px4',branch:'main' },namespace:'/uav1',
    hybridSource:'simulation',initialPose:{ x:0,y:0,z:1.25,yaw:0 },runtimeParameters:{},px4:{},
  };
}

function scoutBinding():ExperimentRobotBinding {
  return {
    id:'scout-01',ref:{ domain:'robot',resourceId:'asset-scout',branch:'main' },namespace:'/ugv1',
    hybridSource:'physical',initialPose:{ x:0,y:0,z:0.181,yaw:0 },runtimeParameters:{},
    scout:{ lidarSimulationEnabled:false,imageSimulationEnabled:false },
  };
}

function robot(
  binding:ExperimentRobotBinding,
  channelId:string,
  value:Record<string,unknown>,
  stale:boolean,
):RunRobot {
  return {
    id:binding.id,robotAssetId:binding.ref.resourceId,robotAssetCommitId:'asset-commit',robotAssetDigest:'digest',
    name:binding.id,kind:binding.px4?'px4_multirotor':'scout_mini',hybridSource:binding.hybridSource,
    profileId:'profile',namespace:binding.namespace,px4:binding.px4?{ modelId:'fs150',mavSystemId:1,managementIp:'',mocapRigidBodyName:'uav1' }:undefined,
    scout:binding.scout?{ managementAddress:'' }:undefined,operationContracts:[],adapterDefinitionId:'adapter',
    connectionEpoch:1,connectionState:'live',connectionRevision:1,online:true,operationalReady:true,status:'online',
    channels:{ [channelId]:{ channelId,sequence:1,messageId:1,observedAt:'',sourceAgeMs:0,staleAt:'',stale,value } },
  };
}

function pose(x:number,y:number,yaw:number) {
  return {
    position:{ x,y,z:99 },
    orientation:{ x:0,y:0,z:Math.sin(yaw/2),w:Math.cos(yaw/2) },
  };
}
