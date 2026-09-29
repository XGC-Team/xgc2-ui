/**
 * Synthetic robot fleet for the fleet telemetry benchmark: N Experiment robot
 * bindings, their Robot assets, the Core run projection, and a telemetry
 * source that emits what Core's robot event broker emits for one run.
 *
 * Core coalesces telemetry per run in a 100 ms window keyed by robot/channel
 * (core-xgc/internal/robot/events.go defaultRobotTelemetryCoalesceWindow), so
 * one SSE message carries the latest change of every channel that updated in
 * that window, for every robot. Channel rates follow the stream-health values
 * of the instrument fixtures: pose/mocap/velocity 20-50 Hz, setpoint 10 Hz,
 * controller/chassis 5 Hz, flight/power/health/diagnostics 1 Hz.
 *
 * Everything here is simulated benchmark data; no application imports except
 * types, so the harness can install it before any application module loads.
 */
import type { ExperimentDocument,ExperimentRobotBinding } from '../src/domains/experiment/experimentPublic';
import type { RobotAssetDocument } from '../src/domains/robot/robotAssetPublic';
import type {
  RobotChannelChange,
  RobotChannelProjection,
  RobotPatchEvent,
  RunRobot,
  RunRobotProjection,
} from '../src/domains/robot/robotRuntimeModel';

export type FleetRobotKind = 'px4' | 'scout' | 'mecanum';

export type FleetRobot = {
  id: string;
  kind: FleetRobotKind;
  index: number;
  assetId: string;
  mavSystemId: number;
};

export const FLEET_TARGET_ID = 'local';
export const FLEET_RUN_ID = 'fleet-panel-robot-runtime-run';
export const FLEET_ROOT_RUN_ID = 'fleet-experiment-root-run';
export const FLEET_EXPERIMENT_ID = 'fleet-experiment';
export const FLEET_STREAM_ID = 'fleet-robot-stream';
export const FLEET_ROBOT_BINDING_ID = 'robot-runtime';
/** Core's per-run telemetry coalescing window. */
export const CORE_TELEMETRY_WINDOW_MS = 100;

type ChannelSchedule = { channelId: string;hz: number;messageId: number };

// The exact channel sets the built-in kind contributions subscribe to
// (builtInRobotAssetKindContributions fs150Telemetry, useRobotProjectionChannels
// scoutInstrumentChannels / mecanumInstrumentChannels).
const px4Channels: ChannelSchedule[] = [
  { channelId: 'state.flight',hz: 1,messageId: 3001 },
  { channelId: 'state.controller',hz: 5,messageId: 3005 },
  { channelId: 'state.pose',hz: 30,messageId: 2001 },
  { channelId: 'state.velocity',hz: 30,messageId: 2002 },
  { channelId: 'state.speed',hz: 30,messageId: 2006 },
  { channelId: 'state.localization.error',hz: 10,messageId: 2007 },
  { channelId: 'state.imu',hz: 50,messageId: 2003 },
  { channelId: 'state.power',hz: 1,messageId: 2004 },
  { channelId: 'state.health',hz: 1,messageId: 2005 },
  { channelId: 'state.mocap.pose',hz: 50,messageId: 2008 },
  { channelId: 'state.mocap.velocity',hz: 50,messageId: 2009 },
  { channelId: 'state.mocap.speed',hz: 50,messageId: 2010 },
  { channelId: 'setpoint.local',hz: 10,messageId: 3002 },
  { channelId: 'diagnostic.fcu-link',hz: 1,messageId: 3004 },
  { channelId: 'diagnostic.stream-health',hz: 1,messageId: 2011 },
];

const ugvChannels: ChannelSchedule[] = [
  { channelId: 'vrpn.position',hz: 50,messageId: 2001 },
  { channelId: 'vrpn.velocity',hz: 50,messageId: 2002 },
  { channelId: 'vrpn.speed',hz: 50,messageId: 2006 },
  { channelId: 'command.velocity',hz: 20,messageId: 2012 },
  { channelId: 'state.imu',hz: 50,messageId: 2003 },
  { channelId: 'state.power',hz: 1,messageId: 2004 },
  { channelId: 'state.health',hz: 1,messageId: 2005 },
  { channelId: 'state.controller',hz: 5,messageId: 3005 },
  { channelId: 'diagnostic.stream-health',hz: 1,messageId: 2011 },
];

