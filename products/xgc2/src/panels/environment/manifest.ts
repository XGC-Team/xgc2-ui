import { definePanelPlugin } from '../types';
import { ExperimentEnvironmentPanel } from './ExperimentEnvironmentPanel';
import {
  ExperimentEnvironmentPanelFrameProvider,
  ExperimentEnvironmentPanelHeaderActions,
  ExperimentEnvironmentPanelHeaderLeading,
} from './experimentEnvironmentFrame';

export const EXPERIMENT_ENVIRONMENT_PANEL_ID = 'experiment-environment';

export const experimentEnvironmentPanelPlugin = definePanelPlugin({
  id: EXPERIMENT_ENVIRONMENT_PANEL_ID,
  name: 'Experiment environment',
  localizedName: { 'en-US':'Experiment environment','zh-CN':'实验环境' },
  category: 'Operations',
  description: 'Files and terminal for an enrolled experiment instance.',
  localizedDescription: {
    'en-US':'Files and terminal for an enrolled experiment instance.',
    'zh-CN':'已注册实验实例的文件和终端。',
  },
  capabilities: ['experiment'] as const,
  backendCapabilities: ['experiment.read'],
  permissions: ['experiment.read'],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  panelWorkflowControls: 'hidden',
  interactiveWhileEditing: true,
  fillBody: true,
  standalonePresentation: 'panel',
  layout: {
    minSize: { w: 8,h: 6 },
    sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
  },
  dataPorts: [
    {
      id: 'robots',
      label: 'Experiment',
      localizedLabel: { 'en-US':'Experiment','zh-CN':'实验' },
      contract: 'experiment.robots.v1',
      required: true,
    },
    {
      id: 'robot-runtime',
      label: 'Experiment runtime',
      localizedLabel: { 'en-US':'Experiment runtime','zh-CN':'实验运行时' },
      contract: 'experiment.runtime.v1',
    },
  ],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
  },
  defaultPanel: {
    title: 'Environment',
    gridPos: { x: 0,y: 0,w: 30,h: 16 },
    query: {},
    options: { dashboard: 'deploy',gridColumns: 30 },
  },
  frameProvider: ExperimentEnvironmentPanelFrameProvider,
  headerLeading: ExperimentEnvironmentPanelHeaderLeading,
  headerActions: ExperimentEnvironmentPanelHeaderActions,
  component: ExperimentEnvironmentPanel,
});
