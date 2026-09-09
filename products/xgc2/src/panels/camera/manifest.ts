import { definePanelPlugin,type PanelLayoutPolicy } from '../types';
import { cameraStreamPanelDefaultRows } from '../../shared/dashboardGeometry';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../../domains/experiment/experimentPublic';
import { ManagedCameraVideoPanel } from './ManagedCameraVideoPanel';
import { CameraVideoPanelOptionsEditor } from './CameraVideoPanelOptionsEditor';
import {
  CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT,
  CAMERA_VIDEO_PANEL_DEFAULTS,
  validateCameraVideoPanelOptions,
} from './cameraVideoPanelModel';
import { MultiCameraMonitorOptionsEditor } from './MultiCameraMonitorOptionsEditor';
import { MultiCameraMonitorPanel } from './MultiCameraMonitorPanel';
import {
  MULTI_CAMERA_MONITOR_DEFAULTS,
  validateMultiCameraMonitorOptions,
} from './multiCameraMonitorModel';
import {
  CameraIntrinsicCalibrationHeaderActions,
  CameraIntrinsicCalibrationWorkspace,
} from './CameraIntrinsicCalibrationWorkspace';
import { CameraIntrinsicCalibrationActionDefaultsEditor } from './CameraIntrinsicCalibrationActionDefaultsEditor';
import {
  CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT,
  CAMERA_INTRINSIC_PANEL_DEFAULTS,
  validateCameraIntrinsicPanelOptions,
} from './cameraIntrinsicPanelModel';
import { CameraIntrinsicCalibrationFrameProvider } from './CameraIntrinsicCalibrationWorkspaceFrame';
import { CameraIntrinsicValidationWorkspace } from './CameraIntrinsicValidationWorkspace';
import {
  GazeboWorldCameraFrameProvider,
  GazeboWorldCameraHeaderActions,
  GazeboWorldCameraHeaderLeading,
} from './GazeboWorldCameraPanelFrame';
import { GazeboWorldCameraWorkspace } from './GazeboWorldCameraWorkspace';
import { GazeboWorldCameraActionDefaultsEditor } from './GazeboWorldCameraActionDefaultsEditor';
import {
  GAZEBO_WORLD_CAMERA_DEFAULTS,
  validateGazeboWorldCameraOptions,
} from './gazeboWorldCameraPanelModel';
import { CameraVideoFrameProvider,CameraVideoHeaderActions,CameraVideoHeaderStatus } from './CameraVideoPanelFrame';

const cameraStreamLayout: PanelLayoutPolicy = {
  minSize: { w: 4,h: 2 },
  sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
};

const calibrationPanelBase = {
  category: 'Operations' as const,
  // process.control authorizes only the typed calibration POST proxy here;
  // panel execution context does not expose direct ProcessInstance mutation.
  backendCapabilities: ['operations.process.read','operations.process.control'],
  permissions: ['operations.process.read','operations.process.control'],
  executionTargetPolicy: 'dashboard' as const,
  configureOnCreate: false,
  optionSchema: {
    dashboard: { type: 'string' as const },
    gridColumns: { type: 'number' as const },
  },
};