const scoutChannels: ChannelSchedule[] = [
  ...ugvChannels,
  { channelId: 'state.chassis',hz: 5,messageId: 2013 },
];

export function fleetChannels(kind: FleetRobotKind) {
  return kind === 'px4' ? px4Channels : kind === 'scout' ? scoutChannels : ugvChannels;
}

/** Deterministic mixed fleet: 2/5 FS150 PX4, 2/5 Scout, 1/5 Mecanum. */
export function fleetRobots(count: number): FleetRobot[] {
  // Slot ids follow the authoring convention: one uav-NNN / ugv-NNN sequence
  // per slot family (Scout and Mecanum share the UGV family).
  const counters = { uav: 0,ugv: 0 };
  const px4Counter = { value: 0 };
  return Array.from({ length: count },(_unused,index) => {
    const slot = index % 5;
    const kind: FleetRobotKind = slot < 2 ? 'px4' : slot < 4 ? 'scout' : 'mecanum';
    const prefix = kind === 'px4' ? 'uav' : 'ugv';
    counters[prefix] += 1;
    if (kind === 'px4') px4Counter.value += 1;
    const id = `${prefix}-${String(counters[prefix]).padStart(3,'0')}`;
    return { id,kind,index,assetId: `asset-${id}`,mavSystemId: kind === 'px4' ? px4Counter.value : 0 };
  });
}

function configHead(resourceId: string,domain: 'robot' | 'experiment') {
  return {
    head: {
      domain,resourceId,name: resourceId,tags: [],mainCommitId: `${resourceId}-commit`,
      currentVersion: 1,digest: resourceId,revision: 1,createdAt: '2026-09-01T00:00:00Z',updatedAt: '2026-09-01T00:00:00Z',
    },
    branch: {
      domain,resourceId,name: 'main',headCommitId: `${resourceId}-commit`,
      headVersion: 1,revision: 1,createdAt: '2026-09-01T00:00:00Z',updatedAt: '2026-09-01T00:00:00Z',
    },
  };
}

export function fleetAssets(robots: readonly FleetRobot[]): RobotAssetDocument[] {
  return robots.map((robot) => {
    const common = { name: robot.assetId,description: '',tags: [] as string[] };
    if (robot.kind === 'px4') {
      return {
        ...configHead(robot.assetId,'robot'),
        spec: {
          ...common,kind: 'px4_multirotor',profileId: 'px4.multirotor.ros1.v9',
          px4: {
            modelId: 'fs150',mavSystemId: robot.mavSystemId,managementIp: '192.0.2.1',sshUsername: 'robot',sshPassword: 'secret',
            mocapRigidBodyName: robot.id.replace(/-/g,'_'),physicalMavrosLocalPort: 9000 + robot.mavSystemId * 10,
            physicalFcuRemotePort: 14560,
            simulationLocalPort: 15000 + robot.mavSystemId - 1,
            simulationRemotePort: 15300 + robot.mavSystemId - 1,
            simulation: { productId: 'px4',launchPackage: 'px4',launchFile: 'sitl.launch' },
          },
        },
      } as unknown as RobotAssetDocument;
    }
    const ugv = {
      managementAddress: '192.0.2.10',connector: 'swarm_ros_bridge',sshUsername: 'wheeltec',sshPassword: 'dongguan',
      telemetryRemotePort: 3001,controlLocalPort: 3001 + robot.index,mocapRigidBodyName: robot.id.replace(/-/g,'_'),
    };
    return robot.kind === 'scout'
      ? {
        ...configHead(robot.assetId,'robot'),
        spec: {
          ...common,kind: 'scout_mini',profileId: 'scout-mini.ros1.v6',
          scout: { ...ugv,simulation: { productId: 'scout',launchPackage: 'scout',launchFile: 'spawn.launch' } },
        },
      } as unknown as RobotAssetDocument
      : {
        ...configHead(robot.assetId,'robot'),
        spec: {
          ...common,kind: 'mecanum_ugv',profileId: 'mecanum-ugv.ros1.v3',
          mecanum: {
            ...ugv,
            simulation: { productId: 'xgc2-gazebo-sim-mecanum',launchPackage: 'gazebo_sim_mecanum',launchFile: 'spawn.launch' },
          },
        },
      } as unknown as RobotAssetDocument;
  });
}

