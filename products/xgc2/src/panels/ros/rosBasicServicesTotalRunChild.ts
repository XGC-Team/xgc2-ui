import {
  isAutomationExecutionRunActive,
  type AutomationRunSourceKind,
} from '../../domains/automation/automationPublic';
import type { PinnedConfigRef } from '../../shared/configResource';
import type { AutomationRunStatus } from '../../shared/executionStatusVocabulary';

/** ROS Control Panel Workflow action used by Total Run / Panel Run. */
export const ROS_CONTROL_PANEL_WORKFLOW_ACTION_ID = 'start-for-experiment';

export type RosTotalRunParent = {
  id:string;
  automationResourceId:string;
  actionId:string;
  parentRunId?:string;
  sourceKind?:AutomationRunSourceKind;
  sourceRef?:PinnedConfigRef<AutomationRunSourceKind>;
  status?:AutomationRunStatus;
  revision?:number;
};

export type RosTotalRunChildRelation = {
  callNodeId:string;
  parentRunId:string;
  childRunId:string;
  launchAbandonedAt?:string;
  targetRoot?:boolean;
  observedStatus?:AutomationRunStatus;
  runStatus?:AutomationRunStatus;
  observedRevision?:number;
  runRevision?:number;
};

export function rosTotalRunLifecycleRootIds(activeRun?:{ id:string;rootRunId?:string }) {
  if (!activeRun?.id) return new Set<string>();
  return new Set([activeRun.id,activeRun.rootRunId].filter((id):id is string => Boolean(id)));
}

/**
 * Current System lifecycle ROS Panel Workflow parent: start-for-experiment
 * under an active System root. Same-automation + actionId !== service is not enough.
 */
export function isRosTotalRunPanelParent(
  parent:RosTotalRunParent,
  expected:{
    automationResourceId:string;
    panelActionId:string;
    lifecycleRootIds:ReadonlySet<string>;
    workflowBranch?:string;
  },
) {
  return isRosPanelCallParent(parent,{
    automationResourceId:expected.automationResourceId,
    actionIds:[expected.panelActionId],
    lifecycleRootIds:expected.lifecycleRootIds,
    workflowBranch:expected.workflowBranch,
  });
}

/**
 * Exact ROS Panel Action parent whose call-node child may outlive it.
 *
 * automation.call can intentionally continue after the child starts. The
 * parent then reaches a terminal Run state while the supervised child remains
 * a live Experiment Session member. Parent activity is therefore not an
 * ownership requirement; the caller must bind it to an authoritative active
 * Session root and select only an active exact child relation.
 */
export function isRosPanelCallParent(
  parent:RosTotalRunParent,
  expected:{
    automationResourceId:string;
    actionIds:readonly string[];
    lifecycleRootIds:ReadonlySet<string>;
    workflowBranch?:string;
  },
) {
  if (parent.automationResourceId !== expected.automationResourceId) return false;
  if (!expected.actionIds.includes(parent.actionId)) return false;
  if (!parent.parentRunId || !expected.lifecycleRootIds.has(parent.parentRunId)) return false;
  if (parent.sourceKind !== undefined && parent.sourceKind !== 'automation') return false;
  if (parent.sourceRef) {
    if (parent.sourceRef.domain !== 'automation') return false;
    if (parent.sourceRef.resourceId !== expected.automationResourceId) return false;
    if (expected.workflowBranch && parent.sourceRef.branch
      && parent.sourceRef.branch !== expected.workflowBranch) return false;
  }
  return true;
}

export function pickRosTotalRunServiceChild<T extends { id:string }>(
  callNodeId:string,
  parents:readonly { id:string }[],
  childRunsForParent:(parentId:string) => readonly RosTotalRunChildRelation[],
  resolveChild:(childRunId:string,status:AutomationRunStatus,revision:number) => T|undefined,
):T|undefined {
  const matches:T[] = [];
  const latestByChildRun = new Map<string,{ status:AutomationRunStatus;revision:number }>();
  parents.forEach((parent) => {
    childRunsForParent(parent.id).forEach((child) => {
      if (child.callNodeId !== callNodeId || child.parentRunId !== parent.id || child.launchAbandonedAt) return;
      const status = child.targetRoot ? child.observedStatus : child.runStatus;
      const revision = child.targetRoot ? child.observedRevision : child.runRevision;
      if (!status || !revision) return;
      const current = latestByChildRun.get(child.childRunId);
      if (!current || revision > current.revision || (
        revision === current.revision
        && isAutomationExecutionRunActive({ id:child.childRunId,status:current.status,revision })
        && !isAutomationExecutionRunActive({ id:child.childRunId,status,revision })
      )) latestByChildRun.set(child.childRunId,{ status,revision });
    });
  });
  latestByChildRun.forEach(({ status,revision },childRunId) => {
    if (!isAutomationExecutionRunActive({ id:childRunId,status,revision })) return;
    const resolved = resolveChild(childRunId,status,revision);
    if (resolved) matches.push(resolved);
  });
  return matches.length === 1 ? matches[0] : undefined;
}
