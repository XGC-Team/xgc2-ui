import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../../domains/experiment/experimentPublic';
import {
  dashboardRowsForSquareControlGrid,
  squareControlGridHeightPx,
} from '../../shared/dashboardGeometry';
import { definePanelPlugin } from '../types';
import { RosBasicServicesPanel } from './RosBasicServicesPanel';
import {
  RosBasicServicesPanelFrameProvider,
  RosBasicServicesPanelHeaderActions,
  RosBasicServicesPanelHeaderLeading,
} from './RosBasicServicesPanelFrame';
import { validateRosBasicServicesPanelOptions } from './rosBasicServicesPanelConfiguration';
import {
  ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW,
  rosBasicServicesLayoutDefaultOptions,
  rosBasicServicesLayoutOptions,
} from './rosBasicServicesPanelLayout';
import { rosBasicServices } from './rosBasicServicesPanelModel';
import { RosBasicServicesPanelOptionsEditor } from './RosBasicServicesPanelOptionsEditor';
import { rosPanelZhMessages } from './rosMessages';

export const rosBasicServicesPanelPlugin = definePanelPlugin({
  id: 'ros-basic-services-control',
  name: 'ROS Control',
  localizedName: { 'en-US':'ROS Control','zh-CN':'ROS 控制' },
  category: 'Control',
  description: 'Control trusted ROS, RViz, Gazebo, VRPN client, and Robot Adapter Automations with control and whiteboard views.',
  localizedDescription: {
    'en-US':'Control trusted ROS, RViz, Gazebo, VRPN client, and Robot Adapter Automations with control and whiteboard views.',
    'zh-CN':'通过控制和白板视图管理可信的 ROS、RViz、Gazebo、VRPN 客户端与机器人适配器自动化。',
  },
  capabilities: ['automation','experiment'] as const,
  backendCapabilities: ['automations.read','automations.run'],
  permissions: ['automations.run'],
  executionTargetPolicy: 'local',
  configureOnCreate: false,
  configExposure: { connections:'workflow' },
  sharedActionDefaults: { title:'ROS connection',fieldNames:['rosMasterUri'] },
  runtimeBoundActionDefaults: [
    'runMode',
  ],
  layout: {
    minSize: { w: 4,h: 2 },
    // Same fixed-height contract as PX4 control: frame follows the square cluster.
    sizePolicy: { horizontal: 'expanding',vertical: 'fixed' },
    preferredHeightForWidth: (widthPx, panel) => {
      const layout = rosBasicServicesLayoutOptions(panel.options ?? {});
      return squareControlGridHeightPx({
        panelWidthPx: widthPx,
        itemCount: Math.max(1, layout.shown.length),
        maxColumns: layout.buttonsPerRow,
      });
    },
  },
  dataPorts: [
    { id:'service-health',label:'Service health',localizedLabel:{ 'en-US':'Service health','zh-CN':'服务健康状态' },contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
  ],
  actionPorts: [
    ...rosBasicServices.map((service) => ({
      id:service.id,label:service.label,
      localizedLabel:{ 'en-US':service.label,'zh-CN':rosPanelZhMessages[service.label] ?? service.label },
      actionKinds:['service'] as const,
    })),
  ],
  authoringPorts: [{
    id:'workflow-parameters',label:'ROS Control defaults',localizedLabel:{ 'en-US':'ROS Control defaults','zh-CN':'ROS 控制默认值' },target:'action-preset',
  }],
  optionSchema: {
    dashboard: { type: 'string' },
    gridColumns: { type: 'number' },
    /* Layout authoring. panelValidation rejects undeclared keys, so these move with the editor. */
    layoutButtonsPerRow: { type: 'number' },
    layoutServiceOrder: { type: 'array' },
    layoutHiddenServices: { type: 'array' },
    autoStartRos: { type: 'boolean' },
    autoStartRviz: { type: 'boolean' },
    autoStartGazeboServer: { type: 'boolean' },
    autoStartGazeboClient: { type: 'boolean' },
    autoStartVrpn: { type: 'boolean' },
    autoStartAdapters: { type: 'boolean' },
    /* The operator's pending process-parameter edits, as one object. Which
       parameters exist is the bound workflow's parameterSchema to say, so
       naming them here would be a second declaration to keep in sync. */
    processParameters: { type: 'object' },
  },
  defaultOptions: {
    ...rosBasicServicesLayoutDefaultOptions(),
  },
  validatePanel: (panel) => validateRosBasicServicesPanelOptions(panel.options),
  defaultPanel: {
    title: 'ROS Control',
    /* Height follows the same wrap the runtime grid uses, so re-authoring buttons per row
       only costs a resize instead of opening a wrong-height panel. */
    gridPos: {
      x: 0,
      y: 0,
      w: 10,
      h: dashboardRowsForSquareControlGrid({
        panelWidthCols: 10,
        itemCount: rosBasicServices.length,
        maxColumns: ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW,
      }),
    },
    query: {},
    options: {
      dashboard: 'gcs',
      ...rosBasicServicesLayoutDefaultOptions(),
    },
  },
  frameProvider: RosBasicServicesPanelFrameProvider,
  headerLeading: RosBasicServicesPanelHeaderLeading,
  headerActions: RosBasicServicesPanelHeaderActions,
  optionsEditor: RosBasicServicesPanelOptionsEditor,
  component: RosBasicServicesPanel,
});
