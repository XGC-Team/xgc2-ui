export const WORKFLOW_RUNTIME_PROTOCOL_NAMESPACE = 'workflowruntime.' as const;
export const WORKFLOW_RUNTIME_ENTITY_TYPE = 'orchestration' as const;
export const SYSTEM_EXPERIMENT_RUNNER_AUTOMATION_RESOURCE_ID = '069f036b-9638-4827-9524-73ff03fe99c9' as const;

function workflowRuntimeValue<const Suffix extends string>(suffix: Suffix) {
  return `${WORKFLOW_RUNTIME_PROTOCOL_NAMESPACE}${suffix}` as `workflowruntime.${Suffix}`;
}

export const workflowRuntimeActions = {
  start: workflowRuntimeValue('start'),
  stop: workflowRuntimeValue('stop'),
  cancel: workflowRuntimeValue('cancel'),
  stopSet: workflowRuntimeValue('stop-set'),
} as const;

export const workflowRuntimeEvents = {
  definitionCreated: workflowRuntimeValue('definition-created'),
  definitionUpdated: workflowRuntimeValue('definition-updated'),
  definitionDeleted: workflowRuntimeValue('definition-deleted'),
  executionClosureInstalled: workflowRuntimeValue('execution-closure-installed'),
  runAccepted: workflowRuntimeValue('run-accepted'),
  runRunning: workflowRuntimeValue('run-running'),
  runWaiting: workflowRuntimeValue('run-waiting'),
  runStopping: workflowRuntimeValue('run-stopping'),
  runSucceeded: workflowRuntimeValue('run-succeeded'),
  runFailed: workflowRuntimeValue('run-failed'),
  runStopped: workflowRuntimeValue('run-stopped'),
  runCanceled: workflowRuntimeValue('run-canceled'),
  runQueued: workflowRuntimeValue('run-queued'),
  runRejected: workflowRuntimeValue('run-rejected'),
  queuedRunStopped: workflowRuntimeValue('queued-run-stopped'),
  queuedRunCanceled: workflowRuntimeValue('queued-run-canceled'),
  stopRequested: workflowRuntimeValue('stop-requested'),
  invocationWaiting: workflowRuntimeValue('invocation-waiting'),
  invocationSucceeded: workflowRuntimeValue('invocation-succeeded'),
  invocationRetry: workflowRuntimeValue('invocation-retry'),
  invocationFailed: workflowRuntimeValue('invocation-failed'),
  invocationLeaseLost: workflowRuntimeValue('invocation-lease-lost'),
  invocationSuspensionFailed: workflowRuntimeValue('invocation-suspension-persistence-failed'),
  invocationSuspensionInvalid: workflowRuntimeValue('invocation-suspension-invalid'),
  nodeSkipped: workflowRuntimeValue('node-skipped'),
  failurePropagated: workflowRuntimeValue('failure-propagated'),
  returnFailed: workflowRuntimeValue('return-failed'),
  runtimeAttachmentFailed: workflowRuntimeValue('runtime-attachment-failed'),
  runtimeAttachmentsWaiting: workflowRuntimeValue('runtime-attachments-waiting'),
  stopSetPlanned: workflowRuntimeValue('stop-set-planned'),
  stopSetItemCompleted: workflowRuntimeValue('stop-set-item-completed'),
  stopSetCompleted: workflowRuntimeValue('stop-set-completed'),
} as const;

export const workflowRuntimeDatasources = {
  run: workflowRuntimeValue('run'),
  runLogs: workflowRuntimeValue('run.logs'),
  runRobots: workflowRuntimeValue('run.robots'),
} as const;

const workflowRuntimeEventTypes = new Set<string>(Object.values(workflowRuntimeEvents));
const workflowRuntimeDefinitionEventTypes = new Set<string>([
  workflowRuntimeEvents.definitionCreated,
  workflowRuntimeEvents.definitionUpdated,
  workflowRuntimeEvents.definitionDeleted,
  workflowRuntimeEvents.executionClosureInstalled,
]);
const workflowRuntimeRunLifecycleEventTypes = new Set<string>([
  workflowRuntimeEvents.runAccepted,
  workflowRuntimeEvents.runRunning,
  workflowRuntimeEvents.runWaiting,
  workflowRuntimeEvents.runStopping,
  workflowRuntimeEvents.runSucceeded,
  workflowRuntimeEvents.runFailed,
  workflowRuntimeEvents.runStopped,
  workflowRuntimeEvents.runCanceled,
  workflowRuntimeEvents.runQueued,
  workflowRuntimeEvents.runRejected,
  workflowRuntimeEvents.queuedRunStopped,
  workflowRuntimeEvents.queuedRunCanceled,
]);

export function isWorkflowRuntimeRunEvent(value: string) {
  return workflowRuntimeEventTypes.has(value) && !workflowRuntimeDefinitionEventTypes.has(value);
}

export function isWorkflowRuntimeDefinitionEvent(value: string) {
  return workflowRuntimeDefinitionEventTypes.has(value);
}

export function isWorkflowRuntimeRunLifecycleEvent(value: string) {
  return workflowRuntimeRunLifecycleEventTypes.has(value);
}
