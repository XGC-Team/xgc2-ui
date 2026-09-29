// @vitest-environment jsdom
/**
 * Render cascade per Automation run event on one Experiment dashboard.
 * Counts production host work (frame, createPanelContext) and plugin renders
 * for each panel, plus React Profiler time. jsdom times are relative only.
 *
 *   npm run perf:dashboard-renders
 */
import { writeFileSync } from 'node:fs';
import { act,render } from '@testing-library/react';
import { Profiler,type ProfilerOnRenderCallback,type ReactNode } from 'react';
import { afterAll,describe,expect,it,vi } from 'vitest';
import type * as BuiltinPanels from '../src/panels/builtinPanels';
import type * as PanelFrameModule from '../src/panels/PanelFrame';
import type * as ControlButtonModule from '../src/components/controls/ControlButton';
import type * as PanelContextFactory from '../src/domains/experiment/dashboard/panelContextFactory';
import type * as ExecutionPublic from '../src/domains/execution/executionPublic';
import { createNavigationStore,NavigationContext,type NavigationState } from '../src/app/navigationContext';
import { ExperimentDashboardCanvas } from '../src/domains/experiment/dashboard/ExperimentDashboardCanvas';
import { ExperimentDashboardRoute } from '../src/domains/experiment/routes/ExperimentDashboardRoute';
import { StationExperimentOccupancyProvider } from '../src/domains/experiment/useExperimentListRunningIds';
import type { ExperimentDashboardActions } from '../src/domains/experiment/dashboard/useExperimentDashboardActions';
import {
  benchAutomation,
  benchDocuments,
  benchExperiment,
  benchPanels,
  benchStationOccupancy,
  createRunProjectionCache,
  HIDDEN_PANEL_SPECS,
  initialRunState,
  PANEL_SPECS,
  renderCounts,
  type BenchRunState,
} from './dashboardRunEventFixture';

