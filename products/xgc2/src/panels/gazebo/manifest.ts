import { workflowRuntimeDatasources } from '../../shared/workflowRuntimeProtocol';
import { definePanelPlugin } from '../types';
import { GazeboScenePanel } from './GazeboScenePanel';
import { gazeboSceneActions } from './gazeboScenePanelModel';

export const gazeboScenePanelPlugin = definePanelPlugin({
  id: 'gazebo-scene-composer',
  name: 'Gazebo scene composer',
  localizedName: { 'en-US':'Gazebo scene composer','zh-CN':'Gazebo 场景编排' },
  category: 'Control',
  description: 'Place, move, and clear trusted obstacles in a running Gazebo world.',
  localizedDescription: {
    'en-US':'Place, move, and clear trusted obstacles in a running Gazebo world.',
    'zh-CN':'在运行中的 Gazebo 世界里放置、移动和清除可信障碍物。',
  },
  capabilities: ['experiment','automation'] as const,
  backendCapabilities: ['automations.read','automations.run','operations.job.control'],
  permissions: ['automations.run','operations.job.control'],
  dataPorts: [{ id:'scene-state',label:'Scene state',localizedLabel:{ 'en-US':'Scene state','zh-CN':'场景状态' },contract:workflowRuntimeDatasources.run }],
  actionPorts: gazeboSceneActions.map((action) => ({ id:action.id,label:action.label,actionKinds:['command'] as const })),
  executionTargetPolicy: 'local',
  configureOnCreate: false,
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
  },
  defaultPanel: {
    title: 'Gazebo scene',
    gridPos: { x: 0,y: 0,w: 10,h: 6 },
    query: {},
    options: { dashboard: 'gcs' },
  },
  component: GazeboScenePanel,
});
