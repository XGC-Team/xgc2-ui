import { definePanelPlugin } from '../types';
import { ExperimentRobotAssetsPanel } from './ExperimentRobotAssetsPanel';

export const EXPERIMENT_ROBOT_ASSETS_PANEL_ID = 'experiment-robot-assets';

export const experimentRobotAssetsPanelPlugin = definePanelPlugin({
  id: EXPERIMENT_ROBOT_ASSETS_PANEL_ID,
  name: 'Experiment Robot assets',
  localizedName: { 'en-US':'Experiment Robot assets','zh-CN':'实验机器人资产' },
  category: 'Fleet',
  description: 'Add, remove, and configure the Robot assets used by this Experiment.',
  localizedDescription: {
    'en-US':'Add, remove, and configure the Robot assets used by this Experiment.',
    'zh-CN':'添加、移除并配置此实验使用的机器人资产。',
  },
  // Automation is required so Starting pose can resolve the Session-owned
  // Adapter Run and sample live VRPN / mocap into the draft.
  capabilities: ['experiment','automation'] as const,
  backendCapabilities: ['experiment.read','experiment.manage','robot.read','automations.read'],
  permissions: ['experiment.read','experiment.manage','robot.read','automations.read'],
  executionTargetPolicy: 'local',
  configureOnCreate: false,
  configExposure: { drawer:'hidden' },
  standalonePresentation: 'page',
  panelWorkflowControls: 'hidden',
  // Roster add/remove/reorder and draft slot params must stay clickable in Edit.
  interactiveWhileEditing: true,
  layout: {
    minSize: { w: 6,h: 4 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  dataPorts: [
    { id:'robots',label:'Experiment robots',localizedLabel:{ 'en-US':'Experiment robots','zh-CN':'实验机器人' },contract:'experiment.robots.v1',required:true },
    { id:'robot-assets',label:'Robot asset catalog',localizedLabel:{ 'en-US':'Robot asset catalog','zh-CN':'机器人资产目录' },contract:'robot.assets.v1',required:true },
    { id:'robot-runtime',label:'Experiment runtime',localizedLabel:{ 'en-US':'Experiment runtime','zh-CN':'实验运行时' },contract:'experiment.runtime.v1' },
  ],
  authoringPorts: [
    { id:'robots-editor',label:'Edit Experiment robots',localizedLabel:{ 'en-US':'Edit Experiment robots','zh-CN':'编辑实验机器人' },target:'experiment.robots',required:true },
    {
      id:'world-origin-offset-editor',
      label:'Edit Experiment world origin offset',
      localizedLabel:{ 'en-US':'Edit Experiment world origin offset','zh-CN':'编辑实验世界系原点偏移' },
      target:'experiment.localizationOffset',
      required:true,
    },
  ],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
  },
  defaultPanel: {
    title: 'Robot assets',
    gridPos: { x: 0,y: 0,w: 30,h: 16 },
    query: {},
    options: { dashboard: 'config',gridColumns: 30 },
  },
  component: ExperimentRobotAssetsPanel,
});
