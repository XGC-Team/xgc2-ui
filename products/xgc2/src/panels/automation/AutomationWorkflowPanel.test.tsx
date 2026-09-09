// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { newAutomationSpec,type AutomationDocument } from '../../domains/automation/automationPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { AutomationWorkflowAuditPanel,AutomationWorkflowControlPanel } from './AutomationWorkflowPanel';
import {
  AutomationWorkflowAuditFrameProvider,
  AutomationWorkflowAuditHeaderActions,
  AutomationWorkflowControlFrameProvider,
  AutomationWorkflowControlHeaderActions,
} from './AutomationWorkflowPanelFrame';

vi.mock('../../domains/automation/automationPublic',async () => ({
  ...(await vi.importActual('../../domains/automation/automationPublic')),
  AutomationGraph: () => <div data-xgc-role="automation-graph" />,
}));

describe('AutomationWorkflowPanel',() => {
  it('renders one stable Run action for every bound preset and re-enables it from runtime truth',async () => {
    const workflow=actionPort('workflow','workflow','formation');
    const fallback=actionPort('fallback','fallback','formation','run-2');
    workflow.action!.label='Run formation';
    fallback.action!.label='Run formation';
    const renderPanel=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ workflow,fallback })} />;
    const { rerender }=render(renderPanel());

    expect(screen.getAllByRole('button')).toHaveLength(2);
    const workflowButton=document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="workflow"]');
    const fallbackButton=document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="fallback"]');
    expect(workflowButton).toHaveAccessibleName('Run formation');
    expect(fallbackButton).toHaveAccessibleName('Run formation');
    expect(workflowButton).toHaveClass('xgc-workflow-status-card','xgc-control-action-card');
    expect(workflowButton).toHaveAttribute('data-xgc-layout','tile');
    expect(workflowButton).toHaveAttribute('data-xgc-status','stopped');
    expect(workflowButton?.querySelector('.xgc-workflow-status-card-progress')).toBeInTheDocument();
    expect(fallbackButton).toBeDisabled();
    expect(fallbackButton).toHaveAttribute('data-xgc-role','panel-action-invoke');
    expect(fallbackButton).toHaveAttribute('data-xgc-run-id','run-2');
    expect(document.querySelector('[data-xgc-role="panel-action-stop"]')).toBeNull();
    expect(document.querySelectorAll('.automation-workflow-action-card')).toHaveLength(2);
    expect(document.querySelector('[data-xgc-role="automation-workflow-trace"]')).toBeNull();

    fireEvent.click(workflowButton!);
    await waitFor(() => expect(workflow.invoke).toHaveBeenCalledTimes(1));
    workflow.activeInvocation={ id:'run-1',status:'running',revision:1 };
    rerender(renderPanel());
    expect(document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="workflow"]')).toBeDisabled();

    delete workflow.activeInvocation;
    rerender(renderPanel());
    fireEvent.click(document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="workflow"]')!);
    await waitFor(() => expect(workflow.invoke).toHaveBeenCalledTimes(2));
  });

  it('keeps a wait-node workflow green and clears a finite workflow after success',() => {
    const action=actionPort('custom1','Algorithm','formation','running-action');
    action.action!.kind='service';
    action.serviceStatus={ state:'running',ready:2,total:2 };
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />;
    const { rerender }=render(view());
    const button=() => document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]')!;
    expect(button()).toHaveAttribute('data-xgc-status','running');
    expect(button().querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    expect(button().querySelector('.xgc-progress')).toHaveAttribute('data-xgc-tone','success');
    expect(button()).not.toBeDisabled();
    action.activeInvocation!.status='waiting';
    rerender(view());
    expect(button().querySelector('.xgc-progress')).toHaveAttribute('data-xgc-tone','success');
    expect(button()).toHaveAttribute('data-xgc-progress','100');
    action.action!.kind='command';
    rerender(view());
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    expect(button().querySelector('.xgc-progress')).toHaveAttribute('data-xgc-tone','success');
    delete action.activeInvocation;
    delete action.serviceStatus;
    action.latestInvocation={ id:'running-action',status:'succeeded',revision:2 };
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-status','stopped');
    expect(button()).not.toBeDisabled();
    expect(button()).not.toHaveAttribute('data-xgc-run-id');
    expect(button().querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

  it('fills a one-step Build workflow from 0/1 to 1/1 while the Run is active',() => {
    const build=actionPort('build','Build','paper-leader-build','build-run');
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ build })} />;
    const { rerender }=render(view());
    const button=() => document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="build"]')!;
    expect(button().querySelector('.xgc-progress')).not.toHaveAttribute('data-xgc-progress-mode','indeterminate');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    build.serviceStatus={ state:'starting',ready:0,total:1 };
    rerender(view());
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    expect(button()).toHaveAttribute('data-xgc-progress','0');
    build.serviceStatus={ state:'running',ready:1,total:1 };
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-progress','100');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    expect(button().querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
    delete build.activeInvocation;
    delete build.serviceStatus;
    build.latestInvocation={ id:'build-run',status:'succeeded',revision:2 };
    rerender(view());
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

  it('keeps a measured red fill after a workflow node fails, not after a normal stop',() => {
    const build=actionPort('build','Build','paper-leader-build','build-run');
    build.serviceStatus={ state:'degraded',ready:1,total:1 };
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ build })} />;
    const { rerender }=render(view());
    const button=() => document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="build"]')!;
    delete build.activeInvocation;
    build.latestInvocation={ id:'build-run',status:'failed',revision:2 };
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-status','failed');
    expect(button()).toHaveAttribute('data-xgc-tone','neutral');
    expect(button()).toHaveAttribute('data-xgc-progress','100');
    expect(button().querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-failed)' });
    build.latestInvocation={ id:'build-run',status:'stopped',revision:3 };
    delete build.serviceStatus;
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-status','stopped');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

  it('fills Algorithm with measured process progress instead of a looping bar',() => {
    const action=actionPort('custom1','Algorithm','formation','running-action');
    action.action!.kind='service';
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />;
    const { rerender }=render(view());
    const button=() => document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]')!;
    const progress=() => button().querySelector('.xgc-progress')!;
    expect(progress()).not.toHaveAttribute('data-xgc-progress-mode','indeterminate');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    action.serviceStatus={ state:'starting',ready:1,total:3 };
    rerender(view());
    expect(progress()).not.toHaveAttribute('data-xgc-progress-mode','indeterminate');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'33%' });
    action.serviceStatus={ state:'running',ready:3,total:3 };
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-status','running');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    expect(progress()).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
  });

  it('toggles a running service through its stop control without starting another run',async () => {
    const action=actionPort('custom1','Algorithm','formation','running-action');
    action.action!.kind='service';
    action.serviceStatus={ state:'running',ready:2,total:2 };
    render(<AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />);
    const button=document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]')!;
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(action.control).toHaveBeenCalledWith(action.activeInvocation,'stop',expect.any(String)));
    expect(action.invoke).not.toHaveBeenCalled();
  });

  it('renders Run and Build bindings as the shared ROS-family control action tiles',() => {
    const run=actionPort('run','run','paper-leader');
    const build=actionPort('build','build','paper-leader-build');
    run.action!.label='Algorithm';
    build.action!.label='Build paper-leader';
    const { container }=render(
      <AutomationWorkflowControlPanel panel={panel()} context={context({ run,build })} />,
    );

    const grid=container.querySelector('[data-xgc-role="automation-workflow-action-grid"]');
    const runButton=container.querySelector(
      '[data-xgc-role="panel-action-invoke"][data-xgc-id="run"]',
    );
    const buildButton=container.querySelector(
      '[data-xgc-role="panel-action-invoke"][data-xgc-id="build"]',
    );
    expect(grid).toHaveClass('xgc-control-action-grid');
    expect(grid).toHaveAttribute('data-xgc-tone-skin','neutral');
    expect(grid).toHaveStyle({ '--control-density-cols':'4','--control-cols':'2','--control-rows':'1' });
    expect(runButton).toHaveAccessibleName('Algorithm');
    expect(runButton).not.toHaveTextContent(/Run:/);
    expect(buildButton).toHaveAccessibleName('Build');
    expect(buildButton).not.toHaveTextContent(/paper-leader/i);
    expect(buildButton).not.toHaveTextContent(/^Build:/);
    expect(buildButton).not.toHaveTextContent(/SCE1/);
    for (const button of [runButton,buildButton]) {
      expect(button).toHaveClass('xgc-workflow-status-card','xgc-control-action-card','automation-workflow-action-card');
      expect(button).toHaveAttribute('data-xgc-layout','tile');
      expect(button).toHaveAttribute('data-xgc-status','stopped');
      expect(button?.querySelector('.xgc-workflow-status-card-progress')).toBeInTheDocument();
      expect(button?.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    }
  });

  it('hides Idle status copy on Reset, Stop, Track, Replay and Algorithm tiles',() => {
    const reset=actionPort('reset','Reset','formation');
    const stop=actionPort('stop','Stop','formation');
    const track=actionPort('track','Track','formation','track-run');
    const replay=actionPort('replay-3d','Replay 3D visualization','scientific-replay');
    const algorithm=actionPort('custom1','Algorithm','formation');
    algorithm.action!.kind='service';
    track.latestInvocation={ id:'track-run',status:'succeeded',revision:2 };
    delete track.activeInvocation;
    const { container }=render(
      <AutomationWorkflowControlPanel panel={panel()} context={context({ reset,stop,track,replay,algorithm })} />,
    );
    for (const id of ['reset','stop','track','replay-3d','custom1']) {
      const button=container.querySelector(`[data-xgc-role="panel-action-invoke"][data-xgc-id="${id}"]`)!;
      expect(button.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
      expect(button).not.toHaveTextContent(/idle/i);
    }
  });

  it('shortens replay tiles that already have experiment context',() => {
    const replay3d=actionPort('replay-3d','replay-3d','scientific-replay');
    const replayImage=actionPort('replay-image','replay-image','scientific-replay');
    const plot=actionPort('replay-plot','replay-plot','scientific-replay');
    replay3d.action!.label='Replay 3D visualization';
    replayImage.action!.label='Replay augmented view';
    plot.action!.label='Plot bag';
    const { container }=render(
      <AutomationWorkflowControlPanel panel={panel()} context={context({ replay3d,replayImage,plot })} />,
    );
    expect(container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="replay-3d"]'))
      .toHaveAccessibleName('Replay 3D');
    expect(container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="replay-image"]'))
      .toHaveAccessibleName('Replay image');
    expect(container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="replay-plot"]'))
      .toHaveAccessibleName('Plot bag');
  });

  it('calls custom1 Algorithm on every experiment tile',() => {
    const formation=actionPort('custom1','custom1','paper-leader');
    formation.action!.label='Formation';
    const { container,rerender }=render(
      <AutomationWorkflowControlPanel panel={panel()} context={context({ formation })} />,
    );
    expect(container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]'))
      .toHaveAccessibleName('Algorithm');
    const sce1=actionPort('custom1','custom1','sce1');
    sce1.action!.label='Custom1';
    rerender(<AutomationWorkflowControlPanel panel={panel()} context={context({ sce1 })} />);
    expect(container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="custom1"]'))
      .toHaveAccessibleName('Algorithm');
  });

  it('restores the Workflow view from the shared runtime projection',() => {
    const value = runtimeValue();
    render(
      <AutomationWorkflowControlFrameProvider panel={panel('whiteboard')}>
        <AutomationWorkflowControlPanel panel={panel('whiteboard')} context={context({
          workflow: actionPort('workflow','Formation NMPC','formation'),
        },value)} />
      </AutomationWorkflowControlFrameProvider>,
    );
    expect(document.querySelector('[data-xgc-role="automation-graph"]')).toBeInTheDocument();
  });

  it('hides History and Logs from Automation Control and clamps a saved history defaultView',() => {
    const value = panel('history');
    render(
      <AutomationWorkflowControlFrameProvider panel={value}>
        <AutomationWorkflowControlPanel panel={value} context={context({
          workflow: actionPort('workflow','Formation NMPC','formation'),
        },runtimeValue())} />
        <AutomationWorkflowControlHeaderActions panel={value} editing={false} />
      </AutomationWorkflowControlFrameProvider>,
    );
    const views = [...document.querySelectorAll('[data-xgc-role="automation-workflow-view"]')]
      .map((el) => el.getAttribute('data-xgc-id'));
    expect(views).toEqual(['controls','whiteboard']);
    expect(screen.queryByRole('button',{ name:'History' })).toBeNull();
    expect(screen.queryByRole('button',{ name:'Logs' })).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-workflow-action-grid"]')).toBeInTheDocument();
    expect(document.querySelector('[data-xgc-role="automation-workflow-history-view"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-workflow-log-inspector"]')).toBeNull();
  });

  it('keeps History and Logs on the audit panel',() => {
    const value = panel('history');
    render(
      <AutomationWorkflowAuditFrameProvider panel={value}>
        <AutomationWorkflowAuditPanel panel={value} context={context({},runtimeValue())} />
        <AutomationWorkflowAuditHeaderActions panel={value} editing={false} />
      </AutomationWorkflowAuditFrameProvider>,
    );
    const views = [...document.querySelectorAll('[data-xgc-role="automation-workflow-view"]')]
      .map((el) => el.getAttribute('data-xgc-id'));
    expect(views).toEqual(['history','logs']);
    expect(document.querySelector('[data-xgc-role="automation-executions-view"]')).toBeInTheDocument();
  });

  it('keeps the audit panel fail-closed until runtime data is connected',() => {
    render(<AutomationWorkflowAuditPanel panel={panel('history')} context={context({})} />);
    expect(document.querySelector('[data-xgc-role="automation-workflow-history-empty"]')).toBeInTheDocument();
  });

  it('leaves the Panel header Stop to Experiment Dashboard Canvas',() => {
    const first = actionPort('first','First planner','first','run-first');
    const second = actionPort('second','Second planner','second','run-second');
    const value = panel();
    render(
      <AutomationWorkflowControlFrameProvider panel={value}>
        <AutomationWorkflowControlPanel panel={value} context={context({ first,second })} />
        <AutomationWorkflowControlHeaderActions panel={value} editing={false} />
      </AutomationWorkflowControlFrameProvider>,
    );
    expect(document.querySelector('[data-xgc-role="automation-workflow-stop-all"]')).toBeNull();
    expect(document.querySelector('[data-xgc-role="automation-workflow-view"]')).toBeInTheDocument();
    const views = [...document.querySelectorAll('[data-xgc-role="automation-workflow-view"]')]
      .map((el) => el.getAttribute('data-xgc-id'));
    expect(views).toEqual(['controls','whiteboard']);
    fireEvent.click(screen.getByRole('button',{ name:'Workflow' }));
    const selector = document.querySelector('[data-xgc-role="automation-workflow-selector-listbox"]');
    expect(selector).toHaveAttribute('data-size','compact');
    expect(selector).toHaveAttribute('data-xgc-fill','true');
    expect(first.invoke).not.toHaveBeenCalled();
    expect(second.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name:'Controls' }));
    expect(document.querySelector('[data-xgc-role="automation-workflow-selector-listbox"]')).toBeNull();
  });
});

