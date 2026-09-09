import type { ConfigRef } from '../../shared/configResource';
import type { AutomationRunStatus } from '../../shared/executionStatusVocabulary';
import type {
  AutomationExecutionRunSummary,
  AutomationRun,
  AutomationRunSummaryView,
} from '../automation/automationPublic';

export type ExperimentConfigRef = ConfigRef<'experiment'>;

export type ExperimentWorkflowTarget = {
  workflowInstanceId:string;
  automationRef:ConfigRef<'automation'>;
  executionTargetId:string;
  actionPresetIds:readonly string[];
};

export type ExperimentRunView = {
  id:string;
  targetId:string;
  experimentRef:ExperimentConfigRef;
  automationResourceId:string;
  actionId:string;
  runMode:string;
  panelId?:string;
  status:AutomationRunStatus;
  revision:number;
  rootRunId:string;
  createdAt:string;
  startedAt?:string;
  updatedAt:string;
  finishedAt?:string;
  workflowTargets:readonly ExperimentWorkflowTarget[];
};

export type ExperimentRunRecord = AutomationRun | AutomationExecutionRunSummary | AutomationRunSummaryView;

export type ExperimentSessionState = 'opening'|'active'|'stopping'|'succeeded'|'failed'|'canceled';
export type ExperimentSessionMemberStatus = 'attached'|'running'|'stopping'|'succeeded'|'failed'|'canceled';
export type ExperimentSessionView = {
  session:{
    id:string;
    targetId:string;
    experimentResourceId:string;
    state:ExperimentSessionState;
    mode:'partial'|'full';
    runMode:string;
    revision:number;
  };
  members:{
    id:string;
    targetId:string;
    sessionId:string;
    bindingId:string;
    kind:string;
    ownerId:string;
    status:ExperimentSessionMemberStatus;
    revision:number;
  }[];
};
