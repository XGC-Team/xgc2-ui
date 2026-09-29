import { downloadRecording,listRecordings } from '../../domains/recording/recordingPublic';
// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { StrictMode } from 'react';
import { newAutomationSpec,newAutomationNode,type AutomationDocument,type AutomationRunDetail } from '../../domains/automation/automationPublic';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import type { PanelActionPortRuntime,PanelPluginContext } from '../types';
import { AutomationWorkflowAuditPanel,AutomationWorkflowControlPanel } from './AutomationWorkflowPanel';
import {
  AutomationWorkflowAuditFrameProvider,
  AutomationWorkflowAuditHeaderActions,
  AutomationWorkflowControlFrameProvider,
  AutomationWorkflowControlHeaderActions,
} from './AutomationWorkflowPanelFrame';
import { testPanelExecution,testRunDetails } from '../../test/panelExecutionTestSupport';

vi.mock('../../domains/automation/automationPublic',async () => ({
  ...(await vi.importActual('../../domains/automation/automationPublic')),
  AutomationGraph: () => <div data-xgc-role="automation-graph" />,
}));

vi.mock('../../domains/recording/recordingPublic',async () => ({
  ...(await vi.importActual('../../domains/recording/recordingPublic')),
  listRecordings:(await import('../../domains/recording/recordingService')).listRecordings,
  downloadRecording:(await import('../../domains/recording/recordingService')).downloadRecording,
}));
vi.mock('../../domains/recording/recordingService',async () => ({
  ...(await vi.importActual('../../domains/recording/recordingService')),listRecordings:vi.fn(),downloadRecording:vi.fn(),
}));

