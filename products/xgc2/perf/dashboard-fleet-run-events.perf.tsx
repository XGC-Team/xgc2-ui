// @vitest-environment jsdom
/**
 * Run-event cost of one Experiment GCS dashboard as the robot fleet grows.
 * A connected N-robot Experiment has one robot-slot and one robot-observer
 * child Run per robot under the instruments Panel workflow; connecting,
 * disconnecting or stopping the fleet streams one Run event per child
 * transition to the dashboard, so the per-event host cost is multiplied by
 * O(robots) events. Measures, per slot Run event: wall time (production host
 * work: canvas, Panel headers, run-detail demand, createPanelContext), React
 * commits and rendered components. jsdom times are relative only.
 *
 *   npm run perf:dashboard-renders -- dashboard-fleet-run-events
 */
import './reactCommitCounter';
import { writeFileSync } from 'node:fs';
import { act,cleanup,render } from '@testing-library/react';
import { Profiler,type ProfilerOnRenderCallback,type ReactNode } from 'react';
import { afterAll,describe,expect,it,vi } from 'vitest';
import type * as BuiltinPanels from '../src/panels/builtinPanels';
import type * as PanelContextFactory from '../src/domains/experiment/dashboard/panelContextFactory';
import type * as ExecutionPublic from '../src/domains/execution/executionPublic';
import { ExperimentDashboardCanvas } from '../src/domains/experiment/dashboard/ExperimentDashboardCanvas';
import { StationExperimentOccupancyProvider } from '../src/domains/experiment/useExperimentListRunningIds';
import type { ExperimentDashboardActions } from '../src/domains/experiment/dashboard/useExperimentDashboardActions';
import { panelRunDetailDemands } from '../src/domains/experiment/dashboard/panelRunDetailDemand';
import { liveInstrumentSlotStops } from '../src/domains/experiment/dashboard/robotInstrumentConnectionSelection';
import {
  benchAutomation,
  benchDocuments,
  benchExperiment,
  benchPanels,
  benchStationOccupancy,
  EXPERIMENT_ID,
  HIDDEN_PANEL_SPECS,
  renderCounts,
} from './dashboardRunEventFixture';
import {
  advanceSlot,
  createFleetRunProjectionCache,
  FLEET_PANEL_SPECS,
  fleetRobotIds,
  initialFleetRunState,
  INSTRUMENTS_CHILD_ID,
  type FleetRunState,
} from './dashboardFleetRunFixture';
import { cpuTimeMs,profileCpu } from './cpuTime';
import { startCommitSample,stopCommitSample,totalRenders } from './reactCommitCounter';

vi.mock('../src/panels/builtinPanels',async (importOriginal) => {
  const original = await importOriginal<typeof BuiltinPanels>();
  const { benchPlugins:plugins } = await import('./dashboardRunEventFixture');
  return { ...original,getPanelPlugin:(id:string) => plugins.get(id) ?? original.getPanelPlugin(id) };
});
vi.mock('../src/domains/experiment/dashboard/panelContextFactory',async (importOriginal) => {
  const original = await importOriginal<typeof PanelContextFactory>();
  const { countRender } = await import('./dashboardRunEventFixture');
  return {
    ...original,
    createPanelContext:(...args:Parameters<typeof original.createPanelContext>) => {
      countRender(`context:${args[1].id}`);
      return original.createPanelContext(...args);
    },
  };
});
const processSnapshot = [{
  targetId:'local',loading:false,error:'',jobs:[],
  processInstances:['w-instruments','w-lichtblick','w-camera'].map((workflow) => ({
    id:`process-${workflow}`,targetId:'local',definitionId:workflow,definitionVersion:'1',definitionDigest:'a'.repeat(64),
    ownerType:'orchestration-run' as const,ownerId:`child-${workflow}`,scope:'run' as const,parameters:{},driver:'host' as const,
    desiredState:'running' as const,observedState:'running' as const,readiness:{ status:'passing' as const },
    liveness:{ status:'passing' as const },revision:1,restartCount:0,createdAt:'t',updatedAt:'t',
  })),
}];
vi.mock('../src/domains/execution/executionPublic',async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublic>(),
  useExecutionTargets:() => processSnapshot,
}));
vi.mock('../src/domains/experiment/dashboard/useDashboardSurfaceSize',() => ({
  useDashboardSurfaceSize:() => ({ width:1600,height:1000,mounted:true,containerRef:{ current:null } }),
}));
vi.mock('../src/domains/experiment/useExperimentAgentViewCapture',() => ({
  useExperimentAgentViewCapture:() => undefined,
}));
vi.mock('react-grid-layout',() => ({
  GridLayout:(props:{ children:ReactNode }) => <div>{props.children}</div>,
}));

