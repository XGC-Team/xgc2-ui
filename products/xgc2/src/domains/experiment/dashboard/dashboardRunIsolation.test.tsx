// @vitest-environment jsdom

import { act,render } from '@testing-library/react';
import { useLayoutEffect,type ReactNode } from 'react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type * as BuiltinPanels from '../../../panels/builtinPanels';
import type * as ExecutionPublic from '../../execution/executionPublic';
import type * as ControlButtonModule from '../../../components/controls/ControlButton';
import type * as PanelContextFactory from './panelContextFactory';
import { definePanelPlugin,type AutomationPanelContext,type PanelPluginContext,type PanelPluginProps } from '../../../panels/types';
import {
  newAutomationNode,
  newAutomationSpec,
  type AutomationDocument,
  type AutomationRunSummaryView,
} from '../../automation/automationPublic';
import {
  EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,
  experimentProcessRuntimeProjection,
  SYSTEM_EXPERIMENT_RUNNER,
  type ExperimentRunView,
} from '../experimentPublic';
import { newExperimentSpec,panelFromEditor,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { StationExperimentOccupancyProvider,type StationExperimentOccupancy } from '../useExperimentListRunningIds';
import { ExperimentDashboardCanvas } from './ExperimentDashboardCanvas';
import { useExperimentDashboardActions,type ExperimentDashboardActions } from './useExperimentDashboardActions';

const probe = vi.hoisted(() => ({
  renders:new Map<string,number>(),
  contexts:new Map<string,PanelPluginContext>(),
  contextBuilds:new Map<string,number>(),
  runtimeStatus:'',
}));

// A Panel host that re-renders rebuilds its plugin context.
vi.mock('./panelContextFactory',async (importOriginal) => {
  const original = await importOriginal<typeof PanelContextFactory>();
  return {
    ...original,
    createPanelContext:(...args:Parameters<typeof original.createPanelContext>) => {
      const panelId = args[1].id;
      probe.contextBuilds.set(panelId,(probe.contextBuilds.get(panelId) ?? 0) + 1);
      return original.createPanelContext(...args);
    },
  };
});

vi.mock('../../../components/controls/ControlButton',async (importOriginal) => {
  const original = await importOriginal<typeof ControlButtonModule>();
  return {
    ...original,
    ControlButton:(props:ControlButtonModule.ControlButtonProps) => {
      if (props.dataXgcRole?.startsWith('panel-workflow-')) {
        const key = `header:${props.dataXgcId}`;
        probe.renders.set(key,(probe.renders.get(key) ?? 0) + 1);
      }
      return <original.ControlButton {...props} />;
    },
  };
});

vi.mock('../../../panels/builtinPanels',async (importOriginal) => {
  const original = await importOriginal<typeof BuiltinPanels>();
  return { ...original,getPanelPlugin:(id:string) => testPlugins().get(id) ?? original.getPanelPlugin(id) };
});
vi.mock('../../execution/executionPublic',async (importOriginal) => ({
  ...await importOriginal<typeof ExecutionPublic>(),
  useExecutionTargets:() => EXECUTIONS,
}));
vi.mock('./useDashboardSurfaceSize',() => ({
  useDashboardSurfaceSize:() => ({ width:900,height:600,mounted:true,containerRef:{ current:null } }),
}));
vi.mock('react-grid-layout',() => ({
  GridLayout:(props:{ children:ReactNode }) => <div>{props.children}</div>,
}));

const EXECUTIONS = [{ targetId:'local',loading:false,error:'',jobs:[],processInstances:[] }];

function ProcessProbe({ panel,context }:PanelPluginProps) {
  probe.renders.set(panel.id,(probe.renders.get(panel.id) ?? 0) + 1);
  probe.contexts.set(panel.id,context);
  const runtime = experimentProcessRuntimeProjection(context.ports.data.runtime?.value);
  const status = runtime?.activeRuns?.[0]?.status ?? '';
  // Run-scoped transports are released in layout effects; record the phase
  // the plugin has committed, as a robot connection would.
  useLayoutEffect(() => { probe.runtimeStatus = status; },[status]);
  return <p>{status}</p>;
}

function ActionProbe({ panel,context }:PanelPluginProps) {
  probe.renders.set(panel.id,(probe.renders.get(panel.id) ?? 0) + 1);
  probe.contexts.set(panel.id,context);
  return <p>{context.ports.actions.start?.activeInvocation?.status ?? 'idle'}</p>;
}

let registry:ReadonlyMap<string,ReturnType<typeof definePanelPlugin>> | undefined;
function testPlugins() {
  registry ??= new Map([
    ['probe-process',definePanelPlugin({
      id:'probe-process',name:'Process probe',category:'Custom',description:'',capabilities:['experiment'] as const,
      executionTargetPolicy:'local',
      dataPorts:[{ id:'runtime',label:'Runtime',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }],
      component:ProcessProbe,
    })],
    ['probe-action',definePanelPlugin({
      id:'probe-action',name:'Action probe',category:'Control',description:'',capabilities:['experiment'] as const,
      executionTargetPolicy:'local',
      actionPorts:[{ id:'start',label:'Start',actionKinds:['service'] }],
      component:ActionProbe,
    })],
  ]);
  return registry;
}

describe('dashboard Run isolation',() => {
  beforeEach(() => {
    probe.renders.clear();
    probe.contexts.clear();
    probe.contextBuilds.clear();
    probe.runtimeStatus = '';
  });

  it('re-renders only Panels whose resolved ports read the Run event',async () => {
    const harness = canvasHarness();
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    probe.renders.clear();

    // An unrelated history row changes the target runtime and every Run map.
    await act(async () => {
      harness.update({ runSummaries:[...harness.automation.runSummaries,historyRow('history-2')] });
      view.rerender(harness.tree());
    });

    expect(probe.renders.get('process')).toBe(1);
    expect(probe.renders.get('control')).toBeUndefined();
  });

  it('does not re-render a Panel for a Run event that belongs to another Panel',async () => {
    // The saved Experiment places both Panels, so the control Panel's Action
    // root and its children belong to it alone.
    const harness = canvasHarness({ ...SESSION,visibleExperiment:EXPERIMENT_WITH_PANELS });
    // Unchanged rows keep their references across events, as the runtime merges do.
    const history = historyRow('history-1');
    const root = panelActionRoot('running');
    harness.update({ runSummaries:[history,root,panelActionChild('running',1)] });
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    probe.renders.clear();
    probe.contextBuilds.clear();

    // One of the control Panel's child Runs advances (a fleet's robot slot).
    await act(async () => {
      harness.update({ runSummaries:[history,root,panelActionChild('running',2)] });
      view.rerender(harness.tree());
    });
    expect(probe.contextBuilds.get('control')).toBe(1);
    expect(probe.contextBuilds.get('process')).toBeUndefined();
    expect(probe.renders.get('process')).toBeUndefined();
    const processRuntime = experimentProcessRuntimeProjection(probe.contexts.get('process')?.ports.data.runtime?.value);
    expect(processRuntime?.runSummaries.map((run) => run.id)).toEqual(['history-1']);

    // A Run that belongs to no Panel still reaches every Panel that reads it.
    await act(async () => {
      harness.update({ runSummaries:[history,historyRow('history-2'),root,panelActionChild('running',2)] });
      view.rerender(harness.tree());
    });
    expect(probe.renders.get('process')).toBe(1);
    expect(experimentProcessRuntimeProjection(probe.contexts.get('process')?.ports.data.runtime?.value)
      ?.runSummaries.map((run) => run.id)).toEqual(['history-1','history-2']);
  });

  it('still re-renders an Action Panel when its own invocation changes',async () => {
    const harness = canvasHarness();
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    probe.renders.clear();

    await act(async () => {
      harness.update({ runSummaries:[...harness.automation.runSummaries,panelActionRoot('waiting')] });
      view.rerender(harness.tree());
    });

    expect(probe.renders.get('control')).toBe(1);
    expect(probe.contexts.get('control')?.ports.actions.start?.activeInvocation).toEqual({
      id:'panel-action-root',status:'waiting',revision:1,
    });
  });

  it('re-renders the Panel Run/Stop header only when what it shows changes',async () => {
    const harness = canvasHarness();
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[data-xgc-role="panel-workflow-run"][data-xgc-id="control"]')).not.toBeNull();
    probe.renders.clear();

    await act(async () => {
      harness.update({ runSummaries:[...harness.automation.runSummaries,historyRow('history-2')] });
      harness.updateActions({ runDetailsById:{ ...harness.actions.runDetailsById } });
      view.rerender(harness.tree());
    });
    expect(probe.renders.get('header:control')).toBeUndefined();

    await act(async () => {
      harness.updateActions({ activeRuns:[panelRunRoot('waiting')] });
      view.rerender(harness.tree());
    });
    expect(probe.renders.get('header:control')).toBe(1);
    expect(view.container.querySelector('[data-xgc-role="panel-workflow-stop"][data-xgc-id="control"]')).not.toBeNull();
  });

  it('stops through the latest Run lifecycle when the header did not re-render',async () => {
    const harness = canvasHarness();
    harness.updateActions({ activeRuns:[panelRunRoot('waiting')] });
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    const latestStop = vi.fn(async () => undefined as never);
    probe.renders.clear();

    await act(async () => {
      harness.updateActions({ activeRuns:[panelRunRoot('waiting')],stopPanelAction:latestStop });
      view.rerender(harness.tree());
    });
    expect(probe.renders.get('header:control')).toBeUndefined();
    await act(async () => {
      (view.container.querySelector('[data-xgc-role="panel-workflow-stop"][data-xgc-id="control"]') as HTMLButtonElement).click();
    });

    expect(latestStop).toHaveBeenCalledExactlyOnceWith(panelRunRoot('waiting'),'Stop Panel control');
    expect(harness.actions.stopPanelAction).toBe(latestStop);
  });

  it('runs a reused Panel context command against the latest Run lifecycle',async () => {
    const harness = canvasHarness();
    const view = render(harness.tree());
    await act(async () => { await Promise.resolve(); });
    const captured = probe.contexts.get('control')!.ports.actions.start!;
    const latestInvoke = vi.fn(async () => ({ id:'next',status:'waiting' as const,revision:1 } as unknown as ExperimentRunView));
    probe.renders.clear();

    await act(async () => {
      harness.updateActions({ invokePanelAction:latestInvoke as unknown as ExperimentDashboardActions['invokePanelAction'] });
      view.rerender(harness.tree());
    });
    expect(probe.renders.get('control')).toBeUndefined();
    await act(async () => { await captured.invoke({ speed:2 }); });

    expect(latestInvoke).toHaveBeenCalledWith('control','start',{ speed:2 },expect.any(String));
    expect(harness.actions.invokePanelAction).toBe(latestInvoke);
  });

  it('commits the Total Stop stopping phase to Panels before the stop request is sent',async () => {
    let observedAtStop = '';
    const stopWorkflow = vi.fn(async () => {
      observedAtStop = probe.runtimeStatus;
      return undefined;
    });
    const root = rootView('running');
    function Dashboard() {
      const actions = useExperimentDashboardActions({
        visibleExperiment:EXPERIMENT,
        runtimeProjection:{
          loading:false,error:'',stateResolved:true,activeRun:root,activeRuns:[root],runDetailsById:{},
          refresh:async () => undefined,convergeStoppedSession:async () => undefined,
        },
        startWorkflow:vi.fn(),
        stopWorkflow,
        runMode:'simulation',
      });
      return <StationExperimentOccupancyProvider value={OCCUPANCY}>
        <button type="button" onClick={() => { void actions.stopExperiment(); }}>Total Stop</button>
        <ExperimentDashboardCanvas
          session={SESSION} dashboard={DASHBOARD} panels={PANEL_WORKSPACE} drop={DROP} actions={actions}
          gcsMode coreNodes={CORE_NODES} executionTargetId="local" automation={AUTOMATION}
        />
      </StationExperimentOccupancyProvider>;
    }
    const view = render(<Dashboard />);
    await act(async () => { await Promise.resolve(); });
    expect(probe.runtimeStatus).toBe('running');

    await act(async () => { view.getByRole('button',{ name:'Total Stop' }).click(); });

    expect(stopWorkflow).toHaveBeenCalledOnce();
    expect(observedAtStop).toBe('stopping');
  });
});

const now = '2026-01-01T00:00:00Z';
function head(domain:string,resourceId:string) {
  return {
    domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,
    digest:'d'.repeat(64),revision:1,createdAt:now,updatedAt:now,
  };
}
function branch(domain:string,resourceId:string) {
  return { domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:now,updatedAt:now };
}
function workflowDocument():AutomationDocument {
  const spec = newAutomationSpec('worker');
  spec.nodes = [{ ...newAutomationNode('trigger.manual',{},'Start'),id:'entry-start' }];
  spec.actions = [{
    id:'start',version:1,label:'Start',entryNodeId:'entry-start',kind:'service',inputSchema:{ fields:[] },
    resultSchema:{ fields:[] },controls:['stop'],admission:{},requiredCapabilities:[],projectionContracts:[],
  }];
  return { head:head('automation','worker'),branch:branch('automation','worker'),spec };
}

const EXPERIMENT:ExperimentDocument = (() => {
  const spec = newExperimentSpec({ name:'Isolation',runModes:['simulation'] });
  spec.workflowInstances = [{
    id:'worker',ref:{ domain:'automation',resourceId:'worker',branch:'main' },
    actionPresets:[
      { id:'run',actionId:'start',inputs:{},parameterBindings:[] },
      { id:'start',actionId:'start',inputs:{},parameterBindings:[] },
    ],
  }];
  return { head:head('experiment','experiment-a'),branch:branch('experiment','experiment-a'),spec };
})();

const PANELS:PanelInstance[] = [
  {
    id:'process',pluginId:'probe-process',title:'Process',gridPos:{ x:0,y:0,w:6,h:4 },query:{},options:{},fieldConfig:{},
    portBindings:[{ portId:'runtime',kind:'data',projection:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE }],
  },
  {
    id:'control',pluginId:'probe-action',title:'Control',gridPos:{ x:6,y:0,w:6,h:4 },query:{},options:{},fieldConfig:{},
    portBindings:[
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'run',managed:false,relation:'supervised',failurePolicy:'keep-experiment' },
      { portId:'start',kind:'action',presetId:'start' },
    ],
  },
];

