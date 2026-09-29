// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ExperimentSurfaceVisibilityProvider } from '../experimentSurfaceVisibility';
import { PX4_MODEL_FS150 } from '../../robot/robotAssetPublic';
import { requestRobotInstrumentSshJump } from '../../robot/robotPublic';
import { peekTerminalRobotLogin,takeTerminalRobotLogin } from '../../terminal/terminalPublic';
import { restartExperimentRun } from '../experimentWorkflowService';
import { ExperimentDashboardRoute } from './ExperimentDashboardRoute';

const state = vi.hoisted(() => ({
  page:'experiment',surfaceVisible:true,editor:null as unknown,
  activeRun:undefined as { placement?:string } | undefined,
  runMode:'simulation' as string,
}));
const mocks = vi.hoisted(() => ({
  canvasProps:[] as { dashboard:{ id:string };session:{ editing:boolean };panels:{ items:unknown[] } }[],
  saveConfig:vi.fn(),workflowRuntime:vi.fn(),dashboardActions:vi.fn(),
  navigatePage:vi.fn(),setPageSection:vi.fn(),setTargetCoreId:vi.fn(),setManagedHostId:vi.fn(),
  convergeStoppedSession:vi.fn(async () => undefined),
}));

vi.mock('../../../app/navigationContext',() => ({
  useNavigation: (select?: (state: never) => unknown) => {
    const navigationState = ({
    page:state.page,gcsMode:false,setGcsMode:vi.fn(),
    navigatePage:mocks.navigatePage,setPageSection:mocks.setPageSection,
    setTargetCoreId:mocks.setTargetCoreId,setManagedHostId:mocks.setManagedHostId,
  });
    return select ? select(navigationState as never) : navigationState;
  },
}));
vi.mock('../dashboard/useExperimentDashboardEditor',() => ({
  useExperimentDashboardEditor:() => state.editor,
}));
vi.mock('../dashboard/useExperimentWorkflowRuntime',() => ({
  useExperimentWorkflowRuntime:(...args:unknown[]) => {
    mocks.workflowRuntime(...args);
    return {
      loading:false,error:'',resolved:true,activeRun:state.activeRun,activeRuns:[],
      runDetailsById:{},observedRunIds:[],refresh:vi.fn(),
      convergeStoppedSession:mocks.convergeStoppedSession,
    };
  },
}));
vi.mock('../dashboard/useExperimentDashboardActions',() => ({
  useExperimentDashboardActions:(options:unknown) => {
    mocks.dashboardActions(options);
    return {};
  },
}));
vi.mock('../dashboard/useExperimentRunMode',() => ({
  useExperimentRunMode:() => ({ value:state.runMode,options:[state.runMode],locked:false,select:vi.fn() }),
}));
vi.mock('../dashboard/ExperimentDashboardCanvas',() => ({
  ExperimentDashboardCanvas:(props:(typeof mocks.canvasProps)[number]) => {
    mocks.canvasProps.push(props);
    return <main data-xgc-role="experiment-dashboard-canvas" />;
  },
}));
vi.mock('../dashboard/ExperimentDashboardTopbar',() => ({
  ExperimentDashboardTopbar:() => <>
    <nav data-xgc-role="experiment-dashboard-tabs" />
    <select data-xgc-role="experiment-run-mode-select" aria-label="Run mode" />
    <button data-xgc-role="experiment-run" type="button">Run</button>
    <button data-xgc-role="experiment-gcs-mode" type="button">GCS</button>
  </>,
}));
vi.mock('../useExperimentAgentViewCapture',() => ({
  useExperimentAgentViewCapture:vi.fn(),
}));