const FLEET_SIZES = [8,32,100] as const;
const WARMUP_EVENTS = 20;
const MEASURED_EVENTS = 60;
const ROOT_EVENTS = 5;
const GCS_PANEL_IDS = FLEET_PANEL_SPECS.map((spec) => spec.id);

/** Panel context builds per event since the last renderCounts.clear(), for every GCS Panel. */
function panelContextCounts(events:number) {
  return Object.fromEntries(GCS_PANEL_IDS.map((panelId) => [
    panelId,Number(((renderCounts.get(`context:${panelId}`) ?? 0) / events).toFixed(2)),
  ]));
}

type FleetRunResult = {
  robots:number;
  childRuns:number;
  events:number;
  cpuMsPerEvent:number;
  reactMsPerEvent:number;
  commitsPerEvent:number;
  rendersPerEvent:number;
  contextBuildsPerEvent:number;
  /** Panel context builds per slot Run event, by Panel id (0 = not re-rendered). */
  contextsByPanel:Record<string,number>;
  /** A Runner root revision concerns every Panel: context builds per Panel per root event. */
  rootEventContextsByPanel:Record<string,number>;
  byComponent:Record<string,number>;
};

const results:FleetRunResult[] = [];
const relationScans:{ robots:number;usPerEvent:number }[] = [];

/**
 * The relation walks one slot Run event triggers on the instruments Panel:
 * the Run/Stop header resolves live selected slots twice and the Panel's
 * run-detail demand walks the workflow child's relations. Pure functions over
 * a fresh snapshot per event, so per-snapshot indexes are rebuilt each time.
 */
function measureRelationScans(size:number) {
  const robotIds = fleetRobotIds(size);
  const project = createFleetRunProjectionCache(robotIds);
  let state = initialFleetRunState(robotIds);
  const selected = new Set(robotIds.filter((_,index) => index % 2 === 0));
  const events = 200;
  const snapshots = Array.from({ length:events },(_,index) => {
    state = advanceSlot(state,robotIds[(index * 7) % robotIds.length]!,index % 2 === 0 ? 'slot' : 'observer','running');
    return project(state).runDetailsById;
  });
  let sink = 0;
  const rounds = Array.from({ length:5 },() => {
    // Each round sees fresh snapshots, as live Run events deliver them.
    const round = snapshots.map((details) => ({ ...details,[INSTRUMENTS_CHILD_ID]:{
      ...details[INSTRUMENTS_CHILD_ID]!,relations:{ ...details[INSTRUMENTS_CHILD_ID]!.relations!,
        childRuns:[...details[INSTRUMENTS_CHILD_ID]!.relations!.childRuns] },
    } }));
    const started = cpuTimeMs();
    round.forEach((details) => {
      sink += liveInstrumentSlotStops(details,[INSTRUMENTS_CHILD_ID],selected).length;
      sink += liveInstrumentSlotStops(details,[INSTRUMENTS_CHILD_ID],selected).length;
      sink += panelRunDetailDemands({
        panelId:'instruments',targetId:'local',activeRuns:[],enabled:true,runDetailsById:details,
        rootDemands:[{ id:INSTRUMENTS_CHILD_ID,targetId:'local',revision:2 }],
      }).length;
    });
    return (cpuTimeMs() - started) * 1000 / events;
  });
  expect(sink).toBeGreaterThan(0);
  return { robots:size,usPerEvent:Number(median(rounds).toFixed(1)) };
}