const SESSION = { visibleExperiment:EXPERIMENT,editing:false,readOnly:false,commitConflict:'',saveError:'' };
const EXPERIMENT_WITH_PANELS:ExperimentDocument = {
  ...EXPERIMENT,
  spec:{ ...EXPERIMENT.spec,dashboards:[{ id:'gcs',name:'GCS',description:'',panels:PANELS.map(panelFromEditor) }] },
};
const DASHBOARD = { id:'gcs',name:'GCS',description:'',panels:[] };
const PANEL_WORKSPACE = { items:PANELS,selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() };
const DROP = { onDragOver:vi.fn(),onDrop:vi.fn() };
const CORE_NODES:never[] = [];
// The Experiment route owns station occupancy; Panels read it from context.
const OCCUPANCY:StationExperimentOccupancy = {
  runningExperimentIds:new Set(),sessions:[],resolved:true,error:'',
  refresh:async () => undefined,convergeStoppedExperiment:async () => undefined,
};
const AUTOMATION = automationRuntime([historyRow('history-1')]);

function automationRuntime(runSummaries:AutomationRunSummaryView[]):AutomationPanelContext['automation'] {
  return {
    targetId:'local',documents:[workflowDocument()],catalog:[],runSummaries,runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),cancel:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn(async () => undefined),
    retainRunDetail:vi.fn(() => vi.fn()),retainRunObservation:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn(),
  } as unknown as AutomationPanelContext['automation'];
}

