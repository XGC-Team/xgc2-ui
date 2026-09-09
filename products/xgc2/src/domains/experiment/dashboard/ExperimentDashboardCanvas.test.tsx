// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach,describe,expect,it,vi,type Mock } from 'vitest';
import type { AutomationPanelContext } from '../../../panels/types';
import type * as AutomationPublicModule from '../../automation/automationPublic';
import { getAutomationExecutionRelations,type AutomationRun,type AutomationRunControl } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument,type ExperimentRunMode,type PanelInstance } from '../experimentModel';
import { panelToEditor } from '../experimentPanelModel';
import { robotSelectionKey } from '../../robot/robotPublic';
import {
  ExperimentDashboardCanvas,
  fullRunPanelInvocationFallback,
} from './ExperimentDashboardCanvas';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';

vi.mock('./useDashboardSurfaceSize', () => ({
  useDashboardSurfaceSize: () => ({
    width: 900,
    height: 600,
    mounted: true,
    containerRef: { current: null },
  }),
}));
vi.mock('react-grid-layout', () => ({
  GridLayout: (props: { children: React.ReactNode }) => <div data-testid="grid-layout">{props.children}</div>,
}));
vi.mock('../../automation/automationPublic',async (importOriginal) => ({
  ...await importOriginal<typeof AutomationPublicModule>(),getAutomationExecutionRelations:vi.fn(),
}));

