import { memo,Profiler,type ProfilerOnRenderCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  useRobotChannelBundle,
  useRunRobots,
  useRunRobotStatus,
} from '../src/domains/robot/robotPublic';
import type {
  RobotChannelChange,
  RobotChannelProjection,
  RobotPatchEvent,
  RunRobot,
  RunRobotProjection,
} from '../src/domains/robot/robotRuntimeModel';
import { FlightRobotInstrument } from '../src/panels/robot/FlightRobotInstrument';
import '../src/styles/panels.css';
import '../src/styles/robot.css';

const runId = 'mixed-runtime-benchmark';
const targetId = 'local';
const changesPerTick = 13;
const tickIntervalMs = 100;
const eventsPerTick = 8;
const instrumentChannels = [
  'state.flight','state.pose','state.velocity','state.mocap.velocity','state.mocap.speed','state.localization.error','state.imu','state.power','state.mocap.pose',
  'diagnostic.fcu-link','diagnostic.stream-health',
] as const;
const listChannels = [
  'vrpn.position','vrpn.velocity','vrpn.speed','command.velocity','state.power','state.health',
  'diagnostic.fcu-link',
] as const;

type BenchmarkCounters = {
  running: boolean;
  events: number;
  changes: number;
  mutations: number;
  mutationNodes: number;
  frames: number;
  fleetRenders: number;
  cardRenders: Record<string,number>;
  profilerCommits: number;
  profilerDurationMs: number;
  longTasks: number[];
};

declare global {
  interface Window {
    __xgcMixedRobotBenchmark: {
      start: () => void;
      stop: () => void;
      reset: () => void;
      snapshot: () => BenchmarkCounters & {
        cards: number;
        px4Cards: number;
        scoutCards: number;
        domNodes: number;
      };
    };
  }
}

const counters: BenchmarkCounters = {
  running: false,
  events: 0,
  changes: 0,
  mutations: 0,
  mutationNodes: 0,
  frames: 0,
  fleetRenders: 0,
  cardRenders: {},
  profilerCommits: 0,
  profilerDurationMs: 0,
  longTasks: [],
};
const projection = benchmarkProjection();
const channelSequences = new Map<string,number>();
let revision = 0;
let robotCursor = 0;
let channelCursor = 0;
let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

installPerformanceObservers();
installBenchmarkTransport();

window.__xgcMixedRobotBenchmark = {
  start: () => { counters.running = true; },
  stop: () => { counters.running = false; },
  reset: () => {
    counters.events = 0;
    counters.changes = 0;
    counters.mutations = 0;
    counters.mutationNodes = 0;
    counters.frames = 0;
    counters.fleetRenders = 0;
    counters.cardRenders = {};
    counters.profilerCommits = 0;
    counters.profilerDurationMs = 0;
    counters.longTasks = [];
  },
  snapshot: () => ({
    ...counters,
    cardRenders: { ...counters.cardRenders },
    longTasks: [...counters.longTasks],
    cards: document.querySelectorAll('[data-xgc-role="run-robot-card"]').length,
    px4Cards: document.querySelectorAll('[data-robot-kind="px4_multirotor"]').length,
    scoutCards: document.querySelectorAll('[data-robot-kind="scout_mini"]').length,
    domNodes: document.body.getElementsByTagName('*').length,
  }),
};

const onRender: ProfilerOnRenderCallback = (_id,_phase,actualDuration) => {
  counters.profilerCommits += 1;
  counters.profilerDurationMs += actualDuration;
};

createRoot(document.getElementById('root')!).render(
  <Profiler id="mixed-robot-runtime" onRender={onRender}>
    <MixedFleet />
  </Profiler>,
);

function MixedFleet() {
  counters.fleetRenders += 1;
  const runtime = useRunRobots(targetId, runId);
  return (
    <main className="robot-instruments-panel mode-double" data-xgc-role="mixed-robot-benchmark">
      <div className="robot-instrument-grid instrument-board instrument-double">
        {(runtime.projection?.robots ?? []).map((robot) => (
          <BenchmarkRobotCard robot={robot} key={robot.id} />
        ))}
      </div>
    </main>
  );
}

