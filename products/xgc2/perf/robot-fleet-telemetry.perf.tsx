// @vitest-environment jsdom
/**
 * Fleet telemetry benchmark for the Experiment GCS robot surface: the real
 * Robot instruments grid (instrument and list views, 24 per page) and Robot
 * control panel fed by the real snapshot + SSE transport, robot runtime store,
 * and 200 ms instrument visual merge, for 8 / 32 / 100 robots.
 *
 * The transport stands in for Core's robot event broker, which coalesces a
 * run's telemetry into one patch per 100 ms (see robotFleetFixture.ts). Each
 * scenario counts, per SSE message and per visual flush: React commits, which
 * components rendered (React DevTools' did-render rule), host DOM updates,
 * robot store subscriptions and listener calls, network requests, main-thread
 * time, and (separate pass) sampled heap allocation. jsdom times are relative
 * and only comparable on one machine; they are not browser frame times.
 *
 *   npm run perf:dashboard-renders -- robot-fleet-telemetry
 *   XGC_PERF_OUT=/tmp/fleet.json npm run perf:dashboard-renders -- robot-fleet-telemetry
 *   XGC_PERF_ALLOC=0 skips the allocation pass; XGC_PERF_DEBUG=1 prints per-component renders.
 */
import './reactCommitCounter';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';
import { act,cleanup,render } from '@testing-library/react';
import { Profiler,type ProfilerOnRenderCallback } from 'react';
import { afterAll,afterEach,beforeAll,describe,expect,it,vi } from 'vitest';
import type * as RobotRuntimeStateModule from '../src/domains/robot/robotRuntimeState';
import { StationExperimentOccupancyProvider } from '../src/domains/experiment/useExperimentListRunningIds';
import { panelPrivateStateKey } from '../src/shared/panelPrivateState';
import { resetRobotRuntimeForTests } from '../src/domains/robot/robotRuntimeTestSupport';
import { RobotInstrumentsGrid } from '../src/panels/robot/RobotInstrumentsGrid';
import { PX4RotorControlPanel } from '../src/panels/robot/PX4RotorControlPanel';
import { RobotControlFrameProvider } from '../src/panels/robot/RobotPanelFrame';
import { cpuTimeMs,profileCpu } from './cpuTime';
import { startCommitSample,stopCommitSample,totalRenders } from './reactCommitCounter';
import {
  createFleetTelemetry,
  FLEET_EXPERIMENT_ID,
  FLEET_ROBOT_BINDING_ID,
  FLEET_RUN_ID,
  FLEET_STREAM_ID,
  fleetAssets,
  fleetExperiment,
  fleetExperimentRuntime,
  fleetRobots,
  sseFrame,
  type FleetRobot,
  type FleetTelemetry,
} from './robotFleetFixture';

type SubscriptionKind = 'run' | 'robot' | 'channel' | 'status';
const storeCounters = vi.hoisted(() => ({
  active: { run: 0,robot: 0,channel: 0,status: 0 } as Record<'run' | 'robot' | 'channel' | 'status',number>,
  calls: { run: 0,robot: 0,channel: 0,status: 0 } as Record<'run' | 'robot' | 'channel' | 'status',number>,
}));

// Count live robot-store subscriptions and how often their listeners run.
vi.mock('../src/domains/robot/robotRuntimeState',async (importOriginal) => {
  const original = await importOriginal<typeof RobotRuntimeStateModule>();
  const wrap = <Args extends unknown[]>(
    kind: SubscriptionKind,
    subscribe: (...args: [...Args,() => void]) => () => void,
  ) => (...args: [...Args,() => void]) => {
    const listener = args[args.length - 1] as () => void;
    const counted = () => {
      storeCounters.calls[kind] += 1;
      listener();
    };
    storeCounters.active[kind] += 1;
    const release = subscribe(...([...args.slice(0,-1),counted] as [...Args,() => void]));
    let released = false;
    return () => {
      if (!released) {
        released = true;
        storeCounters.active[kind] -= 1;
      }
      release();
    };
  };
  return {
    ...original,
    subscribeRunRuntime: wrap('run',original.subscribeRunRuntime),
    subscribeRobotRuntime: wrap('robot',original.subscribeRobotRuntime),
    subscribeRobotChannelRuntime: wrap('channel',original.subscribeRobotChannelRuntime),
    subscribeRobotStatusRuntime: wrap('status',original.subscribeRobotStatusRuntime),
  };
});

