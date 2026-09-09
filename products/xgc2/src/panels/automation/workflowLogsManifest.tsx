import { workflowRuntimeDatasources } from '../../shared/workflowRuntimeProtocol';
import { definePanelPlugin } from '../types';
import { WorkflowLogsPanel } from './WorkflowLogsPanel';

export const workflowLogsPanelPlugin = definePanelPlugin({
  id:'workflow-logs',
  name:'Workflow Logs',
  localizedName:{ 'en-US':'Workflow Logs','zh-CN':'工作流日志' },
  category:'Log',
  description:'Inspect stdout, stderr, and lifecycle logs from the workflow tree owned by the current Experiment Workflow Run.',
  localizedDescription:{
    'en-US':'Inspect stdout, stderr, and lifecycle logs from the workflow tree owned by the current Experiment Workflow Run.',
    'zh-CN':'检查当前实验工作流运行所拥有工作流树的标准输出、标准错误和生命周期日志。',
  },
  capabilities:['experiment'] as const,
  backendCapabilities:[
    'automations.read','experiment.read','operations.process.read','operations.job.read',
  ],
  permissions:[
    'automations.read','experiment.read','operations.process.read','operations.job.read',
  ],
  dataPorts:[{ id:'workflow-traces',label:'Workflow traces',localizedLabel:{ 'en-US':'Workflow traces','zh-CN':'工作流跟踪' },contract:workflowRuntimeDatasources.runLogs,required:true }],
  executionTargetPolicy:'dashboard',
  configureOnCreate:false,
  layout:{
    minSize:{ w:4,h:3 },
    sizePolicy:{ horizontal:'expanding',vertical:'expanding' },
  },
  optionSchema:{ followLogs:{ type:'boolean' } },
  querySchema:{},
  defaultOptions:{ followLogs:true },
  defaultPanel:{
    title:'Workflow Logs',
    gridPos:{ x:23,y:21,w:7,h:7 },
    query:{},
    options:{ followLogs:true },
  },
  component:WorkflowLogsPanel,
});
