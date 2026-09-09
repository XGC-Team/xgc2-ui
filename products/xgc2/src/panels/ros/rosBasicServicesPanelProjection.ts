import {
  isAutomationExecutionRunActive,
  type AutomationRun,
  type AutomationRunSummaryView,
} from '../../domains/automation/automationPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';
import {
  experimentDescendantRunIds,
  experimentOwnedProcessInstances,
  experimentWorkflowRunIds,
  processReady,
  type ExperimentProcessRuntimeProjection,
} from '../../domains/experiment/experimentPublic';
import { rosBasicServices,type RosBasicServiceId } from './rosBasicServicesPanelModel';
import {
  ROS_CONTROL_PANEL_WORKFLOW_ACTION_ID,
  isRosPanelCallParent,
  pickRosTotalRunServiceChild,
  rosTotalRunLifecycleRootIds,
} from './rosBasicServicesTotalRunChild';

/** Exact call nodes on the ROS Control parent. Total Run maps each tile to that child. */
export const ROS_BASIC_SERVICE_CALL_NODE_ID = {
  roscore:'call-ros',
  gzserver:'call-gzserver',
  gzclient:'call-gzclient',
  rviz:'call-rviz',
  vrpn:'call-vrpn',
  adapters:'call-adapters',
} as const satisfies Record<RosBasicServiceId,string>;

export function rosBasicServiceCallNodeId(actionId:string) {
  const service = rosBasicServices.find((item) => item.id === actionId);
  return service ? ROS_BASIC_SERVICE_CALL_NODE_ID[service.id] : undefined;
}

export type RosBasicServiceBinding = {
  automationResourceId?:string;
  actionId?:string;
  activeRunId?:string;
  activeStatus?:ExperimentProcessRuntimeProjection['runSummaries'][number]['status'];
};

export type RosBasicServiceProjection = {
  service:(typeof rosBasicServices)[number];
  available:boolean;
  runId?:string;
  status:string;
  stopping:boolean;
  progress:{ ready:number;total:number;percent:number;active:number;failed:number };
  displayPercent:number;
  statusDescription:string;
  processes:ProcessInstance[];
};

/**
 * Projects each tile from its bound Panel Workflow Action, exact Run relation
 * closure, and explicitly owned Process instances. It does not infer a ROS DAG
 * or expected Process roster from the service label.
 */
export function projectRosBasicServices(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  shown:readonly RosBasicServiceId[],
  bindings:Partial<Record<RosBasicServiceId,RosBasicServiceBinding>> = {},
):RosBasicServiceProjection[] {
  const experimentRunIds = experimentWorkflowRunIds(runtime);
  return shown.map((id) => {
    const service = rosBasicServices.find((candidate) => candidate.id === id)!;
    const binding = bindings[id];
    const run = selectedRun(runtime,experimentRunIds,binding,id);
    const runIds = run
      ? experimentDescendantRunIds(runtime,[run.id])
      : new Set<string>();
    const processes = experimentOwnedProcessInstances(runtime,runIds);
    const ready = processes.filter(processReady).length;
    const failed = processes.filter(processFailed).length;
    const active = processes.filter(processActive).length;
    const admittedWaiting = !run
      && rosControlAutoStartAdmitted(runtime,experimentRunIds,binding,id);
    const stopping = run?.status === 'stopping'
      || processes.some((process) => process.observedState === 'stopping');
    const status = admittedWaiting
      ? 'waiting'
      : workflowStatus(run?.status,processes,ready,failed,stopping);
    const total = processes.length;
    const nodeFailed = status === 'failed';
    const occupied = nodeFailed ? Math.max(ready + failed, total > 0 ? 1 : 0) : ready;
    const percent = nodeFailed && total === 0
      ? 100
      : total > 0 ? Math.round((occupied / total) * 100) : 0;
    const available = Boolean(binding?.automationResourceId && binding.actionId);
    const runStatus = admittedWaiting ? 'waiting' : run?.status;
    return {
      service,available,runId:run?.id,status,stopping,
      progress:{ ready,total,percent,active,failed },displayPercent:percent,processes,
      statusDescription:statusDescription(available,runStatus,ready,total),
    };
  });
}

export function rosBasicServiceMetric(projection:RosBasicServiceProjection) {
  if (!projection.available || !projection.runId || projection.progress.total === 0) return '';
  return `${projection.progress.ready}/${projection.progress.total}`;
}

function selectedRun(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  experimentRunIds:ReadonlySet<string>,
  binding:RosBasicServiceBinding|undefined,
  serviceId:RosBasicServiceId,
) {
  if (!runtime || !binding?.automationResourceId || !binding.actionId) return undefined;
  const runs = runtimeRuns(runtime);
  const serviceCandidates = runs.filter((run) => (
    experimentRunIds.has(run.id)
    && run.automationResourceId === binding.automationResourceId
    && run.actionId === binding.actionId
  ));
  const newestTerminalUpdatedAt = serviceCandidates
    .filter((run) => !isAutomationExecutionRunActive(run))
    .reduce((latest,run) => run.updatedAt > latest ? run.updatedAt : latest,'');
  const newerThanTerminal = (candidate:{ updatedAt:string }) => (
    !newestTerminalUpdatedAt || candidate.updatedAt > newestTerminalUpdatedAt
  );
  if (binding.activeRunId) {
    const exact = runs.find((run) => (
      run.id === binding.activeRunId && experimentRunIds.has(run.id)
    ));
    if (exact && isAutomationExecutionRunActive(exact) && newerThanTerminal(exact)) return exact;
    // A terminal exact summary is newer truth than the invocation snapshot.
    // Only fall back when the exact Run has not arrived in the closure yet.
    if (!exact && experimentRunIds.has(binding.activeRunId)
      && binding.activeStatus && isAutomationExecutionRunActive({
        id:binding.activeRunId,status:binding.activeStatus,revision:1,
      })) {
      return { id:binding.activeRunId,status:binding.activeStatus };
    }
  }
  const invoked = serviceCandidates
    .filter((run) => isAutomationExecutionRunActive(run) && newerThanTerminal(run))
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt)
      || right.revision - left.revision
      || left.id.localeCompare(right.id))[0];
  if (invoked) return invoked;
  const failed = serviceCandidates
    .filter((run) => run.status === 'failed' || run.status === 'rejected')
    .sort((left,right) => right.updatedAt.localeCompare(left.updatedAt)
      || right.revision - left.revision
      || left.id.localeCompare(right.id))[0];
  if (failed) return failed;
  return totalRunServiceChild(runtime,experimentRunIds,binding,serviceId);
}