export const cameraVideoPanelPlugin = definePanelPlugin({
  id: 'camera-video',
  name: 'Camera video',
  localizedName: { 'en-US':'Camera video','zh-CN':'相机视频' },
  category: 'Operations',
  description: 'Display and independently control configured Media Edge camera sources while the Experiment owns their media workflow.',
  localizedDescription: {
    'en-US':'Display and independently control configured Media Edge camera sources while the Experiment owns their media workflow.',
    'zh-CN':'显示并独立控制已配置的 Media Edge 相机源，同时由实验负责其媒体工作流。',
  },
  capabilities: ['visualization','experiment','execution','automation'] as const,
  backendCapabilities: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.events.read',
  ],
  permissions: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.events.read',
  ],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: true,
  layout: cameraStreamLayout,
  frameProvider: CameraVideoFrameProvider,
  headerStatus: CameraVideoHeaderStatus,
  headerActions: CameraVideoHeaderActions,
  dataPorts: [{ id:'video',label:'Camera video',contract:'camera.video.v1' }],
  actionPorts: [{ id:CAMERA_VIDEO_MEDIA_WORKFLOW_SLOT,label:'Media service',actionKinds:['service'] }],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
    mediaBindingId: { type: 'string' },
    streamsJson: { type: 'string',required: true },
    layoutColumns: { type: 'string' },
    tileAspectRatio: { type: 'string' },
    imageFit: { type: 'string' },
    reconnectPolicy: { type: 'string' },
    showMetadata: { type: 'boolean' },
    autoConnect: { type: 'boolean' },
    autoConnectOnExperimentRun: { type: 'boolean' },
  },
  defaultOptions: {
    ...CAMERA_VIDEO_PANEL_DEFAULTS,
    streamsJson:MULTI_CAMERA_MONITOR_DEFAULTS.streamsJson,
    layoutColumns:MULTI_CAMERA_MONITOR_DEFAULTS.layoutColumns,
    tileAspectRatio:MULTI_CAMERA_MONITOR_DEFAULTS.tileAspectRatio,
  },
  optionsEditor: CameraVideoPanelOptionsEditor,
  validatePanel: (panel) => validateCameraVideoPanelOptions(panel.options)
    || validateMultiCameraMonitorOptions(panel.options),
  defaultPanel: {
    title: 'Camera video',
    gridPos: { x: 0,y: 0,w: 8,h: cameraStreamPanelDefaultRows({ panelWidthCols: 8 }) },
    query: {},
    options: {
      dashboard:'gcs',...CAMERA_VIDEO_PANEL_DEFAULTS,
      streamsJson:MULTI_CAMERA_MONITOR_DEFAULTS.streamsJson,
      layoutColumns:MULTI_CAMERA_MONITOR_DEFAULTS.layoutColumns,
      tileAspectRatio:MULTI_CAMERA_MONITOR_DEFAULTS.tileAspectRatio,
    },
  },
  component: ManagedCameraVideoPanel,
});

export const multiCameraMonitorPanelPlugin = definePanelPlugin({
  id: 'multi-camera-monitor',
  name: 'Multi-camera monitor',
  localizedName: { 'en-US':'Multi-camera monitor','zh-CN':'多相机监视器' },
  category: 'Operations',
  description: 'Display and independently reconnect multiple direct Media Edge WebRTC sources in one configurable grid.',
  localizedDescription: {
    'en-US':'Display and independently reconnect multiple direct Media Edge WebRTC sources in one configurable grid.',
    'zh-CN':'在可配置网格中显示并独立重连多个直连 Media Edge WebRTC 视频源。',
  },
  capabilities: ['visualization'] as const,
  executionTargetPolicy: 'local',
  configureOnCreate: true,
  layout: cameraStreamLayout,
  dataPorts: [{ id:'videos',label:'Camera videos',contract:'camera.video.v1',required:true }],
  optionSchema: {
    dashboard: { type:'string' },
    gridColumns: { type:'number' },
    streamsJson: { type:'string',required:true },
    layoutColumns: { type:'string',required:true },
    tileAspectRatio: { type:'string',required:true },
    imageFit: { type:'string',required:true },
    reconnectPolicy: { type:'string',required:true },
    showMetadata: { type:'boolean',required:true },
  },
  defaultOptions: { ...MULTI_CAMERA_MONITOR_DEFAULTS },
  optionsEditor: MultiCameraMonitorOptionsEditor,
  validatePanel: (panel) => validateMultiCameraMonitorOptions(panel.options),
  defaultPanel: {
    title: 'Multi-camera monitor',
    gridPos: { x:0,y:0,w:12,h: cameraStreamPanelDefaultRows({ panelWidthCols: 12 }) },
    query: {},
    options: { dashboard:'gcs',...MULTI_CAMERA_MONITOR_DEFAULTS },
  },
  component: MultiCameraMonitorPanel,
});