describe('ExperimentDashboardRoute visibility',() => {
  beforeEach(() => {
    state.page='experiment';
    state.surfaceVisible=true;
    state.editor=editorFixture();
    state.activeRun=undefined;
    state.runMode='simulation';
    const pending=peekTerminalRobotLogin();
    if (pending) takeTerminalRobotLogin(pending);
    mocks.navigatePage.mockClear();mocks.setPageSection.mockClear();
    mocks.setTargetCoreId.mockClear();mocks.setManagedHostId.mockClear();
    mocks.saveConfig.mockClear();
    mocks.workflowRuntime.mockClear();
    mocks.dashboardActions.mockClear();
  });

  it('uses the visible spec placement and ignores the old localStorage preference',() => {
    window.localStorage.setItem('xgc.experiment.placement.experiment-a',JSON.stringify('per-robot'));
    state.editor=editorFixture({ placement:'centralized' });
    render(routeTree());
    const options = mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string;restartWorkflow?:unknown };
    expect(options.placement).toBe('centralized');
    expect(options.restartWorkflow).toBe(restartExperimentRun);
  });

  it('uses active Run placement and leaves it unset when the active Run omits it',() => {
    state.editor=editorFixture({ placement:'centralized' });
    state.activeRun={ placement:'per-robot' };
    const view=render(routeTree());
    let options = mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBe('per-robot');

    state.activeRun={};
    view.rerender(routeTree());
    options = mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBeUndefined();
  });

  it('omits placement when the visible spec has no deployment',() => {
    window.localStorage.setItem('xgc.experiment.placement.experiment-a',JSON.stringify('per-robot'));
    render(routeTree());
    const options = mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBeUndefined();
  });

  it('keeps each visible Experiment placement when switching between experiments that reuse one asset',() => {
    const assetId='shared-fs150';
    const asset={
      head:{ resourceId:assetId },
      spec:{ px4:{ modelId:PX4_MODEL_FS150,simulationSetup:{ mode:'container' } } },
    };
    const visibleExperiment=(experimentId:string,placement:'centralized' | 'per-robot') => {
      state.editor=editorFixture({ experimentId,placement,robotAssetId:assetId });
      return routeTree(experimentId,asset);
    };

    const view=render(visibleExperiment('experiment-a','centralized'));
    let options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBe('centralized');

    view.rerender(visibleExperiment('experiment-b','per-robot'));
    options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBe('per-robot');

    view.rerender(visibleExperiment('experiment-a','centralized'));
    options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string };
    expect(options.placement).toBe('centralized');
  });

  it('keeps placement independent of simulation, physical, and hybrid run modes',() => {
    const view=render(routeTree());
    let options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string;runMode?:string };

    for (const runMode of ['simulation','physical','hybrid']) {
      for (const placement of ['centralized','per-robot'] as const) {
        state.runMode=runMode;
        state.editor=editorFixture({ placement });
        view.rerender(routeTree());
        options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as { placement?:string;runMode?:string };
        expect(options.runMode).toBe(runMode);
        expect(options.placement).toBe(placement);
      }
    }
  });

  it('routes SSH to the asset catalog Core and refuses hidden or unknown targets',() => {
    const tree=(visible:boolean) => <ExperimentSurfaceVisibilityProvider visible={visible}>
      <ExperimentDashboardRoute
        experiment={{
          selectedExperiment:{ head:{ resourceId:'experiment-a' } },
          automationRuntime:{},localAutomationRuntime:{},saveExperimentDraft:vi.fn(),
          robotAssetCatalog:{ assets:[],loading:false,error:'' },
        } as never}
        environment={{
          coreNodes:[
            { id:'local-core',profile:'gcs',baseUrl:'' },
            { id:'catalog-core',profile:'edge',baseUrl:'https://catalog.example' },
          ],executionTargetId:'agent-runtime',routedTargetCoreId:'runtime-core',
        } as never}
      />
    </ExperimentSurfaceVisibilityProvider>;
    const view=render(tree(true));
    requestRobotInstrumentSshJump('asset','local');
    expect(mocks.setTargetCoreId).toHaveBeenLastCalledWith('local-core');
    expect(mocks.setManagedHostId).toHaveBeenLastCalledWith('local');
    expect(mocks.navigatePage).toHaveBeenLastCalledWith('terminal');
    expect(peekTerminalRobotLogin()).toEqual({ robotAssetId:'asset',scope:'local__local' });
    requestRobotInstrumentSshJump('asset','catalog-core');
    expect(mocks.setTargetCoreId).toHaveBeenLastCalledWith('catalog-core');
    expect(peekTerminalRobotLogin()).toEqual({ robotAssetId:'asset',scope:'catalog-core__local' });
    const pending=peekTerminalRobotLogin();
    requestRobotInstrumentSshJump('asset','unknown-core');
    expect(mocks.navigatePage).toHaveBeenCalledTimes(2);
    expect(peekTerminalRobotLogin()).toBe(pending);
    view.rerender(tree(false));
    requestRobotInstrumentSshJump('asset','local');
    expect(mocks.navigatePage).toHaveBeenCalledTimes(2);
    expect(peekTerminalRobotLogin()).toBe(pending);
    if (pending) takeTerminalRobotLogin(pending);
  });

  it('opens an experiment without creating or saving a deployment dashboard', () => {
    const saveExperimentDraft = vi.fn(async (document: unknown) => document);
    const startWithDraft = vi.fn();
    const selectDashboard = vi.fn();
    const selectPanel = vi.fn();
    const base = editorFixture();
    state.editor = {
      ...base,
      session: {
        ...base.session,
        editing: false,
        startWithDraft,
        updateDraft: vi.fn(),
        reportError: vi.fn(),
        visibleExperiment: {
          head: { resourceId: 'experiment-a' },
          branch: { headCommitId: 'head-1', headVersion: 1 },
          spec: {
            dashboards: [{ id: 'config', name: 'Config', description: '', panels: [] }],
          },
        },
      },
      dashboards: { ...base.dashboards, select: selectDashboard },
      panels: { ...base.panels, select: selectPanel },
    };
    render(<ExperimentSurfaceVisibilityProvider visible>
      <div id="xgc-experiment-topbar-slot" />
      <ExperimentDashboardRoute
        experiment={{
          selectedExperiment: { head: { resourceId: 'experiment-a' } },
          automationRuntime: {},
          localAutomationRuntime: {},
          saveExperimentDraft,
          robotAssetCatalog: { assets: [], loading: false, error: '' },
        } as never}
        environment={{ coreNodes: [], executionTargetId: 'local' } as never}
      />
    </ExperimentSurfaceVisibilityProvider>);
    expect(screen.getByRole('button', { name:'Run' })).toBeInTheDocument();
    expect(startWithDraft).not.toHaveBeenCalled();
    expect(saveExperimentDraft).not.toHaveBeenCalled();
    expect(selectDashboard).not.toHaveBeenCalled();
    expect(selectPanel).not.toHaveBeenCalled();
  });

  it('wires required stopped Session convergence through runtime and dashboard actions',() => {
    const convergeStoppedExperiment=vi.fn(async () => undefined);
    render(<ExperimentSurfaceVisibilityProvider visible>
      <ExperimentDashboardRoute
        experiment={{
          selectedExperiment:{ head:{ resourceId:'experiment-a' } },
          automationRuntime:{},localAutomationRuntime:{},saveExperimentDraft:vi.fn(),
          robotAssetCatalog:{ assets:[],loading:false,error:'' },
          convergeStoppedExperiment,
        } as never}
        environment={{ coreNodes:[],executionTargetId:'local' } as never}
      />
    </ExperimentSurfaceVisibilityProvider>);

    expect(mocks.workflowRuntime).toHaveBeenCalledWith(
      expect.anything(),'local',expect.objectContaining({ convergeStoppedExperiment }),
    );
    expect(mocks.dashboardActions).toHaveBeenCalledWith(expect.objectContaining({
      beginExperimentEdit:expect.any(Function),dashboardSaving:false,
      runtimeProjection:expect.objectContaining({
        convergeStoppedSession:mocks.convergeStoppedSession,
      }),
    }));
    const editor=state.editor as ReturnType<typeof editorFixture>;
    const options=mocks.dashboardActions.mock.calls.at(-1)?.[0] as {
      beginExperimentEdit:(draft:typeof editor.session.visibleExperiment) => void;
    };
    options.beginExperimentEdit(editor.session.visibleExperiment);
    expect(editor.session.startWithDraft).toHaveBeenCalledWith(editor.session.visibleExperiment);
  });

  it('unmounts the entire Experiment topbar portal while its parked route is inactive',async () => {
    const route = () => <ExperimentDashboardRoute
      experiment={{
        selectedExperiment:{ head:{ resourceId:'experiment-a' } },
        automationRuntime:{},localAutomationRuntime:{},saveExperimentDraft:vi.fn(),
        robotAssetCatalog:{ assets:[],loading:false,error:'' },
      } as never}
      environment={{ coreNodes:[],executionTargetId:'local' } as never}
    />;
    const view=render(<><div id="xgc-experiment-topbar-slot" />
      <ExperimentSurfaceVisibilityProvider visible={state.surfaceVisible}>{route()}</ExperimentSurfaceVisibilityProvider>
    </>);
    const slot=() => view.container.querySelector('#xgc-experiment-topbar-slot');
    const topbarRoles=[
      'experiment-dashboard-tabs','experiment-run-mode-select','experiment-run','experiment-gcs-mode',
    ];

    await waitFor(() => expect(slot()?.querySelector('[data-xgc-role="experiment-run"]')).not.toBeNull());
    for (const role of topbarRoles) expect(slot()?.querySelector(`[data-xgc-role="${role}"]`)).not.toBeNull();

    state.page='robotAssets';
    view.rerender(<><div id="xgc-experiment-topbar-slot" />
      <ExperimentSurfaceVisibilityProvider visible={state.surfaceVisible}>{route()}</ExperimentSurfaceVisibilityProvider>
    </>);
    for (const role of topbarRoles) expect(slot()?.querySelector(`[data-xgc-role="${role}"]`)).toBeNull();
    expect(view.container.querySelector('[data-xgc-role="experiment-dashboard-canvas"]')).not.toBeNull();

    state.page='experiment';
    state.surfaceVisible=false;
    view.rerender(<><div id="xgc-experiment-topbar-slot" />
      <ExperimentSurfaceVisibilityProvider visible={state.surfaceVisible}>{route()}</ExperimentSurfaceVisibilityProvider>
    </>);
    for (const role of topbarRoles) expect(slot()?.querySelector(`[data-xgc-role="${role}"]`)).toBeNull();

    state.surfaceVisible=true;
    view.rerender(<><div id="xgc-experiment-topbar-slot" />
      <ExperimentSurfaceVisibilityProvider visible={state.surfaceVisible}>{route()}</ExperimentSurfaceVisibilityProvider>
    </>);
    for (const role of topbarRoles) expect(slot()?.querySelector(`[data-xgc-role="${role}"]`)).not.toBeNull();
  });

  it('hands a visited hidden dashboard the same read-only inputs across host renders',() => {
    const algorithmPanels=[{
      schemaVersion:4,id:'panel-b',pluginId:'web-proxy',title:'Web proxy',grid:{ x:0,y:0,w:8,h:5 },
      view:{ query:{},options:{ url:'https://panel-b.example' },fieldConfig:{} },portBindings:[],
    }];
    const editor=editorFixture();
    const algorithm={ id:'algorithm',name:'Algorithm',description:'',panels:algorithmPanels };
    const selectDashboard=(dashboard:{ id:string;name:string;description:string;panels:unknown[] }) => {
      state.editor={ ...editor,dashboards:{ ...editor.dashboards,items:[editor.dashboards.items[0]!,algorithm],selected:dashboard } };
    };
    selectDashboard(algorithm);
    const view=render(routeTree());
    selectDashboard(editor.dashboards.items[0]!);
    view.rerender(routeTree());
    const hiddenProps=() => mocks.canvasProps.filter((props) => props.dashboard.id==='algorithm').at(-1)!;
    const first=hiddenProps();
    mocks.canvasProps.length=0;
    view.rerender(routeTree());

    expect(first.session.editing).toBe(false);
    expect(first.panels.items).toHaveLength(1);
    // An unchanged host render must not hand the hidden canvas new objects;
    // they are its memo inputs and would re-render every hidden Panel.
    const rendered=mocks.canvasProps.filter((props) => props.dashboard.id==='algorithm');
    rendered.forEach((props) => {
      expect(props.session).toBe(first.session);
      expect(props.panels).toBe(first.panels);
    });
  });

  it('remounts Panel config on panel and head changes without saving a stale baseline',() => {
    state.editor=editorFixture({
      editing:true,panel:webProxyPanel('panel-a','https://panel-a.example'),headCommitId:'head-1',
    });
    const view=render(routeTree());

    fireEvent.change(screen.getByRole('textbox',{ name:'Panel URL' }),{
      target:{ value:'https://stale-panel-a.example' },
    });
    expect(screen.getByRole('button',{ name:'Save' })).toBeEnabled();

    state.editor=editorFixture({
      editing:true,panel:webProxyPanel('panel-b','https://panel-b.example'),headCommitId:'head-1',
    });
    view.rerender(routeTree());
    expect(screen.getByRole('textbox',{ name:'Panel URL' })).toHaveValue('https://panel-b.example');
    expect(screen.getByRole('button',{ name:'Save' })).toBeDisabled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox',{ name:'Panel URL' }),{
      target:{ value:'https://panel-b-edited.example' },
    });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      id:'panel-b',options:expect.objectContaining({ url:'https://panel-b-edited.example' }),
    }),expect.any(Array));

    state.editor=editorFixture({
      editing:true,panel:webProxyPanel('panel-b','https://panel-b-head-2.example'),headCommitId:'head-2',
    });
    view.rerender(routeTree());
    expect(screen.getByRole('textbox',{ name:'Panel URL' })).toHaveValue('https://panel-b-head-2.example');
    expect(screen.getByRole('button',{ name:'Save' })).toBeDisabled();
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('textbox',{ name:'Panel URL' }),{
      target:{ value:'https://panel-b-head-2-edited.example' },
    });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    expect(mocks.saveConfig).toHaveBeenLastCalledWith(expect.objectContaining({
      id:'panel-b',options:expect.objectContaining({ url:'https://panel-b-head-2-edited.example' }),
    }),expect.any(Array));
  });
});