vi.mock('../src/panels/builtinPanels',async (importOriginal) => {
  const original = await importOriginal<typeof BuiltinPanels>();
  const { benchPlugins:plugins } = await import('./dashboardRunEventFixture');
  return { ...original,getPanelPlugin:(id:string) => plugins.get(id) ?? original.getPanelPlugin(id) };
});
vi.mock('../src/panels/PanelFrame',async (importOriginal) => {
  const original = await importOriginal<typeof PanelFrameModule>();
  const { countRender } = await import('./dashboardRunEventFixture');
  return {
    ...original,
    PanelFrame:(props:Parameters<typeof original.PanelFrame>[0]) => {
      countRender(`frame:${props.panel.id}`);
      return original.PanelFrame(props);
    },
  };
});
vi.mock('../src/components/controls/ControlButton',async (importOriginal) => {
  const original = await importOriginal<typeof ControlButtonModule>();
  // The fixture imports application modules that render ControlButton.
  const { countRender } = await import('./renderCounts');
  return {
    ...original,
    ControlButton:(props:ControlButtonModule.ControlButtonProps) => {
      // Panel header Run/Stop (and instrument connection) buttons.
      if (props.dataXgcRole?.startsWith('panel-workflow-')) countRender(`header:${props.dataXgcId}`);
      return <original.ControlButton {...props} />;
    },
  };
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

type EventResult = { event:string;commits:number;actualMs:number;counts:Record<string,number> };
const results:EventResult[] = [];

function actionsFor(projection:ReturnType<ReturnType<typeof createRunProjectionCache>>,previous?:ExperimentDashboardActions):ExperimentDashboardActions {
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

describe('dashboard run-event render cascade',() => {
  afterAll(() => {
    const panelIds = [...PANEL_SPECS,...HIDDEN_PANEL_SPECS].map((spec) => spec.id);
    const header = ['event','commits','ms',...panelIds.flatMap((id) => [`${id}:plugin`,`${id}:frame`,`${id}:ctx`,`${id}:header`])];
    const rows = results.map((result) => [
      result.event,result.commits,result.actualMs.toFixed(2),
      ...panelIds.flatMap((id) => [
        result.counts[`plugin:${id}`] ?? 0,result.counts[`frame:${id}`] ?? 0,result.counts[`context:${id}`] ?? 0,
        result.counts[`header:${id}`] ?? 0,
      ]),
    ]);
    const out = process.env.XGC_PERF_OUT;
    if (out) writeFileSync(out,`${JSON.stringify({ header,rows },null,1)}\n`);
    const summary = results.map((result) => {
      const plugin = panelIds.reduce((sum,id) => sum + (result.counts[`plugin:${id}`] ?? 0),0);
      const frame = panelIds.reduce((sum,id) => sum + (result.counts[`frame:${id}`] ?? 0),0);
      const context = panelIds.reduce((sum,id) => sum + (result.counts[`context:${id}`] ?? 0),0);
      const headers = panelIds.reduce((sum,id) => sum + (result.counts[`header:${id}`] ?? 0),0);
      return `${result.event.padEnd(34)} commits=${result.commits} ms=${result.actualMs.toFixed(2).padStart(7)} plugin=${plugin} frame=${frame} context=${context} header=${headers}`;
    });
    process.stdout.write(`\n${summary.join('\n')}\n\n`);
  });

  it('measures renders per run event',async () => {
    const documents = benchDocuments();
    const experiment = benchExperiment();
    const panels = benchPanels();
    const project = createRunProjectionCache();
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
    let commits = 0;
    let actualMs = 0;
    const onRender:ProfilerOnRenderCallback = (_id,_phase,actualDuration) => {
      commits += 1;
      actualMs += actualDuration;
    };
    let state:BenchRunState = initialRunState();
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

    const measure = async (event:string,update:() => void) => {
      renderCounts.clear();
      commits = 0;
      actualMs = 0;
      await act(async () => {
        update();
        view.rerender(tree());
        await Promise.resolve();
      });
      results.push({ event,commits,actualMs,counts:Object.fromEntries(renderCounts) });
    };
    const advance = (next:BenchRunState) => {
      state = next;
      projection = project(state);
      automation = benchAutomation(projection,documents,functions);
      actions = actionsFor(projection,actions);
    };
    const child = (workflow:string,status:'running'|'succeeded'|'stopping') => ({
      ...state,children:{ ...state.children,[workflow]:{ status,revision:state.children[workflow]!.revision + 1 } },
    });

    await measure('parent re-render, identical inputs',() => undefined);
    await measure('instruments child -> running',() => advance(child('w-instruments','running')));
    await measure('control child -> running',() => advance(child('w-control','running')));
    await measure('logs child -> running',() => advance(child('w-logs','running')));
    await measure('root revision bump',() => advance({ ...state,rootRevision:state.rootRevision + 1 }));
    await measure('instruments child -> stopping',() => advance(child('w-instruments','stopping')));

    expect(results).toHaveLength(6);
  });

  it('measures renders per host event through the Experiment dashboard route',async () => {
    const documents = benchDocuments();
    const experiment = benchExperiment();
    const project = createRunProjectionCache();
    const functions = {
      runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),
      loadRunDetail:vi.fn(async () => ({ invocations:[],nodeSummaries:[],loading:false,error:'' })),
      retainRunDetail:vi.fn(() => () => undefined),retainRunObservation:vi.fn(() => () => undefined),
      refreshExecutionHistory:vi.fn(async () => []),
    };
    let selectedDashboardId = 'gcs';
    const saveExperimentDraft = vi.fn(async (next:typeof experiment) => next);
    const convergeStoppedExperiment = vi.fn(async () => undefined);
    const onSelectedDashboardIdChange = (id:string) => { selectedDashboardId = id; };
    const robotAssetCatalog = { assets:[],loading:false,error:'' };
    const navigation = (sidebarCollapsed:boolean):NavigationState => ({
      page:'experiment',setPage:vi.fn(),navigatePage:vi.fn(),pageSection:() => '',setPageSection:vi.fn(),
      sidebarCollapsed,setSidebarCollapsed:vi.fn(),skin:'light' as NavigationState['skin'],setSkin:vi.fn(),
      language:'en-US',setLanguage:vi.fn(),gcsMode:true,setGcsMode:vi.fn(),targetCoreId:'',setTargetCoreId:vi.fn(),
      managedHostId:'local',setManagedHostId:vi.fn(),
    });
    let nav = navigation(false);
    const navigationStore = createNavigationStore(nav);
    let commits = 0;
    let actualMs = 0;
    const onRender:ProfilerOnRenderCallback = (_id,_phase,actualDuration) => {
      commits += 1;
      actualMs += actualDuration;
    };
    let state:BenchRunState = initialRunState();
    let automation = benchAutomation(project(state),documents,functions);
    const coreNodes:never[] = [];
    const occupancy = benchStationOccupancy();
    const tree = () => <NavigationContext.Provider value={navigationStore}>
      <StationExperimentOccupancyProvider value={occupancy}>
      <Profiler id="route" onRender={onRender}>
        <ExperimentDashboardRoute
          experiment={{
            selectedExperiment:experiment,automationRuntime:automation,localAutomationRuntime:automation,
            saveExperimentDraft,robotAssetCatalog,stationOccupancyResolved:true,
            convergeStoppedExperiment,selectedDashboardId,onSelectedDashboardIdChange,
          }}
          environment={{ coreNodes,executionTargetId:'local' }}
        />
      </Profiler>
      </StationExperimentOccupancyProvider>
    </NavigationContext.Provider>;
    const view = render(tree());
    await act(async () => { await Promise.resolve(); });
    // Visit the Algorithm dashboard once so it stays mounted as a hidden surface.
    selectedDashboardId = 'algo';
    await act(async () => { view.rerender(tree());await Promise.resolve(); });
    selectedDashboardId = 'gcs';
    await act(async () => { view.rerender(tree());await Promise.resolve(); });

    const measure = async (event:string,update:() => void) => {
      renderCounts.clear();
      commits = 0;
      actualMs = 0;
      await act(async () => {
        update();
        view.rerender(tree());
        await Promise.resolve();
      });
      results.push({ event:`route: ${event}`,commits,actualMs,counts:Object.fromEntries(renderCounts) });
    };
    const advance = (next:BenchRunState) => {
      state = next;
      automation = benchAutomation(project(state),documents,functions);
    };
    const child = (workflow:string,status:'running'|'succeeded'|'stopping') => ({
      ...state,children:{ ...state.children,[workflow]:{ status,revision:state.children[workflow]!.revision + 1 } },
    });

    await measure('host re-render, same data',() => undefined);
    await measure('navigation context change',() => {
      nav = navigation(!nav.sidebarCollapsed);
      navigationStore.publish(nav);
    });
    await measure('instruments child -> running',() => advance(child('w-instruments','running')));
    await measure('control child -> running',() => advance(child('w-control','running')));
    await measure('root revision bump',() => advance({ ...state,rootRevision:state.rootRevision + 1 }));

    expect(results.filter((result) => result.event.startsWith('route: '))).toHaveLength(5);
  });
});