function panel(defaultView = 'controls'):PanelInstance {
  return { id:`automation-${defaultView}`,pluginId:'automation-workflow-control',title:'Automation',gridPos:{ x:0,y:0,w:6,h:4 },query:{},options:{ defaultView,historyLimit:10 },fieldConfig:{},portBindings:[] };
}

function context(actions: Record<string,PanelActionPortRuntime>,runtime?:unknown):PanelPluginContext {
  return { ports:{
    actions,
    data:{
      runtime:{ id:'runtime',label:'Workflow runtime',contract:'workflowruntime.run',connected:runtime !== undefined,value:runtime,trace:{} },
      trace:{ id:'trace',label:'Trace',contract:'workflow.run.logs.v1',connected:false,value:undefined,trace:{} },
    },
    authoring:{},interactions:{},
  } };
}

function actionPort(id:string,label:string,resourceId:string,activeId?:string):PanelActionPortRuntime {
  return { id,label,connected:true,disabledReason:'',action:{ id:'run',label,kind:'command',controls:['stop'] },inputSchema:{ fields:[] },defaults:{},
    ...(activeId ? { activeInvocation:{ id:activeId,status:'running',revision:1 } } : {}),invoke:vi.fn(async () => ({ id:'run-new',status:'running' as const,revision:1 })),control:vi.fn(async () => undefined),
    trace:{ automationResourceId:resourceId,actionId:'run' } };
}

function runtimeValue() {
  const document:AutomationDocument = { head:{ domain:'automation',resourceId:'formation',name:'Formation NMPC',tags:[],mainCommitId:'commit',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:00:00Z' },branch:{ domain:'automation',resourceId:'formation',name:'main',headCommitId:'commit',headVersion:1,revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:00:00Z' },spec:newAutomationSpec('Formation NMPC') };
  return { targetId:'local',documents:[document],catalog:[],runSummaries:[{ id:'run-1',targetId:'local',automationResourceId:'formation',actionId:'run',actionVersion:1,sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:'formation',branch:'main',commitId:'commit',version:1,digest:'d'.repeat(64) },status:'succeeded',revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:01:00Z' }],runDetailsById:{},loading:false,error:'' };
}