function routeTree(experimentId='experiment-a',robotAsset?:{ head:{ resourceId:string };spec:unknown }) {
  const robots=robotAsset ? [{
    ref:{ domain:'robot',resourceId:robotAsset.head.resourceId,branch:'main' },
  }] : undefined;
  return <ExperimentSurfaceVisibilityProvider visible={state.surfaceVisible}>
    <ExperimentDashboardRoute
      experiment={{
        selectedExperiment:{
          head:{ resourceId:experimentId },
          spec:{ deployment:{ placement:'per-robot' },...(robots ? { robots } : {}) },
        },
        automationRuntime:{},localAutomationRuntime:{},saveExperimentDraft:vi.fn(),
        robotAssetCatalog:{ assets:robotAsset ? [robotAsset] : [],loading:false,error:'' },
      } as never}
      environment={{ coreNodes:[],executionTargetId:'local' } as never}
    />
  </ExperimentSurfaceVisibilityProvider>;
}

function editorFixture({
  editing=false,panel=null,headCommitId='head-1',experimentId='experiment-a',placement,robotAssetId,
}: {
  editing?:boolean;
  panel?:ReturnType<typeof webProxyPanel> | null;
  headCommitId?:string;
  experimentId?:string;
  placement?:'centralized' | 'per-robot';
  robotAssetId?:string;
} = {}) {
  const panels=panel ? [panel] : [];
  return {
    session:{
      visibleExperiment:{
        head:{ resourceId:experimentId },branch:{ headCommitId },spec:{
          ...(placement ? { deployment:{ placement } } : {}),
          ...(robotAssetId ? { robots:[{
            ref:{ domain:'robot',resourceId:robotAssetId,branch:'main' },
          }] } : {}),
          workflowInstances:[{
            id:'worker',ref:{ domain:'automation',resourceId:'worker',branch:'main' },
            actionPresets:[{ id:'default',actionId:'run',inputs:{},parameterBindings:[] }],
          }],
        },
      },
      editing,readOnly:false,saving:false,exitConfirmationOpen:false,startWithDraft:vi.fn(),
    },
    dashboards:{
      items:[{ id:'gcs',name:'GCS',description:'',panels }],
      selected:{ id:'gcs',name:'GCS',description:'',panels },deleteTarget:null,
    },
    panels:{
      items:panels,configTarget:panel,libraryOpen:false,saveConfig:mocks.saveConfig,
      closeConfig:vi.fn(),
    },
    drop:{},
  };
}

function webProxyPanel(id:string,url:string) {
  return {
    id,pluginId:'web-proxy',title:'Web proxy',gridPos:{ x:0,y:0,w:8,h:5 },query:{},
    options:{ dashboard:'gcs',url },fieldConfig:{},portBindings:[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }],
  };
}
