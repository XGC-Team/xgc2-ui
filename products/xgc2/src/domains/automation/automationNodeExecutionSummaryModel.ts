import type {
  AutomationNodeExecutionSummary,
  AutomationNodeExecutionSummaryStatus,
  AutomationOccurrenceFailure,
} from './automationExecutionContracts';
import {
  enumField,
  invalidExecution,
  isObject,
  nonNegativeInteger,
  objectWithKnownKeys,
  optionalDefined,
  requiredString,
  requiredTimestamp,
} from './automationExecutionValidation';

const summaryKeys = new Set([
  'runId','nodeId','kind','status','latestInvocationId',
  'occurrenceCount','activeOccurrenceCount','completedOccurrenceCount','failedOccurrenceCount','attemptCount',
  'inputs','output','route','errorClass','error','nextAttemptAt','startedAt','finishedAt','updatedAt','revision',
]);
const statuses = new Set<AutomationNodeExecutionSummaryStatus>([
  'pending','running','waiting','succeeded','failed','canceled','skipped','compensating','compensated',
]);
const errorClasses = new Set<AutomationOccurrenceFailure['class']>([
  'transient','permanent','canceled','uncertain',
]);

export function parseAutomationNodeExecutionSummaries(
  value: unknown,
  path: string,
  expectedRunId: string,
): AutomationNodeExecutionSummary[] {
  if (!Array.isArray(value)) throw invalidExecution(path, 'must be an array');
  const nodeIds = new Set<string>();
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const summary = parseAutomationNodeExecutionSummary(item, itemPath);
    if (summary.runId !== expectedRunId) {
      throw invalidExecution(itemPath, `contains summary for unexpected run "${summary.runId}"`);
    }
    if (nodeIds.has(summary.nodeId)) {
      throw invalidExecution(path, `contains duplicate node id "${summary.nodeId}"`);
    }
    nodeIds.add(summary.nodeId);
    return summary;
  });
}

function parseAutomationNodeExecutionSummary(value: unknown, path: string): AutomationNodeExecutionSummary {
  const entry = objectWithKnownKeys(value, summaryKeys, path);
  const occurrenceCount = nonNegativeInteger(entry.occurrenceCount, `${path}.occurrenceCount`);
  const activeOccurrenceCount = nonNegativeInteger(entry.activeOccurrenceCount, `${path}.activeOccurrenceCount`);
  const completedOccurrenceCount = nonNegativeInteger(entry.completedOccurrenceCount, `${path}.completedOccurrenceCount`);
  const failedOccurrenceCount = nonNegativeInteger(entry.failedOccurrenceCount, `${path}.failedOccurrenceCount`);
  const attemptCount = nonNegativeInteger(entry.attemptCount, `${path}.attemptCount`);
  const revision = nonNegativeInteger(entry.revision, `${path}.revision`);
  const status = enumField(entry.status, statuses, `${path}.status`);
  const latestInvocationId = optionalString(entry, 'latestInvocationId', path);
  if (activeOccurrenceCount + completedOccurrenceCount > occurrenceCount || failedOccurrenceCount > completedOccurrenceCount) {
    throw invalidExecution(path, 'contains inconsistent occurrence counters');
  }
  if (occurrenceCount === 0) {
    if (latestInvocationId || status !== 'pending' || attemptCount !== 0 || revision !== 0) {
      throw invalidExecution(path, 'pending Definition node carries occurrence state');
    }
  } else if (!latestInvocationId || status === 'pending' || revision === 0) {
    throw invalidExecution(path, 'activated node omits its latest occurrence identity');
  }
  if (entry.inputs !== undefined && !isObject(entry.inputs)) {
    throw invalidExecution(`${path}.inputs`, 'must be an object');
  }
  return {
    runId: requiredString(entry.runId, `${path}.runId`),
    nodeId: requiredString(entry.nodeId, `${path}.nodeId`),
    kind: requiredString(entry.kind, `${path}.kind`),
    status,
    ...optionalDefined('latestInvocationId', latestInvocationId),
    occurrenceCount,
    activeOccurrenceCount,
    completedOccurrenceCount,
    failedOccurrenceCount,
    attemptCount,
    ...optionalDefined('inputs', entry.inputs),
    ...optionalDefined('output', entry.output),
    ...optionalDefined('route', optionalString(entry, 'route', path)),
    ...optionalDefined('errorClass', entry.errorClass === undefined
      ? undefined
      : enumField(entry.errorClass, errorClasses, `${path}.errorClass`)),
    ...optionalDefined('error', optionalString(entry, 'error', path)),
    ...optionalDefined('nextAttemptAt', optionalTimestamp(entry, 'nextAttemptAt', path)),
    ...optionalDefined('startedAt', optionalTimestamp(entry, 'startedAt', path)),
    ...optionalDefined('finishedAt', optionalTimestamp(entry, 'finishedAt', path)),
    updatedAt: requiredTimestamp(entry.updatedAt, `${path}.updatedAt`),
    revision,
  };
}

function optionalString(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : requiredString(value[key], `${path}.${key}`);
}

function optionalTimestamp(value: Record<string,unknown>, key: string, path: string) {
  return value[key] === undefined ? undefined : requiredTimestamp(value[key], `${path}.${key}`);
}
