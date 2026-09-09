import { workflowRuntimeDatasources } from '../shared/workflowRuntimeProtocol';
import { dashboardRowsForSquareControlGrid,squareControlGridHeightPx } from '../shared/dashboardGeometry';
import { PX4_ROTOR_CONTROL_PANEL_ITEM_COUNT,PX4RotorControlPanel } from './robot/PX4RotorControlPanel';
import { GROUND_STATION_ACTIVITY_PANEL_ID,GroundStationWorkspaceOptions } from '../domains/groundStationInteraction/groundStationInteractionPublic';
import { GroundStationActivityPanelPlugin } from './groundStation/GroundStationActivityPanelPlugin';
import { GroundStationConversationFrameProvider,GroundStationConversationHeaderActions,GroundStationConversationHeaderLeading } from '../domains/groundStationInteraction/groundStationInteractionPublic';
import {
  RobotControlFrameProvider,
  RobotControlHeaderActions,
  RobotControlHeaderLeading,
} from './robot/RobotPanelFrame';
import { RobotControlPanelOptionsEditor } from './robot/RobotControlPanelOptionsEditor';
import { RobotInstrumentsGrid } from './robot/RobotInstrumentsGrid';
import { experimentRobotAssetsPanelPlugin } from './robot/experimentRobotAssetsPanelManifest';
import { rosBasicServicesPanelPlugin } from './ros/manifest';
import {
  ROBOT_SIMULATION_WORKFLOW_SLOT,
} from './robot/robotSimulationPanelModel';
import { px4RotorControlActions } from './robot/px4RotorControlPanelModel';
import { PREFLIGHT_ARM_TEST_WORKFLOW_SLOT } from './robot/preflightStatusPanelModel';
import { LICHTBLICK_WORKFLOW_SLOT } from './visualization/lichtblickWorkflowModel';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../domains/experiment/experimentPublic';
import { robotSelectionWorkflowParameters } from '../domains/robot/robotPublic';
import { gazeboScenePanelPlugin } from './gazebo/manifest';
import {
  cameraIntrinsicCalibrationPanelPlugin,
  cameraIntrinsicValidationPanelPlugin,
  cameraVideoPanelPlugin,
  gazeboWorldCameraPanelPlugin,
  multiCameraMonitorPanelPlugin,
} from './camera/manifest';
import { automationWorkflowAuditPanelPlugin,automationWorkflowControlPanelPlugin } from './automation/manifest';
import { workflowLogsPanelPlugin } from './automation/workflowLogsManifest';
import { recordingControlPanelPlugin,rosbagPlotPanelPlugin } from './runtime/manifest';
import { LichtblickPlugin } from './builtinPanelComponents';
import { LichtblickPanelFrameProvider,LichtblickPanelHeaderActions,LichtblickPanelHeaderLeading } from './visualization/LichtblickPanelFrame';
import { LichtblickPanelOptionsEditor } from './visualization/LichtblickPanelOptionsEditor';
import { LICHTBLICK_LAYOUT_DEFAULTS,validateLichtblickLayoutOptions } from './visualization/lichtblickLayoutOptions';
import { WebProxyPanelOptionsEditor } from './visualization/WebProxyPanelOptionsEditor';
import { WebProxyWorkspace } from './visualization/WebProxyWorkspace';
import { definePanelPlugin,type AnyPanelPluginDefinition } from './types';

const dashboardOptionSchema = {
  dashboard: { type: 'string' },
  gridColumns: { type: 'number' },
} as const;