function rosControlAutoStartAdmitted(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  experimentRunIds:ReadonlySet<string>,
  binding:RosBasicServiceBinding|undefined,
  serviceId:RosBasicServiceId,
) {
  if (!runtime || !binding?.automationResourceId || !binding.actionId) return false;
  const automationResourceId = binding.automationResourceId;
  const actionId = binding.actionId;
  const service = rosBasicServices.find((item) => item.id === serviceId);
  if (!service) return false;
  const lifecycleRootIds = new Set([
    ...rosTotalRunLifecycleRootIds(runtime.activeRun),
    ...(runtime.activeRuns ?? []).flatMap((run) => [run.id,run.rootRunId].filter(
      (id):id is string => Boolean(id),
    )),
  ]);
  const parents = runtimeRuns(runtime).filter((run) => (
    experimentRunIds.has(run.id) && isRosPanelCallParent(run,{
      automationResourceId,
      actionIds:[ROS_CONTROL_PANEL_WORKFLOW_ACTION_ID,actionId],
      lifecycleRootIds,
    }) && isAutomationExecutionRunActive(run)
  ));
  return parents.some((parent) => {
    const value = runtime.runDetailsById[parent.id]?.run?.parameters?.[service.parameterKey];
    return value === true;
  });
}

function totalRunServiceChild(
  runtime:ExperimentProcessRuntimeProjection,
  experimentRunIds:ReadonlySet<string>,
  binding:RosBasicServiceBinding,
  serviceId:RosBasicServiceId,
) {
  const automationResourceId = binding.automationResourceId;
  const actionId = binding.actionId;
  if (!automationResourceId || !actionId) return undefined;
  const callNodeId = ROS_BASIC_SERVICE_CALL_NODE_ID[serviceId];
  const expected = {
    automationResourceId,
    actionIds:[ROS_CONTROL_PANEL_WORKFLOW_ACTION_ID,actionId],
    lifecycleRootIds:rosTotalRunLifecycleRootIds(runtime.activeRun),
  };
  const runs = runtimeRuns(runtime);
  const lifecycleRootIds = new Set([
    ...expected.lifecycleRootIds,
    ...(runtime.activeRuns ?? []).flatMap((run) => [run.id,run.rootRunId].filter(
      (id):id is string => Boolean(id),
    )),
  ]);
  const parents = runs.filter((run) => (
    experimentRunIds.has(run.id) && isRosPanelCallParent(run,{
      ...expected,lifecycleRootIds,
    })
  ));
  return pickRosTotalRunServiceChild(
    callNodeId,
    parents,
    (parentId) => runtime.runDetailsById[parentId]?.relations?.childRuns ?? [],
    (childRunId,status,revision) => {
      const summary = runs.find((run) => run.id === childRunId);
      if (summary) return isAutomationExecutionRunActive(summary) ? summary : undefined;
      return isAutomationExecutionRunActive({ id:childRunId,status,revision })
        ? { id:childRunId,status }
        : undefined;
    },
  );
}

function runtimeRuns(
  runtime:ExperimentProcessRuntimeProjection,
):Array<AutomationRunSummaryView|AutomationRun> {
  const runs = new Map<string,AutomationRunSummaryView|AutomationRun>();
  runtime.runSummaries.forEach((run) => runs.set(run.id,run));
  Object.values(runtime.runDetailsById).forEach((detail) => {
    const run = detail.run;
    if (!run) return;
    const current = runs.get(run.id);
    if (!current || run.revision >= current.revision) runs.set(run.id,run);
  });
  return [...runs.values()];
}

function workflowStatus(
  runStatus:ExperimentProcessRuntimeProjection['runSummaries'][number]['status']|undefined,
  processes:readonly ProcessInstance[],
  ready:number,
  failed:number,
  stopping:boolean,
) {
  if (!runStatus) return 'idle';
  if (failed > 0 || runStatus === 'failed' || runStatus === 'rejected') return 'failed';
  if (stopping || runStatus === 'canceled' || runStatus === 'stopped') return 'stopping';
  if (processes.length > 0 && ready === processes.length) return 'ready';
  if (processes.some(processActive)) return 'running';
  return runStatus;
}

function statusDescription(
  available:boolean,
  runStatus:string|undefined,
  ready:number,
  total:number,
) {
  if (!available) return 'Panel Workflow Action is not connected';
  if (!runStatus) return 'Panel Workflow Action is idle';
  if (total === 0) return `Workflow ${runStatus}; no owned Process instances reported`;
  return `${ready}/${total} owned Process instances ready`;
}

function processActive(process:ProcessInstance) {
  return process.observedState === 'starting' || process.observedState === 'running';
}

function processFailed(process:ProcessInstance) {
  return process.observedState === 'failed'
    || process.observedState === 'lost'
    || process.readiness.status === 'failing';
}