describe('ExperimentDashboardCanvas v9',() => {
  beforeEach(() => {
    vi.mocked(getAutomationExecutionRelations).mockReset();
    window.localStorage.clear();
  });

  it('renders an empty dashboard without constructing Session or workflow-slot state',() => {
    render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expect(screen.getByText('GCS')).toBeInTheDocument();
    expect(screen.getByText('Enter edit mode to add panels to this dashboard.')).toBeInTheDocument();
  });

  it('leaves workflow action failures to the shared notification surface',() => {
    const lifecycle = actions();
    lifecycle.actionError = '400 Bad Request: invalid run parameters';
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expect(container.querySelector('[data-xgc-role="experiment-workflow-action-error"]')).toBeNull();
    expect(container).not.toHaveTextContent('400 Bad Request: invalid run parameters');
  });

  it('hides every dashboard panel title and keeps header actions',() => {
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:true,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{
        items:[panel('panel-instruments','Robot instruments'),panel('panel-lichtblick','Lichtblick')],
        selectedPanelId:'panel-instruments',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const headers = [...container.querySelectorAll('[data-xgc-role="experiment-panel-header"]')];
    expect(headers).toHaveLength(2);
    expect(headers.map((header) => header.querySelector('.xgc-visually-hidden')?.textContent)).toEqual([
      'Robot instruments','Lichtblick',
    ]);
    for (const header of headers) {
      expect(header.querySelector('.xgc-panel-frame-actions')).not.toBeNull();
      expect(header.querySelector('[data-xgc-role="panel-delete"]')).not.toBeNull();
    }
  });

  it('uses the full shared panel header as the edit drag surface',() => {
    const lifecycle = actions();
    const props = {
      session:{ editing:true,readOnly:false,commitConflict:'',saveError:'' },
      dashboard:{ id:'gcs',name:'GCS',description:'',panels:[] },
      panels:{
        items:[panel('panel-a','Panel A')],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      },
      drop:{ onDragOver:vi.fn(),onDrop:vi.fn() },actions:lifecycle,gcsMode:false,
      coreNodes:[],executionTargetId:'local',automation:automation(),
    };
    const { container,rerender } = render(<ExperimentDashboardCanvas {...props} />);

    expect(container.querySelector('[data-xgc-role="experiment-dashboard-canvas"]')).toHaveAttribute('data-xgc-editing','true');
    expect(container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-a"]'))
      .toHaveClass('xgc-workspace-panel-drag-handle');
    expect(container.querySelector('[data-xgc-role="experiment-panel-drag-handle"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="panel-a"]')).not.toBeNull();

    lifecycle.experimentIsRunning = true;
    rerender(<ExperimentDashboardCanvas {...props} />);

    expect(container.querySelector('[data-xgc-role="experiment-dashboard-canvas"]')).toHaveAttribute('data-xgc-editing','false');
    expect(container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="panel-a"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="panel-a"]')).toBeNull();
  });

  it('does not offer a technical settings drawer for the Robot assets authoring surface',() => {
    const robotAssets = panel('robot-assets','Robot assets');
    robotAssets.pluginId = 'experiment-robot-assets';
    const { container } = render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:true,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'config',name:'Config',description:'',panels:[] }}
      panels={{ items:[robotAssets],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    expect(container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="robot-assets"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="robot-assets"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="experiment-panel"][data-xgc-id="robot-assets"]')).toHaveAttribute('data-chrome','flat');
  });

  it('renders the new Experiment default Assets data without main search and limits page chrome to standalone authoring',() => {
    const visibleExperiment = experiment();
    const defaultAssets = visibleExperiment.spec.dashboards
      .flatMap((dashboard) => dashboard.panels)
      .find((candidate) => candidate.pluginId === 'experiment-robot-assets')!;
    const robotAssets = {
      ...panelToEditor(defaultAssets),
      id:'roster-copy',
    };
    const other = panel('panel-a','Panel A');
    const props = {
      session:{ visibleExperiment,editing:false,readOnly:false,commitConflict:'',saveError:'' },
      dashboard:{ id:'custom-config',name:'Configuration',description:'',panels:[] },
      panels:{ items:[robotAssets],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() },
      drop:{ onDragOver:vi.fn(),onDrop:vi.fn() },actions:actions(),gcsMode:false,
      coreNodes:[],executionTargetId:'local',automation:automation(),
    };
    const { container,rerender } = render(<ExperimentDashboardCanvas {...props} />);
    const frame = () => container.querySelector('[data-xgc-role="experiment-panel"][data-xgc-id="roster-copy"]');
    expect(frame()).toHaveAttribute('data-chrome','flat');
    expect(frame()?.querySelector('[data-xgc-role="experiment-panel-header"]')).not.toBeVisible();
    expect(frame()?.querySelector('[data-xgc-role="panel-workflow-run"]')).toBeNull();
    expect(frame()?.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(frame()?.querySelector('[data-xgc-role="experiment-robot-assets-panel-search"]')).toBeNull();
    expect(screen.queryByText('Experiment unavailable')).toBeNull();
    fireEvent.click(frame()!.querySelector('[data-xgc-role="experiment-robot-assets-browse"]')!);
    const candidateSearch = screen.getByRole('searchbox',{ name:'Search assets' });
    fireEvent.change(candidateSearch,{ target:{ value:'FS150' } });
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    rerender(<ExperimentDashboardCanvas {...props} session={{ ...props.session,editing:true }} />);
    expect(frame()).toHaveAttribute('data-chrome','flat');
    expect(screen.queryByRole('searchbox')).toBeNull();
    fireEvent.click(frame()!.querySelector('[data-xgc-role="experiment-robot-assets-browse"]')!);
    expect(screen.getByRole('searchbox',{ name:'Search assets' })).toHaveValue('FS150');
    fireEvent.click(screen.getByRole('button',{ name:'Close drawer' }));
    expect(container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="roster-copy"]')).not.toBeNull();
    rerender(<ExperimentDashboardCanvas {...props} panels={{ ...props.panels,items:[robotAssets,other] }} />);
    expect(frame()).toHaveAttribute('data-chrome','framed');
    rerender(<ExperimentDashboardCanvas {...props} panels={{ ...props.panels,items:[other] }} />);
    expect(container.querySelector('[data-xgc-role="experiment-panel"]')).toHaveAttribute('data-chrome','framed');
    rerender(<ExperimentDashboardCanvas {...props} gcsMode />);
    expect(frame()).toHaveAttribute('data-chrome','seamed');
  });

  it('keeps Robot assets and instruments clickable in Dashboard Edit without unlocking layout-only panels',() => {
    const robotAssets = panel('robot-assets','Robot assets');
    robotAssets.pluginId = 'experiment-robot-assets';
    const instruments = panel('panel-instruments','Robot instruments');
    instruments.pluginId = 'robot-instruments-grid';
    const layoutOnly = panel('panel-a','Panel A');
    const { container } = render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:true,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'config',name:'Config',description:'',panels:[] }}
      panels={{
        items:[robotAssets,instruments,layoutOnly],
        selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    expectPanelBodyInteractiveWhileEditing(container,'robot-assets',true);
    expectPanelBodyInteractiveWhileEditing(container,'panel-instruments',true);
    expectPanelBodyInteractiveWhileEditing(container,'panel-a',false);
  });

  it('renders the shared stable Panel workflow Run control for any workflow-bound panel',() => {
    const lifecycle = actions();
    const workflowPanel = panel('panel-workflow','User panel');
    workflowPanel.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:false,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    const run = container.querySelector<HTMLElement>('[data-xgc-role="panel-workflow-run"][data-xgc-id="panel-workflow"]');
    const header = container.querySelector<HTMLElement>('[data-xgc-role="experiment-panel-header"]');
    const trailing = header?.querySelector<HTMLElement>('[data-xgc-role="experiment-panel-header-trailing"]');
    expect(run).toBeInstanceOf(HTMLElement);
    if (!(run instanceof HTMLElement)) return;
    expect(trailing).toContainElement(run);
    expect(header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]')?.contains(run)).toBe(false);
    expect(container.querySelectorAll('[data-xgc-role="panel-workflow-run"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-xgc-role="panel-workflow-stop"]')).toHaveLength(0);
    expectIconOnlyWorkflowControl(run, 'run');
    fireEvent.click(run);
    expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-workflow',{});
  });

  it('projects Total Run admission into each managed Panel as an enabled Square Stop',async () => {
    const lifecycle=actions();
    lifecycle.startInFlight=true;
    lifecycle.canStopExperiment=true;
    const workflowPanel=panel('camera-intrinsic-calibration','Camera intrinsic calibration');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'camera-intrinsic-calibration',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const stop=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="panel-workflow-stop"][data-xgc-id="camera-intrinsic-calibration"]',
    );
    expectIconOnlyWorkflowControl(stop,'stop');
    expect(stop).not.toBeDisabled();
    expect(container.querySelector('[data-xgc-role="panel-workflow-run"]')).toBeNull();
    fireEvent.click(stop!);
    await waitFor(() => expect(lifecycle.stopExperiment).toHaveBeenCalledTimes(1));
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
  });

  it('keeps Panel Stop enabled while Total Run relations are still hydrating',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    vi.mocked(getAutomationExecutionRelations).mockReturnValue(new Promise(() => undefined));
    const workflowPanel=panel('camera-intrinsic-calibration','Camera intrinsic calibration');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'camera-intrinsic-calibration',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const stop=container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="panel-workflow-stop"][data-xgc-id="camera-intrinsic-calibration"]',
    );
    expectIconOnlyWorkflowControl(stop,'stop');
    expect(stop).not.toBeDisabled();
    fireEvent.click(stop!);
    await waitFor(() => expect(lifecycle.stopExperiment).toHaveBeenCalledTimes(1));
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
  });

  it('does not disable Panel Stop across Total Run admit then relation hydrate',async () => {
    const lifecycle=actions();
    lifecycle.startInFlight=true;
    const workflowPanel=panel('camera-intrinsic-calibration','Camera intrinsic calibration');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'camera-intrinsic-calibration',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    let resolveRelations:((value:never) => void)|undefined;
    vi.mocked(getAutomationExecutionRelations).mockImplementation(() => new Promise((resolve) => {
      resolveRelations=resolve;
    }));
    const renderCanvas=() => <ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />;
    const { container,rerender }=render(renderCanvas());
    const stop=() => container.querySelector<HTMLButtonElement>(
      '[data-xgc-role="panel-workflow-stop"][data-xgc-id="camera-intrinsic-calibration"]',
    );
    expect(stop()).not.toBeDisabled();

    lifecycle.startInFlight=false;
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    rerender(renderCanvas());
    expect(stop()).not.toBeDisabled();
    expectIconOnlyWorkflowControl(stop(),'stop');

    await act(async () => {
      resolveRelations?.({
        runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
        childRunGroupMembers:[{
          groupId:'group',itemKey:'camera-intrinsic-calibration',childRunId:'child-root',state:'dispatched',
        }],
        childRuns:[{ childRunId:'child-root',targetId:'local',runStatus:'waiting',runRevision:7,revision:2 }],
        waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      } as never);
    });
    await waitFor(() => expect(stop()).not.toBeDisabled());
    expectIconOnlyWorkflowControl(stop(),'stop');
  });

  it('flips Panel Run to an enabled Square Stop that can abort admission immediately',async () => {
    const lifecycle=actions();
    let releaseStart: ((run:{ id:string }) => void)|undefined;
    lifecycle.startPanel=vi.fn(() => new Promise((resolve) => {
      releaseStart=(run) => resolve(run as never);
    })) as ExperimentDashboardActions['startPanel'];
    const workflowPanel=panel('camera-intrinsic-calibration','Camera intrinsic calibration');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:false,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
    const stop=await waitFor(() => {
      const control=container.querySelector<HTMLButtonElement>(
        '[data-xgc-role="panel-workflow-stop"][data-xgc-id="camera-intrinsic-calibration"]',
      );
      expect(control).toBeInstanceOf(HTMLButtonElement);
      return control!;
    });
    expectIconOnlyWorkflowControl(stop,'stop');
    expect(stop).not.toBeDisabled();
    fireEvent.click(stop);
    await waitFor(() => expect(lifecycle.stopExperiment).toHaveBeenCalledTimes(1));
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
    releaseStart?.({ id:'panel-run' });
  });

  it('offers a bottom workflow link when the panel has a resolvable workflow instance',() => {
    const workflowPanel = panel('panel-workflow','Calibration preview');
    workflowPanel.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'calibration-workflow',presetId:'run',
      managed:false,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const plainPanel = panel('panel-plain','Plain panel');
    const visibleExperiment = experiment();
    visibleExperiment.spec.workflowInstances = [{
      id:'calibration-workflow',
      ref:{ domain:'automation',resourceId:'camera/calibration',branch:'main' },
      executionTargetId:'agent/scout',
      actionPresets:[],
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ visibleExperiment,editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel,plainPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const open = container.querySelector<HTMLAnchorElement>(
      '[data-xgc-role="panel-workflow-open"][data-xgc-id="panel-workflow"]',
    );
    expect(open).toHaveTextContent('Open workflow');
    expect(open).toHaveAttribute(
      'href','#/automations/agent%2Fscout/workflows/camera%2Fcalibration',
    );
    expect(container.querySelector('[data-xgc-role="panel-workflow-open"][data-xgc-id="panel-plain"]')).toBeNull();
  });

  it('places instrument views on the left and one Panel workflow Run with chrome on the right',() => {
    const instruments = panel('panel-instruments','Robot instruments');
    instruments.pluginId = 'robot-instruments-grid';
    const lichtblick = panel('panel-lichtblick','Lichtblick');
    lichtblick.pluginId = 'xgc2-lichtblick';
    lichtblick.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'viz-workflow',presetId:'run',
      managed:false,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:true,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{
        items:[instruments,lichtblick],
        selectedPanelId:'panel-instruments',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const instrumentHeader = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-instruments"]');
    const vizHeader = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-lichtblick"]');
    const instrumentLeading = instrumentHeader?.querySelector('[data-xgc-role="experiment-panel-header-leading"]');
    const vizLeading = vizHeader?.querySelector('[data-xgc-role="experiment-panel-header-leading"]');
    const vizTrailing = vizHeader?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    const run = vizTrailing?.querySelector('[data-xgc-role="panel-workflow-run"][data-xgc-id="panel-lichtblick"]');
    const config = vizTrailing?.querySelector('[data-xgc-role="panel-config"]');
    const del = vizTrailing?.querySelector('[data-xgc-role="panel-delete"]');

    expect(instrumentLeading?.querySelector('[data-xgc-role="robot-instrument-view-switcher"]')).not.toBeNull();
    expect(instrumentHeader?.querySelector('[data-xgc-role="panel-workflow-run"]')).toBeNull();
    expect(vizLeading?.querySelector('[data-xgc-role="lichtblick-header-leading"]')).not.toBeNull();
    expect(vizTrailing?.querySelector('[data-xgc-role="lichtblick-header-actions"]')).not.toBeNull();
    expect(run).not.toBeNull();
    expect(vizHeader?.querySelectorAll('[data-xgc-role="panel-workflow-run"]')).toHaveLength(1);
    expectIconOnlyWorkflowControl(run, 'run');
    expect(config).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(del).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(run?.nextElementSibling).toBe(config);
    expect(config?.nextElementSibling).toBe(del);
  });

  it('keeps Connect and Disconnect on instruments for the current selection only',() => {
    const instruments = panel('panel-instruments','Robot instruments');
    instruments.pluginId = 'robot-instruments-grid';
    instruments.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{
        items:[instruments],
        selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    const header = container.querySelector('[data-xgc-role="experiment-panel-header"][data-xgc-id="panel-instruments"]');
    const leading = header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]');
    const trailing = header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    expect(leading?.querySelector('[data-xgc-role="robot-instrument-view-switcher"]')).not.toBeNull();
    expectInstrumentConnectionPair(trailing, { selected: false, connected: false });
    expect(container.querySelectorAll('[data-xgc-role="robot-provider-restart"]')).toHaveLength(0);
    expect(container.querySelector('[data-xgc-role="run-robot-card"] [data-xgc-role="robot-provider-restart"]')).toBeNull();
    expect(header?.textContent).not.toMatch(/Connect|Reconnect|Disconnect/);
  });

  it('hides Panel Workflow Run on observer Ground station activity chrome',() => {
    const activity = panel('ground-station-activity','Ground station activity');
    activity.pluginId = 'ground-station-activity';
    activity.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-ground-station-activity',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{
        items:[activity],
        selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    const header = container.querySelector(
      '[data-xgc-role="experiment-panel-header"][data-xgc-id="ground-station-activity"]',
    );
    expect(header?.querySelector('[data-xgc-role="panel-workflow-run"]')).toBeNull();
    expect(header?.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    expect(header?.querySelector('[data-xgc-role="panel-config"]')).toBeNull();
  });

  it('shows the shared Panel settings gear on Ground station activity only while editing',() => {
    const activity = panel('ground-station-activity','Ground station activity');
    activity.pluginId = 'ground-station-activity';
    const panels = {
      items:[activity],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
    };
    const { container,rerender } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={panels} drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expect(container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="ground-station-activity"]')).toBeNull();
    rerender(<ExperimentDashboardCanvas
      session={{ editing:true,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={panels} drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expect(container.querySelector('[data-xgc-role="panel-config"][data-xgc-id="ground-station-activity"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="panel-delete"][data-xgc-id="ground-station-activity"]')).not.toBeNull();
  });

  it('hides Panel Workflow Run on Robot control chrome',() => {
    const control = panel('robot-control','Robot control');
    control.pluginId = 'px4-rotor-control-panel';
    control.portBindings = [{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-control',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container } = render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{
        items:[control],
        selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn(),
      }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={actions()} gcsMode
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    const header = container.querySelector(
      '[data-xgc-role="experiment-panel-header"][data-xgc-id="robot-control"]',
    );
    expect(header?.querySelector('[data-xgc-role="panel-workflow-run"]')).toBeNull();
    expect(header?.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    const leading = header?.querySelector('[data-xgc-role="experiment-panel-header-leading"]');
    const trailing = header?.querySelector('[data-xgc-role="experiment-panel-header-trailing"]');
    const remote = trailing?.querySelector('[data-xgc-role="robot-remote-control-open"][data-xgc-id="robot-control"]');
    expect(remote).toHaveClass('xgc-panel-runtime-action');
    expect(remote).toHaveAttribute('data-xgc-icon-only','true');
    expect(remote).toHaveAttribute('data-xgc-size','compact');
    expect(remote).toHaveAttribute('data-xgc-tone','default');
    expect(remote).toHaveAttribute('data-xgc-appearance','raised');
    expect(remote?.textContent?.replace(/\s+/g,'')).toBe('');
    expect(leading?.querySelector('[data-xgc-role="robot-remote-control-open"]')).toBeNull();
    expect(leading?.querySelector('[data-xgc-role="robot-control-view-switcher"]')).not.toBeNull();
  });

  it('stops and restarts only the current Robot selection while the managed parent stays active',async () => {
    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),JSON.stringify(['scout-01','scout-02']),
    );
    const lifecycle=actions();
    const fullRoot={
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting' as const,revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    };
    lifecycle.activeRuns=[fullRoot];
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const runtime=automation();
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[],
      childRuns:[],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const renderCanvas=() => <ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />;
    const { container,rerender }=render(renderCanvas());
    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-run"]'),
    ).not.toBeDisabled());
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected: true, connected: false },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
    await waitFor(() => expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-instruments',{
      robotId:'',robotIds:['scout-01','scout-02'],selectionKey:'selected:["scout-01","scout-02"]',
    }));
    expect(runtime.stopRunSet).not.toHaveBeenCalled();

    const firstSelectionRoot={
      ...fullRoot,id:'selected-root-a',rootRunId:'selected-root-a',actionId:'run-panel',panelId:'panel-instruments',revision:1,
    };
    const secondSelectionRoot={
      ...fullRoot,id:'selected-root-b',rootRunId:'selected-root-b',actionId:'run-panel',panelId:'panel-instruments',revision:1,
    };
    lifecycle.activeRuns=[fullRoot,firstSelectionRoot,secondSelectionRoot];
    lifecycle.runDetailsById={
      [firstSelectionRoot.id]:panelRunDetail(firstSelectionRoot.id,'panel-instruments',['scout-01','scout-02']),
      [secondSelectionRoot.id]:panelRunDetail(secondSelectionRoot.id,'panel-instruments',['scout-03']),
    };
    rerender(renderCanvas());
    const stop=container.querySelector('[data-xgc-role="panel-workflow-stop"]');
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected: true, connected: true },
    );
    fireEvent.click(stop!);
    await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(
      expect.objectContaining({ id:'selected-root-a',actionId:'run-panel' }),
      'Stop Panel panel-instruments',
    ));
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ id:'selected-root-b' }),expect.anything(),
    );
    expect(runtime.stopRunSet).not.toHaveBeenCalled();
    expect(lifecycle.stopExperiment).not.toHaveBeenCalled();

    rerender(renderCanvas());
    const restart=container.querySelector('[data-xgc-role="panel-workflow-run"]');
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected: true, connected: false },
    );
    fireEvent.click(restart!);
    await waitFor(() => expect(lifecycle.startPanel).toHaveBeenLastCalledWith('panel-instruments',{
      robotId:'',robotIds:['scout-01','scout-02'],selectionKey:'selected:["scout-01","scout-02"]',
    }));

    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),JSON.stringify(['scout-03']),
    );
    rerender(renderCanvas());
    const secondStop=container.querySelector('[data-xgc-role="panel-workflow-stop"]');
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected: true, connected: true },
    );
    fireEvent.click(secondStop!);
    await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(
      expect.objectContaining({ id:'selected-root-b',actionId:'run-panel' }),
      'Stop Panel panel-instruments',
    ));
    expect(lifecycle.stopPanelAction).toHaveBeenCalledTimes(2);
    expect(lifecycle.activeRuns).toContain(fullRoot);

    lifecycle.activeRuns=[];
    rerender(renderCanvas());
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected: true, connected: false },
    );
  });

  it.each(['simulation','physical','hybrid'] as const)(
    'connects and disconnects the current Instrument Grid selection the same way in %s',
    async (runMode) => {
      window.localStorage.setItem(
        robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),
        JSON.stringify(['uav-01','scout-01']),
      );
      const lifecycle=actions();
      lifecycle.runMode=runMode;
      const instruments=panel('panel-instruments','Robot instruments');
      instruments.pluginId='robot-instruments-grid';
      instruments.portBindings=[{
        portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
        managed:true,relation:'supervised',failurePolicy:'stop-experiment',
      }];
      const renderCanvas=() => <ExperimentDashboardCanvas
        session={{ visibleExperiment:experiment(['simulation','physical','hybrid']),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
        dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
        panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
        drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
        coreNodes={[]} executionTargetId="local" automation={automation()}
      />;
      const { container,rerender }=render(renderCanvas());
      expectInstrumentConnectionPair(
        container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
        { selected: true, connected: false },
      );
      fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
      await waitFor(() => expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-instruments',{
        robotId:'',robotIds:['scout-01','uav-01'],selectionKey:'selected:["scout-01","uav-01"]',
      }));
      expect(lifecycle.startPanel).toHaveBeenCalledTimes(1);

      const selectedRoot={
        id:'selected-root',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
        automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run-panel',runMode,
        status:'waiting' as const,revision:1,rootRunId:'selected-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
        panelId:'panel-instruments',
      };
      lifecycle.activeRuns=[selectedRoot];
      lifecycle.runDetailsById={
        [selectedRoot.id]:panelRunDetail(selectedRoot.id,'panel-instruments',['scout-01','uav-01'],runMode),
      };
      rerender(renderCanvas());
      expectInstrumentConnectionPair(
        container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
        { selected: true, connected: true },
      );
      fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
      await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(
        expect.objectContaining({ id:'selected-root',actionId:'run-panel',runMode }),
        'Stop Panel panel-instruments',
      ));
      expect(lifecycle.startPanel).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['simulation','physical','hybrid'] as const)(
    'does not connect the full roster when no robot is selected in %s',
    (runMode) => {
      const lifecycle=actions();
      lifecycle.runMode=runMode;
      const instruments=panel('panel-instruments','Robot instruments');
      instruments.pluginId='robot-instruments-grid';
      instruments.portBindings=[{
        portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
        managed:true,relation:'supervised',failurePolicy:'stop-experiment',
      }];
      const { container }=render(<ExperimentDashboardCanvas
        session={{ visibleExperiment:experiment(['simulation','physical','hybrid']),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
        dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
        panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
        drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
        coreNodes={[]} executionTargetId="local" automation={automation()}
      />);
      expectInstrumentConnectionPair(
        container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
        { selected: false, connected: false },
      );
      fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
      fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
      expect(lifecycle.startPanel).not.toHaveBeenCalled();
      expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
    },
  );

  it('enables instrument connect as soon as robot.selection changes',async () => {
    const lifecycle=actions();
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:false,connected:false },
    );
    act(() => writeInstrumentSelection(['scout-01']));
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:true,connected:false },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
    await waitFor(() => expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-instruments',{
      robotId:'scout-01',robotIds:['scout-01'],selectionKey:'selected:["scout-01"]',
    }));
  });

  it('does not stop a multi-robot instrument run after the live selection shrinks to one robot',async () => {
    writeInstrumentSelection(['scout-01','scout-02']);
    const lifecycle=actions();
    const connectedRoot={
      id:'selected-root-a',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run-panel',runMode:'simulation',
      status:'waiting' as const,revision:1,rootRunId:'selected-root-a',createdAt:'t',updatedAt:'t',workflowTargets:[],
      panelId:'panel-instruments',
    };
    lifecycle.activeRuns=[connectedRoot];
    lifecycle.runDetailsById={
      [connectedRoot.id]:panelRunDetail(connectedRoot.id,'panel-instruments',['scout-01','scout-02']),
    };
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:true,connected:true },
    );
    act(() => writeInstrumentSelection(['scout-01']));
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      {
        selected:true,connectEnabled:false,disconnectEnabled:false,
        connectTitle:'Selected robots already connected',
        disconnectTitle:'Cannot disconnect selected robots without stopping others',
      },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
    expect(lifecycle.stopExperiment).not.toHaveBeenCalled();
  });

  it('disconnects only the selected slot of a multi-robot instrument run',async () => {
    writeInstrumentSelection(['scout-01','scout-02']);
    const lifecycle=actions();
    const connectedRoot={
      id:'selected-root-a',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run-panel',runMode:'simulation',
      status:'waiting' as const,revision:1,rootRunId:'selected-root-a',createdAt:'t',updatedAt:'t',workflowTargets:[],
      panelId:'panel-instruments',
    };
    const slotChild={
      childRunId:'slot-scout-01',targetId:'local',runStatus:'waiting' as const,runRevision:4,revision:2,
    };
    lifecycle.activeRuns=[connectedRoot];
    lifecycle.runDetailsById={
      [connectedRoot.id]:{
        ...(panelRunDetail(connectedRoot.id,'panel-instruments',['scout-01','scout-02']) as object),
        relations:{
          runId:connectedRoot.id,
          childRunGroups:[{ id:'slots',producerNodeId:'robot-slots' }],
          childRunGroupMembers:[
            { groupId:'slots',itemKey:'scout-01',childRunId:'slot-scout-01',state:'dispatched' },
            { groupId:'slots',itemKey:'scout-02',childRunId:'slot-scout-02',state:'dispatched' },
          ],
          childRuns:[
            slotChild,
            { childRunId:'slot-scout-02',targetId:'local',runStatus:'waiting',runRevision:5,revision:2 },
          ],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      } as never,
    };
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const runtime=automation();
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    act(() => writeInstrumentSelection(['scout-01']));
    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-stop"]'),
    ).not.toBeDisabled());
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    await waitFor(() => expect(runtime.stopRunSet).toHaveBeenCalledWith(
      { id:'slot-scout-01',status:'waiting',revision:4 },
      expect.objectContaining({ reason:'Stop Panel panel-instruments' }),
    ));
    expect(runtime.stopRunSet).toHaveBeenCalledTimes(1);
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
    expect(lifecycle.stopExperiment).not.toHaveBeenCalled();
  });

  it('connects remaining selected robots and disconnects only the already connected ones',async () => {
    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),
      JSON.stringify(['scout-01','scout-02']),
    );
    const lifecycle=actions();
    const connectedRoot={
      id:'selected-root-a',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run-panel',runMode:'simulation',
      status:'waiting' as const,revision:1,rootRunId:'selected-root-a',createdAt:'t',updatedAt:'t',workflowTargets:[],
      panelId:'panel-instruments',
    };
    lifecycle.activeRuns=[connectedRoot];
    lifecycle.runDetailsById={
      [connectedRoot.id]:panelRunDetail(connectedRoot.id,'panel-instruments',['scout-01']),
    };
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(['simulation','physical','hybrid']),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:true,connectEnabled:true,disconnectEnabled:true },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
    await waitFor(() => expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-instruments',{
      robotId:'scout-02',robotIds:['scout-02'],selectionKey:'selected:["scout-02"]',
    }));
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(
      expect.objectContaining({ id:'selected-root-a',actionId:'run-panel' }),
      'Stop Panel panel-instruments',
    ));
    expect(lifecycle.stopExperiment).not.toHaveBeenCalled();
  });

  it('disconnects selected slots of a full-roster instrument run without stopping siblings',async () => {
    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),
      JSON.stringify(['scout-01']),
    );
    const lifecycle=actions();
    const fullRoot={
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting' as const,revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    };
    lifecycle.activeRuns=[fullRoot];
    const slotChild={
      childRunId:'slot-scout-01',targetId:'local',runStatus:'waiting' as const,runRevision:4,revision:2,
    };
    lifecycle.runDetailsById={
      'full-child':{
        run:{ id:'full-child',parameters:{ panelId:'panel-instruments',runMode:'simulation' } },
        invocations:[],nodeSummaries:[],loading:false,error:'',
        relations:{
          runId:'full-child',
          childRunGroups:[{ id:'slots',producerNodeId:'robot-slots' }],
          childRunGroupMembers:[
            { groupId:'slots',itemKey:'scout-01',childRunId:'slot-scout-01',state:'dispatched' },
            { groupId:'slots',itemKey:'scout-02',childRunId:'slot-scout-02',state:'dispatched' },
          ],
          childRuns:[
            slotChild,
            { childRunId:'slot-scout-02',targetId:'local',runStatus:'waiting',runRevision:5,revision:2 },
          ],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      } as never,
    };
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const runtime=automation();
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[{
        groupId:'group',itemKey:'panel-robot-instruments',childRunId:'full-child',state:'dispatched',
      }],
      childRuns:[{ childRunId:'full-child',targetId:'local',runStatus:'waiting',runRevision:7,revision:2 }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-stop"]'),
    ).not.toBeDisabled());
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:true,connectEnabled:false,disconnectEnabled:true },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    await waitFor(() => expect(runtime.stopRunSet).toHaveBeenCalledWith(
      { id:'slot-scout-01',status:'waiting',revision:4 },
      expect.objectContaining({ reason:'Stop Panel panel-instruments' }),
    ));
    expect(runtime.stopRunSet).toHaveBeenCalledTimes(1);
    expect(lifecycle.stopPanelAction).not.toHaveBeenCalled();
    expect(lifecycle.stopExperiment).not.toHaveBeenCalled();
  });

  it('reconnects a selected slot after the full-roster instrument child has stopped that slot',async () => {
    window.localStorage.setItem(
      robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' }),
      JSON.stringify(['scout-01']),
    );
    const lifecycle=actions();
    const fullRoot={
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting' as const,revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    };
    lifecycle.activeRuns=[fullRoot];
    lifecycle.runDetailsById={
      'full-child':{
        run:{ id:'full-child',parameters:{ panelId:'panel-instruments',runMode:'simulation' } },
        invocations:[],nodeSummaries:[],loading:false,error:'',
        relations:{
          runId:'full-child',
          childRunGroups:[{ id:'slots',producerNodeId:'robot-slots' }],
          childRunGroupMembers:[
            { groupId:'slots',itemKey:'scout-01',childRunId:'slot-scout-01',state:'terminal' },
            { groupId:'slots',itemKey:'scout-02',childRunId:'slot-scout-02',state:'dispatched' },
          ],
          childRuns:[
            { childRunId:'slot-scout-01',targetId:'local',runStatus:'stopped',runRevision:4,revision:2 },
            { childRunId:'slot-scout-02',targetId:'local',runStatus:'waiting',runRevision:5,revision:2 },
          ],
          waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        },
      } as never,
    };
    const instruments=panel('panel-instruments','Robot instruments');
    instruments.pluginId='robot-instruments-grid';
    instruments.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'stop-experiment',
    }];
    const runtime=automation();
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[{
        groupId:'group',itemKey:'panel-robot-instruments',childRunId:'full-child',state:'dispatched',
      }],
      childRuns:[{ childRunId:'full-child',targetId:'local',runStatus:'waiting',runRevision:7,revision:2 }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[instruments],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-run"]'),
    ).not.toBeDisabled());
    expectInstrumentConnectionPair(
      container.querySelector('[data-xgc-role="experiment-panel-header-trailing"]'),
      { selected:true,connectEnabled:true,disconnectEnabled:false },
    );
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-run"]')!);
    await waitFor(() => expect(lifecycle.startPanel).toHaveBeenCalledWith('panel-instruments',{
      robotId:'scout-01',robotIds:['scout-01'],selectionKey:'selected:["scout-01"]',
    }));
  });

  it('keeps Panel lifecycle controls exact without hydrating a mounted non-runtime panel',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    const runtime=automation();
    const loadRunDetail=runtime.loadRunDetail as Mock<(runId:string) => Promise<unknown>>;
    const workflowPanel=panel('panel-workflow','User panel');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[
        { groupId:'group',itemKey:'user-workflow',childRunId:'child-root',state:'dispatched' },
        { groupId:'group',itemKey:'other-workflow',childRunId:'shared-automation-child',state:'dispatched' },
      ],
      childRuns:[
        { childRunId:'child-root',targetId:'local',runStatus:'waiting',runRevision:7,revision:2 },
        { childRunId:'shared-automation-child',targetId:'local',runStatus:'waiting',runRevision:4,revision:2 },
      ],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container,rerender }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    await waitFor(() => expect(getAutomationExecutionRelations).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.mocked(getAutomationExecutionRelations).mock.results.at(-1)?.value;
    });
    const stop = container.querySelector('[data-xgc-role="panel-workflow-stop"]');
    expect(stop).not.toBeDisabled();
    expectIconOnlyWorkflowControl(stop, 'stop');
    expect(loadRunDetail).not.toHaveBeenCalled();
    rerender(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    const loads=loadRunDetail.mock.calls.length;
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    await waitFor(() => expect(runtime.stopRunSet).toHaveBeenCalledWith(
      { id:'child-root',status:'waiting',revision:7 },
      { includeAnchor:true,includeDetached:true,reason:'Stop Panel panel-workflow' },
    ));
    expect(getAutomationExecutionRelations).toHaveBeenCalledTimes(1);
    expect(loadRunDetail.mock.calls.length).toBe(loads);
  });

  it('hydrates only the exact mounted runtime Panel root, never its sibling Panel',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    const runtime=automation();
    const lichtblick=panel('panel-lichtblick','Lichtblick');
    lichtblick.pluginId='xgc2-lichtblick';
    lichtblick.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'viz-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[
        { groupId:'group',itemKey:'viz-workflow',childRunId:'viz-root',state:'dispatched' },
        { groupId:'group',itemKey:'sibling-workflow',childRunId:'sibling-root',state:'dispatched' },
      ],
      childRuns:[
        { childRunId:'viz-root',targetId:'local',runStatus:'waiting',runRevision:7,revision:2 },
        { childRunId:'sibling-root',targetId:'local',runStatus:'waiting',runRevision:5,revision:2 },
      ],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'any-dashboard',name:'Any',description:'',panels:[] }}
      panels={{ items:[lichtblick],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);
    await waitFor(() => expect(runtime.loadRunDetail).toHaveBeenCalledWith('viz-root',7));
    expect(runtime.loadRunDetail).not.toHaveBeenCalledWith('sibling-root',expect.anything());
    expect(runtime.loadRunDetail).toHaveBeenCalledTimes(1);
  });

  it('projects one exact active child after its dispatch member becomes terminal',() => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:3,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    const workflowPanel=panel('panel-workflow','User panel');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const relations={
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels' }],
      childRunGroupMembers:[{ groupId:'group',itemKey:'user-workflow',childRunId:'child-root',state:'terminal' }],
      childRuns:[{ childRunId:'child-root',targetId:'local',runStatus:'waiting',runRevision:7 }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    };
    expect(fullRunPanelInvocationFallback(workflowPanel,lifecycle,{
      rootId:'full-root',rootRevision:3,loading:false,error:'',relations:relations as never,
    })).toEqual({ rootRunId:'full-root',targetId:'local',id:'child-root',status:'waiting',revision:7 });
    relations.childRunGroupMembers.push({
      groupId:'group',itemKey:'user-workflow',childRunId:'ambiguous-child',state:'dispatched',
    });
    relations.childRuns.push({
      childRunId:'ambiguous-child',targetId:'local',runStatus:'waiting',runRevision:2,
    });
    expect(fullRunPanelInvocationFallback(workflowPanel,lifecycle,{
      rootId:'full-root',rootRevision:3,loading:false,error:'',relations:relations as never,
    })).toBeUndefined();
    expect(fullRunPanelInvocationFallback(workflowPanel,lifecycle,{
      rootId:'full-root',rootRevision:3,loading:false,error:'',relations:{
        ...relations,
        childRunGroupMembers:[{
          groupId:'group',itemKey:'user-workflow',childRunId:'missing-child',state:'dispatched',
        }],
        childRuns:[],
      } as never,
    })).toBeUndefined();
  });

  it('restores a terminal keep-experiment Panel as Run from one full-root relation snapshot',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'run',runMode:'simulation',
      status:'waiting',revision:4,rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    const runtime=automation();
    const workflowPanel=panel('panel-workflow','User panel');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',
      childRunGroups:[{ id:'group',producerNodeId:'run-panels',state:'resolved' }],
      childRunGroupMembers:[{
        groupId:'group',itemKey:'user-workflow',childRunId:'child-root',state:'terminal',
      }],
      childRuns:[{
        childRunId:'child-root',targetId:'local',runStatus:'stopped',runRevision:8,
      }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);

    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-run"][data-xgc-id="panel-workflow"]'),
    ).not.toBeNull());
    expect(container.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    expect(getAutomationExecutionRelations).toHaveBeenCalledTimes(1);
    expect(runtime.loadRunDetail).not.toHaveBeenCalled();
  });

  it('shows one outer Stop for active Panel Actions and stops every exact Action root',async () => {
    const lifecycle=actions();
    const actionRoot={
      id:'panel-action-root',targetId:'local',
      experimentRef:{ domain:'experiment' as const,resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f036b-9638-4827-9524-73ff03fe99c9',actionId:'invoke-panel-action',
      runMode:'simulation',panelId:'panel-workflow',status:'waiting' as const,revision:5,
      rootRunId:'panel-action-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    };
    const secondActionRoot={ ...actionRoot,id:'panel-action-root-2',rootRunId:'panel-action-root-2',revision:6 };
    lifecycle.activeRuns=[actionRoot,secondActionRoot];
    const workflowPanel=panel('panel-workflow','User algorithms');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    const { container,rerender }=render(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);

    const stop=container.querySelector('[data-xgc-role="panel-workflow-stop"][data-xgc-id="panel-workflow"]');
    expectIconOnlyWorkflowControl(stop,'stop');
    fireEvent.click(stop!);
    await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledTimes(2));
    expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(actionRoot,'Stop Panel panel-workflow');
    expect(lifecycle.stopPanelAction).toHaveBeenCalledWith(secondActionRoot,'Stop Panel panel-workflow');

    lifecycle.activeRuns=[];
    rerender(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    expect(container.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    expect(container.querySelector(
      '[data-xgc-role="panel-workflow-run"][data-xgc-id="panel-workflow"]',
    )).not.toBeNull();

    const repeatedActionRoot={ ...actionRoot,id:'panel-action-root-3',rootRunId:'panel-action-root-3',revision:7 };
    lifecycle.activeRuns=[repeatedActionRoot];
    rerender(<ExperimentDashboardCanvas
      session={{ visibleExperiment:experiment(),editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={automation()}
    />);
    const repeatedStop=container.querySelector('[data-xgc-role="panel-workflow-stop"]');
    expectIconOnlyWorkflowControl(repeatedStop,'stop');
    fireEvent.click(repeatedStop!);
    await waitFor(() => expect(lifecycle.stopPanelAction).toHaveBeenCalledTimes(3));
    expect(lifecycle.stopPanelAction).toHaveBeenLastCalledWith(
      repeatedActionRoot,'Stop Panel panel-workflow',
    );
  });

  it('prefers an exact failed child Run over a stale full-root waiting relation',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f06',actionId:'run',runMode:'simulation',status:'waiting',revision:4,
      rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    lifecycle.runDetailsById={
      'child-root':{
        run:exactAutomationRun('child-root','failed',9,'user-project ROS source is unavailable'),
        invocations:[],nodeSummaries:[],loading:false,error:'',
      },
    };
    const runtime=automation();
    const workflowPanel=panel('panel-workflow','User panel');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels',state:'open' }],
      childRunGroupMembers:[{
        groupId:'group',itemKey:'user-workflow',childRunId:'child-root',state:'terminal',
      }],
      childRuns:[{
        childRunId:'child-root',targetId:'local',runStatus:'waiting',runRevision:7,
      }],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);

    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-run"][data-xgc-id="panel-workflow"]'),
    ).not.toBeNull());
    expect(container.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBeNull();
    expect(runtime.loadRunDetail).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent('user-project ROS source is unavailable');
  });

  it('stops every exact active child Run owned by one Panel workflow',async () => {
    const lifecycle=actions();
    lifecycle.activeRuns=[{
      id:'full-root',targetId:'local',experimentRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main' },
      automationResourceId:'069f06',actionId:'run',runMode:'simulation',status:'waiting',revision:4,
      rootRunId:'full-root',createdAt:'t',updatedAt:'t',workflowTargets:[],
    }];
    lifecycle.runDetailsById={
      'child-a':{ run:exactAutomationRun('child-a','running',9),
        invocations:[],nodeSummaries:[],loading:false,error:'' },
      'child-b':{ run:exactAutomationRun('child-b','waiting',10),
        invocations:[],nodeSummaries:[],loading:false,error:'' },
    };
    const runtime=automation();
    const workflowPanel=panel('panel-workflow','User panel');
    workflowPanel.portBindings=[{
      portId:'panel-workflow',kind:'workflow',workflowInstanceId:'user-workflow',presetId:'run',
      managed:true,relation:'supervised',failurePolicy:'keep-experiment',
    }];
    vi.mocked(getAutomationExecutionRelations).mockResolvedValueOnce({
      runId:'full-root',childRunGroups:[{ id:'group',producerNodeId:'run-panels',state:'open' }],
      childRunGroupMembers:[
        { groupId:'group',itemKey:'user-workflow',childRunId:'child-a',state:'dispatched' },
        { groupId:'group',itemKey:'user-workflow',childRunId:'child-b',state:'dispatched' },
      ],
      childRuns:[
        { childRunId:'child-a',targetId:'local',runStatus:'waiting',runRevision:7 },
        { childRunId:'child-b',targetId:'local',runStatus:'waiting',runRevision:8 },
      ],
      waits:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
    } as never);
    const { container }=render(<ExperimentDashboardCanvas
      session={{ editing:false,readOnly:false,commitConflict:'',saveError:'' }}
      dashboard={{ id:'gcs',name:'GCS',description:'',panels:[] }}
      panels={{ items:[workflowPanel],selectedPanelId:'',select:vi.fn(),openConfig:vi.fn(),remove:vi.fn(),updateLayout:vi.fn() }}
      drop={{ onDragOver:vi.fn(),onDrop:vi.fn() }} actions={lifecycle} gcsMode={false}
      coreNodes={[]} executionTargetId="local" automation={runtime}
    />);

    await waitFor(() => expect(
      container.querySelector('[data-xgc-role="panel-workflow-stop"][data-xgc-id="panel-workflow"]'),
    ).not.toBeNull());
    fireEvent.click(container.querySelector('[data-xgc-role="panel-workflow-stop"]')!);
    const stopRunSet=vi.mocked(runtime.stopRunSet);
    await waitFor(() => expect(stopRunSet).toHaveBeenCalledTimes(2));
    const stoppedControls=stopRunSet.mock.calls.map(([run]) => run)
      .sort((left,right) => left.id.localeCompare(right.id));
    const expectedControls:AutomationRunControl[]=[
      { id:'child-a',status:'running',revision:9 },
      { id:'child-b',status:'waiting',revision:10 },
    ];
    expect(stoppedControls).toEqual(expectedControls);
  });
});