export function fleetBindings(robots: readonly FleetRobot[]): ExperimentRobotBinding[] {
  return robots.map((robot) => ({
    id: robot.id,
    ref: { domain: 'robot',resourceId: robot.assetId,branch: 'main' },
    namespace: `/${robot.id.replace(/-/g,'')}`,
    hybridSource: 'simulation',
    runtimeParameters: {},
    initialPose: { x: robot.index,y: 0,z: 0,yaw: 0 },
    ...(robot.kind === 'px4' ? { px4: {} } : robot.kind === 'scout'
      ? { scout: { lidarSimulationEnabled: false,imageSimulationEnabled: false } }
      : { mecanum: {} }),
  }) as ExperimentRobotBinding);
}

export function fleetExperiment(robots: readonly FleetRobot[]): ExperimentDocument {
  return {
    ...configHead(FLEET_EXPERIMENT_ID,'experiment'),
    spec: {
      schemaVersion: 15,name: 'Fleet benchmark',description: '',tags: [],runModes: ['simulation'],
      worldBoundary: null,localizationOffset: { x: 0,y: 0,z: 0,yaw: 0 },
      robots: fleetBindings(robots),
      workflowInstances: [],
      dashboards: [],
    },
  } as unknown as ExperimentDocument;
}

/** Experiment runtime datasource value with one active Session binding member. */
export function fleetExperimentRuntime() {
  return {
    targetId: FLEET_TARGET_ID,
    activeRun: { id: FLEET_ROOT_RUN_ID,targetId: FLEET_TARGET_ID,status: 'running',runMode: 'simulation' },
    activeRuns: [{ id: FLEET_ROOT_RUN_ID,targetId: FLEET_TARGET_ID,status: 'running',runMode: 'simulation' }],
    sessionViews: [{
      session: {
        id: 'fleet-session',targetId: FLEET_TARGET_ID,experimentResourceId: FLEET_EXPERIMENT_ID,
        state: 'active',mode: 'full',runMode: 'simulation',revision: 1,
      },
      members: [{
        id: 'fleet-member',targetId: FLEET_TARGET_ID,sessionId: 'fleet-session',bindingId: FLEET_ROBOT_BINDING_ID,
        kind: 'workflow_run',ownerId: FLEET_RUN_ID,status: 'running',revision: 1,
      }],
    }],
    processInstances: [],documents: [],catalog: [],runSummaries: [],runDetailsById: {},loading: false,error: '',
  };
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function channelValue(kind: FleetRobotKind,channelId: string,sequence: number,robotIndex: number): Record<string,unknown> {
  const phase = (sequence + robotIndex * 7) % 360;
  const angle = phase * Math.PI / 180;
  const x = robotIndex + Math.sin(angle);
  const y = Math.cos(angle);
  switch (channelId) {
    case 'state.flight': return { connected: true,mode: 'OFFBOARD',armed: true,landedState: 2 };
    case 'state.controller': return { text: 'Tracking' };
    case 'state.pose':
    case 'state.mocap.pose':
    case 'vrpn.position':
      return {
        position: { x,y,z: kind === 'px4' ? 1.2 : 0.18 },
        orientation: { x: 0,y: 0,z: Math.sin(angle / 2),w: Math.cos(angle / 2) },
      };
    case 'state.velocity':
    case 'state.mocap.velocity':
    case 'vrpn.velocity':
      return { linear: { x: Math.cos(angle) * 0.4,y: -Math.sin(angle) * 0.4,z: 0.01 },angular: { x: 0,y: 0,z: 0.1 } };
    case 'state.speed':
    case 'state.mocap.speed':
    case 'vrpn.speed':
      return { metersPerSecond: 0.4 + (sequence % 10) / 100 };
    case 'state.localization.error': return { meters: 0.02 + (sequence % 5) / 1000 };
    case 'state.imu':
      return {
        orientation: { x: Math.sin(angle / 8),y: 0,z: Math.sin(angle / 2),w: Math.cos(angle / 2) },
        angularVelocity: { x: 0.01,y: -0.02,z: 0.1 },
        linearAcceleration: { x: 0.1,y: 0,z: 9.81 },
      };
    case 'state.power': return { percentageState: 'PERCENTAGE_STATE_AVAILABLE',percentage: 90 - (robotIndex % 40),voltageV: 22.4 };
    case 'state.health':
      return {
        online: true,summary: 'healthy',faults: [],
        positioning: {
          state: 'POSITIONING_STATE_ACTIVE',reason: 'POSITIONING_REASON_MOTION_DETECTED',
          observedAgeMs: 8,windowSpreadM: 0.01,sampleCount: 5,
        },
      };
    case 'setpoint.local': return { active: true,typeMask: 3576,position: { x,y,z: 1.2 } };
    case 'diagnostic.fcu-link': return { roundTripTimeMs: 16 + (sequence % 5) };
    case 'diagnostic.stream-health':
      return { channels: fleetChannels(kind).map((channel) => ({
        channelId: channel.channelId,sourceRateHz: channel.hz,sourceAgeMs: 8,stale: false,
      })) };
    case 'command.velocity': return { linear: { x: 0.32,y: 0,z: 0 },angular: { x: 0,y: 0,z: -0.18 } };
    case 'state.chassis': return { controlMode: 'CONTROL_MODE_COMMAND_CAN',nativeControlMode: 1 };
    default: return {};
  }
}

/** Robot authority lease Core renews with every accepted sample. */
const ONLINE_LEASE_MS = 3000;
const OPERATIONAL_LEASE_MS = 2500;

/** Channel freshness window: a few sample periods, at least 1.5 s. */
function staleAfterMs(schedule: ChannelSchedule) {
  return Math.max(1500,Math.round(3000 / schedule.hz));
}

/**
 * Stateful Core stand-in for one run: the REST snapshot and one coalesced
 * patch per 100 ms window. `clock` is the time a patch is emitted; channel
 * and authority deadlines are real (1.5-3 s), so the store's freshness
 * deadline timer runs its sweeps while the fleet streams, as live.
 */
export function createFleetTelemetry(robots: readonly FleetRobot[],clock: () => number) {
  const sequences = new Map<string,number>();
  let revision = 0;
  let window = 0;
  type Authority = Pick<RobotChannelChange,'online' | 'operationalReady' | 'status' | 'onlineUntil' | 'operationalReadyUntil'>;
  const authority = (): Authority => ({
    online: true,operationalReady: true,status: 'online',
    onlineUntil: iso(clock() + ONLINE_LEASE_MS),operationalReadyUntil: iso(clock() + OPERATIONAL_LEASE_MS),
  });
  const channel = (robot: FleetRobot,schedule: ChannelSchedule): RobotChannelProjection => {
    const key = `${robot.id}\u0000${schedule.channelId}`;
    const sequence = sequences.get(key) ?? 1;
    const now = clock();
    return {
      channelId: schedule.channelId,sequence,messageId: schedule.messageId,
      observedAt: iso(now - 5),sourceAgeMs: 5,staleAt: iso(now - 5 + staleAfterMs(schedule)),stale: false,
      value: channelValue(robot.kind,schedule.channelId,sequence,robot.index),
    };
  };
  const runRobot = (robot: FleetRobot): RunRobot => ({
    id: robot.id,
    robotAssetId: robot.assetId,
    robotAssetCommitId: `${robot.assetId}-commit`,
    robotAssetDigest: robot.assetId,
    name: robot.id.toUpperCase(),
    kind: robot.kind === 'px4' ? 'px4_multirotor' : robot.kind === 'scout' ? 'scout_mini' : 'mecanum_ugv',
    hybridSource: 'simulation',
    profileId: robot.kind === 'px4' ? 'px4.multirotor.ros1.v9' : robot.kind === 'scout' ? 'scout-mini.ros1.v6' : 'mecanum-ugv.ros1.v3',
    namespace: `/${robot.id.replace(/-/g,'')}`,
    ...(robot.kind === 'px4'
      ? { px4: {
        modelId: 'fs150',mavSystemId: robot.mavSystemId,managementIp: '192.0.2.1',
        mocapRigidBodyName: robot.id.replace(/-/g,'_'),positioningFrameNumber: robot.index + 1,positioningComparisonThresholdM: 0.5,
      } }
      : { [robot.kind]: {
        managementAddress: '192.0.2.10',connector: 'swarm_ros_bridge',telemetryRemotePort: 3001,
        controlLocalPort: 3001 + robot.index,mocapRigidBodyName: robot.id.replace(/-/g,'_'),
        positioningFrameNumber: robot.index + 1,positioningComparisonThresholdM: 0.5,
      } }),
    operationContracts: [],
    adapterDefinitionId: `${robot.kind}-adapter`,
    connectionEpoch: 1,connectionState: 'live',connectionRevision: 1,
    ...authority(),
    channels: Object.fromEntries(fleetChannels(robot.kind).map((schedule) => [schedule.channelId,channel(robot,schedule)])),
  } as RunRobot);

  const change = (robot: FleetRobot,schedule: ChannelSchedule,state: Authority = authority()): RobotChannelChange => {
    const key = `${robot.id}\u0000${schedule.channelId}`;
    sequences.set(key,(sequences.get(key) ?? 1) + Math.max(1,Math.round(schedule.hz * CORE_TELEMETRY_WINDOW_MS / 1000)));
    return { ...channel(robot,schedule),robotId: robot.id,connectionEpoch: 1,...state };
  };

  return {
    snapshot(): RunRobotProjection {
      return {
        targetId: FLEET_TARGET_ID,runId: FLEET_RUN_ID,streamId: FLEET_STREAM_ID,projectionRevision: revision,pending: false,
        experimentResourceId: FLEET_EXPERIMENT_ID,experimentCommitId: `${FLEET_EXPERIMENT_ID}-commit`,
        robotSelectionDigest: 'a'.repeat(64),
        robots: robots.map(runRobot),operations: [],updatedAt: iso(clock()),
      };
    },
    get revision() { return revision; },
    /** One Core window: the latest change of every channel due in it. */
    nextWindow(options: { robots?: readonly FleetRobot[] } = {}): RobotPatchEvent {
      window += 1;
      const changes: RobotChannelChange[] = [];
      (options.robots ?? robots).forEach((robot) => {
        fleetChannels(robot.kind).forEach((schedule) => {
          const everyWindows = Math.max(1,Math.round(1000 / (schedule.hz * CORE_TELEMETRY_WINDOW_MS)));
          if ((window + robot.index) % everyWindows === 0) changes.push(change(robot,schedule));
        });
      });
      revision += 1;
      return {
        revision,targetId: FLEET_TARGET_ID,runId: FLEET_RUN_ID,changes,resets: [],emittedAt: iso(clock()),
      };
    },
    /** One robot's authority flips (e.g. operational readiness lapses). */
    statusWindow(robot: FleetRobot,status: 'online' | 'limited'): RobotPatchEvent {
      const state: Authority = status === 'online'
        ? authority()
        : { online: true,operationalReady: false,status: 'limited',onlineUntil: iso(clock() + ONLINE_LEASE_MS) };
      const schedule = fleetChannels(robot.kind).find((candidate) => candidate.channelId === 'state.health')!;
      revision += 1;
      return {
        revision,targetId: FLEET_TARGET_ID,runId: FLEET_RUN_ID,changes: [change(robot,schedule,state)],resets: [],
        emittedAt: iso(clock()),
      };
    },
  };
}

export type FleetTelemetry = ReturnType<typeof createFleetTelemetry>;

export function sseFrame(event: RobotPatchEvent) {
  return `id: ${event.revision}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`;
}