export const gazeboWorldCameraPanelPlugin = definePanelPlugin({
  id: 'gazebo-world-camera',
  name: 'Camera extrinsic calibration',
  localizedName: { 'en-US':'Camera extrinsic calibration','zh-CN':'相机外参标定' },
  category: 'Operations',
  description: 'Run one managed simulation or physical camera provider, view its truthful Media Edge stream, and solve extrinsics from an immutable snapshot.',
  localizedDescription: {
    'en-US':'Run one managed simulation or physical camera provider, view its truthful Media Edge stream, and solve extrinsics from an immutable snapshot.',
    'zh-CN':'运行一个受管的仿真或实物相机提供程序，查看其真实 Media Edge 视频流，并从不可变快照求解外参。',
  },
  capabilities: ['visualization','experiment','execution','automation'] as const,
  backendCapabilities: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  permissions: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  configExposure: { connections:'summary',actionDefaults:'custom' },
  actionDefaultsEditor: GazeboWorldCameraActionDefaultsEditor,
  sharedActionDefaults: {
    title:'Camera calibration inputs',
    fieldNames:['simulationIntrinsicFile','physicalIntrinsicFile'],
  },
  authoringPorts: [{
    id:'workflow-parameters',label:'Camera calibration defaults',
    localizedLabel:{ 'en-US':'Camera calibration defaults','zh-CN':'相机标定默认值' },
    target:'action-preset',
  }],
  maxInstancesPerDashboard: 1,
  layout: cameraStreamLayout,
  frameProvider: GazeboWorldCameraFrameProvider,
  headerLeading: GazeboWorldCameraHeaderLeading,
  headerActions: GazeboWorldCameraHeaderActions,
  dataPorts: [
    { id:'video',label:'World camera video',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
    { id:'calibration',label:'Extrinsic calibration',contract:'camera.calibration.extrinsic.v1' },
  ],
  actionPorts: [
    { id:'camera-service',label:'World camera service',actionKinds:['service'] },
    { id:'set-pose',label:'Set camera pose',actionKinds:['command'] },
    { id:'solve-extrinsic',label:'Solve extrinsics',actionKinds:['command'] },
  ],
  optionSchema: {
    dashboard: { type:'string' },
    gridColumns: { type:'number' },
    x: { type:'number',required:true },
    y: { type:'number',required:true },
    z: { type:'number',required:true },
    rollDegrees: { type:'number',required:true },
    pitchDegrees: { type:'number',required:true },
    yawDegrees: { type:'number',required:true },
    edgeUrl: { type:'string',required:true },
    sourceId: { type:'string',required:true },
    iceServerUrls: { type:'string',required:true },
    publicIPs: { type:'string',required:true },
  },
  defaultOptions: { ...GAZEBO_WORLD_CAMERA_DEFAULTS },
  validatePanel: (panel) => validateGazeboWorldCameraOptions(panel.options),
  defaultPanel: {
    title: 'Gazebo world camera',
    // Same right-column slot as the fleet GCS seed (under ROS Control).
    gridPos: { x:23,y:5,w:7,h: cameraStreamPanelDefaultRows({ panelWidthCols: 7 }) },
    query: {},
    options: { dashboard:'gcs',...GAZEBO_WORLD_CAMERA_DEFAULTS },
  },
  component: GazeboWorldCameraWorkspace,
});

export const cameraIntrinsicCalibrationPanelPlugin = definePanelPlugin({
  ...calibrationPanelBase,
  capabilities: ['visualization','experiment','execution','automation'] as const,
  backendCapabilities: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  permissions: [
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  id: 'camera-intrinsic-calibration',
  name: 'Camera intrinsic calibration',
  localizedName: { 'en-US':'Camera intrinsic calibration','zh-CN':'相机内参标定' },
  description: 'Collect simulation or physical camera observations and explicitly save the accepted intrinsic result.',
  localizedDescription: {
    'en-US':'Collect simulation or physical camera observations and explicitly save the accepted intrinsic result.',
    'zh-CN':'采集仿真或实物相机观测，并显式保存已通过的内参结果。',
  },
  configureOnCreate: false,
  configExposure: { connections:'workflow',actionDefaults:'custom' },
  layout: {
    minSize: { w: 4,h: 2 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  frameProvider: CameraIntrinsicCalibrationFrameProvider,
  headerLeading: CameraIntrinsicCalibrationHeaderActions,
  actionDefaultsEditor: CameraIntrinsicCalibrationActionDefaultsEditor,
  validatePanel: (panel) => validateCameraIntrinsicPanelOptions(panel.options),
  dataPorts: [
    { id:'video',label:'Calibration video',contract:'camera.video.v1' },
    { id:'calibration',label:'Intrinsic calibration',contract:'camera.calibration.intrinsic.v1' },
  ],
  actionPorts: [{
    id:CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT,label:'Calibration workflow',required:true,actionKinds:['interaction'],
  }],
  authoringPorts: [{
    id:'workflow-parameters',label:'Calibration defaults',
    localizedLabel:{ 'en-US':'Calibration defaults','zh-CN':'标定默认参数' },
    target:'action-preset',
  }],
  optionSchema: {
    dashboard: { type:'string' },
    gridColumns: { type:'number' },
    edgeUrl: { type:'string',required:true },
    sourceId: { type:'string',required:true },
  },
  defaultOptions: { ...CAMERA_INTRINSIC_PANEL_DEFAULTS },
  defaultPanel: {
    title: 'Camera intrinsic calibration',
    gridPos: { x: 0,y: 0,w: 8,h: cameraStreamPanelDefaultRows({ panelWidthCols: 8 }) },
    query: {},options: { dashboard:'gcs',...CAMERA_INTRINSIC_PANEL_DEFAULTS },
  },
  component: CameraIntrinsicCalibrationWorkspace,
});

export const cameraIntrinsicValidationPanelPlugin = definePanelPlugin({
  ...calibrationPanelBase,
  capabilities:['visualization','experiment','execution','automation'] as const,
  backendCapabilities:[
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  permissions:[
    'automations.read','automations.run','experiment.read',
    'operations.process.read','operations.process.control','operations.events.read',
  ],
  id:'camera-intrinsic-validation',
  name:'Camera intrinsic validation',
  localizedName:{ 'en-US':'Camera intrinsic validation','zh-CN':'相机内参验证' },
  description:'Capture one live frame and generate grid, overlay, heatmap, displacement, detail, and raw/undistorted comparisons from a saved intrinsic file.',
  localizedDescription:{
    'en-US':'Capture one live frame and generate grid, overlay, heatmap, displacement, detail, and raw/undistorted comparisons from a saved intrinsic file.',
    'zh-CN':'采集一帧实时图像，并使用已保存的内参文件生成网格、叠加图、热力图、位移图、细节图以及原图/去畸变对比。',
  },
  configExposure:{ connections:'workflow',actionDefaults:'hidden' },
  panelWorkflowControls:'visible',
  layout:{
    minSize:{ w:8,h:6 },
    sizePolicy:{ horizontal:'expanding',vertical:'expanding' },
  },
  frameProvider:CameraIntrinsicCalibrationFrameProvider,
  headerLeading:CameraIntrinsicCalibrationHeaderActions,
  validatePanel:(panel) => validateCameraIntrinsicPanelOptions(panel.options),
  dataPorts:[
    { id:'video',label:'Calibration video',contract:'camera.video.v1' },
    { id:'calibration',label:'Intrinsic calibration',contract:'camera.calibration.intrinsic.v1' },
  ],
  actionPorts:[{
    id:CAMERA_INTRINSIC_CALIBRATION_WORKFLOW_SLOT,label:'Calibration workflow',required:true,actionKinds:['interaction'],
  }],
  optionSchema:{
    dashboard:{ type:'string' },gridColumns:{ type:'number' },
    edgeUrl:{ type:'string',required:true },sourceId:{ type:'string',required:true },
  },
  defaultOptions:{ ...CAMERA_INTRINSIC_PANEL_DEFAULTS },
  defaultPanel:{
    title:'Camera intrinsic validation',gridPos:{ x:0,y:0,w:30,h:16 },query:{},
    options:{ dashboard:'validation',...CAMERA_INTRINSIC_PANEL_DEFAULTS },
  },
  component:CameraIntrinsicValidationWorkspace,
});