// jsdom has no layout: give the instruments board a fixed height so paging and
// row sizing take their real code paths.
Object.defineProperty(HTMLElement.prototype,'clientHeight',{ configurable: true,get: () => 640 });

const FLEET_SIZES = [8,32,100] as const;
const VIEWS = ['double','list'] as const;
const PAGE_SIZE = 24;
const WARMUP_WINDOWS = 20;
const TIMED_WINDOWS = 30;
const ALLOCATION_WINDOWS = 10;
const WINDOW_MS = 100;
const CARD_COMPONENTS = ['RobotProjectionCard'] as const;

type View = typeof VIEWS[number];

type Transport = {
  requests: Map<string,number>;
  /** One pre-encoded SSE frame, so encoding is not measured as ingest. */
  push: (chunk: Uint8Array) => void;
  restore: () => void;
};

type Metrics = {
  windows: number;
  changes: number;
  /** Per SSE message: CPU and wall time from enqueue until the store settled. */
  ingestMs: number[];
  ingestWallMs: number[];
  /** One entry per React commit: CPU and wall time of the timer tick that flushed it. */
  flushMs: number[];
  flushWallMs: number[];
  /** One entry per React commit: Profiler actualDuration (render phase). */
  renderMs: number[];
  /** CPU of every 100 ms timer tick (visual merge, freshness sweeps), commit or not. */
  timerMs: number[];
  commits: number;
  renders: number;
  cardRenders: number;
  hostUpdates: number;
  listenerCalls: number;
  requests: number;
  allocatedKB?: number;
  byComponent: Record<string,number>;
};

type ScenarioResult = {
  robots: number;
  view: View;
  visibleCards: number;
  subscriptions: Record<SubscriptionKind,number>;
  eventStreams: number;
  fleet: Metrics;
  singleRobot: Metrics;
  offPageRobot: Metrics;
  statusFlip: Metrics;
  /** Operator selects the whole fleet (one robot.selection write). */
  selectAll: Metrics;
};

type TelemetryEvent = ReturnType<FleetTelemetry['nextWindow']>;

const results: ScenarioResult[] = [];

