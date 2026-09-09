import type { ConfigRef } from '../../shared/configResource';
import { request } from '../../api/http';
import { isRunStatusActive } from '../../shared/executionStatusVocabulary';
import { createMutationIdentity } from '../../shared/utils/intent';
import { SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID } from '../../shared/workflowRuntimeProtocol';
import {
  getAutomationRun,
  isAutomationRunRevisionConflict,
  startAutomationRun,
  stopAutomationRunSet,
  type AutomationRun,
  type AutomationRunControl,
  type AutomationStopRunSetResponse,
} from '../automation/automationPublic';
import type { ExperimentDocument } from './experimentModel';
import type {
  ExperimentConfigRef,
  ExperimentSessionView,
  ExperimentRunRecord,
  ExperimentRunView,
  ExperimentWorkflowTarget,
} from './experimentWorkflowModel';

export type {
  ExperimentRunRecord,
  ExperimentRunView,
  ExperimentWorkflowTarget,
} from './experimentWorkflowModel';

export const SYSTEM_EXPERIMENT_RUNNER = Object.freeze({
  systemKey:'system-experiment-runner',
  resourceId:SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID,
  branch:'main',
  actions:Object.freeze({
    run:'run',
    runPanel:'run-panel',
    invokePanelAction:'invoke-panel-action',
    stopAll:'stop-all',
  }),
});

export async function listActiveExperimentSessions(
  targetId:string,
  experimentResourceId = '',
  signal?:AbortSignal,
):Promise<ExperimentSessionView[]> {
  const query = experimentResourceId.trim()
    ? `?experimentId=${encodeURIComponent(experimentResourceId.trim())}`
    : '';
  return request<ExperimentSessionView[]>(
    `/execution-targets/${encodeURIComponent(targetId)}/experiment-sessions${query}`,
    { signal,cache:'no-store' },
  );
}

export function runningExperimentIdsFromSessions(
  views:readonly ExperimentSessionView[],
):ReadonlySet<string> {
  return new Set(views.flatMap((view) => isExperimentSessionActive(view)
    ? [view.session.experimentResourceId]
    : []));
}

export function experimentSessionIsRunning(
  views:readonly ExperimentSessionView[],
  experimentResourceId:string,
):boolean {
  return views.some((view) => view.session.experimentResourceId === experimentResourceId
    && isExperimentSessionActive(view));
}

/**
 * System command roots still owned by an active Experiment Session.
 *
 * A command Run may finish after it has launched a supervised child. The
 * Session member deliberately remains non-terminal until that owned child
 * closes, so the member is the stronger lifecycle truth for restoring the
 * command's exact Run-relation closure after navigation or refresh.
 */
export function activeExperimentSessionCommandRootIds(
  views:readonly ExperimentSessionView[],
  experimentResourceId:string,
  targetId:string,
):ReadonlySet<string> {
  return new Set(sessionCommandRootMembers(views,experimentResourceId,targetId).flatMap((member) => (
    member.status === 'attached'
      || member.status === 'running'
      || member.status === 'stopping'
      ? [member.ownerId]
      : []
  )));
}

/**
 * Every System command root recorded by an active Experiment Session.
 *
 * A Session member can become terminal before its command Run projection does
 * (for example, one collected Panel failure while sibling Panel Workflows keep
 * the full Run waiting). Reload must inspect that exact command Run before
 * deciding whether it is active; the terminal member alone is not Run truth.
 */
export function experimentSessionCommandRootIds(
  views:readonly ExperimentSessionView[],
  experimentResourceId:string,
  targetId:string,
):ReadonlySet<string> {
  return new Set(sessionCommandRootMembers(views,experimentResourceId,targetId).map((member) => member.ownerId));
}

function sessionCommandRootMembers(
  views:readonly ExperimentSessionView[],
  experimentResourceId:string,
  targetId:string,
) {
  return views.flatMap((view) => (
    view.session.experimentResourceId === experimentResourceId
    && view.session.targetId === targetId
    && isExperimentSessionActive(view)
      ? view.members.flatMap((member) => (
        member.kind === 'workflow_command'
        && member.ownerId.trim() === member.ownerId
        && member.ownerId
          ? [member]
          : []
      ))
      : []
  ));
}

function isExperimentSessionActive(view:ExperimentSessionView) {
  return view.session.state === 'opening'
    || view.session.state === 'active'
    || view.session.state === 'stopping';
}

/**
 * Experiment runtime is a projection of an ordinary Automation root Run.
 * Process/media readiness belongs to the authored Panel Workflows and their
 * runtime relations; it is never synthesized here from a template profile.
 */
export async function startExperimentRun(
  targetId:string,
  experiment:ExperimentDocument,
  runMode:string,
):Promise<ExperimentRunView> {
  const exactRunMode = runMode.trim();
  if (!exactRunMode) throw new Error('Experiment Run requires a runMode string.');
  const run = await startAutomationRun(targetId,{
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
    automationRef:systemExperimentRunnerRef(),
    experimentRef:experimentConfigRef(experiment),
    parameters:{ runMode:exactRunMode },
    reason:`Run Experiment ${experiment.spec.name}`,
  });
  return experimentRunView(run,experiment,targetId);
}