function exactAutomationRun(
  id:string,
  status:AutomationRun['status'],
  revision:number,
  primaryError?:string,
):AutomationRun {
  return {
    id,targetId:'local',automationResourceId:'panel-workflow',definitionId:'panel-workflow',definitionVersion:1,
    actionId:'run',actionVersion:1,configDigest:'a'.repeat(64),executionPlanDigest:'b'.repeat(64),
    registryDigest:'c'.repeat(64),definitionDigest:'d'.repeat(64),executionModel:'orchestration-occurrence-v1',
    sourceKind:'experiment',sourceRef:{ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'commit-1',version:1,digest:'e'.repeat(64) },
    status,revision,parameters:{},...(primaryError ? { primaryError } : {}),admissionMode:'parallel',admissionScope:'root',
    rootRunId:'full-root',depth:1,correlationId:id,acceptedAt:'t',createdAt:'t',updatedAt:'t',
  };
}

function expectInstrumentConnectionPair(
  trailing: Element | null | undefined,
  options: {
    selected: boolean;
    connected?: boolean;
    connectEnabled?: boolean;
    disconnectEnabled?: boolean;
    connectTitle?: string;
    disconnectTitle?: string;
  },
) {
  const cluster = trailing?.querySelector('[data-xgc-role="robot-instruments-connection"]');
  const connect = trailing?.querySelector<HTMLElement>('[data-xgc-role="panel-workflow-run"]');
  const disconnect = trailing?.querySelector<HTMLElement>('[data-xgc-role="panel-workflow-stop"]');
  expect(cluster).toHaveAttribute('aria-label', 'Selected robot connection');
  expect(cluster?.querySelector('[data-xgc-role="panel-workflow-run"]')).toBe(connect);
  expect(cluster?.querySelector('[data-xgc-role="panel-workflow-stop"]')).toBe(disconnect);
  for (const control of [connect, disconnect]) {
    expect(control).toHaveAttribute('data-xgc-icon-only', 'true');
    expect(control).toHaveAttribute('data-xgc-size', 'compact');
    expect(control).toHaveClass('xgc-panel-runtime-action');
    expect(control?.textContent?.replace(/\s+/g, '')).toBe('');
  }
  expect(connect?.querySelector('svg.lucide-plug')).not.toBeNull();
  expect(connect?.querySelector('svg.lucide-play')).toBeNull();
  expect(disconnect?.querySelector('svg.lucide-unplug')).not.toBeNull();
  expect(disconnect?.querySelector('svg.lucide-square')).toBeNull();
  expect(connect).toHaveAttribute('aria-label', 'Connect selected robots');
  expect(disconnect).toHaveAttribute('aria-label', 'Disconnect selected robots');
  expect(connect).toHaveAttribute('data-xgc-tone', 'default');
  expect(disconnect).toHaveAttribute('data-xgc-tone', 'default');
  expect(connect).not.toHaveAttribute('data-xgc-tone', 'danger');
  expect(disconnect).not.toHaveAttribute('data-xgc-tone', 'danger');
  expect(connect).not.toHaveAttribute('data-xgc-tone', 'primary');
  expect(disconnect).not.toHaveAttribute('data-xgc-tone', 'primary');
  const connectEnabled = options.connectEnabled
    ?? (options.selected && options.connected === false);
  const disconnectEnabled = options.disconnectEnabled
    ?? (options.selected && options.connected === true);
  if (connectEnabled) expect(connect).not.toBeDisabled();
  else expect(connect).toBeDisabled();
  if (disconnectEnabled) expect(disconnect).not.toBeDisabled();
  else expect(disconnect).toBeDisabled();
  if (!options.selected) {
    expect(connect).toHaveAttribute('title', options.connectTitle ?? 'Select robots to connect');
    expect(disconnect).toHaveAttribute('title', options.disconnectTitle ?? 'Select robots to disconnect');
    return;
  }
  if (options.connectTitle) expect(connect).toHaveAttribute('title', options.connectTitle);
  else if (connectEnabled && disconnectEnabled) {
    expect(connect).toHaveAttribute('title', 'Connect remaining selected robots');
  } else if (connectEnabled) {
    expect(connect).toHaveAttribute('title', 'Connect selected robots');
  } else {
    expect(connect).toHaveAttribute('title', 'Selected robots already connected');
  }
  if (options.disconnectTitle) expect(disconnect).toHaveAttribute('title', options.disconnectTitle);
  else if (connectEnabled && disconnectEnabled) {
    expect(disconnect).toHaveAttribute('title', 'Disconnect connected selected robots');
  } else if (disconnectEnabled) {
    expect(disconnect).toHaveAttribute('title', 'Disconnect selected robots');
  } else {
    expect(disconnect).toHaveAttribute('title', 'Selected robots are not connected');
  }
}