function installTransport(telemetry: FleetTelemetry): Transport {
  const requests = new Map<string,number>();
  const original = globalThis.fetch;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const count = (key: string) => requests.set(key,(requests.get(key) ?? 0) + 1);
  globalThis.fetch = (async (input: RequestInfo | URL,init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(raw,'http://station.test').pathname;
    if (path.endsWith(`/orchestration-runs/${FLEET_RUN_ID}/robots`)) {
      count('snapshot');
      return new Response(JSON.stringify(telemetry.snapshot()),{
        status: 200,headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.endsWith(`/orchestration-runs/${FLEET_RUN_ID}/robots/events`)) {
      count('events');
      const body = new ReadableStream<Uint8Array>({
        start(next) {
          controller = next;
          init?.signal?.addEventListener('abort',() => {
            controller = undefined;
            try { next.close(); } catch { /* already closed */ }
          },{ once: true });
        },
        cancel() { controller = undefined; },
      });
      return new Response(body,{
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-XGC-Robot-Stream-ID': FLEET_STREAM_ID,
          'X-XGC-Robot-Latest-Revision': String(telemetry.revision),
        },
      });
    }
    count(`other ${path}`);
    return new Response('{}',{ status: 404,headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return {
    requests,
    push(chunk) {
      if (!controller) throw new Error('robot event stream is not open');
      controller.enqueue(chunk);
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** Let the stream reader, SSE parser and store settle (real macrotasks). */
async function drain() {
  for (let index = 0; index < 3; index += 1) {
    await new Promise<void>((resolve) => { setImmediate(resolve); });
  }
}

function panelContext(robots: readonly FleetRobot[]) {
  const experiment = fleetExperiment(robots);
  return {
    executionTargetId: 'local',
    sharedStateScope: 'experiment',
    disabledReason: '',
    ports: {
      actions: {
        'robot-simulation': {
          id: 'robot-simulation',label: 'Robot simulation',connected: true,disabledReason: '',defaults: {},
          invoke: vi.fn(),control: vi.fn(),
          trace: { automationResourceId: FLEET_ROBOT_BINDING_ID,workflowInstanceId: FLEET_ROBOT_BINDING_ID },
        },
      },
      data: {
        robots: { id: 'robots',label: 'Robots',contract: 'experiment.robots.v1',connected: true,value: experiment,trace: {} },
        'robot-assets': {
          id: 'robot-assets',label: 'Robot assets',contract: 'robot.assets.v1',connected: true,
          value: { assets: fleetAssets(robots),loading: false,error: '' },trace: {},
        },
        'robot-runtime': {
          id: 'robot-runtime',label: 'Experiment runtime',contract: 'experiment.runtime.v1',connected: true,
          value: fleetExperimentRuntime(),trace: { projection: 'experiment.runtime.v1' },
        },
      },
      authoring: {},
      interactions: {},
    },
  } as never;
}

let heapSession: Session | undefined;

async function allocationSession() {
  if (heapSession || process.env.XGC_PERF_ALLOC === '0') return heapSession;
  try {
    heapSession = new Session();
    heapSession.connect();
    await heapSession.post('HeapProfiler.enable');
  } catch {
    heapSession = undefined;
  }
  return heapSession;
}

/** Sampled bytes allocated by `work`, including objects already collected. */
async function sampleAllocatedKB(work: () => Promise<void>) {
  const session = await allocationSession();
  if (!session) {
    await work();
    return undefined;
  }
  await session.post('HeapProfiler.startSampling',{
    samplingInterval: 4096,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  } as never);
  await work();
  const { profile } = await session.post('HeapProfiler.stopSampling') as {
    profile: { head: HeapNode };
  };
  type HeapNode = {
    selfSize: number;
    children: HeapNode[];
    callFrame: { functionName: string;url: string;lineNumber: number };
  };
  const total = (node: HeapNode): number => node.selfSize + node.children.reduce((sum,child) => sum + total(child),0);
  if (process.env.XGC_PERF_ALLOC_TOP) {
    const sites = new Map<string,number>();
    const visit = (node: HeapNode) => {
      const frame = node.callFrame;
      const key = `${frame.functionName || '(anonymous)'} ${frame.url.replace(/^.*\/web\//,'')}:${frame.lineNumber + 1}`;
      sites.set(key,(sites.get(key) ?? 0) + node.selfSize);
      node.children.forEach(visit);
    };
    visit(profile.head);
    const top = [...sites.entries()].sort((a,b) => b[1] - a[1]).slice(0,Number(process.env.XGC_PERF_ALLOC_TOP) || 25);
    process.stdout.write(`allocation sites:\n${top.map(([site,bytes]) => `  ${(bytes / 1024).toFixed(0).padStart(8)} KB ${site}`).join('\n')}\n`);
  }
  return total(profile.head) / 1024;
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a,b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function sum(values: readonly number[]) {
  return values.reduce((total,value) => total + value,0);
}

async function runScenario(size: number,view: View): Promise<ScenarioResult> {
  resetRobotRuntimeForTests();
  window.localStorage.clear();
  const robots = fleetRobots(size);
  // Frames are generated before a measured loop; each is stamped with the
  // time it will be pushed, so its deadlines are live when it arrives.
  let emitOffsetMs = 0;
  const telemetry = createFleetTelemetry(robots,() => Date.now() + emitOffsetMs);
  const transport = installTransport(telemetry);
  const gridPanel = { id: 'fleet-instruments',pluginId: 'robot-instruments-grid',title: 'Robot instruments',options: { dashboard: 'gcs',typeFilter: 'all' } };
  const controlPanel = { id: 'fleet-control',pluginId: 'px4-rotor-control-panel',title: 'Robot control',options: { dashboard: 'gcs' } };
  const gridScope = { experimentId: FLEET_EXPERIMENT_ID,dashboardId: 'gcs',panelId: gridPanel.id };
  window.localStorage.setItem(panelPrivateStateKey(gridScope,'instrument.view'),JSON.stringify(view));
  window.localStorage.setItem(panelPrivateStateKey(gridScope,'instrument.page-sizes'),JSON.stringify({ list: PAGE_SIZE,single: PAGE_SIZE,double: PAGE_SIZE }));
  const selected = robots.filter((robot) => robot.kind === 'px4').slice(0,4).map((robot) => robot.id);
  window.localStorage.setItem(`xgc.experiment.${FLEET_EXPERIMENT_ID}.robot.selection`,JSON.stringify(selected));
  const occupancy = {
    runningExperimentIds: new Set([FLEET_EXPERIMENT_ID]),
    sessions: fleetExperimentRuntime().sessionViews,
    resolved: true,error: '',refresh: async () => undefined,convergeStoppedExperiment: async () => undefined,
  } as never;
  const gridContext = panelContext(robots);
  const controlContext = panelContext(robots);
  let renderMs = 0;
  const onRender: ProfilerOnRenderCallback = (_id,_phase,actualDuration) => { renderMs += actualDuration; };
  const mounted = render(
    <StationExperimentOccupancyProvider value={occupancy}>
      <Profiler id="fleet" onRender={onRender}>
        <RobotInstrumentsGrid panel={gridPanel as never} context={gridContext} />
        <RobotControlFrameProvider panel={controlPanel as never}>
          <PX4RotorControlPanel panel={controlPanel as never} context={controlContext} />
        </RobotControlFrameProvider>
      </Profiler>
    </StationExperimentOccupancyProvider>,
  );
  await act(async () => { await drain(); });
  const cards = mounted.container.querySelectorAll('[data-xgc-role="run-robot-card"]');
  const visibleIds = new Set(Array.from(cards,(card) => (card as HTMLElement).dataset.xgcId ?? ''));
  expect(visibleIds.size).toBe(Math.min(size,PAGE_SIZE));
  expect(transport.requests.get('events')).toBe(1);

  // Core's frames are generated and encoded before a measured loop starts:
  // only the browser side of the stream (decode, parse, validate, store,
  // render) is timed and allocation-sampled.
  const encoder = new TextEncoder();
  const frames = (windows: number,next: () => TelemetryEvent) => {
    const generated = Array.from({ length: windows },(_,index) => {
      emitOffsetMs = index * WINDOW_MS;
      const event = next();
      return { changes: event.changes.length,frame: encoder.encode(sseFrame(event)) };
    });
    emitOffsetMs = 0;
    return generated;
  };
  type Frame = ReturnType<typeof frames>[number];
  const pushWindow = async ({ changes,frame }: Frame,metrics: Metrics) => {
    metrics.windows += 1;
    metrics.changes += changes;
    const started = performance.now();
    const startedCpu = cpuTimeMs();
    await act(async () => {
      transport.push(frame);
      await drain();
    });
    metrics.ingestMs.push(cpuTimeMs() - startedCpu);
    metrics.ingestWallMs.push(performance.now() - started);
  };
  const advance = async (metrics: Metrics) => {
    const commitsBefore = metrics.commits;
    renderMs = 0;
    const started = performance.now();
    const startedCpu = cpuTimeMs();
    await act(async () => { vi.advanceTimersByTime(WINDOW_MS); });
    const elapsedCpu = cpuTimeMs() - startedCpu;
    const elapsed = performance.now() - started;
    metrics.timerMs.push(elapsedCpu);
    if (renderMs > 0) {
      metrics.flushMs.push(elapsedCpu);
      metrics.flushWallMs.push(elapsed);
      metrics.renderMs.push(renderMs);
    }
    return commitsBefore;
  };
  const emptyMetrics = (): Metrics => ({
    windows: 0,changes: 0,ingestMs: [],ingestWallMs: [],flushMs: [],flushWallMs: [],renderMs: [],timerMs: [],commits: 0,renders: 0,cardRenders: 0,
    hostUpdates: 0,listenerCalls: 0,requests: 0,byComponent: {},
  });
  const run = async (window: readonly Frame[],metrics = emptyMetrics()) => {
    for (const frame of window) {
      await pushWindow(frame,metrics);
      await advance(metrics);
    }
    // Close the last 200 ms visual merge window.
    await advance(metrics);
    return metrics;
  };
  const measure = async (window: readonly Frame[]) => {
    const requestsBefore = sum([...transport.requests.values()]);
    const callsBefore = sum(Object.values(storeCounters.calls));
    startCommitSample();
    const metrics = await run(window);
    const sample = stopCommitSample();
    metrics.commits = sample.commits;
    metrics.renders = totalRenders(sample);
    metrics.cardRenders = totalRenders(sample,CARD_COMPONENTS);
    metrics.hostUpdates = sample.hostUpdates;
    metrics.byComponent = Object.fromEntries([...sample.renders.entries()].sort((a,b) => b[1] - a[1]));
    metrics.listenerCalls = sum(Object.values(storeCounters.calls)) - callsBefore;
    metrics.requests = sum([...transport.requests.values()]) - requestsBefore;
    return metrics;
  };

  await run(frames(WARMUP_WINDOWS,() => telemetry.nextWindow()));
  const subscriptions = { ...storeCounters.active };
  const timedFrames = frames(TIMED_WINDOWS,() => telemetry.nextWindow());
  const fleet = process.env.XGC_PERF_CPU_TOP
    ? await profileCpu(() => measure(timedFrames))
    : await measure(timedFrames);
  const allocationFrames = frames(ALLOCATION_WINDOWS,() => telemetry.nextWindow());
  fleet.allocatedKB = await sampleAllocatedKB(async () => { await run(allocationFrames); });
  if (fleet.allocatedKB !== undefined) fleet.allocatedKB /= ALLOCATION_WINDOWS;
  const visibleRobot = robots.find((robot) => visibleIds.has(robot.id))!;
  const singleRobot = await measure(frames(1,() => telemetry.nextWindow({ robots: [visibleRobot] })));
  const offPage = robots.find((robot) => !visibleIds.has(robot.id));
  const offPageRobot = offPage
    ? await measure(frames(1,() => telemetry.nextWindow({ robots: [offPage] })))
    : emptyMetrics();
  const statusFlip = await measure(frames(1,() => telemetry.statusWindow(visibleRobot,'limited')));
  const selectionKey = `xgc.experiment.${FLEET_EXPERIMENT_ID}.robot.selection`;
  const selectAll = await (async () => {
    const metrics = emptyMetrics();
    const callsBefore = sum(Object.values(storeCounters.calls));
    renderMs = 0;
    startCommitSample();
    const startedCpu = cpuTimeMs();
    await act(async () => {
      // Robot instruments writes the experiment-wide selection slot; every
      // Panel that reads robot.selection hears the panel-state event.
      window.localStorage.setItem(selectionKey,JSON.stringify(robots.map((robot) => robot.id)));
      window.dispatchEvent(new CustomEvent('xgc-panel-state',{ detail: { key: selectionKey } }));
    });
    metrics.flushMs.push(cpuTimeMs() - startedCpu);
    metrics.renderMs.push(renderMs);
    const sample = stopCommitSample();
    metrics.commits = sample.commits;
    metrics.renders = totalRenders(sample);
    metrics.cardRenders = totalRenders(sample,CARD_COMPONENTS);
    metrics.hostUpdates = sample.hostUpdates;
    metrics.byComponent = Object.fromEntries([...sample.renders.entries()].sort((a,b) => b[1] - a[1]));
    metrics.listenerCalls = sum(Object.values(storeCounters.calls)) - callsBefore;
    return metrics;
  })();
  const eventStreams = transport.requests.get('events') ?? 0;

  mounted.unmount();
  cleanup();
  transport.restore();
  resetRobotRuntimeForTests();
  return {
    robots: size,view,visibleCards: visibleIds.size,subscriptions,eventStreams,
    fleet,singleRobot,offPageRobot,statusFlip,selectAll,
  };
}

function summary(result: ScenarioResult) {
  const { fleet } = result;
  const commits = Math.max(1,fleet.commits);
  return {
    robots: result.robots,
    view: result.view,
    cards: result.visibleCards,
    channelSubscriptions: result.subscriptions.channel,
    statusSubscriptions: result.subscriptions.status,
    runSubscriptions: result.subscriptions.run,
    eventStreams: result.eventStreams,
    changesPerMessage: Math.round(fleet.changes / fleet.windows),
    ingestCpuMsPerMessage: Number(median(fleet.ingestMs).toFixed(2)),
    /** Main-thread CPU per second of streaming: every patch plus every timer tick. */
    cpuMsPerSecond: Math.round((sum(fleet.ingestMs) + sum(fleet.timerMs)) / (fleet.windows * WINDOW_MS / 1000)),
    ingestWallMsPerMessage: Number(median(fleet.ingestWallMs).toFixed(2)),
    listenerCallsPerMessage: Math.round(fleet.listenerCalls / fleet.windows),
    commitsPerSecond: Number((fleet.commits / (fleet.windows * WINDOW_MS / 1000)).toFixed(1)),
    rendersPerCommit: Number((fleet.renders / commits).toFixed(1)),
    cardRendersPerCommit: Number((fleet.cardRenders / commits).toFixed(1)),
    domUpdatesPerCommit: Math.round(fleet.hostUpdates / commits),
    reactRenderMsPerCommit: Number(median(fleet.renderMs).toFixed(2)),
    flushCpuMsPerCommit: Number(median(fleet.flushMs).toFixed(2)),
    flushWallMsPerCommit: Number(median(fleet.flushWallMs).toFixed(2)),
    allocatedKBPerMessage: fleet.allocatedKB === undefined ? undefined : Math.round(fleet.allocatedKB),
    requestsDuringTelemetry: fleet.requests,
    singleRobotRenders: result.singleRobot.renders,
    singleRobotCardRenders: result.singleRobot.cardRenders,
    offPageRobotRenders: result.offPageRobot.renders,
    statusFlipRenders: result.statusFlip.renders,
    statusFlipCardRenders: result.statusFlip.cardRenders,
    statusFlipCpuMs: Number((sum(result.statusFlip.ingestMs) + sum(result.statusFlip.flushMs)).toFixed(2)),
    selectAllRenders: result.selectAll.renders,
    selectAllCpuMs: Number(sum(result.selectAll.flushMs).toFixed(2)),
  };
}

function report(result: ScenarioResult) {
  const row = summary(result);
  return [
    `${String(row.robots).padStart(3)} robots ${row.view.padEnd(6)}`,
    `cards=${String(row.cards).padStart(2)}`,
    `subs(ch/st/run)=${row.channelSubscriptions}/${row.statusSubscriptions}/${row.runSubscriptions}`,
    `streams=${row.eventStreams}`,
    `chg/msg=${row.changesPerMessage}`,
    `ingest cpu=${row.ingestCpuMsPerMessage.toFixed(2)}ms/msg`,
    `cpu=${row.cpuMsPerSecond}ms/s`,
    `listeners/msg=${row.listenerCallsPerMessage}`,
    `commits/s=${row.commitsPerSecond}`,
    `renders/commit=${row.rendersPerCommit}`,
    `cards/commit=${row.cardRendersPerCommit}`,
    `dom/commit=${row.domUpdatesPerCommit}`,
    `render=${row.reactRenderMsPerCommit.toFixed(2)}ms/commit`,
    `flush cpu=${row.flushCpuMsPerCommit.toFixed(2)}ms/commit`,
    `alloc=${row.allocatedKBPerMessage === undefined ? 'n/a' : `${row.allocatedKBPerMessage}KB/msg`}`,
    `req=${row.requestsDuringTelemetry}`,
    `| 1 robot: renders=${row.singleRobotRenders} cards=${row.singleRobotCardRenders}`,
    `off-page renders=${row.offPageRobotRenders}`,
    `status flip: renders=${row.statusFlipRenders} cards=${row.statusFlipCardRenders} cpu=${row.statusFlipCpuMs.toFixed(2)}ms`,
    `select all: renders=${row.selectAllRenders} cpu=${row.selectAllCpuMs.toFixed(2)}ms`,
  ].join(' ');
}

describe('robot fleet telemetry cascade',() => {
  beforeAll(async () => {
    // JIT warm-up so the first recorded scenario is not paying for it.
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','setInterval','clearInterval','Date'] });
    vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
    const previous = process.env.XGC_PERF_ALLOC;
    process.env.XGC_PERF_ALLOC = '0';
    await runScenario(32,'double');
    await runScenario(32,'list');
    if (previous === undefined) delete process.env.XGC_PERF_ALLOC;
    else process.env.XGC_PERF_ALLOC = previous;
    vi.useRealTimers();
  },120_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    process.stdout.write(`\n${results.map(report).join('\n')}\n\n`);
    if (process.env.XGC_PERF_DEBUG) {
      results.forEach((result) => {
        process.stdout.write(`${result.robots} ${result.view} fleet ${JSON.stringify(result.fleet.byComponent)}\n`);
        process.stdout.write(`${result.robots} ${result.view} status ${JSON.stringify(result.statusFlip.byComponent)}\n`);
        process.stdout.write(`${result.robots} ${result.view} select-all ${JSON.stringify(result.selectAll.byComponent)}\n`);
      });
    }
    const out = process.env.XGC_PERF_OUT;
    if (out) writeFileSync(out,`${JSON.stringify(results.map(summary),null,1)}\n`);
    await heapSession?.post('HeapProfiler.disable');
    heapSession?.disconnect();
  });

  it.each(FLEET_SIZES.flatMap((size) => VIEWS.map((view) => [size,view] as const)))(
    '%i robots, %s view',async (size,view) => {
      vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','setInterval','clearInterval','Date'] });
      vi.setSystemTime(new Date('2026-09-28T08:00:00Z'));
      const result = await runScenario(size,view);
      results.push(result);

      // Budgets: counts, not times, so they hold on a loaded host.
      // Transport chatter does not scale with robots or panels: one SSE
      // stream per run, no requests while telemetry streams.
      expect(result.eventStreams).toBe(1);
      expect(result.fleet.requests).toBe(0);
      // Subscriptions follow the visible page, not the fleet.
      expect(result.subscriptions.channel).toBeLessThanOrEqual(PAGE_SIZE * 15);
      expect(result.subscriptions.status).toBeLessThanOrEqual(PAGE_SIZE);
      expect(result.subscriptions.run).toBeLessThanOrEqual(2);
      // One React commit per 200 ms visual merge, however many patches.
      expect(result.fleet.commits).toBeLessThanOrEqual(Math.ceil(result.fleet.windows / 2) + 1);
      // A merge re-renders each changed card's live readouts only, and
      // reconciles only the elements of readouts whose values changed.
      expect(result.fleet.renders / result.fleet.cardRenders).toBeLessThanOrEqual(view === 'double' ? 10 : 13);
      expect(result.fleet.hostUpdates / result.fleet.cardRenders).toBeLessThanOrEqual(view === 'double' ? 40 : 100);
      // One robot's telemetry re-renders that robot's card and nothing else.
      expect(result.singleRobot.cardRenders).toBe(1);
      expect(result.singleRobot.renders).toBeLessThanOrEqual(view === 'double' ? 10 : 13);
      // Off-page robots have no subscriptions and draw nothing.
      expect(result.offPageRobot.renders).toBe(0);
      // A status flip re-renders that card (status, then merge) and the grid once.
      expect(result.statusFlip.cardRenders).toBeLessThanOrEqual(2);
      expect(result.statusFlip.byComponent.RobotInstrumentsGrid ?? 0).toBeLessThanOrEqual(1);
    },
    120_000,
  );
});