describe('AutomationWorkflowPanel',() => {
  it.each(['target','experiment','panel','port','owner','preset'] as const)(
    'discards a late accepted receipt when the card changes %s identity without a Data port',async (changed) => {
      const original=actionPort('capture','Old capture','worker');
      original.executionMode='standalone';original.action!.kind='service';
      original.trace={ automationResourceId:'worker',actionId:'run',workflowInstanceId:'owner-a',presetId:'preset-a' };
      let resolveStart!:(value:{ id:string;status:'waiting';revision:number }) => void;
      original.invoke=vi.fn(() => new Promise<{ id:string;status:'waiting';revision:number }>((resolve) => { resolveStart=resolve; }));
      const detail=finalizedRecordingDetail();
      const next=actionPort(changed==='port' ? 'next-capture' : 'capture','New capture','worker');
      next.executionMode='standalone';next.action!.kind='service';
      next.trace={ ...original.trace,
        workflowInstanceId:changed==='owner' ? 'owner-b' : 'owner-a',
        presetId:changed==='preset' ? 'preset-b' : 'preset-a' };
      // The target-scoped store legitimately retains the previous binding's Run.
      testRunDetails(next.execution)['old-root']=detail;
      next.execution!.loadRunDetail=vi.fn(async () => detail);
      vi.mocked(listRecordings).mockClear().mockResolvedValue([{ id:'old-file',name:'OLD_CAPTURE.mp4',size:1024,
        experimentId:'experiment-a',workflowRunId:'old-root',targetId:'local',status:'finalized' } as Awaited<ReturnType<typeof listRecordings>>[number]]);
      original.invocationScope={ targetId:'local',experimentResourceId:'experiment-a',experimentBranch:'main',
        panelId:panel().id,portId:'capture',workflowInstanceId:'owner-a',presetId:'preset-a' };
      next.invocationScope={ ...original.invocationScope,
        targetId:changed==='target' ? 'another-target' : 'local',
        experimentResourceId:changed==='experiment' ? 'experiment-b' : 'experiment-a',
        panelId:changed==='panel' ? 'another-panel' : panel().id,portId:next.id,
        workflowInstanceId:next.trace.workflowInstanceId!,presetId:next.trace.presetId! };
      const { container,rerender }=render(<AutomationWorkflowControlPanel panel={panel()} context={context({ capture:original })} />);
      fireEvent.click(container.querySelector('[data-xgc-role="panel-action-invoke"]')!);
      expect(original.invoke).toHaveBeenCalledTimes(1);
      rerender(<AutomationWorkflowControlPanel panel={{ ...panel(),...(changed==='panel' ? { id:'another-panel' } : {}) }}
        context={context({ capture:next })} />);
      const nextButton=container.querySelector('[data-xgc-role="panel-action-invoke"]')!;
      expect(nextButton).toHaveAccessibleName('New capture');
      expect(nextButton).toBeEnabled();
      expect(nextButton).toHaveAttribute('data-xgc-status','stopped');
      expect(container.querySelector('[data-xgc-role="panel-action-recording-result"]')).toBeNull();
      await act(async () => { resolveStart({ id:'old-root',status:'waiting',revision:1 }); });
      expect(nextButton).toBeEnabled();
      expect(nextButton).not.toHaveAttribute('data-xgc-run-id');
      expect(screen.queryByText('Saved: OLD_CAPTURE.mp4')).toBeNull();
      expect(container.querySelector('[data-xgc-role="panel-action-recording-result"]')).toBeNull();
      expect(next.execution!.loadRunDetail).not.toHaveBeenCalled();
      expect(next.execution!.retainRunObservation).not.toHaveBeenCalled();
      expect(listRecordings).not.toHaveBeenCalled();
    },
  );

  it('discards the previous recording invocation on rebinding and ignores its late failure',async () => {
    const original=actionPort('capture','Old capture','worker');
    original.executionMode='standalone';original.action!.kind='service';
    original.trace={ ...original.trace,workflowInstanceId:'owner',presetId:'old-preset' };
    original.latestInvocation={ id:'old-root',status:'stopped',revision:3 };
    testRunDetails(original.execution)['old-root']=finalizedRecordingDetail();
    vi.mocked(listRecordings).mockClear().mockResolvedValue([{ id:'old-file',name:'OLD_CAPTURE.mp4',size:1024,
      experimentId:'experiment-a',workflowRunId:'old-root',targetId:'local',status:'finalized' } as Awaited<ReturnType<typeof listRecordings>>[number]]);
    let rejectStart!:(cause:Error) => void;
    original.invoke=vi.fn(() => new Promise<never>((_,reject) => { rejectStart=reject; }));
    const { container,rerender }=render(<AutomationWorkflowControlPanel panel={panel()} context={context({ capture:original })} />);
    expect(container.querySelector('[data-xgc-role="panel-action-recording-result"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-xgc-role="panel-action-invoke"]')!);
    const next=actionPort('capture','New capture','worker');
    next.executionMode='standalone';next.action!.kind='service';
    next.trace={ ...original.trace,presetId:'new-preset' };
    rerender(<AutomationWorkflowControlPanel panel={panel()} context={context({ capture:next })} />);
    const nextButton=container.querySelector('[data-xgc-role="panel-action-invoke"]')!;
    expect(nextButton).toBeEnabled();
    expect(screen.queryByText('Saved: OLD_CAPTURE.mp4')).toBeNull();
    await act(async () => { rejectStart(new Error('OLD REQUEST FAILED')); });
    expect(nextButton).not.toHaveAttribute('title','OLD REQUEST FAILED');
    fireEvent.click(nextButton);
    await waitFor(() => expect(next.execution!.retainRunObservation).toHaveBeenCalledWith('run-new'));
    expect(next.invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves accepted old-commit control across same-identity revisions under StrictMode',async () => {
    const original=actionPort('capture','Capture','worker');
    original.executionMode='standalone';original.action!.kind='service';
    original.trace={ ...original.trace,workflowInstanceId:'owner',presetId:'capture-preset' };
    let resolveStart!:(value:{ id:string;status:'waiting';revision:number }) => void;
    original.invoke=vi.fn(() => new Promise<{ id:string;status:'waiting';revision:number }>((resolve) => { resolveStart=resolve; }));
    const runtime={ ...runtimeValue(),experimentResourceId:'experiment-a' };
    const { container,rerender }=render(<StrictMode><AutomationWorkflowControlPanel panel={panel()} context={context({ capture:original },runtime)} /></StrictMode>);
    fireEvent.click(container.querySelector('[data-xgc-role="panel-action-invoke"]')!);
    const next={ ...original,label:'Renamed capture',action:{ ...original.action!,label:'Renamed capture' } };
    const nextRuntime={ ...runtime,documents:runtime.documents.map((document) => ({ ...document,
      head:{ ...document.head,mainCommitId:'next-commit',revision:2 },
      branch:{ ...document.branch,headCommitId:'next-commit',revision:2 } })) };
    rerender(<StrictMode><AutomationWorkflowControlPanel panel={panel()} context={context({ capture:next },nextRuntime)} /></StrictMode>);
    const button=container.querySelector('[data-xgc-role="panel-action-invoke"]')!;
    expect(button).toBeDisabled();
    await act(async () => { resolveStart({ id:'accepted-old-commit',status:'waiting',revision:7 }); });
    expect(button).toHaveAttribute('data-xgc-run-id','accepted-old-commit');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(next.control).toHaveBeenCalledWith(
      { id:'accepted-old-commit',status:'waiting',revision:7 },'stop',expect.any(String),
    ));
    expect(original.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps recording controls in the unchanged action grid through Stop and finalization',async () => {
    const port=actionPort('ordinary-capture','Capture','worker');port.executionMode='standalone';
    port.action!.kind='service';port.action!.controls=['stop'];
    const spec=newAutomationSpec('Worker');
    spec.nodes=[{ ...newAutomationNode('process.run-bash',{ archiveOutput:{ category:'ScreenRecording',extension:'mp4' } }),id:'actual-producer' }];
    const sourceRef={ domain:'experiment',resourceId:'frozen-experiment',branch:'main',commitId:'old',version:1,digest:'a'.repeat(64) };
    const automationRef={ ...sourceRef,domain:'automation',resourceId:'worker' };
    const detail={ run:{ id:'exact-root',rootRunId:'exact-root',targetId:'local',sourceKind:'experiment',sourceRef,automationRef,status:'waiting',revision:2 },
      snapshot:{ runId:'exact-root',targetId:'local',sourceKind:'experiment',sourceRef,automationRef,automationSpec:spec },
      invocations:[{ id:'real-occurrence',runId:'exact-root',nodeId:'actual-producer',kind:'process.run-bash',status:'waiting',compensationStatus:'none',attempts:[{ status:'waiting' }] }],
      relations:{ runId:'exact-root',childRuns:[],childRunGroups:[],childRunGroupMembers:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
        waits:[{ type:'job',subjectId:'exact-job',runId:'exact-root',invocationId:'real-occurrence',state:'pending' }] },
      nodeSummaries:[],loading:false,error:'' } as unknown as AutomationRunDetail;
    port.activeInvocation={ id:'exact-root',status:'waiting',revision:2 };
    const load=vi.fn(async () => detail);
    port.execution=testPanelExecution({ 'exact-root':detail },{ loadRunDetail:load,retainRunObservation:vi.fn(() => vi.fn()),retainRunDetail:vi.fn(() => vi.fn()) });
    vi.mocked(listRecordings).mockClear().mockResolvedValue([{ id:'screen.record',name:'Experiment_simulation_capture.mp4',size:1024,
      experimentId:'frozen-experiment',workflowRunId:'exact-root',targetId:'local',status:'finalized' } as Awaited<ReturnType<typeof listRecordings>>[number]]);
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ capture:port })} />;
    const { container,rerender }=render(view());
    await waitFor(() => expect(load).toHaveBeenCalled());
    fireEvent.click(container.querySelector('[data-xgc-role="panel-action-invoke"]')!);
    await waitFor(() => expect(port.control).toHaveBeenCalled());
    expect(listRecordings).not.toHaveBeenCalled();
    port.activeInvocation=undefined;port.latestInvocation={ id:'exact-root',status:'stopped',revision:3 };
    detail.run={ ...detail.run!,status:'stopped',revision:3 };rerender(view());
    expect(listRecordings).not.toHaveBeenCalled();
    detail.invocations[0]!.status='canceled';detail.invocations[0]!.compensationStatus='succeeded';detail.invocations[0]!.attempts[0]!.status='canceled';
    detail.relations!.waits[0]!.state='canceled';rerender(view());
    const grid=container.querySelector('[data-xgc-role="automation-workflow-action-grid"]')!;
    expect(grid.children).toHaveLength(1);
    expect(grid.firstElementChild).toHaveAttribute('data-xgc-role','panel-action-invoke');
    expect(grid.firstElementChild).toHaveAccessibleName('Capture');
    expect(grid.firstElementChild).toHaveAttribute('data-xgc-status','stopped');
    expect(grid.querySelector('[data-xgc-role="panel-action-recording-result"]')).toBeNull();
    expect(grid.querySelector('[data-xgc-role="panel-action-recording-download"]')).toBeNull();
    expect(grid.querySelector('[data-xgc-role="panel-action-recording-refresh"]')).toBeNull();
    expect(listRecordings).not.toHaveBeenCalled();
    expect(downloadRecording).not.toHaveBeenCalled();
  });

  it('uses the short Action label and stops its exact accepted Run through the same card',async () => {
    const port=actionPort('capture','Capture','worker');
    port.executionMode='standalone';port.action!.kind='service';port.action!.controls=['stop'];
    port.activeInvocation={ id:'standalone-root',status:'waiting',revision:7 };
    const { container }=render(<AutomationWorkflowControlPanel panel={panel()} context={context({ capture:port })} />);
    const button=container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="capture"]')!;
    expect(button).toHaveAccessibleName('Capture');
    fireEvent.click(button);
    await waitFor(() => expect(port.control).toHaveBeenCalledWith(port.activeInvocation,'stop',expect.any(String)));
    expect(port.invoke).not.toHaveBeenCalled();
  });

  it('invokes Reset and Stop with one click without displaying fixed preset inputs',async () => {
    const ports=Object.fromEntries(['reset','stop'].map(id => {
      const port=actionPort(id,id,'ugv');
      port.action!.label=id;
      port.inputSchema={ fields:[{ name:'commandGroup',label:'Vehicle command group',kind:'string',required:true,
        string:{ default:'xgc.ugv-reset-stop',enum:['xgc.ugv-reset-stop'] } }] };
      port.defaults={ commandGroup:'xgc.ugv-reset-stop' };
      return [id,port];
    }));
    const { container }=render(<AutomationWorkflowControlPanel panel={panel()} context={context(ports)} />);
    expect(screen.queryByText('Vehicle command group')).toBeNull();
    expect(container.querySelector('input,select,textarea,form')).toBeNull();
    for (const id of ['reset','stop']) {
      fireEvent.click(container.querySelector(`[data-xgc-role="panel-action-invoke"][data-xgc-id="${id}"]`)!);
      await waitFor(() => expect(ports[id]!.invoke).toHaveBeenCalledTimes(1));
      expect(ports[id]!.invoke).toHaveBeenCalledWith({},expect.any(String));
    }
  });

  it('preserves configured action order instead of alphabetizing protocol IDs',() => {
    const ports=Object.fromEntries(['run','record','takeoff','start','stop','reset'].map(id => [id,actionPort(id,id,'formation')]));
    render(<AutomationWorkflowControlPanel panel={panel()} context={context(ports)} />);
    expect([...document.querySelectorAll('[data-xgc-role="panel-action-invoke"]')].map(el => el.getAttribute('data-xgc-id')))
      .toEqual(['run','record','takeoff','start','stop','reset']);
  });

  it('puts the bag archive location on idle Record title, not the tile body',() => {
    const record=actionPort('record','Record','formation');
    record.action!.kind='service';
    const run=actionPort('run','Algorithm','formation');
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ run,record })} />;
    const { container,rerender }=render(view());
    const recordButton=() => container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="record"]')!;
    const runButton=() => container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="run"]')!;
    expect(recordButton()).toHaveAccessibleName('Record');
    expect(recordButton()).toHaveAttribute(
      'title',
      "Saves under this station's Documents/XGC/Data. After Stop, listed as a data file on Analysis plots.",
    );
    expect(recordButton()).not.toHaveTextContent(/Documents\/XGC\/Data/i);
    expect(recordButton().querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(runButton()).not.toHaveAttribute('title');
    record.disabledReason='Waiting for the current Session';
    rerender(view());
    expect(recordButton()).toHaveAttribute('title','Waiting for the current Session');
    record.disabledReason='';
    record.activeInvocation={ id:'rec-1',status:'running',revision:1 };
    rerender(view());
    expect(recordButton()).toHaveAttribute('title','Stop service');
    expect(recordButton()).toHaveAccessibleName('Record');
  });

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
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
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
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
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

  it('keeps Algorithm run occupancy after stop then start in the same Session',() => {
    const action=actionPort('run','Algorithm','paper-leader','run-1');
    action.action!.kind='service';
    action.serviceStatus={ state:'running',ready:2,total:2 };
    const view=() => <AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />;
    const { rerender }=render(view());
    const button=() => document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="run"]')!;
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    delete action.activeInvocation;
    delete action.serviceStatus;
    action.latestInvocation={ id:'run-1',status:'stopped',revision:2 };
    rerender(view());
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
    action.activeInvocation={ id:'run-2',status:'waiting',revision:1 };
    action.serviceStatus={ state:'running',ready:2,total:2 };
    rerender(view());
    expect(button()).toHaveAttribute('data-xgc-status','running');
    expect(button().querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    expect(button().querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
  });

  it('retains the Algorithm invoke id and stays occupied before occupancy summaries arrive',async () => {
    const action=actionPort('run','Algorithm','paper-leader');
    action.action!.kind='service';
    render(<AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />);
    const button=document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="run"]')!;
    fireEvent.click(button);
    await waitFor(() => expect(action.execution?.retainRunObservation).toHaveBeenCalledWith('run-new'));
    expect(action.invoke).toHaveBeenCalledTimes(1);
    expect(action.execution?.loadRunDetail).toHaveBeenCalledWith('run-new');
    expect(button).toHaveAttribute('data-xgc-status','waiting');
    expect(button.querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'100%' });
    fireEvent.click(button);
    await waitFor(() => expect(action.control).toHaveBeenCalledWith(
      expect.objectContaining({ id:'run-new',status:'waiting',revision:1 }),
      'stop',
      expect.any(String),
    ));
    expect(action.invoke).toHaveBeenCalledTimes(1);
  });

  it('surfaces Algorithm invoke occupancy rejection on the tile without a second start',async () => {
    const action=actionPort('run','Algorithm','paper-leader');
    action.action!.kind='service';
    action.invoke=vi.fn(async () => { throw new Error('workflow occupancy rejected'); });
    render(<AutomationWorkflowControlPanel panel={panel()} context={context({ action })} />);
    const button=document.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="run"]')!;
    fireEvent.click(button);
    await waitFor(() => expect(action.invoke).toHaveBeenCalledTimes(1));
    expect(button).toHaveAttribute('title','workflow occupancy rejected');
    expect(button).toHaveAttribute('data-xgc-status','stopped');
    expect(action.control).not.toHaveBeenCalled();
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
    const record = actionPort('screen-record', 'screen-record', 'recording');
    record.action!.label = 'Screen record';
    const recorded = render(
      <AutomationWorkflowControlPanel panel={panel()} context={context({ record })} />,
    );
    const button = recorded.container.querySelector('[data-xgc-role="panel-action-invoke"][data-xgc-id="screen-record"]')!;
    expect(button).toHaveAccessibleName('Screen record');
    const strong = button.querySelector('.xgc-workflow-status-card-heading strong')!;
    expect(strong.querySelector('br')).not.toBeNull();
    expect(strong.childNodes[0]?.textContent).toBe('Screen');
    expect(strong.childNodes[2]?.textContent).toBe('record');
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
    execution:testPanelExecution({},{
      loadRunDetail:vi.fn(async () => ({ invocations:[],nodeSummaries:[],loading:false,error:'' })),
      retainRunDetail:vi.fn(() => () => undefined),
      retainRunObservation:vi.fn(() => () => undefined),
    }),
    ...(activeId ? { activeInvocation:{ id:activeId,status:'running',revision:1 } } : {}),invoke:vi.fn(async () => ({ id:'run-new',status:'waiting' as const,revision:1 })),control:vi.fn(async () => undefined),
    trace:{ automationResourceId:resourceId,actionId:'run' } };
}

