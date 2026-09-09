// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import type { ExperimentRobotBinding } from '../../domains/experiment/experimentPublic';
import type { RobotAssetDocument } from '../../domains/robot/robotAssetPublic';
import type { RobotChannelProjection,RunRobot } from '../../domains/robot/robotPublic';
import {
  robotHealthTone,
  robotLabel,
  robotProjectionSessionRunId,
  splitSignedArrayAxis,
  signedFixedWidth,
  splitSignedFixed,
  staticRobot,
} from './robotProjectionModel';
import { unsignedZeroFixed } from './robotTelemetryValues';
import { robotAssetKindCompositionWithUnitreeB2 } from '../../../test-fixtures/robot-kinds/with-unitree-b2';

const b2Composition = robotAssetKindCompositionWithUnitreeB2;

describe('robotProjectionSessionRunId',() => {
  it('selects only the exact typed Session root of the Panel child',() => {
    expect(robotProjectionSessionRunId({
      targetId:'local',activeRun:{ id:'system-root',targetId:'local' },
      sessionViews:[{ session:{ id:'session-1',targetId:'local',state:'active' },members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
        ownerId:'panel-child',status:'running',revision:1,
      }] }],runDetailsById:{},processInstances:[],documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    } as never,'panel-child','robot-runtime')).toBe('panel-child');
  });

  it('never falls back to a child or another target while lineage is unresolved',() => {
    const runtime = {
      targetId:'local',activeRun:{ id:'system-root',targetId:'local' },
      activeRuns:[{ id:'system-root',targetId:'local' }],runSummaries:[],runDetailsById:{},
      processInstances:[],documents:[],catalog:[],loading:false,error:'',
    };
    expect(robotProjectionSessionRunId(runtime as never,'panel-child','robot-runtime')).toBeUndefined();
    expect(robotProjectionSessionRunId({
      ...runtime,sessionViews:[{ session:{ id:'session-1',targetId:'agent-a',state:'active' },members:[{
        id:'member-1',targetId:'agent-a',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
        ownerId:'panel-child',status:'running',revision:1,
      }] }],
    } as never,'panel-child','robot-runtime')).toBeUndefined();
  });

  it.each([
    ['stopping Session','stopping','running'],
    ['stopping member','active','stopping'],
  ] as const)('revokes projection identity for a %s',(_label,sessionState,memberStatus) => {
    expect(robotProjectionSessionRunId({
      targetId:'local',activeRun:{ id:'system-root',targetId:'local' },sessionViews:[{
        session:{ id:'session-1',targetId:'local',state:sessionState },
        members:[{ id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',
          kind:'workflow_run',ownerId:'panel-child',status:memberStatus,revision:2 }],
      }],runDetailsById:{},processInstances:[],documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    } as never,'panel-child','robot-runtime')).toBeUndefined();
  });

  it('revokes the projection while every target root is locally stopping ahead of Session reconciliation',() => {
    expect(robotProjectionSessionRunId({
      targetId:'local',activeRun:{ id:'system-root',targetId:'local',status:'stopping' },
      activeRuns:[
        { id:'system-root',targetId:'local',status:'stopping' },
        { id:'selected-root',targetId:'local',status:'stopping' },
      ],
      sessionViews:[{ session:{ id:'session-1',targetId:'local',state:'active' },members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
        ownerId:'panel-child',status:'running',revision:1,
      }] }],runDetailsById:{},processInstances:[],documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    } as never,'panel-child','robot-runtime')).toBeUndefined();
  });

  it('keeps the full parent while only a selected restart root is stopping',() => {
    expect(robotProjectionSessionRunId({
      targetId:'local',activeRun:{ id:'selected-root',targetId:'local',status:'stopping' },
      activeRuns:[
        { id:'system-root',targetId:'local',status:'waiting' },
        { id:'selected-root',targetId:'local',status:'stopping' },
      ],
      sessionViews:[{ session:{ id:'session-1',targetId:'local',state:'active' },members:[{
        id:'member-1',targetId:'local',sessionId:'session-1',bindingId:'robot-runtime',kind:'workflow_run',
        ownerId:'panel-child',status:'running',revision:1,
      }] }],runDetailsById:{},processInstances:[],documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    } as never,'panel-child','robot-runtime')).toBe('panel-child');
  });

  it('drops stale telemetry ownership on Stop and selects only the rerun owner',() => {
    const runtime = (rootRunId:string|undefined,panelRunId:string) => ({
      targetId:'local',
      activeRun:rootRunId ? { id:rootRunId,targetId:'local' } : undefined,
      activeRuns:rootRunId ? [{ id:rootRunId,targetId:'local' }] : [],
      sessionViews:[{ session:{ id:`session-${panelRunId}`,targetId:'local',state:'active' },members:[{
        id:`member-${panelRunId}`,targetId:'local',sessionId:`session-${panelRunId}`,
        bindingId:'robot-runtime',kind:'workflow_run',ownerId:panelRunId,status:'running',revision:1,
      }] }],runDetailsById:{},processInstances:[],documents:[],catalog:[],runSummaries:[],loading:false,error:'',
    });

    expect(robotProjectionSessionRunId(
      runtime('system-root-a','panel-run-a') as never,'panel-run-a','robot-runtime',
    )).toBe('panel-run-a');
    // Stop can clear active roots before the Session/member snapshot and Panel
    // Action invocation reconcile. The stale owner must already be revoked.
    expect(robotProjectionSessionRunId(
      runtime(undefined,'panel-run-a') as never,'panel-run-a','robot-runtime',
    )).toBeUndefined();
    expect(robotProjectionSessionRunId(
      runtime('system-root-b','panel-run-b') as never,'panel-run-b','robot-runtime',
    )).toBe('panel-run-b');
  });
});

