import { definePanelPlugin } from '../types';
import { RecordingControlPanel } from './RecordingControlPanel';
import { RosbagPlotPanel } from './RosbagPlotPanel';
import {
  RECORDING_ARTIFACT_DEFAULT_LIMIT,
  RECORDING_CONTROL_PANEL_ID,
  ROSBAG_RECORDING_WORKFLOW_SLOT,
} from './recordingControlPanelModel';
import { ROSBAG_PLOT_PANEL_ID } from './rosbagPlotPanelModel';

/**
 * The ROS bag recording surface.
 *
 * It reads no datasource: a recording is an Experiment workflow binding, and
 * everything the panel shows is either that binding's document, Core's own
 * topic derivation, or the artifact archive. A datasource here would be a
 * second, disagreeing idea of what is being recorded.
 *
 * The slot is not `required`: an Experiment template that binds no recorder is
 * a legitimate Experiment, and the panel guides instead of failing the board.
 */
export const recordingControlPanelPlugin = definePanelPlugin({
  id: RECORDING_CONTROL_PANEL_ID,
  name: 'Recording control',
  localizedName: { 'en-US':'Recording control','zh-CN':'录制控制' },
  category: 'Operations',
  description: 'Choose what the Experiment Workflow records, start and stop the recorder, and browse the artifacts it produced.',
  localizedDescription: {
    'en-US':'Choose what the Experiment Workflow records, start and stop the recorder, and browse the artifacts it produced.',
    'zh-CN':'选择实验工作流的录制内容，启动或停止录制器，并浏览生成的产物。',
  },
  capabilities: ['visualization','experiment'] as const,
  backendCapabilities: [
    'experiment.read','automations.read','automations.run','recordings.read','robot.read',
  ],
  permissions: [
    'experiment.read','automations.read','automations.run','recordings.read','robot.read',
  ],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  layout: {
    minSize: { w: 4,h: 4 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  dataPorts: [{ id:'recording-artifacts',label:'Recording artifacts',localizedLabel:{ 'en-US':'Recording artifacts','zh-CN':'录制产物' },contract:'recording.artifacts.v1' }],
  actionPorts: [{ id:ROSBAG_RECORDING_WORKFLOW_SLOT,label:'Recording',localizedLabel:{ 'en-US':'Recording','zh-CN':'录制' },actionKinds:['service'] }],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
    artifactLimit: { type: 'number' },
  },
  defaultOptions: { artifactLimit: RECORDING_ARTIFACT_DEFAULT_LIMIT },
  defaultPanel: {
    title: 'Recording control',
    gridPos: { x: 0,y: 0,w: 6,h: 6 },
    query: {},
    options: { dashboard: 'gcs',artifactLimit: RECORDING_ARTIFACT_DEFAULT_LIMIT },
  },
  component: RecordingControlPanel,
});

/**
 * Offline bag inspector. Catalog comes from GET /recordings/rosbags/:id/plot
 * with no series; dragging a field requests that series only.
 */
export const rosbagPlotPanelPlugin = definePanelPlugin({
  id: ROSBAG_PLOT_PANEL_ID,
  name: 'Rosbag plot',
  localizedName: { 'en-US':'Rosbag plot','zh-CN':'Rosbag 曲线' },
  category: 'Operations',
  description: 'Open a recorded bag, browse topics, and drag fields onto plots to compare curves.',
  localizedDescription: {
    'en-US':'Open a recorded bag, browse topics, and drag fields onto plots to compare curves.',
    'zh-CN':'打开已录制的 bag，浏览话题，并将字段拖入图表以比较曲线。',
  },
  capabilities: ['visualization','experiment'] as const,
  backendCapabilities: ['recordings.read'],
  permissions: ['recordings.read'],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  layout: {
    minSize: { w: 8,h: 6 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  dataPorts: [{ id:'recording-artifacts',label:'Recording artifacts',localizedLabel:{ 'en-US':'Recording artifacts','zh-CN':'录制产物' },contract:'recording.artifacts.v1' }],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
  },
  defaultPanel: {
    title: 'Rosbag plot',
    gridPos: { x: 0,y: 0,w: 16,h: 10 },
    query: {},
    options: { dashboard: 'gcs' },
  },
  component: RosbagPlotPanel,
});