const BenchmarkRobotCard = memo(function BenchmarkRobotCard({ robot }: { robot: RunRobot }) {
  counters.cardRenders[robot.id] = (counters.cardRenders[robot.id] ?? 0) + 1;
  const status = useRunRobotStatus(targetId, runId, robot.id);
  const px4 = robot.kind === 'px4_multirotor';
  const channels = useRobotChannelBundle(
    targetId,
    runId,
    robot.id,
    px4 ? instrumentChannels : listChannels,
    px4 ? 'interactive' : 'compact',
  );
  const flight = value(channels['state.flight']);
  const poseChannel = channels[px4 ? 'state.pose' : 'vrpn.position'];
  const pose = value(poseChannel);
  const mocapVelocity = value(channels['state.mocap.velocity']);
  const mocapSpeed = value(channels['state.mocap.speed']);
  const localizationError = value(channels['state.localization.error']);
  const power = value(channels['state.power']);
  if (px4) {
    return (
      <article
        className="robot-instrument-card robot-instrument-host"
        data-xgc-role="run-robot-card"
        data-xgc-id={robot.id}
        data-robot-kind={robot.kind}
      >
        <FlightRobotInstrument
          name={robot.name}
          telemetry={{
            online: status.online,
            poseFresh: Boolean(poseChannel && !poseChannel.stale),
            mocapState: channelFreshness(channels['state.mocap.pose']),
            healthTone: status.operationalReady ? 'healthy' : status.online ? 'fault' : 'unavailable',
            flight,
            pose,
            mocapPose: value(channels['state.mocap.pose']),
            mocapVelocity,
            mocapSpeed,
            localizationError,
            imu: value(channels['state.imu']),
            power,
            localSetpoint: value(channels['setpoint.local']),
            localSetpointState: channelFreshness(channels['setpoint.local']),
            streamHealth: value(channels['diagnostic.stream-health']),
            fcuLink: value(channels['diagnostic.fcu-link']),
          }}
        />
      </article>
    );
  }
  const position = objectValue(pose.position);
  const vrpnVelocity = value(channels['vrpn.velocity']);
  const vrpnAngular = objectValue(vrpnVelocity.angular);
  const vrpnSpeed = numberValue(value(channels['vrpn.speed']).metersPerSecond);
  const command = value(channels['command.velocity']);
  const commandLinear = numberValue(objectValue(command.linear).x);
  const commandAngular = numberValue(objectValue(command.angular).z);
  const percentage = numberValue(power.percentage);
  const health = value(channels['state.health']);
  return (
    <article
      className="robot-instrument-card"
      data-xgc-role="run-robot-card"
      data-xgc-id={robot.id}
      data-robot-kind={robot.kind}
    >
      <header><div><strong>{robot.name}</strong><small>{robot.id} · ground</small></div><span>{status.status}</span></header>
      <dl>
        <div><dt>Mode</dt><dd>{stringValue(flight.mode)}</dd></div>
        <div><dt>Position</dt><dd>{vector(position)}</dd></div>
        <div><dt>Speed</dt><dd>{vrpnSpeed?.toFixed(2) ?? '--'}</dd></div>
        <div><dt>Linear</dt><dd>{commandLinear?.toFixed(2) ?? '--'} / {vrpnSpeed?.toFixed(2) ?? '--'}</dd></div>
        <div><dt>Angular</dt><dd>{commandAngular?.toFixed(2) ?? '--'} / {numberValue(vrpnAngular.z)?.toFixed(2) ?? '--'}</dd></div>
        <div><dt>Power</dt><dd>{percentage == null ? '--' : `${Math.round(percentage * 100)}%`}</dd></div>
        <div><dt>Health</dt><dd>{stringValue(health.summary)}</dd></div>
      </dl>
    </article>
  );
});

function installPerformanceObservers() {
  new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => counters.longTasks.push(entry.duration));
  }).observe({ type: 'longtask',buffered: true });
  const nextFrame = () => {
    counters.frames += 1;
    requestAnimationFrame(nextFrame);
  };
  requestAnimationFrame(nextFrame);
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver((records) => {
      counters.mutations += records.length;
      records.forEach((record) => {
        counters.mutationNodes += record.addedNodes.length + record.removedNodes.length;
      });
    }).observe(document.body, { subtree: true,attributes: true,childList: true,characterData: true });
  }, { once: true });
}