describe('staticRobot', () => {
  it('projects a Unitree B2 Asset into Experiment instrument runtime (physical, no sim)', () => {
    const binding: ExperimentRobotBinding = {
      id: 'legacy-b2',
      ref: { domain: 'robot',resourceId: 'robot-b2',branch: 'main' },
      namespace: '/b2',hybridSource: 'physical',runtimeParameters: {},
      initialPose: { x: 0,y: 0,z: 0,yaw: 0 },
      unitreeB2: {},
    };
    const robot = staticRobot(binding,unitreeB2Asset(), b2Composition);
    expect(robot.id).toBe('legacy-b2');
    expect(robot.kind).toBe('unitree_b2');
    expect(b2Composition.contributionByProtocolKind(robot.kind)).toBeDefined();
    expect(robotLabel(robot,b2Composition)).toBe('Unitree B2');
    expect(robot.status).toBe('offline');
  });

  it('fails closed for Unitree B2 when product composition omits the leaf', () => {
    const binding: ExperimentRobotBinding = {
      id: 'b2-01',
      ref: { domain: 'robot',resourceId: 'robot-b2',branch: 'main' },
      namespace: '/b21',hybridSource: 'physical',runtimeParameters: {},
      initialPose: { x: 0,y: 0,z: 0.55,yaw: 0 },
      unitreeB2: {},
    };
    // Default built-in composition (no optional argument) rejects B2 projection.
    expect(() => staticRobot(binding, unitreeB2Asset())).toThrow(/cannot be projected|not enabled/i);
  });
});

describe('unsignedZeroFixed', () => {
  it('drops the IEEE minus when a HUD ruler rounds to 0.0', () => {
    expect(unsignedZeroFixed(-0.04, 1)).toBe('0.0');
    expect(unsignedZeroFixed(0.04, 1)).toBe('0.0');
    expect(unsignedZeroFixed(-0, 1)).toBe('0.0');
    expect(unsignedZeroFixed(0, 1)).toBe('0.0');
    expect(unsignedZeroFixed(-0.14, 1)).toBe('-0.1');
    expect(unsignedZeroFixed(-1.24, 1)).toBe('-1.2');
    expect(unsignedZeroFixed(27.5, 1)).toBe('27.5');
  });
});

describe('signedFixedWidth', () => {
  it('reserves a figure-space sign column so positive and negative values share width', () => {
    expect(signedFixedWidth(5.025)).toBe('\u20075.03');
    expect(signedFixedWidth(-5.025)).toBe('-5.03');
    expect(signedFixedWidth(0)).toBe('\u20070.00');
    expect(signedFixedWidth(28.765, 1)).toBe('\u200728.8');
    expect(signedFixedWidth(-0.004, 2)).toBe('-0.00');
  });
});

describe('splitSignedFixed', () => {
  it('splits polarity into a sign token and absolute digits for a fixed CSS sign column', () => {
    expect(splitSignedFixed(5.025)).toEqual({ sign: '', digits: '5.03' });
    expect(splitSignedFixed(-5.025)).toEqual({ sign: '-', digits: '5.03' });
    expect(splitSignedFixed(0)).toEqual({ sign: '', digits: '0.00' });
    expect(splitSignedFixed(-0.004)).toEqual({ sign: '-', digits: '0.00' });
    expect(splitSignedFixed(28.765, 1)).toEqual({ sign: '', digits: '28.8' });
  });
});

