// @vitest-environment jsdom

import { fireEvent,render } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { RosBasicServicesControlsView } from './RosBasicServicesControlsView';
import { rosBasicServices } from './rosBasicServicesPanelModel';
import type { RosBasicServiceProjection } from './rosBasicServicesPanelProjection';

describe('RosBasicServicesControlsView',() => {
  it('exposes the actual disabled reason and becomes clickable when the port recovers',() => {
    const activate=vi.fn(async()=>undefined);
    const action={busy:false,disabledReason:'Waiting for the current Session',titleAttr:'Start ROS',activate};
    const props={buttonsPerRow:3,panelId:'ros-control',services:[projection('roscore','idle',0)]};
    const {container,rerender}=render(<RosBasicServicesControlsView {...props} actions={{roscore:action}} />);
    const button=()=>container.querySelector('[data-xgc-role="ros-basic-service-control"]')!;
    expect(button()).toBeDisabled();
    expect(button()).toHaveAttribute('title',action.disabledReason);
    fireEvent.click(button());expect(activate).not.toHaveBeenCalled();
    rerender(<RosBasicServicesControlsView {...props} actions={{roscore:{...action,disabledReason:''}}} />);
    expect(button()).not.toBeDisabled();
    expect(button()).toHaveAttribute('title','Start ROS');
    fireEvent.click(button());expect(activate).toHaveBeenCalledTimes(1);
  });

  it('keeps ready status copy neutral while exposing ready progress for the ROS vivid-success skin',() => {
    const { container } = render(<RosBasicServicesControlsView
      buttonsPerRow={3}
      panelId="ros-control"
      services={[
        projection('roscore','ready',100),
        projection('gzserver','running',50),
      ]}
    />);

    const ready = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:roscore"]')!;
    const running = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:gzserver"]')!;
    expect(ready).toHaveAttribute('data-xgc-status','ready');
    expect(ready).toHaveClass('ros-panel-service-status-card');
    expect(ready).toHaveAttribute('data-xgc-tone','neutral');
    expect(ready.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(running.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(ready).not.toHaveTextContent(/idle/i);
    expect(running).not.toHaveTextContent(/idle/i);
    expect(ready.querySelector('[role="progressbar"]')).toHaveAttribute('data-xgc-tone','success');
    expect(ready.querySelector('[role="progressbar"]'))
      .toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-measured)' });
    expect(running).toHaveAttribute('data-xgc-tone','neutral');
    expect(running.querySelector('[role="progressbar"]')).toHaveAttribute('data-xgc-tone','neutral');
    expect(running.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow','0');
    expect(running).not.toHaveTextContent('Action not connected');
    expect(running).not.toHaveTextContent('owned processes ready');
  });

  it('keeps a measured red fill after a workflow node fails and stays gray after a normal stop',() => {
    const { container,rerender } = render(<RosBasicServicesControlsView
      buttonsPerRow={3}
      panelId="ros-control"
      services={[projection('roscore','failed',100)]}
    />);
    const failed = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:roscore"]')!;
    expect(failed).toHaveAttribute('data-xgc-status','failed');
    expect(failed).toHaveAttribute('data-xgc-tone','neutral');
    expect(failed).toHaveAttribute('data-xgc-progress','100');
    expect(failed.querySelector('.xgc-progress')).toHaveStyle({ '--xgc-progress-fill':'var(--color-progress-failed)' });
    rerender(<RosBasicServicesControlsView
      buttonsPerRow={3}
      panelId="ros-control"
      services={[{
        ...projection('roscore','idle',0),
        runId:undefined,
        progress:{ ready:0,total:0,percent:0,active:0,failed:0 },
      }]}
    />);
    const idle = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:roscore"]')!;
    expect(idle).toHaveAttribute('data-xgc-status','idle');
    expect(idle.querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent':'0%' });
  });

  it('leaves idle as soon as Total Run has admitted a service without a child runId',() => {
    const service = rosBasicServices.find((candidate) => candidate.id === 'roscore')!;
    const { container } = render(<RosBasicServicesControlsView
      buttonsPerRow={3}
      panelId="ros-control"
      services={[{
        service,
        available:true,
        status:'waiting',
        stopping:false,
        progress:{ ready:0,total:0,percent:0,active:0,failed:0 },
        displayPercent:0,
        statusDescription:'Workflow waiting; no owned Process instances reported',
        processes:[],
      }]}
    />);
    const card = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:roscore"]')!;
    expect(card).toHaveAttribute('data-xgc-status','waiting');
    expect(card.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow','0');
    expect(card).not.toHaveAttribute('data-xgc-run-id');
  });

  it('does not reserve tile text for disconnected or empty workflow state',() => {
    const service = rosBasicServices.find((candidate) => candidate.id === 'roscore')!;
    const { container } = render(<RosBasicServicesControlsView
      buttonsPerRow={3}
      panelId="ros-control"
      services={[{
        service,
        available:false,
        status:'idle',
        stopping:false,
        progress:{ ready:0,total:0,percent:0,active:0,failed:0 },
        displayPercent:0,
        statusDescription:'Panel Workflow Action is not connected',
        processes:[],
      }]}
    />);

    const card = container.querySelector('[data-xgc-role="ros-basic-service-control"][data-xgc-id="ros-control:roscore"]')!;
    expect(card).not.toHaveTextContent('connect');
    expect(card.querySelector('.xgc-workflow-status-card-metrics')).toHaveTextContent('');
    expect(card.querySelector('.xgc-workflow-status-card-heading em')).toBeNull();
    expect(card).not.toHaveTextContent(/idle/i);
  });
});

function projection(
  id:'roscore'|'gzserver',
  status:string,
  displayPercent:number,
):RosBasicServiceProjection {
  const service = rosBasicServices.find((candidate) => candidate.id === id)!;
  return {
    service,
    available:true,
    runId:`run-${id}`,
    status,
    stopping:false,
    progress:{ ready:displayPercent === 100 ? 1 : 0,total:1,percent:displayPercent,active:1,failed:0 },
    displayPercent,
    statusDescription:`${status} service`,
    processes:[],
  };
}