function historyRow(id:string):AutomationRunSummaryView {
  return {
    id,targetId:'local',automationResourceId:'other',actionId:'run',actionVersion:1,sourceKind:'automation',
    sourceRef:{ domain:'automation',resourceId:'other',branch:'main',commitId:'c',version:1,digest:'e'.repeat(64) },
    status:'succeeded',revision:1,rootRunId:id,createdAt:now,updatedAt:now,
  };
}

function panelActionRoot(status:AutomationRunSummaryView['status']):AutomationRunSummaryView {
  return {
    id:'panel-action-root',targetId:'local',automationResourceId:'worker',actionId:'start',actionVersion:1,
    sourceKind:'experiment',
    sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'commit-1',version:1,digest:'d'.repeat(64) },
    experimentSelector:{ runMode:'simulation',panelId:'control',presetId:'start' },
    status,revision:1,rootRunId:'panel-action-root',createdAt:now,updatedAt:now,
  };
}

function panelActionChild(status:AutomationRunSummaryView['status'],revision:number):AutomationRunSummaryView {
  return {
    id:'panel-action-child',targetId:'local',automationResourceId:'worker',actionId:'start',actionVersion:1,
    sourceKind:'automation',
    sourceRef:{ domain:'automation',resourceId:'worker',branch:'main',commitId:'c',version:1,digest:'e'.repeat(64) },
    status,revision,parentRunId:'panel-action-root',rootRunId:'panel-action-root',createdAt:now,updatedAt:now,
  };
}

