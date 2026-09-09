// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import { cameraStreamPanelDefaultRows } from '../../../shared/dashboardGeometry';
import { PanelLibraryDrawer } from './PanelLibraryDrawer';
import { LanguageProvider } from '../../../shared/localization/LanguageProvider';

describe('PanelLibraryDrawer', () => {
  it('renders built-in panel metadata in the selected language', () => {
    const { container } = render(
      <LanguageProvider language="zh-CN">
        <PanelLibraryDrawer
          dashboard={{ id:'gcs',name:'地面站',description:'',panels:[] }}
          onClose={vi.fn()}
          onAdd={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole('button',{ name:/ROS 控制/ })).toHaveTextContent('ROS 控制');
    expect(panelItem(container,'ros-basic-services-control'))
      .toHaveTextContent('通过控制和白板视图管理可信的 ROS');
    expect(container).not.toHaveTextContent('Control trusted ROS');
  });

  it('offers the supported built-in dashboard panels', () => {
    const onAdd = vi.fn();
    const { container } = render(
      <PanelLibraryDrawer
        dashboard={{ id: 'gcs', name: 'GCS', description: '',panels: [] }}
        onClose={vi.fn()}
        onAdd={onAdd}
      />,
    );

    expect(panelItem(container, 'px4-rotor-control-panel')).toBeInTheDocument();
    for (const id of [
      'automation-workflow-control','automation-workflow-audit','ros-basic-services-control','robot-instruments-grid',
      'px4-rotor-control-panel','xgc2-lichtblick','camera-video','multi-camera-monitor','gazebo-world-camera',
      'camera-intrinsic-calibration',
      'ground-station-activity',
      'rosbag-plot',
    ]) {
      expect(panelItem(container, id)).toBeInTheDocument();
      expect(container.querySelector(`[data-xgc-role="panel-library-item"][data-xgc-id="${id}"] .panel-library-preview`)).toBeNull();
      expect(container.querySelector(`[data-xgc-role="panel-library-item"][data-xgc-id="${id}"] em`)).toBeNull();
    }
    expect(screen.getByRole('button', { name: /Automation Control/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Automation Logs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ROS Control/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Camera video/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Multi-camera monitor/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Camera extrinsic calibration/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Camera intrinsic calibration/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rosbag plot/ })).toBeInTheDocument();
    expect(panelItem(container, 'unknown')).toBeNull();
    expect(getPanelPlugin('unknown')).toBeUndefined();
    expect(screen.getByRole('dialog', { name: 'Panel library for GCS' })).not.toHaveTextContent('Add a panel to GCS');
    expect(container.querySelector('[data-xgc-role="panel-library-drawer"]')).not.toHaveTextContent('Drag a panel into the dashboard');

    expect(getPanelPlugin('robot-instruments-grid')).toMatchObject({
      capabilities: ['visualization','experiment','automation'],
      backendCapabilities: [
        'operations.robot.read','operations.process.control','operations.job.control',
        'automations.read','automations.run','robot.read',
      ],
      permissions: [
        'operations.robot.read','operations.process.control','operations.job.control',
        'automations.read','automations.run','robot.read',
      ],
      executionTargetPolicy: 'local',
    });
    expect(getPanelPlugin('robot-instruments-grid')?.backendCapabilities).not.toContain('automations.panel-session');
    const cameraVideo = getPanelPlugin('camera-video');
    expect(cameraVideo).toMatchObject({
      capabilities: ['visualization','experiment','execution','automation'],
      executionTargetPolicy: 'dashboard',configureOnCreate: true,
      dataPorts: [{ id:'video',label:'Camera video',contract:'camera.video.v1' }],
      actionPorts:[{ id:'b2-onboard-media',label:'Media service',actionKinds:['service'] }],
    });
    expect(cameraVideo?.backendCapabilities).toEqual([
      'automations.read','automations.run','experiment.read',
      'operations.process.read','operations.events.read',
    ]);
    expect(cameraVideo?.permissions).toEqual(cameraVideo?.backendCapabilities);
    const multiCamera = getPanelPlugin('multi-camera-monitor');
    expect(multiCamera).toMatchObject({
      capabilities:['visualization'],executionTargetPolicy:'local',
      configureOnCreate:true,
      dataPorts:[{ id:'videos',label:'Camera videos',contract:'camera.video.v1',required:true }],
    });
    expect(multiCamera?.backendCapabilities).toBeUndefined();
    expect(multiCamera?.permissions).toBeUndefined();
    expect(getPanelPlugin('camera-intrinsic-calibration')).toMatchObject({
      capabilities: ['visualization','experiment','execution','automation'],
      backendCapabilities: [
        'automations.read','automations.run','experiment.read',
        'operations.process.read','operations.process.control','operations.events.read',
      ],
      permissions: [
        'automations.read','automations.run','experiment.read',
        'operations.process.read','operations.process.control','operations.events.read',
      ],
      executionTargetPolicy: 'dashboard',configureOnCreate: false,
      dataPorts: expect.arrayContaining([
        expect.objectContaining({ contract:'camera.video.v1' }),
        expect.objectContaining({ contract:'camera.calibration.intrinsic.v1' }),
      ]),
    });
    const worldCamera = getPanelPlugin('gazebo-world-camera');
    expect(worldCamera).toMatchObject({
        capabilities: ['visualization','experiment','execution','automation'],
        executionTargetPolicy: 'dashboard',configureOnCreate: false,
        defaultPanel: expect.objectContaining({
          title: 'Gazebo world camera',
          gridPos: { x:23,y:5,w:7,h: cameraStreamPanelDefaultRows({ panelWidthCols: 7 }) },
        }),
      });
    expect(worldCamera?.backendCapabilities).toEqual(expect.arrayContaining([
      'automations.read','automations.run','operations.process.read','operations.process.control',
    ]));
    expect(worldCamera?.dataPorts?.map((port) => port.contract)).toEqual(expect.arrayContaining([
      'experiment.runtime.v1','camera.calibration.extrinsic.v1',
    ]));
    expect(getPanelPlugin('xgc2-lichtblick')).toMatchObject({
      executionTargetPolicy: 'dashboard',
    });
    expect(getPanelPlugin('xgc2-lichtblick')?.backendCapabilities).not.toContain('operations.process.control');
    expect(getPanelPlugin('xgc2-lichtblick')?.permissions).not.toContain('operations.process.control');
    expect(getPanelPlugin('ground-station-activity')).toMatchObject({
      executionTargetPolicy: 'dashboard',configureOnCreate: false,
      panelWorkflowControls: 'hidden',
      backendCapabilities: ['operations.events.read','ground-station.interactions.read','ground-station.interactions.respond'],
      permissions: ['operations.events.read','ground-station.interactions.read','ground-station.interactions.respond'],
    });
    expect(getPanelPlugin('ground-station-activity')?.maxInstancesPerDashboard).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /Robot control/i }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'px4-rotor-control-panel' }));
    expect(getPanelPlugin('px4-rotor-control-panel')).toMatchObject({
      name: 'Robot control',
      description: 'Switch between UAV, UGV, and Remote control views for the Experiment robots.',
      panelWorkflowControls: 'hidden',
      backendCapabilities: ['operations.robot.read','operations.robot.control','automations.read','automations.run'],
      permissions: ['operations.robot.read','operations.robot.control','automations.read','automations.run'],
      executionTargetPolicy: 'local',
      configureOnCreate: false,
      configExposure: { actionDefaults:'hidden' },
      actionPorts: expect.arrayContaining([
        expect.objectContaining({ id:'preflight-arm-test',actionKinds:['command'] }),
        expect.objectContaining({ id:'arm',actionKinds:['command'] }),
        expect.objectContaining({ id:'remote-control',actionKinds:['command'] }),
      ]),
      defaultPanel: expect.objectContaining({ title: 'Robot control' }),
    });
    expect(getPanelPlugin('px4-rotor-control-panel')?.optionsEditor).toBeTruthy();
    expect(getPanelPlugin('px4-rotor-control-panel')?.optionSchema).toMatchObject({
      springReturn: { type: 'boolean' },
    });
    expect(getPanelPlugin('px4-rotor-control-panel')?.validatePanel).toBeUndefined();
  });

  it('allows another Lichtblick instance when one is already present on the dashboard', () => {
    const onAdd = vi.fn();
    const { container } = render(
      <PanelLibraryDrawer
        dashboard={{
          id: 'gcs',name: 'GCS',description: '',
          panels: [{ id: 'lichtblick',pluginId: 'xgc2-lichtblick' } as never],
        }}
        onClose={vi.fn()}
        onAdd={onAdd}
      />,
    );

    const lichtblick = panelItem(container, 'xgc2-lichtblick') as HTMLButtonElement;
    expect(lichtblick).toBeEnabled();
    expect(lichtblick).toHaveAttribute('draggable', 'true');
    expect(lichtblick).not.toHaveAttribute('title');
    fireEvent.click(lichtblick);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'xgc2-lichtblick' }));
  });
});

function panelItem(container: HTMLElement, id: string) {
  return container.querySelector(`[data-xgc-role="panel-library-item"][data-xgc-id="${id}"]`);
}