function installBenchmarkTransport() {
  const encoder = new TextEncoder();
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input,init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw,location.href);
    if (url.pathname.endsWith(`/orchestration-runs/${runId}/robots`)) {
      return new Response(JSON.stringify(projection), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!url.pathname.endsWith(`/orchestration-runs/${runId}/robots/events`)) {
      return originalFetch(input,init);
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        const close = () => {
          streamController = undefined;
          try { controller.close(); } catch { /* stream already closed */ }
        };
        init?.signal?.addEventListener('abort', close, { once: true });
      },
      cancel() { streamController = undefined; },
    });
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'X-XGC-Robot-Stream-ID': projection.streamId,
        'X-XGC-Robot-Latest-Revision': String(revision),
      },
    });
  };
  window.setInterval(() => {
    if (!counters.running || !streamController) return;
    const changes = Array.from({ length: changesPerTick }, () => nextChange());
    const groups = Array.from({ length: eventsPerTick }, () => [] as RobotChannelChange[]);
    changes.forEach((change,index) => groups[index % groups.length]!.push(change));
    let chunk = '';
    groups.forEach((eventChanges) => {
      revision += 1;
      const event: RobotPatchEvent = {
        revision,targetId,runId,changes: eventChanges,resets: [],emittedAt: new Date().toISOString(),
      };
      chunk += `id: ${revision}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`;
      counters.events += 1;
      counters.changes += eventChanges.length;
    });
    try { streamController.enqueue(encoder.encode(chunk)); } catch { streamController = undefined; }
  }, tickIntervalMs);
}

function nextChange(): RobotChannelChange {
  const robot = projection.robots[robotCursor % projection.robots.length]!;
  robotCursor += 1;
  const ids = robot.kind === 'px4_multirotor' ? instrumentChannels : listChannels.slice(0,5);
  const channelId = ids[channelCursor % ids.length]!;
  channelCursor += 1;
  const current = robot.channels[channelId]!;
  const key = `${robot.id}:${channelId}`;
  const sequence = (channelSequences.get(key) ?? current.sequence) + 1;
  channelSequences.set(key,sequence);
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + 60_000).toISOString();
  return {
    ...current,
    robotId: robot.id,
    connectionEpoch: robot.connectionEpoch,
    sequence,
    observedAt: now,
    staleAt: deadline,
    stale: false,
    value: channelValue(channelId,sequence),
    online: true,
    operationalReady: true,
    status: 'online',
    onlineUntil: deadline,
    operationalReadyUntil: deadline,
  };
}

function benchmarkProjection(): RunRobotProjection {
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + 3_600_000).toISOString();
  const robots: RunRobot[] = [
    ...Array.from({ length: 6 }, (_unused,index) => robot(`px4-${index + 1}`,'px4_multirotor',index,now,deadline)),
    ...Array.from({ length: 4 }, (_unused,index) => robot(`scout-${index + 1}`,'scout_mini',index,now,deadline)),
  ];
  return {
    targetId,runId,streamId: 'mixed-benchmark-stream',projectionRevision: 0,pending: false,
    experimentResourceId: 'mixed-benchmark-experiment',
    experimentCommitId: 'mixed-benchmark-commit',
    robotSelectionDigest: 'a'.repeat(64),
    robots,operations: [],updatedAt: now,
  };
}

function robot(id: string,kind: 'px4_multirotor' | 'scout_mini',index: number,now: string,deadline: string): RunRobot {
  const channelIds = kind === 'px4_multirotor' ? instrumentChannels : listChannels;
  return {
    id,
    robotAssetId: `benchmark-${kind}-${index + 1}`,
    robotAssetCommitId: `benchmark-${kind}-${index + 1}-commit`,
    robotAssetDigest: 'b'.repeat(64),
    name: kind === 'px4_multirotor' ? `PX4 ${index + 1}` : `Scout ${index + 1}`,
    kind,modality: 'inherit',
    profileId: kind === 'px4_multirotor' ? 'fixture.aerial.v1' : 'fixture.ground.v1',
    namespace: kind === 'px4_multirotor' ? `/uav${index + 1}` : `/scout${index + 1}`,
    ...(kind === 'px4_multirotor'
      ? { px4: { mavSystemId: index + 1,managementIp: `192.0.2.${index + 1}`,mocapRigidBodyName: id } }
      : { scout: { managementAddress: `192.0.2.${100 + index}` } }),
    operationContracts: [],adapterDefinitionId: kind === 'px4_multirotor' ? 'px4-adapter' : 'scout-adapter',
    connectionEpoch: 1,connectionState: 'live',connectionRevision: 1,
    online: true,operationalReady: true,status: 'online',onlineUntil: deadline,operationalReadyUntil: deadline,
    channels: Object.fromEntries(channelIds.map((channelId) => [channelId,channel(channelId,now,deadline)])),
  };
}

