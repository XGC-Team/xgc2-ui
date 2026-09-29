import { workflowRuntimeDatasources } from '../../shared/workflowRuntimeProtocol';
import { definePanelPlugin } from '../types';
import { RosbagPlotPanel } from './RosbagPlotPanel';
import { ScientificGalleryPanel } from './ScientificGalleryPanel';
import {
  ScientificGalleryFrameProvider,
  ScientificGalleryHeaderActions,
  ScientificGalleryHeaderLeading,
  ScientificGalleryHeaderStatus,
} from './scientificGalleryPanelFrame';
import { ROSBAG_PLOT_PANEL_ID } from './rosbagPlotPanelModel';
import {
  SCIENTIFIC_GALLERY_ACTION_PORT,
  SCIENTIFIC_GALLERY_PANEL_ID,
  SCIENTIFIC_GALLERY_RUNTIME_PORT,
} from './scientificGalleryPanelModel';
import { VIDEO_RENDER_ACTION_PORT } from './videoProduction/videoProductionModel';

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

/**
 * Generic scientific result gallery. The panel selects a completed Experiment
 * data file and invokes one bound Workflow action. The panel contributes one
 * offline-authored script path; the Workflow owns execution and its published
 * image directory.
 */
export const scientificGalleryPanelPlugin = definePanelPlugin({
  id: SCIENTIFIC_GALLERY_PANEL_ID,
  name: 'Scientific plots',
  localizedName: { 'en-US':'Scientific plots','zh-CN':'科研绘图' },
  category: 'Operations',
  description: 'Select a completed Experiment data file, plot figures with the bound Workflow, and view the results.',
  localizedDescription: {
    'en-US':'Select a completed Experiment data file, plot figures with the bound Workflow, and view the results.',
    'zh-CN':'选择已完成的实验数据文件，用绑定工作流绘图并查看结果。',
  },
  capabilities: ['visualization','experiment','automation'] as const,
  backendCapabilities: ['automations.read','automations.run','recordings.read','recordings.write','operations.job.control'],
  permissions: ['automations.read','automations.run','recordings.read','recordings.write','operations.job.control'],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: true,
  panelWorkflowControls: 'hidden',
  fillBody: true,
  frameProvider: ScientificGalleryFrameProvider,
  headerLeading: ScientificGalleryHeaderLeading,
  headerStatus: ScientificGalleryHeaderStatus,
  headerActions: ScientificGalleryHeaderActions,
  layout: {
    minSize: { w: 8,h: 6 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  dataPorts: [
    { id:'recording-artifacts',label:'Recording artifacts',localizedLabel:{ 'en-US':'Recording artifacts','zh-CN':'录制产物' },contract:'recording.artifacts.v1' },
    { id:SCIENTIFIC_GALLERY_RUNTIME_PORT,label:'Workflow runtime',localizedLabel:{ 'en-US':'Workflow runtime','zh-CN':'工作流运行时' },contract:workflowRuntimeDatasources.run },
  ],
  actionPorts: [{
    id:SCIENTIFIC_GALLERY_ACTION_PORT,label:'Plot',localizedLabel:{ 'en-US':'Plot','zh-CN':'绘图' },
    description:'A command Action with required string inputs inputPath, scriptPath, and publicationId.',
    localizedDescription:{
      'en-US':'A command Action with required string inputs inputPath, scriptPath, and publicationId.',
      'zh-CN':'具有必填字符串输入 inputPath、scriptPath 和 publicationId 的命令动作。',
    },
    actionKinds:['command'],required:true,
  },{
    id:VIDEO_RENDER_ACTION_PORT,label:'Render video',localizedLabel:{ 'en-US':'Render video','zh-CN':'渲染视频' },
    actionKinds:['command'],
  }],
  defaultPortBindings: [
    { portId:'recording-artifacts',kind:'data',projection:'recording.artifacts.v1' },
    { portId:SCIENTIFIC_GALLERY_RUNTIME_PORT,kind:'data',projection:workflowRuntimeDatasources.run },
  ],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
    scriptPath: { type: 'string' },
  },
  defaultPanel: {
    title: 'Scientific plots',
    gridPos: { x: 0,y: 0,w: 23,h: 16 },
    query: {},
    options: { dashboard: 'algorithm',scriptPath: '' },
  },
  component: ScientificGalleryPanel,
});