export async function startExperimentPanelRun(
  targetId:string,
  experiment:ExperimentDocument,
  runMode:string,
  panelId:string,
  inputOverrides:Record<string,unknown> = {},
):Promise<ExperimentRunView> {
  const exactRunMode = runMode.trim();
  const exactPanelId = panelId.trim();
  if (!exactRunMode || !exactPanelId) throw new Error('Panel Run requires exact panelId and runMode strings.');
  const run = await startAutomationRun(targetId,{
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.runPanel,
    automationRef:systemExperimentRunnerRef(),
    experimentRef:experimentConfigRef(experiment),
    parameters:{
      panelId:exactPanelId,
      runMode:exactRunMode,
      inputOverridesJson:JSON.stringify(inputOverrides),
    },
    reason:`Run Panel ${exactPanelId} in Experiment ${experiment.spec.name}`,
  });
  return experimentRunView(run,experiment,targetId);
}

export async function invokeExperimentPanelAction(
  targetId:string,
  experiment:ExperimentDocument,
  runMode:string,
  panelId:string,
  presetId:string,
  inputOverrides:Record<string,unknown>,
  reason?:string,
):Promise<ExperimentRunView> {
  const exactRunMode = runMode.trim();
  const exactPanelId = panelId.trim();
  const exactPresetId = presetId.trim();
  if (!exactRunMode || !exactPanelId || !exactPresetId) {
    throw new Error('Panel Action requires exact panelId, presetId and runMode strings.');
  }
  const run = await startAutomationRun(targetId,{
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction,
    automationRef:systemExperimentRunnerRef(),
    experimentRef:experimentConfigRef(experiment),
    parameters:{
      panelId:exactPanelId,presetId:exactPresetId,runMode:exactRunMode,
      inputOverridesJson:JSON.stringify(inputOverrides),
    },
    reason:reason?.trim() || `Invoke Panel Action ${exactPresetId} from ${exactPanelId}`,
  });
  return experimentRunView(run,experiment,targetId);
}

export async function stopExperimentRun(
  targetId:string,
  experiment:ExperimentDocument,
):Promise<ExperimentRunView> {
  const run = await startAutomationRun(targetId,{
    actionId:SYSTEM_EXPERIMENT_RUNNER.actions.stopAll,
    automationRef:systemExperimentRunnerRef(),
    experimentRef:experimentConfigRef(experiment),
    parameters:{},
    reason:`Stop Experiment ${experiment.head.resourceId}`,
  });
  return experimentRunView(run,experiment,targetId);
}

export async function stopExperimentRunnerRoot(
  targetId:string,
  root:AutomationRunControl,
  reason:string,
):Promise<AutomationStopRunSetResponse> {
  let anchor = root;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await stopAutomationRunSet(targetId,anchor.id,{
        expectedRevision:anchor.revision,
        includeAnchor:true,
        // This is an explicit operator stop of one Panel/Action root. Total
        // Stop uses the protected stop-all Action and deliberately retains
        // detached-observed Agent roots.
        includeDetached:true,
        reason,
        ...createMutationIdentity('experiment.panel-run-set.stop'),
      });
    } catch (cause) {
      if (!isAutomationRunRevisionConflict(cause) || attempt === 2) throw cause;
      const refreshed = await getAutomationRun(targetId,anchor.id);
      if (!isSystemExperimentRunnerRoot(refreshed)) {
        throw new Error('Panel Runner identity changed while Stop was being reconciled.');
      }
      anchor = refreshed;
    }
  }
  throw new Error('Panel stop-set retry exhausted.');
}


export function experimentRunView(
  run:ExperimentRunRecord,
  experiment:ExperimentDocument,
  fallbackTargetId:string,
  exactRun?:AutomationRun,
):ExperimentRunView {
  if (!isSystemExperimentRunnerRoot(run)
    || !sameExperimentRef(run.sourceRef,experimentConfigRef(experiment))) {
    throw new Error('Automation Run is not the selected Experiment System Runner root.');
  }
  const sourceRef = run.sourceRef;
  if (!sourceRef) throw new Error('Experiment System Runner source is unavailable.');
  const parameterSource = exactRun && exactRun.id === run.id ? exactRun : run;
  return {
    id:run.id,
    targetId:run.targetId || fallbackTargetId,
    experimentRef:{
      domain:'experiment',
      resourceId:sourceRef.resourceId,
      branch:sourceRef.branch,
    },
    automationResourceId:run.automationResourceId,
    actionId:run.actionId,
    runMode:runModeFrom(parameterSource),
    ...(panelIdFrom(parameterSource) ? { panelId:panelIdFrom(parameterSource) } : {}),
    status:run.status,
    revision:run.revision,
    rootRunId:run.rootRunId || run.id,
    createdAt:run.createdAt,
    ...(run.startedAt ? { startedAt:run.startedAt } : {}),
    updatedAt:run.updatedAt,
    ...(run.finishedAt ? { finishedAt:run.finishedAt } : {}),
    workflowTargets:authoredWorkflowTargets(experiment,fallbackTargetId),
  };
}

