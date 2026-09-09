import { describe,expect,it } from 'vitest';
import type { ExperimentRobotBinding } from './experimentModel';
import { experimentRobotBindingsChangeOnlyInitialPose } from './experimentInitialPoseAuthoring';

describe('experimentRobotBindingsChangeOnlyInitialPose',() => {
  it('allows finite next-start XYZ/yaw changes while leaving the source unchanged',() => {
    const current = [binding('uav-01'),binding('uav-02')];
    const next = structuredClone(current);
    next[1]!.initialPose = { x:5,y:-2,z:3,yaw:0.8 };
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,next)).toBe(true);
    expect(current[1]?.initialPose).toEqual({ x:0,y:0,z:0,yaw:0 });
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,structuredClone(current))).toBe(false);
  });

  it.each([
    ['namespace',(robot: ExperimentRobotBinding) => { robot.namespace = '/other'; }],
    ['slot identity',(robot: ExperimentRobotBinding) => { robot.id = 'other'; }],
    ['Robot assignment',(robot: ExperimentRobotBinding) => { robot.ref.resourceId = 'other'; }],
    ['Robot branch',(robot: ExperimentRobotBinding) => { robot.ref.branch = 'other'; }],
    ['hybrid source',(robot: ExperimentRobotBinding) => { robot.hybridSource = 'simulation'; }],
    ['runtime parameter',(robot: ExperimentRobotBinding) => { robot.runtimeParameters.robotName = 'other'; }],
    ['Robot kind',(robot: ExperimentRobotBinding) => { delete robot.px4; robot.scout = { lidarSimulationEnabled:false,imageSimulationEnabled:false }; }],
  ] as const)('refuses a pose update carrying a changed %s',(_label,change) => {
    const current = [binding('uav-01')];
    const next = structuredClone(current);
    next[0]!.initialPose.z = 3;
    change(next[0]!);
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,next)).toBe(false);
  });

  it('refuses additions, removals, and reordered Robot assignments',() => {
    const current = [binding('uav-01'),binding('uav-02')];
    const next = structuredClone(current);
    next[0]!.initialPose.x = 3;
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,[...next,binding('uav-03')])).toBe(false);
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,next.slice(1))).toBe(false);
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,[...next].reverse())).toBe(false);
  });

  it.each([Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY])('refuses non-finite pose value %s', (value) => {
    const current = [binding('uav-01')];
    const next = structuredClone(current);
    next[0]!.initialPose.z = value;
    expect(experimentRobotBindingsChangeOnlyInitialPose(current,next)).toBe(false);
  });
});

function binding(id: string): ExperimentRobotBinding {
  return {
    id,ref:{ domain:'robot',resourceId:id,branch:'main' },namespace:`/${id}`,
    hybridSource:'physical',runtimeParameters:{},initialPose:{ x:0,y:0,z:0,yaw:0 },px4:{},
  };
}