function expectPanelBodyInteractiveWhileEditing(
  container: HTMLElement,
  panelId: string,
  interactive: boolean,
) {
  const frame = container.querySelector(`[data-xgc-role="experiment-panel"][data-xgc-id="${panelId}"]`);
  const body = frame?.querySelector('.xgc-panel-frame-body');
  expect(frame).not.toBeNull();
  expect(body).not.toBeNull();
  if (interactive) {
    expect(frame).toHaveAttribute('data-xgc-interactive-while-editing', 'true');
    expect(body).not.toHaveAttribute('aria-disabled');
    return;
  }
  expect(frame).not.toHaveAttribute('data-xgc-interactive-while-editing');
  expect(body).toHaveAttribute('aria-disabled', 'true');
}

function expectIconOnlyWorkflowControl(control: Element | null | undefined, kind: 'run' | 'stop') {
  expect(control).toBeInstanceOf(HTMLElement);
  if (!(control instanceof HTMLElement)) return;
  expect(control).toHaveAttribute('data-xgc-icon-only', 'true');
  expect(control).toHaveAttribute('data-xgc-size', 'compact');
  expect(control).toHaveClass('xgc-panel-runtime-action');
  expect(control).not.toHaveClass('xgc-panel-workflow-runstop');
  expect(control.textContent?.trim()).toBe('');
  expect(control.querySelectorAll('svg')).toHaveLength(1);
  expect(control.querySelector('svg')).toHaveAttribute('width', '13');
  expect(control.querySelector('svg')).toHaveAttribute('height', '13');
  expect(control.querySelector('svg.lucide-circle')).toBeNull();
  if (kind === 'run') {
    expect(control).toHaveAttribute('data-xgc-status','stopped');
    expect(control.querySelector('svg.lucide-play')).not.toBeNull();
    expect(control.querySelector('svg.lucide-octagon')).toBeNull();
    expect(control.querySelector('svg.lucide-square')).toBeNull();
    expect(control).toHaveAttribute('title', 'Run Panel workflow');
    expect(control.getAttribute('aria-label')).toMatch(/^Run .+ workflow$/);
    expect(control).not.toHaveAttribute('data-xgc-tone', 'primary');
  } else {
    expect(control).toHaveAttribute('data-xgc-status','running');
    expect(control.querySelector('svg.lucide-square')).not.toBeNull();
    expect(control.querySelector('svg.lucide-octagon')).toBeNull();
    expect(control.querySelector('svg.lucide-play')).toBeNull();
    expect(control).toHaveAttribute('title', 'Stop Panel workflow');
    expect(control.getAttribute('aria-label')).toMatch(/^Stop .+ workflow$/);
    expect(control).toHaveAttribute('data-xgc-tone', 'danger');
    expect(control.querySelector('.lucide-loader-circle')).toBeNull();
    expect(control).not.toHaveAttribute('aria-busy');
  }
}

