// @vitest-environment jsdom

import { render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { WorkflowStartupPipeline } from './WorkflowStartupPipeline';
import {
  workflowStartupIdentityFactSamples,
  workflowStartupRailState,
  workflowStartupWidthCopy,
} from './workflowStartupPipelineModel';

describe('WorkflowStartupPipeline',() => {
  it('keeps passed rails lit, sends only into the next stage, and uses circular marks',() => {
    const stages = [
      stage('run','ready','Admitted'),
      stage('camera','ready','usb_cam'),
      stage('media','active','media.example.test'),
      stage('calibrator','pending','Idle'),
    ];
    expect(workflowStartupRailState('starting',stages)).toEqual({
      sendingId:'camera',
      passed:new Set(['run']),
      lastReadyIndex:1,
      currentId:'media',
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
      .toHaveAttribute('data-passed','true');
    expect(document.querySelector('[data-xgc-id="panel-a:run"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
    expect(document.querySelector('[data-xgc-id="panel-a:media"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="panel-a:camera"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','true');
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

  it('keeps sending on the current rail and does not jump back if an earlier stage flickers',() => {
    const started = [
      stage('run','ready','Admitted'),
      stage('camera','ready','gazebo_world_camera'),
      stage('media','pending','media.example.test'),
    ];
    const latched = workflowStartupRailState('starting',started);
    expect(latched).toEqual({
      sendingId:'',
      passed:new Set(['run']),
      lastReadyIndex:1,
      currentId:'camera',
    });
    expect(workflowStartupRailState('starting',[
      stage('run','ready','Admitted'),
      stage('camera','pending','gazebo_world_camera'),
      stage('media','pending','media.example.test'),
    ],latched.lastReadyIndex)).toEqual({
      sendingId:'',
      passed:new Set(['run']),
      lastReadyIndex:1,
      currentId:'camera',
    });
    const view = render(
      <WorkflowStartupPipeline id="world-camera" title="Calibration camera" phase="starting" stages={started} />,
    );
    expect(document.querySelector('[data-xgc-id="world-camera:camera"]')).toHaveAttribute('data-current','true');
    expect(document.querySelector('[data-xgc-id="world-camera:camera"] .workflow-startup-pipeline-rail'))
      .toHaveAttribute('data-sending','false');
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

function stage(
  id: string,
  status: 'pending' | 'active' | 'ready' | 'failed',
  fact: string,
  detail?: string,
) {
  return { id,title:id,fact,status,icon:<span />,...(detail ? { detail } : {}) };
}
