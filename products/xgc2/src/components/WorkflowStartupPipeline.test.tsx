// @vitest-environment jsdom

import { act,fireEvent,render,renderHook,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { WorkflowStartupPipeline } from './WorkflowStartupPipeline';
import { useWorkflowStartupPresentation,workflowStartupGeneration } from './useWorkflowStartupPresentation';
import {
  workflowStartupFactsReady,
  workflowStartupIdentityFactSamples,
  workflowStartupPresentationComplete,
  workflowStartupRailState,
  workflowStartupSendingDestinationReady,
  workflowStartupWidthCopy,
} from './workflowStartupPipelineModel';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
});

describe('WorkflowStartupPipeline',() => {
  it('identifies a generation by run identity, not invocation revision',() => {
    expect(workflowStartupGeneration('run-1','lichtblick')).toBe('run-1');
    expect(workflowStartupGeneration('','lichtblick')).toBe('lichtblick');
    expect(workflowStartupFactsReady('starting',[
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','ready','foxglove-bridge'),
    ])).toBe(true);
    expect(workflowStartupFactsReady('starting',[
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ])).toBe(false);
    expect(workflowStartupSendingDestinationReady([
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ],'run')).toBe(true);
    expect(workflowStartupSendingDestinationReady([
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ],'run')).toBe(false);
    expect(workflowStartupSendingDestinationReady([
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ],'')).toBe(false);
  });

  it('forgets a completed presentation after the generation identity leaves',() => {
    const { result,rerender } = renderHook(
      ({ generation,reset }) => useWorkflowStartupPresentation(generation,reset),
      { initialProps:{ generation:'run-1',reset:false } },
    );
    act(() => result.current.onPresentationComplete('run-1'));
    expect(result.current.presented).toBe(true);
    rerender({ generation:'world-camera',reset:false });
    expect(result.current.presented).toBe(false);
    rerender({ generation:'run-1',reset:false });
    expect(result.current.presented).toBe(false);
  });

  it('forgets a completed presentation when the startup is stopped',() => {
    const { result,rerender } = renderHook(
      ({ generation,reset }) => useWorkflowStartupPresentation(generation,reset),
      { initialProps:{ generation:'run-1',reset:false } },
    );
    act(() => result.current.onPresentationComplete('run-1'));
    expect(result.current.presented).toBe(true);
    rerender({ generation:'run-1',reset:true });
    expect(result.current.presented).toBe(false);
    rerender({ generation:'run-1',reset:false });
    expect(result.current.presented).toBe(false);
  });

  it('keeps passed rails lit, sends only into the next stage, and uses circular marks',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('camera','ready','usb_cam'),
      stage('media','active','media.example.test'),
      stage('calibrator','pending','Idle'),
    ];
    expect(workflowStartupRailState('starting',stages)).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:1,
      currentId:'media',
      visualComplete:false,
      factsReady:false,
    });
    expect(workflowStartupRailState('starting',stages,1,'',new Set(['run']))).toEqual({
      sendingId:'camera',
      passed:new Set(['run']),
      lastReadyIndex:1,
      currentId:'media',
      visualComplete:false,
      factsReady:false,
    });
    render(
      <WorkflowStartupPipeline
        id="panel-a"
        title="Calibration pipeline"
        phase="starting"
        stages={stages}
      />,
    );
    expect(document.querySelector('[data-xgc-id="panel-a:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','false');
    expect(document.querySelector('[data-xgc-id="panel-a:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="panel-a:media"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="panel-a:camera"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="panel-a:camera"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','false');
    expect(document.querySelector('[data-xgc-id="panel-a:media"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="panel-a:media"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','false');
    expect(document.querySelector('.workflow-startup-pipeline-mark')?.tagName).toBe('SPAN');
    expect(document.querySelector('.workflow-startup-pipeline-stage button')).toBeNull();
    expect(screen.getByText('usb_cam')).toBeInTheDocument();
    expect(document.querySelector('.workflow-startup-pipeline-bars')).toBeNull();
    expect(document.querySelector('.workflow-startup-pipeline-row')).toBeNull();
    expect(document.querySelector('.workflow-startup-pipeline-track')).toBeNull();
  });

  it('does not send on the rail after the current stage',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('camera','active','usb_cam · starting'),
      stage('media','pending','media.example.test'),
    ];
    expect(workflowStartupRailState('starting',stages)).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:0,
      currentId:'camera',
      visualComplete:false,
      factsReady:false,
    });
  });

  it('fills the arrived step and does not send until the next stage is active',() => {
    const arrived = [
      stage('run','ready','Admitted'),
      stage('viewer','pending','Idle'),
      stage('bridge','pending','Idle'),
    ];
    expect(workflowStartupRailState('starting',arrived)).toEqual({
      sendingId:'',
      passed:new Set(),
      lastReadyIndex:0,
      currentId:'run',
      visualComplete:false,
      factsReady:false,
    });
    const view = render(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" stages={arrived} />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','active','lichtblick-web'),
          stage('bridge','pending','Idle'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
  });

  it('does not fill or send from a later active process until that stage is the wait target',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web'),
      stage('bridge','active','foxglove-bridge'),
    ];
    expect(workflowStartupRailState('starting',stages)).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:0,
      currentId:'viewer',
      visualComplete:false,
      factsReady:false,
    });
    render(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" stages={stages} />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"]')).toHaveAttribute('data-current','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:bridge"]')).toHaveAttribute('data-current','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
  });

  it('plays already-ready prefix rails instead of auto-passing them',() => {
    const started = [
      stage('run','ready','Admitted'),
      stage('camera','ready','gazebo_world_camera'),
      stage('media','pending','media.example.test'),
    ];
    const latched = workflowStartupRailState('starting',started);
    expect(latched).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:1,
      currentId:'camera',
      visualComplete:false,
      factsReady:false,
    });
    expect(workflowStartupRailState('starting',[
      stage('run','ready','Admitted'),
      stage('camera','pending','gazebo_world_camera'),
      stage('media','pending','media.example.test'),
    ],latched.lastReadyIndex,'',new Set(['run']))).toEqual({
      sendingId:'',
      passed:new Set(['run']),
      lastReadyIndex:1,
      currentId:'camera',
      visualComplete:false,
      factsReady:false,
    });
    const view = render(
      <WorkflowStartupPipeline id="world-camera" title="Calibration camera" phase="starting" stages={started} />,
    );
    expect(document.querySelector('[data-xgc-id="world-camera:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    view.rerender(
      <WorkflowStartupPipeline id="world-camera" title="Calibration camera" phase="starting" paused stages={started} />,
    );
    expect(document.querySelector('[data-xgc-id="world-camera:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
    view.rerender(
      <WorkflowStartupPipeline
        id="world-camera"
        title="Calibration camera"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('camera','pending','gazebo_world_camera'),
          stage('media','pending','media.example.test'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-id="world-camera:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="world-camera:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
    expect(document.querySelector('[data-xgc-id="world-camera:camera"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="world-camera:camera"]')).toHaveAttribute('data-current','true');
  });

  it('keeps fetch errors on the failed stage title and does not invert that mark in copy',() => {
    const stages = [
      stage('run','failed','unavailable','Failed to fetch'),
      stage('viewer','pending','Idle'),
      stage('bridge','pending','Idle'),
    ];
    expect(workflowStartupRailState('starting',stages).currentId).toBe('run');
    expect(workflowStartupPresentationComplete('starting',stages,new Set(['run','viewer']))).toBe(false);
    render(<WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" stages={stages} />);
    const run = document.querySelector('[data-xgc-role="workflow-startup-pipeline-stage"][data-xgc-id="lichtblick:run"]')!;
    expect(run).toHaveAttribute('data-current','true');
    expect(run).toHaveAttribute('data-xgc-status','failed');
    expect(run).toHaveAttribute('title','Failed to fetch');
    expect(run).not.toHaveTextContent(/Failed to fetch/i);
    expect(run.querySelector('.workflow-startup-pipeline-fact')).toHaveTextContent('unavailable');
  });

  it('keeps an in-flight send until the destination arrives, even if it flickers pending',() => {
    const sending = workflowStartupRailState('starting',[
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web · starting'),
      stage('bridge','pending','No bridge'),
    ]);
    expect(sending).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:0,
      currentId:'viewer',
      visualComplete:false,
      factsReady:false,
    });
    expect(workflowStartupRailState('starting',[
      stage('run','ready','Admitted'),
      stage('viewer','pending','No viewer'),
      stage('bridge','pending','No bridge'),
    ],sending.lastReadyIndex,sending.sendingId)).toEqual({
      sendingId:'run',
      passed:new Set(),
      lastReadyIndex:0,
      currentId:'run',
      visualComplete:false,
      factsReady:false,
    });
  });

  it('does not replay a rail that already finished sending',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web · starting'),
      stage('bridge','pending','No bridge'),
    ];
    expect(workflowStartupRailState('starting',stages,0,'',new Set(['run']))).toEqual({
      sendingId:'',
      passed:new Set(['run']),
      lastReadyIndex:0,
      currentId:'viewer',
      visualComplete:false,
      factsReady:false,
    });
    expect(workflowStartupRailState('starting',[
      stage('run','ready','Admitted'),
      stage('viewer','pending','No viewer'),
      stage('bridge','pending','No bridge'),
    ],0,'run',new Set(['run']))).toEqual({
      sendingId:'',
      passed:new Set(['run']),
      lastReadyIndex:0,
      currentId:'run',
      visualComplete:false,
      factsReady:false,
    });
  });

  it('completes an in-flight send when the surface is paused instead of replaying later',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','active','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ];
    const view = render(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" stages={stages} />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    view.rerender(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" paused stages={stages} />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
    view.rerender(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="starting" stages={stages} />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
  });

  it('does not notify presentation while parked even after rails catch up',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','ready','foxglove-bridge'),
    ];
    const onPresentationComplete = vi.fn();
    render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-1"
        title="Lichtblick"
        phase="starting"
        paused
        stages={stages}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-visual-complete','false');
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','true');
    expect(onPresentationComplete).not.toHaveBeenCalled();
  });

  it('notifies presentation only after both rails have played and the complete marks have painted',async() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','ready','foxglove-bridge'),
    ];
    const onPresentationComplete = vi.fn();
    render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-1"
        title="Lichtblick"
        phase="starting"
        stages={stages}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"]'))
      .toHaveAttribute('data-xgc-status','ready');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"]'))
      .toHaveAttribute('data-xgc-status','ready');
    expect(document.querySelector('[data-xgc-id="lichtblick:bridge"]'))
      .toHaveAttribute('data-xgc-status','ready');
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','true');
    expect(onPresentationComplete).not.toHaveBeenCalled();
    await playRail('lichtblick','run');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','true');
    await playRail('lichtblick','viewer');
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
        .toHaveAttribute('data-xgc-visual-complete','true');
      expect(onPresentationComplete).toHaveBeenCalledWith('run-1');
    });
    expect(onPresentationComplete).toHaveBeenCalledTimes(1);
  });

  it('does not restart an in-flight send when facts become ready, and catches up the rest',async() => {
    const view = render(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','active','lichtblick-web'),
          stage('bridge','pending','No bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','false');
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','false');
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','ready','lichtblick-web'),
          stage('bridge','ready','foxglove-bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','false');
    await playRail('lichtblick','run');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','true');
  });

  it('catches up a new send into an already-ready destination before later stages are ready',() => {
    render(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','ready','lichtblick-web'),
          stage('bridge','pending','No bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','true');
  });

  it('does not switch an in-flight send to catch-up CSS when its destination becomes ready',() => {
    const view = render(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','active','lichtblick-web'),
          stage('bridge','pending','No bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','false');
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','ready','lichtblick-web'),
          stage('bridge','pending','No bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-facts-ready','false');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-catch-up','false');
  });

  it('keeps passed rails when the same generation rerenders',async() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','ready','foxglove-bridge'),
    ];
    const view = render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-1"
        title="Lichtblick"
        phase="starting"
        stages={stages}
      />,
    );
    await playRail('lichtblick','run');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-1"
        title="Lichtblick"
        phase="starting"
        stages={stages}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-passed','true');
    expect(document.querySelector('[data-xgc-id="lichtblick:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
  });

  it('does not treat a failed startup as visually complete',() => {
    const onPresentationComplete = vi.fn();
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','failed','lichtblick-web'),
      stage('bridge','pending','No bridge'),
    ];
    render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-2"
        title="Lichtblick"
        phase="starting"
        stages={stages}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    expect(document.querySelector('[data-xgc-id="lichtblick:viewer"]')).toHaveAttribute('data-xgc-status','failed');
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-visual-complete','false');
    expect(onPresentationComplete).not.toHaveBeenCalled();
  });

  it('ignores a stale presentation callback from a previous generation',async() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('viewer','ready','lichtblick-web'),
      stage('bridge','ready','foxglove-bridge'),
    ];
    const onPresentationComplete = vi.fn();
    const view = render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-old"
        title="Lichtblick"
        phase="starting"
        stages={stages}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    await playBothRails('lichtblick');
    await waitFor(() => expect(onPresentationComplete).toHaveBeenCalledWith('run-old'));
    onPresentationComplete.mockClear();
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-new"
        title="Lichtblick"
        phase="starting"
        stages={stages}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-generation','run-new');
    expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
      .toHaveAttribute('data-xgc-visual-complete','false');
    expect(onPresentationComplete).not.toHaveBeenCalled();
  });

  it('snaps remaining rails when reduced motion is requested and then notifies',async() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));
    const onPresentationComplete = vi.fn();
    render(
      <WorkflowStartupPipeline
        id="lichtblick"
        generation="run-fast"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','ready','lichtblick-web'),
          stage('bridge','ready','foxglove-bridge'),
        ]}
        onPresentationComplete={onPresentationComplete}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-xgc-role="workflow-startup-pipeline"]'))
        .toHaveAttribute('data-xgc-visual-complete','true');
      expect(onPresentationComplete).toHaveBeenCalledWith('run-fast');
    });
  });

  it('sizes the frame from reserved copy and does not drop longer samples when live facts shrink',() => {
    expect(workflowStartupWidthCopy('Lichtblick',[
      { title:'Run',fact:'No run',reserve:['Admitted','unavailable'] },
      { title:'Viewer',fact:'No viewer',reserve:workflowStartupIdentityFactSamples('lichtblick-web') },
    ],{ titles:[],facts:['foxglove-bridge · starting'] })).toEqual({
      titles:['Lichtblick','Run','Viewer'],
      facts:[
        'No run',
        'No viewer',
        'Admitted',
        'unavailable',
        ...workflowStartupIdentityFactSamples('lichtblick-web'),
        'foxglove-bridge · starting',
      ],
    });
    const short = [
      { ...stage('run','pending','No run'),reserve:['No run','Admitted'] },
      { ...stage('viewer','pending','No viewer'),reserve:['No viewer','lichtblick-web · starting'] },
      { ...stage('bridge','pending','No bridge'),reserve:['No bridge','foxglove-bridge · starting'] },
    ];
    const view = render(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="stopped" stages={short} />,
    );
    const sizer = document.querySelector('.workflow-startup-pipeline-sizer') as HTMLElement;
    expect(sizer.querySelector('[data-sample="foxglove-bridge · starting"]')).not.toBeNull();
    expect(sizer.querySelector('[data-sample="Lichtblick"]')).not.toBeNull();
    expect(screen.getByText('No viewer')).toBeInTheDocument();
    view.rerender(
      <WorkflowStartupPipeline
        id="lichtblick"
        title="Lichtblick"
        phase="starting"
        stages={[
          stage('run','ready','Admitted'),
          stage('viewer','active','lichtblick-web · starting'),
          stage('bridge','pending','No bridge'),
        ]}
      />,
    );
    expect(document.querySelector('[data-sample="foxglove-bridge · starting"]')).not.toBeNull();
    view.rerender(
      <WorkflowStartupPipeline id="lichtblick" title="Lichtblick" phase="stopped" stages={short} />,
    );
    expect(document.querySelector('[data-sample="foxglove-bridge · starting"]')).not.toBeNull();
    expect(document.querySelector('[data-sample="lichtblick-web · starting"]')).not.toBeNull();
  });
});

async function playBothRails(id: string) {
  await playRail(id,'run');
  await playRail(id,'viewer');
}

async function playRail(id: string, stageId: string) {
  fireEvent.animationEnd(
    document.querySelector(`[data-xgc-id="${id}:${stageId}"] .workflow-startup-pipeline-send`)!,
    { animationName:'workflow-startup-send',elapsedTime:1.6,pseudoElement:'' },
  );
  await waitFor(() => {
    expect(document.querySelector(`[data-xgc-id="${id}:${stageId}"] .workflow-startup-pipeline-rail`))
      .toHaveAttribute('data-passed','true');
  });
}

function stage(
  id: string,
  status: 'pending' | 'active' | 'ready' | 'failed',
  fact: string,
  detail?: string,
) {
  return { id,title:id,fact,status,icon:<span />,...(detail ? { detail } : {}) };
}