function panelRunRoot(status:ExperimentRunView['status']):ExperimentRunView {
  return {
    id:'panel-run-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId:SYSTEM_EXPERIMENT_RUNNER.actions.runPanel,
    runMode:'simulation',status,revision:2,rootRunId:'panel-run-root',createdAt:now,updatedAt:now,workflowTargets:[],
    panelId:'control',
  };
}

function rootView(status:ExperimentRunView['status']):ExperimentRunView {
  return {
    id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
    automationResourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
    runMode:'simulation',status,revision:3,rootRunId:'full-root',createdAt:now,updatedAt:now,workflowTargets:[],
  };
}

function canvasHarness(session = SESSION) {
  const harness = {
    automation:AUTOMATION,
    actions:{
      experimentIsRunning:false,activeRun:undefined,activeRuns:[],sessionViews:[],runDetailsById:{},runMode:'simulation',
      stopAllInFlight:false,startInFlight:false,lifecycleStateLoading:false,actionError:'',startDisabledReason:'',
      canStartExperiment:true,canStopExperiment:false,updateRobotBindings:vi.fn(),updateRobotBindingsDisabledReason:() => '',
      updateLocalizationOffset:vi.fn(),updateLocalizationOffsetDisabledReason:() => '',updateWorldBoundary:vi.fn(),
      updateWorldBoundaryDisabledReason:() => '',updateWorkflowPresetInputs:vi.fn(),updateWorkflowPresetInputsDisabledReason:() => '',
      startExperiment:vi.fn(),stopExperiment:vi.fn(),startPanel:vi.fn(),invokePanelAction:vi.fn(),stopPanelAction:vi.fn(),
    } as unknown as ExperimentDashboardActions,
    update(next:Partial<AutomationPanelContext['automation']>) {
      harness.automation = { ...harness.automation,...next };
    },
    updateActions(next:Partial<ExperimentDashboardActions>) {
      harness.actions = { ...harness.actions,...next };
    },
    tree:() => <StationExperimentOccupancyProvider value={OCCUPANCY}>
      <ExperimentDashboardCanvas
        session={session} dashboard={DASHBOARD} panels={PANEL_WORKSPACE} drop={DROP} actions={harness.actions}
        gcsMode coreNodes={CORE_NODES} executionTargetId="local" automation={harness.automation}
      />
    </StationExperimentOccupancyProvider>,
  };
  return harness;
}