export const corePanelPlugins: AnyPanelPluginDefinition[] = [
  automationWorkflowControlPanelPlugin,
  automationWorkflowAuditPanelPlugin,
  workflowLogsPanelPlugin,
  rosBasicServicesPanelPlugin,
  gazeboScenePanelPlugin,
  cameraVideoPanelPlugin,
  multiCameraMonitorPanelPlugin,
  gazeboWorldCameraPanelPlugin,
  cameraIntrinsicCalibrationPanelPlugin,
  cameraIntrinsicValidationPanelPlugin,
  recordingControlPanelPlugin,
  rosbagPlotPanelPlugin,
  experimentRobotAssetsPanelPlugin,
  definePanelPlugin({
    id: GROUND_STATION_ACTIVITY_PANEL_ID,
    name: 'Ground station activity',
    localizedName: { 'en-US':'Ground station activity','zh-CN':'地面站动态' },
    category: 'Operations',
    description: 'Review status, decision requests, and context handoffs for this Experiment dashboard target.',
    localizedDescription: {
      'en-US':'Review status, decision requests, and context handoffs for this Experiment dashboard target.',
      'zh-CN':'查看此实验仪表板目标的状态、决策请求和上下文交接。',
    },
    capabilities: ['visualization'] as const,
    backendCapabilities: [
      'operations.events.read','ground-station.interactions.read','ground-station.interactions.respond',
    ],
    permissions: [
      'operations.events.read','ground-station.interactions.read','ground-station.interactions.respond',
    ],
    executionTargetPolicy: 'dashboard',
    configureOnCreate: false,
    layout: {
      minSize: { w: 4,h: 3 },
      sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
    },
    dataPorts: [{ id:'activity',label:'Ground station activity',contract:'ground-station.interactions.v1',required:true }],
    // Observer: chat/log is a data projection. The bound system-panel-workflow is
    // occupancy chrome for Total Run, not an operator start. Hide header Run/Stop.
    // Settings gear is the shared Panel settings, Edit-only, like every other panel.
    panelWorkflowControls: 'hidden',
    defaultPanel: {
      title: 'Ground station activity',
      gridPos: { x: 0, y: 0, w: 8, h: 10 },
      query: {},
      options: {},
    },
    component: GroundStationActivityPanelPlugin,
    optionsEditor: GroundStationWorkspaceOptions,
    optionSchema: {...dashboardOptionSchema,workspaceId:{type:'string'}},
    frameProvider: GroundStationConversationFrameProvider,
    headerLeading: GroundStationConversationHeaderLeading,
    headerActions: GroundStationConversationHeaderActions,
  }),
  definePanelPlugin({
    id: 'robot-instruments-grid',
    name: 'Robot instruments grid',
    localizedName: { 'en-US':'Robot instruments grid','zh-CN':'机器人仪表网格' },
    category: 'Fleet',
    description: 'Live semantic state plus versioned robot selection that automation nodes can query.',
    localizedDescription: {
      'en-US':'Live semantic state plus versioned robot selection that automation nodes can query.',
      'zh-CN':'显示实时语义状态，并提供自动化节点可查询的版本化机器人选择。',
    },
    capabilities: ['visualization', 'experiment', 'automation'] as const,
    backendCapabilities: [
      'operations.robot.read','operations.process.control','operations.job.control',
      'automations.read','automations.run','robot.read',
    ],
    permissions: [
      'operations.robot.read','operations.process.control','operations.job.control',
      'automations.read','automations.run','robot.read',
    ],
    executionTargetPolicy: 'local',
    // Robot selection is what this panel and Robot control talk to each other
    // through, so it stays one choice per experiment; everything else this panel
    // remembers (view mode, page size) is per instance.
    sharedStateScope: 'experiment',
    interactiveWhileEditing: true,
    workflowRunInputOverrides: ({ experimentId }) => robotSelectionWorkflowParameters(experimentId),
    layout: {
      minSize: { w: 6,h: 4 },
      sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
    },
    dataPorts: [
      { id:'robots',label:'Experiment robots',contract:'experiment.robots.v1',required:true },
      { id:'robot-assets',label:'Robot assets',contract:'robot.assets.v1',required:true },
      { id:'robot-runtime',label:'Experiment runtime',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE },
    ],
    actionPorts: [
      { id:ROBOT_SIMULATION_WORKFLOW_SLOT,label:'Robot simulation',actionKinds:['service'] },
    ],
    optionSchema: {
      ...dashboardOptionSchema,
      typeFilter: { type: 'string' },
      showMeta: { type: 'boolean' },
      compact: { type: 'boolean' },
    },
    defaultOptions: { typeFilter: 'all', showMeta: true, compact: false },
    defaultPanel: {
      title: 'Robot instruments',
      gridPos: { x: 0, y: 0, w: 8, h: 5 },
      query: {},
      options: { dashboard: 'gcs', typeFilter: 'all', showMeta: true, compact: false },
    },
    component: RobotInstrumentsGrid,
  }),
  definePanelPlugin({
    id: 'px4-rotor-control-panel',
    name: 'Robot control',
    localizedName: { 'en-US':'Robot control','zh-CN':'机器人控制' },
    category: 'Control',
    description: 'Switch between UAV, UGV, and Remote control views for the Experiment robots.',
    localizedDescription: {
      'en-US':'Switch between UAV, UGV, and Remote control views for the Experiment robots.',
      'zh-CN':'在实验机器人的无人机、地面车和遥控视图之间切换。',
    },
    capabilities: ['visualization','experiment','automation'] as const,
    backendCapabilities: ['operations.robot.read','operations.robot.control','automations.read','automations.run'],
    permissions: ['operations.robot.read','operations.robot.control','automations.read','automations.run'],
    executionTargetPolicy: 'local',
    configureOnCreate: false,
    // Panel Action ports share one protected routing Action. Keep its internal
    // command discriminator and Robot selection inputs out of generic preset
    // editing so a named control cannot be retargeted to another effect.
    configExposure: { actionDefaults:'hidden' },
    sharedStateScope: 'experiment',
    layout: {
      minSize: { w: 4,h: 2 },
      // The two action rows use one four-column tile track. Its height follows
      // from its width, so GCS mode hands unused rows to the expanding neighbour.
      sizePolicy: { horizontal: 'expanding',vertical: 'fixed' },
      preferredHeightForWidth: (widthPx) => squareControlGridHeightPx({
        panelWidthPx: widthPx,
        itemCount: PX4_ROTOR_CONTROL_PANEL_ITEM_COUNT,
        maxColumns: 4,
        // Mode controls share the first row with Set mode and Arm test.
        headerPx: 34 + 40,
      }),
    },
    frameProvider: RobotControlFrameProvider,
    headerLeading: RobotControlHeaderLeading,
    headerActions: RobotControlHeaderActions,
    dataPorts: [
      { id:'robots',label:'Experiment robots',contract:'experiment.robots.v1',required:true },
      { id:'robot-runtime',label:'Robot runtime',contract:workflowRuntimeDatasources.runRobots },
      { id:'robot-operations',label:'Robot operations',contract:'robot.operation.v1' },
    ],
    // Every effectful control binds an exact Experiment workflow Action preset.
    actionPorts: [
      ...px4RotorControlActions.map((action) => ({ id:action.id,label:action.label,actionKinds:['command'] as const })),
      { id:PREFLIGHT_ARM_TEST_WORKFLOW_SLOT,label:'Preflight arm test',actionKinds:['command'] },
      { id:'remote-control',label:'Remote control',actionKinds:['command'] },
    ],
    optionSchema: {
      ...dashboardOptionSchema,
      springReturn: { type: 'boolean' },
    },
    optionsEditor: RobotControlPanelOptionsEditor,
    // Operator commands are the Action tiles. Total Run / Workflow owns the
    // panel lifecycle and cancel; do not expose a header Play the operator
    // will not press.
    panelWorkflowControls: 'hidden',
    defaultPanel: {
      title: 'Robot control',
      /* One row of four compact action tiles; h matches the cluster at default w. */
      gridPos: {
        x: 8,
        y: 0,
        w: 8,
        h: dashboardRowsForSquareControlGrid({
          panelWidthCols: 8,
          itemCount: PX4_ROTOR_CONTROL_PANEL_ITEM_COUNT,
        }),
      },
      query: {},
      options: { dashboard: 'gcs' },
    },
    component: PX4RotorControlPanel,
  }),
  definePanelPlugin({
    id: 'xgc2-lichtblick',
    name: 'Lichtblick WebUI',
    localizedName: { 'en-US':'Lichtblick WebUI','zh-CN':'Lichtblick WebUI' },
    category: 'Telemetry',
    description: 'Prepare and display the trusted run-aware Lichtblick 3D visualization runtime on the selected Experiment target.',
    localizedDescription: {
      'en-US':'Prepare and display the trusted run-aware Lichtblick 3D visualization runtime on the selected Experiment target.',
      'zh-CN':'在所选实验目标上准备并显示可信、感知运行状态的 Lichtblick 三维可视化运行时。',
    },
    capabilities: ['visualization', 'experiment', 'execution', 'automation'] as const,
    backendCapabilities: [
      'core.view','automations.run','automations.read','experiment.read','robot.read',
      'operations.process.read','operations.events.read',
    ],
    permissions: [
      'core.view','automations.run','automations.read','experiment.read','robot.read',
      'operations.process.read','operations.events.read',
    ],
    executionTargetPolicy: 'dashboard',
    // Core may reuse an exact local listener under a non-canonical ID. Expose
    // every trusted runtime component candidate, then let the ensure response
    // identify the exact instances whose SSE revisions must be followed.
    configureOnCreate: false,
    layout: {
      minSize: { w: 6,h: 4 },
      sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
    },
    dataPorts: [
      { id:'visualization',label:'Lichtblick runtime',contract:EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,required:true },
      { id:'telemetry',label:'ROS telemetry',contract:'ros1.telemetry.v1' },
    ],
    actionPorts: [{ id:LICHTBLICK_WORKFLOW_SLOT,label:'Lichtblick service',required:true,actionKinds:['service'] }],
    optionSchema: {
      ...dashboardOptionSchema,
      layoutMode: { type: 'string' },
      gridVisible: { type: 'boolean' },
      gridColor: { type: 'string' },
      gridSize: { type: 'number' },
      gridDivisions: { type: 'number' },
      gridLineWidth: { type: 'number' },
      axesVisible: { type: 'boolean' },
      axesScale: { type: 'number' },
      markerColor: { type: 'string' },
      plotPaths: { type: 'array' },
    },
    authoringPorts: [
      { id:'workflow-parameters',label:'Lichtblick defaults',localizedLabel:{ 'en-US':'Lichtblick defaults','zh-CN':'Lichtblick 默认值' },target:'action-preset' },
    ],
    defaultOptions: { ...LICHTBLICK_LAYOUT_DEFAULTS },
    optionsEditor: LichtblickPanelOptionsEditor,
    validatePanel: (panel) => validateLichtblickLayoutOptions(panel.options),
    frameProvider: LichtblickPanelFrameProvider,
    headerLeading: LichtblickPanelHeaderLeading,
    headerActions: LichtblickPanelHeaderActions,
    defaultPanel: {
      title: 'Lichtblick',
      gridPos: { x: 0, y: 4, w: 6, h: 5 },
      query: {},
      options: { dashboard: 'gcs',...LICHTBLICK_LAYOUT_DEFAULTS },
    },
    component: LichtblickPlugin,
  }),
  definePanelPlugin({
    id: 'web-proxy',
    name: 'Web proxy',
    localizedName: { 'en-US':'Web proxy','zh-CN':'网页代理' },
    category: 'Telemetry',
    description: 'Reverse-proxy an operator-authored http(s) origin, such as the onboard field panel, into the Experiment dashboard.',
    localizedDescription: {
      'en-US':'Reverse-proxy an operator-authored http(s) origin, such as the onboard field panel, into the Experiment dashboard.',
      'zh-CN':'将操作员配置的 HTTP(S) 来源（如车载现场面板）反向代理到实验仪表板。',
    },
    capabilities: ['visualization', 'experiment'] as const,
    backendCapabilities: ['experiment.read'],
    permissions: ['experiment.read'],
    executionTargetPolicy: 'dashboard',
    configureOnCreate: true,
    layout: {
      minSize: { w: 6,h: 4 },
      sizePolicy: { horizontal: 'expanding',vertical: 'expanding' },
    },
    optionSchema: {
      ...dashboardOptionSchema,
      url: { type: 'string' },
    },
    defaultOptions: { url: '' },
    optionsEditor: WebProxyPanelOptionsEditor,
    defaultPanel: {
      title: 'Web proxy',
      gridPos: { x: 7, y: 10, w: 16, h: 6 },
      query: {},
      options: { dashboard: 'gcs',url: '' },
    },
    component: WebProxyWorkspace,
  }),
];

export const availablePanelPlugins = corePanelPlugins;

const panelPluginsById = new Map<string,AnyPanelPluginDefinition>();
for (const plugin of availablePanelPlugins) {
  if (panelPluginsById.has(plugin.id)) throw new Error(`Panel plugin already registered: ${plugin.id}`);
  panelPluginsById.set(plugin.id, plugin);
}

export function getPanelPlugin(pluginId: string) {
  return panelPluginsById.get(pluginId);
}