function channel(channelId: string,observedAt: string,staleAt: string): RobotChannelProjection {
  return {
    channelId,sequence: 1,messageId: messageId(channelId),observedAt,sourceAgeMs: 0,staleAt,stale: false,
    value: channelValue(channelId,1),
  };
}

function messageId(channelId: string) {
  const ids: Record<string,number> = {
    'state.flight': 3001,'state.pose': 2001,'state.velocity': 2002,'state.mocap.velocity': 2002,'state.mocap.speed': 2006,'state.localization.error': 2007,
    'vrpn.position': 2001,'vrpn.velocity': 2002,'vrpn.speed': 2006,'command.velocity': 2002,
    'state.imu': 2003,'state.power': 2004,'state.health': 2005,'state.mocap.pose': 2001,'setpoint.local': 3002,'diagnostic.fcu-link': 3004,
    'diagnostic.stream-health': 2011,
  };
  return ids[channelId] ?? 9000;
}

function channelValue(channelId: string,sequence: number): Record<string,unknown> {
  const angle = (sequence % 360) * Math.PI / 180;
  switch (channelId) {
    case 'state.flight': return { mode: 'OFFBOARD',armed: true,connected: true };
    case 'state.pose': return { position: { x: sequence / 10,y: sequence / 20,z: 3 },orientation: { x: 0,y: 0,z: 0,w: 1 } };
    case 'vrpn.position': return { position: { x: sequence / 10,y: sequence / 20,z: 0 },orientation: { x: 0,y: 0,z: 0,w: 1 } };
    case 'vrpn.velocity': return { linear: { x: Math.sin(angle),y: Math.cos(angle),z: 0 },angular: { x: 0,y: 0,z: Math.sin(angle) } };
    case 'vrpn.speed': return { metersPerSecond: Math.sin(angle) };
    case 'command.velocity': return { linear: { x: 1,y: 0,z: 0 },angular: { x: 0,y: 0,z: 0.5 } };
    case 'state.velocity': return { linear: { x: Math.sin(angle),y: Math.cos(angle),z: 0.1 } };
    case 'state.mocap.velocity': return { linear: { x: Math.sin(angle),y: Math.cos(angle),z: 0.1 } };
    case 'state.mocap.speed': return { metersPerSecond: 1.005 };
    case 'state.localization.error': return { meters: 0.032 };
    case 'state.imu': return { orientation: { x: Math.sin(angle / 2),y: 0,z: 0,w: Math.cos(angle / 2) } };
    case 'state.power': return { percentage: 0.75 };
    case 'state.health': return { online: true,summary: 'ready' };
    case 'state.mocap.pose': return { position: { x: sequence / 10,y: sequence / 20,z: 3 } };
    case 'setpoint.local': return { active: true };
    case 'diagnostic.fcu-link': return { roundTripTimeMs: 16.5 };
    case 'diagnostic.stream-health': return { channels: [
      { channelId: 'state.imu',sourceRateHz: 50 },
      { channelId: 'state.pose',sourceRateHz: 20 },
      { channelId: 'state.mocap.velocity',sourceRateHz: 20 },
      { channelId: 'setpoint.local',sourceRateHz: 10 },
    ] };
    default: return {};
  }
}

function value(channel?: RobotChannelProjection) {
  return channel?.value ?? {};
}

function objectValue(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string,unknown> : {};
}

function numberValue(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}

function stringValue(input: unknown) {
  return typeof input === 'string' && input ? input : '--';
}

function vector(input: Record<string,unknown>) {
  return ['x','y','z'].map((axis) => numberValue(input[axis])?.toFixed(2) ?? '--').join(', ');
}

function channelFreshness(channel?: RobotChannelProjection): 'fresh' | 'stale' | 'missing' {
  return !channel ? 'missing' : channel.stale ? 'stale' : 'fresh';
}