function median(values:readonly number[]) {
  const sorted = [...values].sort((a,b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

type Projection = ReturnType<ReturnType<typeof createFleetRunProjectionCache>>;

function actionsFor(projection:Projection,previous?:ExperimentDashboardActions):ExperimentDashboardActions {
  const noop = vi.fn(async () => undefined as never);
  const reason = () => '';
  const base = previous ?? {
    experimentIsRunning:true,activeRun:undefined,activeRuns:[],sessionViews:[],runDetailsById:{},runMode:'simulation',
    stopAllInFlight:false,startInFlight:false,lifecycleStateLoading:false,actionError:'',startDisabledReason:'',
    canStartExperiment:false,canStopExperiment:true,updateRobotBindings:noop,updateRobotBindingsDisabledReason:reason,
    updateLocalizationOffset:noop,updateLocalizationOffsetDisabledReason:reason,updateWorldBoundary:noop,
    updateWorldBoundaryDisabledReason:reason,updateWorkflowPresetInputs:noop,updateWorkflowPresetInputsDisabledReason:reason,
    startExperiment:noop,stopExperiment:noop,startPanel:noop,invokePanelAction:noop,stopPanelAction:noop,
  } as unknown as ExperimentDashboardActions;
  const rootDetail = projection.runDetailsById['full-root'];
  if (previous && previous.activeRun?.revision===projection.root.revision
    && previous.runDetailsById['full-root']===rootDetail) return previous;
  // Like useExperimentDashboardActions: a new lifecycle object only when the
  // System Runner projection (root view or its retained detail) changes.
  return {
    ...base,activeRun:projection.root,activeRuns:[projection.root],
    runDetailsById:rootDetail ? { 'full-root':rootDetail } : {},
  };
}

async function measureFleet(size:number,profile = false):Promise<FleetRunResult> {
  window.localStorage.clear();
  const robotIds = fleetRobotIds(size);
  // The operator selected half of the fleet in Robot instruments.
  window.localStorage.setItem(
    `xgc.experiment.${EXPERIMENT_ID}.robot.selection`,
    JSON.stringify(robotIds.filter((_,index) => index % 2 === 0)),
  );
  const documents = benchDocuments([...FLEET_PANEL_SPECS,...HIDDEN_PANEL_SPECS]);
  const experiment = benchExperiment(FLEET_PANEL_SPECS,HIDDEN_PANEL_SPECS);
  const panels = benchPanels(FLEET_PANEL_SPECS);
  const project = createFleetRunProjectionCache(robotIds);
  const functions = {
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),
    loadRunDetail:vi.fn(async () => ({ invocations:[],nodeSummaries:[],loading:false,error:'' })),
    retainRunDetail:vi.fn(() => () => undefined),retainRunObservation:vi.fn(() => () => undefined),
    refreshExecutionHistory:vi.fn(async () => []),
  };
  const session = { visibleExperiment:experiment,editing:false,readOnly:false,commitConflict:'',saveError:'' };
  const panelWorkspace = { items:panels,selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() };
  const drop = { onDragOver:vi.fn(),onDrop:vi.fn() };
  const dashboard = { id:'gcs',name:'GCS',description:'',panels:[] };
  const coreNodes:never[] = [];
  const robotAssetCatalog = { assets:[],loading:false,error:'' };
  let reactMs = 0;
  const onRender:ProfilerOnRenderCallback = (_id,_phase,actualDuration) => { reactMs += actualDuration; };
  let state:FleetRunState = initialFleetRunState(robotIds);
  let projection = project(state);
  let automation = benchAutomation(projection,documents,functions);
  let actions = actionsFor(projection);
  const occupancy = benchStationOccupancy();
  const tree = () => <StationExperimentOccupancyProvider value={occupancy}>
    <Profiler id="canvas" onRender={onRender}>
      <ExperimentDashboardCanvas
        session={session} dashboard={dashboard} panels={panelWorkspace} drop={drop} actions={actions}
        gcsMode coreNodes={coreNodes} executionTargetId="local" automation={automation} localAutomation={automation}
        robotAssetCatalog={robotAssetCatalog}
      />
    </Profiler>
  </StationExperimentOccupancyProvider>;
  const view = render(tree());
  await act(async () => { await Promise.resolve(); });
  const event = async (index:number) => {
    // Core's side of the event (the next Run projection) is built before the
    // clock starts; only the dashboard's handling of it is measured.
    const robotId = robotIds[(index * 7) % robotIds.length]!;
    state = advanceSlot(state,robotId,index % 2 === 0 ? 'slot' : 'observer','running');
    const nextProjection = project(state);
    const started = cpuTimeMs();
    await act(async () => {
      projection = nextProjection;
      automation = benchAutomation(projection,documents,functions);
      actions = actionsFor(projection,actions);
      view.rerender(tree());
      await Promise.resolve();
    });
    return cpuTimeMs() - started;
  };
  for (let index = 0; index < WARMUP_EVENTS; index += 1) await event(index);
  renderCounts.clear();
  reactMs = 0;
  startCommitSample();
  const times:number[] = [];
  const measured = async () => {
    for (let index = WARMUP_EVENTS; index < WARMUP_EVENTS + MEASURED_EVENTS; index += 1) times.push(await event(index));
  };
  if (profile) await profileCpu(measured);
  else await measured();
  const sample = stopCommitSample();
  const contextsByPanel = panelContextCounts(MEASURED_EVENTS);
  const contextBuilds = Object.values(contextsByPanel).reduce((sum,count) => sum + count,0) * MEASURED_EVENTS;
  // Lifecycle events still reach every Panel: bump the Runner root revision.
  renderCounts.clear();
  for (let index = 0; index < ROOT_EVENTS; index += 1) {
    const next = { ...state,base:{ ...state.base,rootRevision:state.base.rootRevision + 1 } };
    state = next;
    const nextProjection = project(state);
    await act(async () => {
      projection = nextProjection;
      automation = benchAutomation(projection,documents,functions);
      actions = actionsFor(projection,actions);
      view.rerender(tree());
      await Promise.resolve();
    });
  }
  const rootEventContextsByPanel = panelContextCounts(ROOT_EVENTS);
  view.unmount();
  cleanup();
  return {
    robots:size,
    childRuns:robotIds.length * 2,
    events:MEASURED_EVENTS,
    cpuMsPerEvent:Number(median(times).toFixed(2)),
    reactMsPerEvent:Number((reactMs / MEASURED_EVENTS).toFixed(2)),
    commitsPerEvent:Number((sample.commits / MEASURED_EVENTS).toFixed(2)),
    rendersPerEvent:Number((totalRenders(sample) / MEASURED_EVENTS).toFixed(1)),
    contextBuildsPerEvent:Number((contextBuilds / MEASURED_EVENTS).toFixed(1)),
    contextsByPanel,
    rootEventContextsByPanel,
    byComponent:Object.fromEntries([...sample.renders.entries()].sort((a,b) => b[1] - a[1])),
  };
}

describe('dashboard Run events with a robot fleet',() => {
  afterAll(() => {
    process.stdout.write(`\n${results.map((result) => [
      `${String(result.robots).padStart(3)} robots (${String(result.childRuns).padStart(3)} slot/observer Runs)`,
      `cpu=${result.cpuMsPerEvent.toFixed(2)}ms/event`,
      `react=${result.reactMsPerEvent.toFixed(2)}ms/event`,
      `commits=${result.commitsPerEvent}/event`,
      `renders=${result.rendersPerEvent}/event`,
      `contexts=${result.contextBuildsPerEvent}/event`,
      `re-rendered panels=${Object.entries(result.contextsByPanel).filter(([,count]) => count > 0).map(([panelId]) => panelId).join('+')}`,
    ].join(' ')).join('\n')}\n${relationScans.map((scan) => (
      `${String(scan.robots).padStart(3)} robots relation walks per slot Run event: ${scan.usPerEvent.toFixed(1)}µs`
    )).join('\n')}\n\n`);
    if (process.env.XGC_PERF_DEBUG) {
      results.forEach((result) => process.stdout.write(`${result.robots} ${JSON.stringify(result.byComponent)}\n`));
    }
    const out = process.env.XGC_PERF_OUT;
    if (out) {
      writeFileSync(out,`${JSON.stringify({
        // Per-component counts stay in the XGC_PERF_DEBUG output.
        events:results.map((result) => ({ ...result,byComponent:undefined })),relationScans,
      },null,1)}\n`);
    }
  });

  it('times the relation walks of one slot Run event',() => {
    FLEET_SIZES.forEach(measureRelationScans);
    FLEET_SIZES.forEach((size) => relationScans.push(measureRelationScans(size)));
  });

  it('warms up the dashboard host',async () => {
    for (const size of FLEET_SIZES) await measureFleet(size);
  },120_000);

  it.each(FLEET_SIZES)('%i robots',async (size) => {
    const result = await measureFleet(size,Boolean(process.env.XGC_PERF_CPU_TOP) && size === FLEET_SIZES.at(-1));
    results.push(result);
    expect(result.commitsPerEvent).toBeGreaterThan(0);
    // Budgets: a robot slot Run event concerns only the instruments Panel
    // (it owns the slot Run) and the logs Panel (target-wide run history).
    // No other Panel host re-renders or rebuilds its context, at any fleet size.
    expect(result.contextsByPanel).toEqual(Object.fromEntries(GCS_PANEL_IDS.map((panelId) => [
      panelId,panelId === 'instruments' || panelId === 'logs' ? 1 : 0,
    ])));
    expect(result.rendersPerEvent).toBeLessThanOrEqual(20);
    // A Runner root revision still reaches every Panel.
    expect(result.rootEventContextsByPanel).toEqual(Object.fromEntries(GCS_PANEL_IDS.map((panelId) => [panelId,1])));
  },120_000);
});