describe('splitSignedArrayAxis', () => {
  it('keeps two fraction digits and a minus, without plus or leading integer zeros', () => {
    expect(splitSignedArrayAxis(1.2)).toEqual({ sign: '', integer: '1', fraction: '20', digits: '1.20' });
    expect(splitSignedArrayAxis(-1.5)).toEqual({ sign: '-', integer: '1', fraction: '50', digits: '1.50' });
    expect(splitSignedArrayAxis(0.05)).toEqual({ sign: '', integer: '0', fraction: '05', digits: '0.05' });
    expect(splitSignedArrayAxis(-0.6)).toEqual({ sign: '-', integer: '0', fraction: '60', digits: '0.60' });
    expect(splitSignedArrayAxis(-2.54)).toEqual({ sign: '-', integer: '2', fraction: '54', digits: '2.54' });
    expect(splitSignedArrayAxis(-0.004)).toEqual({ sign: '-', integer: '0', fraction: '00', digits: '0.00' });
    expect(splitSignedArrayAxis(5)).toEqual({ sign: '', integer: '5', fraction: '00', digits: '5.00' });
    expect(splitSignedArrayAxis(12.04)).toEqual({ sign: '', integer: '12', fraction: '04', digits: '12.04' });
    expect(splitSignedArrayAxis(123.45)).toEqual({ sign: '', integer: '123', fraction: '45', digits: '123.45' });
  });
});

describe('robotHealthTone', () => {
  it('marks a live ready Mecanum healthy from IMU plus the three VRPN channels', () => {
    expect(mecanumTone()).toBe('healthy');
  });

  it.each([
    ['missing IMU', { 'state.imu': undefined }],
    ['missing position', { 'vrpn.position': undefined }],
    ['stale velocity', { 'vrpn.velocity': channel('vrpn.velocity', true) }],
    ['missing speed', { 'vrpn.speed': undefined }],
  ])('marks Mecanum unavailable when %s', (_label, channels) => {
    expect(mecanumTone({ channels })).toBe('unavailable');
  });

  it('distinguishes unavailable connectivity from failed operational readiness', () => {
    expect(mecanumTone({
      robot: { connectionState: 'closed' },
      online: false,
      operationalReady: false,
    })).toBe('unavailable');
    expect(mecanumTone({ operationalReady: false })).toBe('fault');
  });

  it('keeps a Mecanum neutral before a Run exists', () => {
    expect(mecanumTone({ hasRun: false })).toBe('idle');
  });
});

function mecanumTone(overrides: {
  hasRun?: boolean;
  robot?: Partial<Pick<RunRobot,'mecanum' | 'connectionState'>>;
  channels?: Record<string,RobotChannelProjection | undefined>;
  online?: boolean;
  operationalReady?: boolean;
} = {}) {
  const robot = {
    kind: 'mecanum_ugv',
    mecanum: { mocapRigidBodyName: 'ugv1' },
    connectionState: 'live',
    ...overrides.robot,
  } satisfies Pick<RunRobot,'kind' | 'mecanum' | 'connectionState'>;
  return robotHealthTone({
    hasRun: overrides.hasRun ?? true,
    robot,
    channels: {
      'state.imu': channel('state.imu'),
      'vrpn.position': channel('vrpn.position'),
      'vrpn.velocity': channel('vrpn.velocity'),
      'vrpn.speed': channel('vrpn.speed'),
      ...overrides.channels,
    },
    healthChannel: undefined,
    health: {},
    online: overrides.online ?? true,
    operationalReady: overrides.operationalReady ?? true,
  });
}

function channel(channelId: string, stale = false): RobotChannelProjection {
  return {
    channelId,
    sequence: 1,
    messageId: 2001,
    observedAt: '2026-07-23T00:00:00Z',
    sourceAgeMs: 0,
    staleAt: '2026-07-23T00:00:01Z',
    stale,
    value: {},
  };
}

function unitreeB2Asset(): RobotAssetDocument {
  return {
    head: {
      domain: 'robot',resourceId: 'robot-b2',name: 'B2 01',tags: [],mainCommitId: 'b2-c1',
      currentVersion: 1,digest: 'b2',revision: 1,createdAt: '',updatedAt: '',
    },
    branch: {
      domain: 'robot',resourceId: 'robot-b2',name: 'main',headCommitId: 'b2-c1',
      headVersion: 1,revision: 1,createdAt: '',updatedAt: '',
    },
    spec: {
      name: 'B2 01',description: '',tags: [],kind: 'unitree_b2',profileId: 'unitree.b2.v1',
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