function runtimeValue() {
  const document:AutomationDocument = { head:{ domain:'automation',resourceId:'formation',name:'Formation NMPC',tags:[],mainCommitId:'commit',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:00:00Z' },branch:{ domain:'automation',resourceId:'formation',name:'main',headCommitId:'commit',headVersion:1,revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:00:00Z' },spec:newAutomationSpec('Formation NMPC') };
  return { targetId:'local',documents:[document],catalog:[],runSummaries:[{ id:'run-1',targetId:'local',automationResourceId:'formation',actionId:'run',actionVersion:1,sourceKind:'automation',sourceRef:{ domain:'automation',resourceId:'formation',branch:'main',commitId:'commit',version:1,digest:'d'.repeat(64) },status:'succeeded',revision:1,createdAt:'2026-08-24T00:00:00Z',updatedAt:'2026-08-24T00:01:00Z' }],runDetailsById:{},loading:false,error:'' };
}

function finalizedRecordingDetail():AutomationRunDetail {
  const spec=newAutomationSpec('Old producer');
  spec.nodes=[{ ...newAutomationNode('process.run-bash',{ archiveOutput:{ category:'ScreenRecording',extension:'mp4' } }),id:'producer' }];
  const sourceRef={ domain:'experiment',resourceId:'experiment-a',branch:'main',commitId:'old',version:1,digest:'a'.repeat(64) };
  const automationRef={ ...sourceRef,domain:'automation',resourceId:'worker' };
  return { run:{ id:'old-root',rootRunId:'old-root',targetId:'local',sourceKind:'experiment',sourceRef,automationRef,status:'stopped',revision:3 },
    snapshot:{ runId:'old-root',targetId:'local',sourceKind:'experiment',sourceRef,automationRef,automationSpec:spec },
    invocations:[{ id:'occ',runId:'old-root',nodeId:'producer',kind:'process.run-bash',status:'canceled',compensationStatus:'succeeded',attempts:[{ status:'canceled' }] }],
    relations:{ runId:'old-root',childRuns:[],childRunGroups:[],childRunGroupMembers:[],effects:[],runtimeGroups:[],runtimes:[],resources:[],
      waits:[{ type:'job',subjectId:'old-job',runId:'old-root',invocationId:'occ',state:'canceled' }] },
    nodeSummaries:[],loading:false,error:'' } as unknown as AutomationRunDetail;
}
