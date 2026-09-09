// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { PanelInstance } from '../../domains/experiment/experimentPublic';
import { rosBasicServicesPanelPlugin } from './manifest';
import { RosBasicServicesPanelOptionsEditor } from './RosBasicServicesPanelOptionsEditor';

describe('RosBasicServicesPanelOptionsEditor',() => {
  it('keeps runMode runtime-bound while allowing the physical VRPN host to be authored',() => {
    const onWorkflowParameterChange=vi.fn();
    const { container }=render(<RosBasicServicesPanelOptionsEditor
      panel={panel()} executionTargetId="local" dashboardPanels={[]}
      options={{}}
      actionPresetAuthoring={{
        'workflow-parameters':{
          values:{
            runMode:'hybrid',
            physicalVrpnServerHost:'192.168.51.2',
          },
          onChange:onWorkflowParameterChange,
        },
      }}
      onChange={vi.fn()}
    />);

    expect(rosBasicServicesPanelPlugin.runtimeBoundActionDefaults).toEqual([
      'runMode',
    ]);
    expect(screen.queryByText('Hybrid VRPN remaps')).toBeNull();

    const host=screen.getByRole('textbox',{ name:'Physical VRPN server host' });
    expect(host).toHaveValue('192.168.51.2');
    expect(host).toHaveAttribute('required');
    expect(container.querySelector(
      '[data-xgc-role="ros-basic-services-physical-vrpn-server-host"][data-xgc-id="ros-control"]',
    )).toContainElement(host);
    fireEvent.change(host,{ target:{ value:'mocap.field.local' } });
    expect(onWorkflowParameterChange).toHaveBeenCalledWith(
      'physicalVrpnServerHost','mocap.field.local',
    );
  });

  it('keeps unbound system capabilities visible but non-editable',() => {
    const onChange=vi.fn();
    const { container }=render(<RosBasicServicesPanelOptionsEditor
      panel={panel()} executionTargetId="local" dashboardPanels={[]}
      options={{
        layoutButtonsPerRow:3,
        layoutServiceOrder:['roscore','adapters','gzserver','gzclient','rviz','vrpn'],
        layoutHiddenServices:['rviz','vrpn'],
      }}
      onChange={onChange}
    />);

    expect(container.querySelectorAll('[data-xgc-role="ros-basic-service-layout"]')).toHaveLength(6);
    const adapters=container.querySelector('[data-xgc-role="ros-basic-service-layout"][data-xgc-id="ros-control:adapters"]')!;
    expect(adapters).toHaveTextContent('Robot adapters');
    expect(adapters).toHaveTextContent('Not connected');
    expect(adapters.querySelector('[data-xgc-role="ros-basic-service-shown"]')).toHaveAttribute('data-disabled','true');
    expect(screen.getByRole('button',{ name:'Move Robot adapters earlier' })).toBeDisabled();
    expect(screen.getByRole('button',{ name:'Move Robot adapters later' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps display and automatic startup separate and authors startup through the workflow preset',() => {
    const onChange=vi.fn();
    const onWorkflowParameterChange=vi.fn();
    const { container }=render(<RosBasicServicesPanelOptionsEditor
      panel={panel()} executionTargetId="local" dashboardPanels={[]}
      options={{
        layoutButtonsPerRow:3,
        layoutServiceOrder:['roscore','gzserver','vrpn','adapters','rviz','gzclient'],
        layoutHiddenServices:[],
      }}
      actionPresetAuthoring={{
        'workflow-parameters':{
          values:{
            autoStartRos:true,autoStartGazeboServer:true,autoStartVrpn:true,
            autoStartAdapters:false,autoStartRviz:false,autoStartGazeboClient:false,
          },
          onChange:onWorkflowParameterChange,
        },
      }}
      onChange={onChange}
    />);

    expect(container.querySelectorAll('[data-xgc-role="ros-basic-service-auto-start"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-xgc-role="ros-basic-service-shown"]')).toHaveLength(6);
    expect(screen.getByRole('switch',{ name:'Auto start ROS' })).toBeChecked();
    expect(screen.getByRole('switch',{ name:'Show ROS button' })).toBeChecked();

    fireEvent.click(screen.getByRole('switch',{ name:'Auto start Gazebo server' }));
    expect(onWorkflowParameterChange).toHaveBeenLastCalledWith('autoStartGazeboServer',false);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch',{ name:'Show Gazebo server button' }));
    expect(onWorkflowParameterChange).toHaveBeenLastCalledWith('autoStartGazeboServer',false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      layoutHiddenServices:['gzserver'],
    }));
    expect(screen.getByRole('switch',{ name:'Auto start Robot adapters' })).toBeDisabled();
  });
});

function panel():PanelInstance {
  return {
    id:'ros-control',pluginId:'ros-basic-services-control',title:'ROS Control',
    gridPos:{ x:0,y:0,w:7,h:5 },query:{},options:{},fieldConfig:{},
    portBindings:['roscore','gzserver','gzclient','rviz','vrpn'].map((portId) => ({
      portId,kind:'action' as const,presetId:portId,
    })),
  };
}
