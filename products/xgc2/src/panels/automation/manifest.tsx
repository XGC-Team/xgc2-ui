import { workflowRuntimeDatasources } from '../../shared/workflowRuntimeProtocol';
import {
  CONTROL_ACTION_GRID_DENSITY_COLUMNS,
  dashboardRowsForSquareControlGrid,
  squareControlGridHeightPx,
} from '../../shared/dashboardGeometry';
import { definePanelPlugin } from '../types';
import {
  AutomationWorkflowAuditPanel,
  AutomationWorkflowControlPanel,
} from './AutomationWorkflowPanel';
import {
  AutomationWorkflowAuditFrameProvider,
  AutomationWorkflowAuditHeaderActions,
  AutomationWorkflowControlFrameProvider,
  AutomationWorkflowControlHeaderActions,
} from './AutomationWorkflowPanelFrame';
import {
  validateAutomationWorkflowAuditOptions,
  validateAutomationWorkflowControlOptions,
} from './automationWorkflowPanelModel';

const commonOptionSchema = {
  dashboard: { type: 'string' },
  gridColumns: { type: 'number' },
  automationResourceIds: { type: 'array' },
  defaultView: { type: 'string' },
} as const;

function automationControlItemCount(panel: { options: Record<string,unknown>;portBindings: { kind:string }[] }) {
  const actions = panel.portBindings.filter((binding) => binding.kind === 'action').length;
  if (actions > 0) return actions;
  const ids = panel.options.automationResourceIds;
  return Array.isArray(ids) && ids.length > 0 ? ids.length : 1;
}

export const automationWorkflowControlPanelPlugin = definePanelPlugin({
  id: 'automation-workflow-control',
  name: 'Automation Control',
  localizedName: { 'en-US':'Automation Control','zh-CN':'自动化控制' },
  category: 'Automation',
  description: 'Run selected Automation workflows and inspect status, node output, stdout and stderr in one panel.',
  localizedDescription: {
    'en-US':'Run selected Automation workflows and inspect status, node output, stdout and stderr in one panel.',
    'zh-CN':'运行所选自动化工作流，并在一个面板中检查状态、节点输出、标准输出和标准错误。',
  },
  capabilities: ['automation','experiment'] as const,
  backendCapabilities: ['automations.read','automations.run'],
  permissions: ['automations.read','automations.run'],
  dynamicActionPorts: { source:'panel-action-bindings' },
  dataPorts: [
    { id:'runtime',label:'Workflow runtime',localizedLabel:{ 'en-US':'Workflow runtime','zh-CN':'工作流运行时' },contract:workflowRuntimeDatasources.run },
    { id:'trace',label:'Invocation trace',localizedLabel:{ 'en-US':'Invocation trace','zh-CN':'调用跟踪' },contract:workflowRuntimeDatasources.runLogs },
  ],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  layout: {
    minSize: { w: 4,h: 2 },
    // Same fixed-height contract as ROS / PX4 control clusters.
    sizePolicy: { horizontal: 'expanding',vertical: 'fixed' },
    preferredHeightForWidth: (widthPx, panel) => squareControlGridHeightPx({
      panelWidthPx: widthPx,
      itemCount: automationControlItemCount(panel),
      maxColumns: CONTROL_ACTION_GRID_DENSITY_COLUMNS,
    }),
  },
  frameProvider: AutomationWorkflowControlFrameProvider,
  headerLeading: AutomationWorkflowControlHeaderActions,
  optionSchema: {
    ...commonOptionSchema,
    historyLimit: { type: 'number' },
    followLogs: { type: 'boolean' },
    panelWorkflowControls: { type:'string' },
  },
  querySchema: {},
  defaultOptions: {
    defaultView: 'controls',
    historyLimit: 10,
    followLogs: true,
  },
  defaultPanel: {
    title: 'Automation Control',
    gridPos: {
      x: 0,
      y: 0,
      w: 12,
      h: dashboardRowsForSquareControlGrid({
        panelWidthCols: 12,
        itemCount: 1,
        maxColumns: CONTROL_ACTION_GRID_DENSITY_COLUMNS,
      }),
    },
    query: {},
    options: {
      defaultView: 'controls',
      historyLimit: 10,
      followLogs: true,
    },
  },
  validatePanel: (panel) => validateAutomationWorkflowControlOptions(panel.options),
  component: AutomationWorkflowControlPanel,
});

export const automationWorkflowAuditPanelPlugin = definePanelPlugin({
  id: 'automation-workflow-audit',
  name: 'Automation Logs',
  localizedName: { 'en-US':'Automation Logs','zh-CN':'自动化日志' },
  category: 'Automation',
  description: 'Audit workflow execution history, node output, errors, stdout and stderr.',
  localizedDescription: {
    'en-US':'Audit workflow execution history, node output, errors, stdout and stderr.',
    'zh-CN':'审查工作流运行历史、节点输出、错误、标准输出和标准错误。',
  },
  capabilities: ['automation','experiment'] as const,
  backendCapabilities: ['automations.read'],
  permissions: ['automations.read'],
  dataPorts: [
    { id:'runtime',label:'Workflow runtime',localizedLabel:{ 'en-US':'Workflow runtime','zh-CN':'工作流运行时' },contract:workflowRuntimeDatasources.run },
    { id:'trace',label:'Workflow traces',localizedLabel:{ 'en-US':'Workflow traces','zh-CN':'工作流跟踪' },contract:workflowRuntimeDatasources.runLogs,required:true },
  ],
  executionTargetPolicy: 'dashboard',
  configureOnCreate: false,
  frameProvider: AutomationWorkflowAuditFrameProvider,
  headerLeading: AutomationWorkflowAuditHeaderActions,
  optionSchema: {
    ...commonOptionSchema,
    historyLimit: { type: 'number' },
    followLogs: { type: 'boolean' },
  },
  querySchema: {},
  defaultOptions: {
    defaultView: 'history',
    historyLimit: 10,
    followLogs: true,
  },
  defaultPanel: {
    title: 'Automation Logs',
    gridPos: { x: 12,y: 0,w: 18,h: 7 },
    query: {},
    options: {
      defaultView: 'history',
      historyLimit: 10,
      followLogs: true,
    },
  },
  validatePanel: (panel) => validateAutomationWorkflowAuditOptions(panel.options),
  component: AutomationWorkflowAuditPanel,
});
