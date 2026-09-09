// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';

vi.mock('../../automation/automationTargetService',() => ({
  listAutomationTargetFiles: vi.fn(async (_target:string, path:string) => ({
    path,
    parent:'/',
    entries:[{
      name:'intrinsics-20260904T021713.263963Z.yaml',
      path:`${path}/intrinsics-20260904T021713.263963Z.yaml`,
      isDir:false,
    }],
  })),
}));
import { newAutomationSpec,type AutomationDocument } from '../../automation/automationPublic';
import { newExperimentSpec,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { DEFAULT_LOCAL_MEDIA_EDGE_URL } from '../../../config/urls';
import { GAZEBO_WORLD_CAMERA_DEFAULTS } from '../../../panels/camera/gazeboWorldCameraPanelModel';
import { PanelConfigDrawer } from './PanelConfigDrawer';

describe('PanelConfigDrawer Connections',() => {
  it('authors one Panel Workflow and derives Action presets from it',() => {
    const onSave = vi.fn();
    render(<PanelConfigDrawer panel={panel()} coreNodes={[]} executionTargetId="local"
      automationDocuments={[worker()]} experiment={experiment()} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button',{ name:'Panel workflow' }));
    fireEvent.click(screen.getByRole('option',{ name:/worker \/ default/ }));
    fireEvent.click(screen.getByRole('button',{ name:'Add workflow Action' }));
    fireEvent.click(screen.getByRole('option',{ name:'Run' }));
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      portBindings:expect.arrayContaining([
        expect.objectContaining({ kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:true }),
        { portId:'action-default',kind:'action',presetId:'default' },
      ]),
    }),expect.any(Array));
  });

  it('shows only fixed workflow Action inputs without leaking Automation value-source controls',() => {
    const onSave = vi.fn();
    const value = panel();
    const configuredExperiment = experiment();
    configuredExperiment.spec.workflowInstances[0]!.actionPresets[0]!.parameterBindings = [{
      target:'/speed',expression:'{{ $run.parameters.speed }}',language:'xgc-expression-v2',
    }];
    value.portBindings.push(
      { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'worker',presetId:'default',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
      { portId:'workflow',kind:'action',presetId:'default' },
    );
    const { container } = render(<PanelConfigDrawer panel={value} coreNodes={[]} executionTargetId="local"
      automationDocuments={[worker()]} experiment={configuredExperiment} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole('spinbutton',{ name:'Speed' })).toHaveValue(1);
    expect(screen.getByRole('textbox',{ name:'Allowed Web origins' })).toHaveValue('https://gcs.example');
    expect(container.querySelector('[data-xgc-role="panel-action-port-defaults"] .xgc-form-section-title'))
      .toHaveTextContent('Run');
    expect(screen.queryByText('Run defaults')).toBeNull();
    expect(screen.queryByRole('group',{ name:/value source/ })).toBeNull();
    expect(document.querySelector('[data-xgc-role="segmented-control"]')).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton',{ name:'Speed' }),{ target:{ value:'2' } });
    fireEvent.click(screen.getByRole('button',{ name:'Save' }));

    expect(onSave.mock.calls[0]?.[1][0].actionPresets[0].inputs).toEqual({
      speed:2,allowedOrigins:'https://gcs.example',
    });
    expect(onSave.mock.calls[0]?.[1][0].actionPresets[0].parameterBindings).toEqual([{
      target:'/speed',expression:'{{ $run.parameters.speed }}',language:'xgc-expression-v2',
    }]);
  });

  it('does not expose the protected Robot control routing discriminator as editable defaults',() => {
    const { container }=render(<PanelConfigDrawer
      panel={robotControlPanel()} coreNodes={[]} executionTargetId="local"
      automationDocuments={[robotControlWorkflow()]} experiment={robotControlExperiment()}
      onClose={vi.fn()} onSave={vi.fn()}
    />);
    const drawer=container.querySelector<HTMLElement>(
      '[data-xgc-role="panel-config-drawer"][data-xgc-id="robot-control"]',
    )!;

    expect(drawer.querySelector('[data-xgc-role="panel-config-connections"]')).toBeInTheDocument();
    expect(drawer.querySelector('[data-xgc-role="panel-action-port-defaults"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="robot-remote-spring-return"]')).toBeInTheDocument();
    expect(within(drawer).getByRole('switch',{ name:'Spring return' })).not.toBeChecked();
    expect(within(drawer).queryByText('Panel command')).toBeNull();
    expect(within(drawer).queryByText('Robot IDs')).toBeNull();
    expect(within(drawer).queryByText('Flight mode')).toBeNull();
  });

  it('routes ROS automatic startup through its declared workflow-parameter authoring port',() => {
    const onSave=vi.fn();
    const value=rosControlPanel();
    const configuredExperiment=rosControlExperiment();
    const { container }=render(<PanelConfigDrawer
      panel={value} coreNodes={[]} executionTargetId="local"
      automationDocuments={[rosControlWorkflow()]} experiment={configuredExperiment}
      onClose={vi.fn()} onSave={onSave}
    />);

    const gzserver=container.querySelector<HTMLElement>(
      '[data-xgc-role="ros-basic-service-layout"][data-xgc-id="ros-control:gzserver"]',
    )!;
    expect(within(gzserver).getByRole('switch',{ name:'Auto start Gazebo server' })).toBeChecked();
    expect(within(gzserver).getByRole('switch',{ name:'Show Gazebo server button' })).toBeChecked();

    fireEvent.click(within(gzserver).getByRole('switch',{ name:'Auto start Gazebo server' }));
    fireEvent.click(container.querySelector('[data-xgc-role="panel-config-save"]')!);

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].options).not.toHaveProperty('autoStartGazeboServer');
    const savedStart=onSave.mock.calls[0]?.[1][0].actionPresets.find(
      (preset: { id:string }) => preset.id === 'start',
    );
    expect(savedStart.inputs).toMatchObject({ autoStartRos:true,autoStartGazeboServer:false });
  });

  it('exposes intrinsic camera connection inputs while hiding internal infrastructure defaults',() => {
    const value = cameraIntrinsicPanel();
    const configuredExperiment = cameraIntrinsicExperiment();
    const onSave = vi.fn();
    const { container } = render(<PanelConfigDrawer panel={value} coreNodes={[]} executionTargetId="local"
      automationDocuments={[cameraIntrinsicWorkflow()]} experiment={configuredExperiment}
      onClose={vi.fn()} onSave={onSave} />);
    const drawer = container.querySelector<HTMLElement>(
      '[data-xgc-role="panel-config-drawer"][data-xgc-id="camera-intrinsic-calibration"]',
    )!;
    const save = drawer.querySelector<HTMLButtonElement>(
      '[data-xgc-role="panel-config-save"][data-xgc-id="camera-intrinsic-calibration"]',
    )!;

    expect(save).toBeDisabled();

    const workflow = within(drawer).getByRole('button',{ name:'Workflow' });
    expect(workflow).toHaveTextContent(
      'Camera intrinsic calibration Panel Workflow — Start camera intrinsic calibration for Experiment',
    );
    fireEvent.click(workflow);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent(
      'Camera intrinsic calibration Panel Workflow — Start camera intrinsic calibration for Experiment',
    );
    fireEvent.click(screen.getByRole('option'));
    const captureContract = within(drawer).getByRole('button',{ name:'Simulation capture contract' });
    expect(captureContract).toHaveTextContent('3840 × 2160 · 30 fps · 110° HFOV');
    fireEvent.click(captureContract);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('3840 × 2160 · 30 fps · 110° HFOV');
    fireEvent.click(screen.getByRole('option'));
    const boardControl = drawer.querySelector<HTMLElement>(
      '[data-xgc-role="camera-intrinsic-board-profile"][data-xgc-id="camera-intrinsic-calibration"]',
    )!;
    const board = within(boardControl).getByRole('button',{ name:'Calibration board' });
    expect(board).toHaveTextContent('Field plate · 6×6 · 88 mm tags · 26.4 mm gap');
    fireEvent.click(board);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.click(screen.getByRole('option',{ name:'A4 sheet · 6×6 · 24 mm tags · 7.2 mm gap' }));
    expect(boardControl).toHaveAttribute('data-value','a4_6x6_24mm_30pct_kalibr_v1');
    expect(board).toHaveTextContent('A4 sheet · 6×6 · 24 mm tags · 7.2 mm gap');
    expect(save).toBeEnabled();

    expect(drawer.querySelector('[data-xgc-role="panel-config-connections"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-config-connections-summary"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-action-port-defaults"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-workflow-managed"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-workflow-relation"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-workflow-failure-policy"]')).toBeNull();
    expect(within(drawer).queryByText('Physical provider')).toBeNull();
    expect(within(drawer).queryByText('Simulation provider')).toBeNull();
    expect(within(drawer).queryByText('Shared Media source ID')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="camera-intrinsic-board-parameters"]')).toBeInTheDocument();
    expect(drawer.querySelector('[data-xgc-role="camera-intrinsic-capture-parameters"]')).toBeInTheDocument();
    expect(within(drawer).queryByText('Communication')).toBeNull();
    expect(within(drawer).queryByText('Lifecycle')).toBeNull();
    expect(within(drawer).queryByText('Run mode')).toBeNull();
    expect(within(drawer).queryAllByRole('textbox')).toHaveLength(4);
    expect(drawer.querySelector('[data-xgc-role="camera-intrinsic-connection-options"]')).toBeInTheDocument();
    expect(within(drawer).getByRole('textbox',{ name:'Physical V4L2 device' }))
      .toHaveValue('/dev/v4l/by-id/usb-camera-test-video-index0');
    expect(within(drawer).getByRole('textbox',{ name:'WebRTC / Media Edge URL' }))
      .toHaveValue(DEFAULT_LOCAL_MEDIA_EDGE_URL);
    expect(within(drawer).getByRole('textbox',{ name:'Media source ID' })).toHaveValue('usb_cam');
    expect(within(drawer).getByRole('textbox',{ name:'Camera name' })).toHaveValue('usb_cam');
    expect(within(drawer).getByRole('textbox',{ name:'Camera name' }))
      .toHaveAttribute('pattern','^[A-Za-z][A-Za-z0-9._-]{0,63}$');
    expect(within(drawer).getByRole('button',{ name:'Calibration board' }))
      .toHaveTextContent('A4 sheet · 6×6 · 24 mm tags · 7.2 mm gap');
    expect(within(drawer).getByRole('spinbutton',{ name:'Snapshot timeout (sec)' })).toHaveValue(5);
    expect(within(drawer).getByRole('spinbutton',{ name:'Detection/display width (px)' })).toHaveValue(960);
    expect(within(drawer).getByRole('spinbutton',{ name:'Reference JPEG quality' })).toHaveValue(80);

    fireEvent.change(within(drawer).getByRole('spinbutton',{ name:'Snapshot timeout (sec)' }),{ target:{ value:'6' } });
    fireEvent.change(within(drawer).getByRole('spinbutton',{ name:'Detection/display width (px)' }),{ target:{ value:'1280' } });
    fireEvent.change(within(drawer).getByRole('spinbutton',{ name:'Reference JPEG quality' }),{ target:{ value:'90' } });
    fireEvent.change(within(drawer).getByRole('textbox',{ name:'Camera name' }),{ target:{ value:'front_camera' } });
    fireEvent.change(within(drawer).getByRole('textbox',{ name:'Physical V4L2 device' }),{
      target:{ value:'/dev/v4l/by-id/usb-front-camera-video-index0' },
    });
    fireEvent.change(within(drawer).getByRole('textbox',{ name:'WebRTC / Media Edge URL' }),{
      target:{ value:'http://192.0.2.20:18090' },
    });
    fireEvent.change(within(drawer).getByRole('textbox',{ name:'Media source ID' }),{
      target:{ value:'front_camera' },
    });
    fireEvent.click(save);
    const savedPreset = onSave.mock.calls[0]?.[1][0].actionPresets[0];
    expect(savedPreset.inputs.physical).toMatchObject({
      boardProfile:'a4_6x6_24mm_30pct_kalibr_v1',
      snapshotTimeout:6,displayWidth:1280,jpegQuality:90,cameraName:'front_camera',
      videoDevice:'/dev/v4l/by-id/usb-front-camera-video-index0',
    });
    expect(savedPreset.inputs.simulation).toMatchObject({
      boardProfile:'a4_6x6_24mm_30pct_kalibr_v1',
      snapshotTimeout:6,displayWidth:1280,jpegQuality:90,cameraName:'front_camera',
    });
    expect(savedPreset.inputs.sourceId).toBe('front_camera');
    expect(onSave.mock.calls[0]?.[0].options).toMatchObject({
      edgeUrl:'http://192.0.2.20:18090',sourceId:'front_camera',
    });
    expect(savedPreset.parameterBindings).toEqual([{
      target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2',
    }]);
  });

  it('authors world-camera simulation and physical intrinsic YAMLs in Panel settings',async () => {
    const onSave=vi.fn();
    const { container }=render(<PanelConfigDrawer
      panel={worldCameraPanel()} coreNodes={[]} executionTargetId="local"
      automationDocuments={[worldCameraWorkflow()]} experiment={worldCameraExperiment()}
      onClose={vi.fn()} onSave={onSave}
    />);
    const drawer=container.querySelector<HTMLElement>(
      '[data-xgc-role="panel-config-drawer"][data-xgc-id="gazebo-world-camera"]',
    )!;
    const shared=drawer.querySelector<HTMLElement>(
      '[data-xgc-role="panel-shared-action-defaults"][data-xgc-id="gazebo-world-camera"]',
    )!;

    expect(shared).toBeInTheDocument();
    expect(within(shared).getByRole('button',{ name:'Simulation camera intrinsics' })).toBeInTheDocument();
    expect(within(shared).getByRole('button',{ name:'Physical camera intrinsics' })).toBeInTheDocument();
    expect(within(shared).queryByRole('button',{ name:'Simulation camera pose source' })).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-action-port-defaults"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="panel-config-connections"]')).toBeNull();
    expect(drawer.querySelector('[data-xgc-role="automation-parameter-schema-form"]')).toBeNull();

    fireEvent.click(within(shared).getByRole('button',{ name:'Simulation camera intrinsics' }));
    await waitFor(() => expect(screen.getByRole('option',{ name:'Latest · 2026-09-04 02:17:13' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option',{ name:'Latest · 2026-09-04 02:17:13' }));
    fireEvent.click(within(drawer).getByRole('button',{ name:'Save' }));

    const saved=onSave.mock.calls[0]?.[1][0].actionPresets[0];
    expect(saved.inputs.simulationIntrinsicFile)
      .toBe('/calibration/sim/usb_cam/intrinsics-20260904T021713.263963Z.yaml');
    expect(saved.inputs.physicalIntrinsicFile).toBe('/calibration/phy/intrinsics-old.yaml');
    expect(saved.inputs.simulationPoseSource).toBe('authored');
    expect(saved.parameterBindings).toEqual([{
      target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2',
    }]);
  });
});

function panel():PanelInstance {
  return { id:'control',pluginId:'automation-workflow-control',title:'Control',gridPos:{ x:0,y:0,w:8,h:5 },query:{},
    options:{ defaultView:'controls',historyLimit:10,followLogs:true },fieldConfig:{},portBindings:[{ portId:'trace',kind:'data',projection:'workflow.run.logs.v1' }] };
}
function experiment():ExperimentDocument {
  const spec = newExperimentSpec({ name:'Experiment' });
  spec.workflowInstances = [{ id:'worker',ref:{ domain:'automation',resourceId:'worker',branch:'main' },
    actionPresets:[{ id:'default',actionId:'run',inputs:{ speed:1,allowedOrigins:'https://gcs.example' },parameterBindings:[] }] }];
  return { head:head('experiment','experiment-a'),branch:branch('experiment','experiment-a'),spec };
}
function worker():AutomationDocument { return {
  head:head('automation','worker'),branch:branch('automation','worker'),
  spec:newAutomationSpec('Worker','local',{ fields:[
    { name:'speed',label:'Speed',kind:'number',number:{ default:1 } },
    { name:'allowedOrigins',label:'Allowed Web origins',kind:'string',string:{ default:'' } },
  ] }),
}; }
function robotControlPanel():PanelInstance { return {
  id:'robot-control',pluginId:'px4-rotor-control-panel',title:'Robot control',
  gridPos:{ x:0,y:0,w:8,h:5 },query:{},options:{ dashboard:'gcs' },fieldConfig:{},
  portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-control',presetId:'run',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'arm',kind:'action',presetId:'arm' },
    { portId:'set-flight-mode',kind:'action',presetId:'set-flight-mode' },
    { portId:'remote-control',kind:'action',presetId:'run' },
  ],
}; }
function robotControlExperiment():ExperimentDocument {
  const spec=newExperimentSpec({ name:'Robot control experiment' });
  spec.workflowInstances=[{
    id:'panel-robot-control',ref:{ domain:'automation',resourceId:'robot-control-workflow',branch:'main' },
    actionPresets:[
      { id:'arm',actionId:'control',inputs:{ command:'arm',robotIds:['px4-01'] },parameterBindings:[] },
      { id:'set-flight-mode',actionId:'control',inputs:{ command:'set-flight-mode',robotIds:['px4-01'],mode:'POSCTL' },parameterBindings:[] },
      { id:'run',actionId:'control',inputs:{ command:'remote-control',robotIds:['px4-01'] },parameterBindings:[] },
    ],
  }];
  return { head:head('experiment','robot-control-experiment'),branch:branch('experiment','robot-control-experiment'),spec };
}
function robotControlWorkflow():AutomationDocument {
  const spec=newAutomationSpec('Robot control');
  spec.actions[0]={
    ...spec.actions[0]!,id:'control',label:'Robot control',inputSchema:{ fields:[
      { name:'command',label:'Panel command',kind:'string',required:true,string:{ enum:['arm','set-flight-mode','remote-control'] } },
      { name:'robotIds',label:'Robot IDs',kind:'array',array:{ default:[],items:{ kind:'string' } } },
      { name:'mode',label:'Flight mode',kind:'string',string:{ default:'POSCTL' } },
    ] },
  };
  return { head:head('automation','robot-control-workflow'),branch:branch('automation','robot-control-workflow'),spec };
}
function rosControlPanel():PanelInstance { return {
  id:'ros-control',pluginId:'ros-basic-services-control',title:'ROS Control',
  gridPos:{ x:0,y:0,w:10,h:5 },query:{},fieldConfig:{},
  options:{
    layoutButtonsPerRow:3,
    layoutServiceOrder:['roscore','gzserver','vrpn','adapters','rviz','gzclient'],
    layoutHiddenServices:[],
  },
  portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-ros-control',presetId:'start',managed:true,relation:'supervised',failurePolicy:'stop-experiment' },
    { portId:'roscore',kind:'action',presetId:'roscore' },
    { portId:'gzserver',kind:'action',presetId:'gzserver' },
    { portId:'workflow-parameters',kind:'authoring',target:'action-preset',presetId:'start' },
  ],
}; }
function rosControlExperiment():ExperimentDocument {
  const spec=newExperimentSpec({ name:'ROS experiment' });
  spec.workflowInstances=[{
    id:'panel-ros-control',ref:{ domain:'automation',resourceId:'ros-control-workflow',branch:'main' },
    actionPresets:[
      { id:'start',actionId:'start-for-experiment',inputs:{ autoStartRos:true,autoStartGazeboServer:true },parameterBindings:[] },
      { id:'roscore',actionId:'roscore',inputs:{},parameterBindings:[] },
      { id:'gzserver',actionId:'gzserver',inputs:{},parameterBindings:[] },
    ],
  }];
  return { head:head('experiment','ros-experiment'),branch:branch('experiment','ros-experiment'),spec };
}
function rosControlWorkflow():AutomationDocument {
  const spec=newAutomationSpec('ROS Control');
  const base=spec.actions[0]!;
  spec.actions=[
    { ...base,id:'start-for-experiment',label:'Start ROS Control',inputSchema:{ fields:[
      { name:'autoStartRos',label:'ROS',kind:'boolean',required:true,boolean:{ default:true } },
      { name:'autoStartGazeboServer',label:'Gazebo server',kind:'boolean',required:true,boolean:{ default:true } },
    ] } },
    { ...base,id:'roscore',label:'ROS',inputSchema:{ fields:[] } },
    { ...base,id:'gzserver',label:'Gazebo server',inputSchema:{ fields:[] } },
  ];
  return { head:head('automation','ros-control-workflow'),branch:branch('automation','ros-control-workflow'),spec };
}
function worldCameraPanel():PanelInstance { return {
  id:'gazebo-world-camera',pluginId:'gazebo-world-camera',title:'Camera extrinsic calibration',
  gridPos:{ x:0,y:0,w:23,h:16 },query:{},fieldConfig:{},
  options:{ dashboard:'calibration',gridColumns:30,...GAZEBO_WORLD_CAMERA_DEFAULTS },
  portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-world-camera',presetId:'start',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'camera-service',kind:'action',presetId:'start' },
    { portId:'workflow-parameters',kind:'authoring',target:'action-preset',presetId:'start' },
  ],
}; }
function worldCameraExperiment():ExperimentDocument {
  const spec=newExperimentSpec({ name:'World camera experiment' });
  spec.workflowInstances=[{
    id:'panel-world-camera',ref:{ domain:'automation',resourceId:'world-camera-workflow',branch:'main' },
    actionPresets:[{
      id:'start',actionId:'start-for-experiment',inputs:{
        simulationIntrinsicFile:'/calibration/sim/intrinsics-old.yaml',
        physicalIntrinsicFile:'/calibration/phy/intrinsics-old.yaml',
        calibrationRoot:'/calibration',cameraName:'usb_cam',
        simulationPoseSource:'authored',simulationExtrinsicFile:'',controlPort:28090,
      },parameterBindings:[{
        target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2',
      }],
    }],
  }];
  return { head:head('experiment','world-camera-experiment'),branch:branch('experiment','world-camera-experiment'),spec };
}
function worldCameraWorkflow():AutomationDocument {
  const spec=newAutomationSpec('World camera');
  const base=spec.actions[0]!;
  spec.actions=[{ ...base,id:'start-for-experiment',label:'Start world camera',inputSchema:{ fields:[
    { name:'simulationIntrinsicFile',label:'Simulation intrinsic calibration YAML',kind:'string',required:true,
      string:{ default:'',pathKind:'file',fileExtensions:['.yaml'] } },
    { name:'physicalIntrinsicFile',label:'Physical intrinsic calibration YAML',kind:'string',required:true,
      string:{ default:'',pathKind:'file',fileExtensions:['.yaml'] } },
    { name:'simulationPoseSource',label:'Simulation camera pose source',kind:'string',required:true,
      string:{ default:'authored',enum:['authored','file'] } },
    { name:'simulationExtrinsicFile',label:'Simulation camera extrinsic YAML',kind:'string',
      string:{ default:'',pathKind:'file',fileExtensions:['.yaml'] } },
    { name:'controlPort',label:'Media Edge control port',kind:'integer',required:true,
      integer:{ default:28090,minimum:1,maximum:65535 } },
  ] } }];
  return { head:head('automation','world-camera-workflow'),branch:branch('automation','world-camera-workflow'),spec };
}
function cameraIntrinsicPanel():PanelInstance { return {
  id:'camera-intrinsic-calibration',pluginId:'camera-intrinsic-calibration',title:'Camera intrinsic calibration',
  gridPos:{ x:0,y:0,w:23,h:15 },query:{},fieldConfig:{},
  options:{
    dashboard:'gcs',gridColumns:30,edgeUrl:DEFAULT_LOCAL_MEDIA_EDGE_URL,sourceId:'usb_cam',
  },
  portBindings:[
    { portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-camera-intrinsic',presetId:'start',managed:true,relation:'supervised',failurePolicy:'keep-experiment' },
    { portId:'camera-intrinsic-calibration',kind:'action',presetId:'start' },
  ],
}; }
function cameraIntrinsicExperiment():ExperimentDocument {
  const spec = newExperimentSpec({ name:'Camera intrinsic calibration experiment',runModes:['simulation','physical'] });
  spec.workflowInstances = [{
    id:'panel-camera-intrinsic',ref:{ domain:'automation',resourceId:'camera-intrinsic-router',branch:'main' },
    actionPresets:[{
      id:'start',actionId:'start-for-experiment',
      inputs:{
        physical:{
          allowedOrigins:'https://gcs.example.test',cameraName:'usb_cam',boardProfile:'field_6x6_88mm_30pct',
          snapshotTimeout:5,displayWidth:960,jpegQuality:80,
          videoDevice:'/dev/v4l/by-id/usb-camera-test-video-index0',
        },
        runMode:'simulation',
        simulation:{
          controlPort:28090,cameraName:'usb_cam',boardProfile:'field_6x6_88mm_30pct',
          snapshotTimeout:5,displayWidth:960,jpegQuality:80,
        },
        sourceId:'usb_cam',
      },
      parameterBindings:[{ target:'/runMode',expression:'{{ $run.parameters.runMode }}',language:'xgc-expression-v2' }],
    }],
  }];
  return { head:head('experiment','experiment-intrinsic'),branch:branch('experiment','experiment-intrinsic'),spec };
}
function cameraIntrinsicWorkflow():AutomationDocument {
  const spec = newAutomationSpec('Camera intrinsic calibration Panel Workflow');
  spec.actions[0] = {
    ...spec.actions[0]!,id:'start-for-experiment',label:'Start camera intrinsic calibration for Experiment',
    inputSchema:{ fields:[
      { name:'physical',label:'Physical provider',kind:'object',required:true,object:{ fields:[
        { name:'allowedOrigins',label:'Allowed Web origins',kind:'string',required:true,string:{ default:'' } },
      ] } },
      { name:'runMode',label:'Run mode',kind:'string',required:true,string:{ default:'simulation',enum:['simulation','physical'] } },
      { name:'simulation',label:'Simulation provider',kind:'object',required:true,object:{ fields:[
        { name:'controlPort',label:'Control port',kind:'integer',required:true,integer:{ default:28090 } },
      ] } },
      { name:'sourceId',label:'Shared Media source ID',kind:'string',required:true,string:{ default:'usb_cam' } },
    ] },
  };
  return { head:head('automation','camera-intrinsic-router'),branch:branch('automation','camera-intrinsic-router'),spec };
}
function head(domain:string,resourceId:string) { return { domain,resourceId,name:resourceId,tags:[],mainCommitId:'commit-1',currentVersion:1,digest:'d'.repeat(64),revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' }; }
function branch(domain:string,resourceId:string) { return { domain,resourceId,name:'main',headCommitId:'commit-1',headVersion:1,revision:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z' }; }