function writeInstrumentSelection(ids: string[]) {
  const key=robotSelectionKey({ experimentId:'experiment-a',shared:'experiment' });
  window.localStorage.setItem(key,JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('xgc-panel-state',{ detail:{ key } }));
}

function actions():ExperimentDashboardActions {
  return {
    experimentIsRunning:false,activeRun:undefined,activeRuns:[],sessionViews:[],runDetailsById:{},runMode:'simulation',
    stopAllInFlight:false,startInFlight:false,lifecycleStateLoading:false,actionError:'',startDisabledReason:'',
    canStartExperiment:true,canStopExperiment:false,updateRobotBindings:vi.fn(),updateRobotBindingsDisabledReason:vi.fn(() => '' as const),
    updateLocalizationOffset:vi.fn(),updateLocalizationOffsetDisabledReason:vi.fn(() => '' as const),
    updateWorkflowPresetInputs:vi.fn(),updateWorkflowPresetInputsDisabledReason:vi.fn(() => '' as const),
    startExperiment:vi.fn(),stopExperiment:vi.fn(),startPanel:vi.fn(async () => ({ id:'panel-run' } as never)),
    invokePanelAction:vi.fn(),stopPanelAction:vi.fn(),
  };
}
function panel(id:string,title:string):PanelInstance {
  return {
    id,pluginId:'missing-plugin',title,gridPos:{ x:0,y:0,w:6,h:5 },
    query:{},options:{},fieldConfig:{},portBindings:[],
  };
}
function experiment(runModes:ExperimentRunMode[]=['simulation']):ExperimentDocument {
  return {
    head:{
      domain:'experiment',resourceId:'experiment-a',name:'Experiment',tags:[],mainCommitId:'commit-1',currentVersion:1,
      digest:'d'.repeat(64),revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    },
    branch:{
      domain:'experiment',resourceId:'experiment-a',name:'main',headCommitId:'commit-1',headVersion:1,
      revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    },
    spec:newExperimentSpec({ name:'Experiment',runModes }),
  };
}
function automation():AutomationPanelContext['automation'] {
  return { targetId:'local',documents:[],catalog:[],runSummaries:[],runDetailsById:{},loading:false,error:'',
    runDocument:vi.fn(),runBoundAutomation:vi.fn(),stop:vi.fn(),stopRunSet:vi.fn(),loadRunDetail:vi.fn(),
    retainRunDetail:vi.fn(() => vi.fn()),refreshExecutionHistory:vi.fn() } as unknown as AutomationPanelContext['automation'];
}

function panelRunDetail(
  runId:string,
  panelId:string,
  robotIds:string[],
  runMode:ExperimentRunMode='simulation',
) {
  const selectionKey=robotIds.length===0 ? 'all' : `selected:${JSON.stringify([...robotIds].sort())}`;
  return {
    run:{
      id:runId,parameters:{
        panelId,runMode,inputOverridesJson:JSON.stringify({
          robotId:robotIds.length===1 ? robotIds[0] : '',robotIds,selectionKey,
        }),
      },
    },
    invocations:[],nodeSummaries:[],loading:false,error:'',
  } as never;
}