export function activeExperimentRun(
  runs:readonly ExperimentRunRecord[],
  experiment:ExperimentDocument,
  targetId:string,
  exactRuns:Readonly<Record<string,{ run?:AutomationRun }>> = {},
  sessionCommandRootIds:ReadonlySet<string> = new Set(),
):ExperimentRunView|undefined {
  const active = activeExperimentRuns(
    runs,experiment,targetId,exactRuns,sessionCommandRootIds,
  )[0];
  return active;
}

export function activeExperimentRuns(
  runs:readonly ExperimentRunRecord[],
  experiment:ExperimentDocument,
  targetId:string,
  exactRuns:Readonly<Record<string,{ run?:AutomationRun }>> = {},
  sessionCommandRootIds:ReadonlySet<string> = new Set(),
):ExperimentRunView[] {
  const experimentRef = experimentConfigRef(experiment);
  return runs
    .filter((run) => (isRunStatusActive(run.status) || sessionCommandRootIds.has(run.id))
      && isSystemExperimentRunnerRoot(run)
      && run.actionId !== SYSTEM_EXPERIMENT_RUNNER.actions.stopAll
      && sameExperimentRef(run.sourceRef,experimentRef))
    .sort((left,right) => (
      Number(isRunStatusActive(right.status)) - Number(isRunStatusActive(left.status))
      || compareExperimentRuns(left,right)
    ))
    .map((run) => experimentRunView(run,experiment,targetId,exactRuns[run.id]?.run));
}

export function runningExperimentIds(
  runs:readonly ExperimentRunRecord[],
):ReadonlySet<string> {
  return new Set(runs.flatMap((run) => (
    isRunStatusActive(run.status)
      && isSystemExperimentRunnerRoot(run)
      && run.actionId !== SYSTEM_EXPERIMENT_RUNNER.actions.stopAll
      && run.sourceRef?.domain === 'experiment'
      ? [run.sourceRef.resourceId]
      : []
  )));
}

export function systemExperimentRunnerRef():ConfigRef<'automation'> {
  return {
    domain:'automation',
    resourceId:SYSTEM_EXPERIMENT_RUNNER.resourceId,
    branch:SYSTEM_EXPERIMENT_RUNNER.branch,
  };
}

export function isSystemExperimentRunnerRoot(run:ExperimentRunRecord):boolean {
  return run.automationResourceId === SYSTEM_EXPERIMENT_RUNNER.resourceId
    && (Object.values(SYSTEM_EXPERIMENT_RUNNER.actions) as readonly string[]).includes(run.actionId)
    && run.sourceKind === 'experiment'
    && run.sourceRef?.domain === 'experiment'
    && !run.parentRunId
    && (!run.rootRunId || run.rootRunId === run.id)
    && (!('depth' in run) || run.depth === undefined || run.depth === 0);
}

function authoredWorkflowTargets(
  experiment:ExperimentDocument,
  inheritedTargetId:string,
):ExperimentWorkflowTarget[] {
  return experiment.spec.workflowInstances.map((instance) => ({
    workflowInstanceId:instance.id,
    automationRef:{
      domain:'automation',
      resourceId:instance.ref.resourceId,
      branch:instance.ref.branch,
      ...(instance.ref.componentId ? { componentId:instance.ref.componentId } : {}),
    },
    executionTargetId:instance.executionTargetId || inheritedTargetId,
    actionPresetIds:instance.actionPresets.map((preset) => preset.id),
  }));
}

function experimentConfigRef(experiment:ExperimentDocument):ExperimentConfigRef {
  return {
    domain:'experiment',
    resourceId:experiment.head.resourceId,
    branch:experiment.branch.name,
  };
}

function runModeFrom(run:ExperimentRunRecord):string {
  const value = 'parameters' in run ? run.parameters.runMode : run.experimentSelector?.runMode;
  return typeof value === 'string' ? value : '';
}

function panelIdFrom(run:ExperimentRunRecord):string {
  const value = 'parameters' in run ? run.parameters.panelId : run.experimentSelector?.panelId;
  return typeof value === 'string' ? value : '';
}

function sameExperimentRef(
  left:Pick<ConfigRef,'domain'|'resourceId'|'branch'>|undefined,
  right:ExperimentConfigRef,
) {
  return left?.domain === 'experiment'
    && left.resourceId === right.resourceId
    && left.branch === right.branch;
}

function compareExperimentRuns(left:ExperimentRunRecord,right:ExperimentRunRecord) {
  return right.revision - left.revision
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.id.localeCompare(right.id);
}
