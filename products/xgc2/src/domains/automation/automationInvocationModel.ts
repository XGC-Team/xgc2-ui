import type { AutomationNode } from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type {
  AutomationAttemptStatus,
  AutomationCompensationStatus,
  AutomationInvocationStatus,
  AutomationNodeAttempt,
  AutomationNodeExecutionSummary,
  AutomationNodeExecutionSummaryStatus,
  AutomationNodeInputRef,
  AutomationNodeInvocation,
  AutomationNodeOccurrenceAggregate,
  AutomationNodeOutputRef,
  AutomationOccurrenceFailure,
} from './automationExecutionContracts';
import {
  digest,
  invalidExecution,
  nonNegativeInteger,
  objectWithKnownKeys,
  optionalDefined,
  optionalNonNegativeIntegerField,
  optionalStringField,
  positiveInteger,
  requiredString,
} from './automationExecutionValidation';

const invocationStatuses = new Set<AutomationInvocationStatus>([
  'ready','running','waiting','retry-wait','succeeded','failed','canceled','skipped',
]);
const attemptStatuses = new Set<AutomationAttemptStatus>(['running','waiting','succeeded','failed','canceled','abandoned']);
const compensationStatuses = new Set<AutomationCompensationStatus>([
  'none','ready','running','retry-wait','succeeded','failed','canceled',
]);
const errorClasses = new Set<AutomationOccurrenceFailure['class']>(['transient','permanent','canceled','uncertain']);
const invocationKeys = new Set([
  'id','runId','nodeId','kind','status','activeAttemptId','currentWaitId','waitGeneration','failure','nextAttemptAt',
  'compensationStatus','compensationFailure','compensationNextAttemptAt','compensationStartedAt','compensationFinishedAt',
  'startedAt','finishedAt','createdAt','updatedAt','revision','attempts','inputRefs','outputRefs',
]);
const attemptKeys = new Set([
  'id','runId','invocationId','phase','number','status','adoptionCount','createdAt','startedAt','finishedAt','updatedAt','revision',
]);
const outputRefKeys = new Set(['id','runId','invocationId','attemptId','nodeId','port','value','valueDigest']);
const inputRefKeys = new Set(['id','runId','consumerInvocationId','edgeId','inputKey','ordinal','producer']);
const failureKeys = new Set(['class','message']);

export function parseAutomationNodeInvocations(value: unknown, path: string, expectedRunID = ''): AutomationNodeInvocation[] {
  if (!Array.isArray(value)) throw invalidExecution(path, 'must be an array');
  const invocationIDs = new Set<string>();
  const attemptIDs = new Set<string>();
  const inputIDs = new Set<string>();
  const outputRefs = new Map<string,AutomationNodeOutputRef>();
  const invocationNodes = new Set<string>();
  let runID = '';
  const invocations = value.map((entry, index) => {
    const invocation = parseInvocation(entry, `${path}[${index}]`, { attemptIDs,inputIDs,outputRefs });
    if (invocationIDs.has(invocation.id)) throw invalidExecution(path, `contains duplicate invocation id "${invocation.id}"`);
    invocationIDs.add(invocation.id);
    if (!runID) runID = invocation.runId;
    if (invocation.runId !== runID) throw invalidExecution(path, 'contains invocations from multiple runs');
    if (expectedRunID && invocation.runId !== expectedRunID) {
      throw invalidExecution(path, `contains invocation for unexpected run "${invocation.runId}"`);
    }
    if (invocationNodes.has(invocation.nodeId)) {
      throw invalidExecution(path, `contains multiple invocations for DAG node "${invocation.nodeId}"`);
    }
    invocationNodes.add(invocation.nodeId);
    return invocation;
  });
  for (const invocation of invocations) {
    for (const input of invocation.inputRefs) {
      const producer = outputRefs.get(input.producer.id);
      if (!producer || !sameOutputLineage(producer, input.producer)) {
        throw invalidExecution(path, `input reference "${input.id}" has missing or inconsistent producer lineage`);
      }
    }
  }
  return invocations;
}

// The canvas consumes a static-node summary derived exclusively from the
// immutable Definition and occurrence ledger. Definition nodes with no
// occurrence remain visible as pending with zero counts.
export function currentAutomationNodeExecutionSummaries(
  run: AutomationRun,
  definitionNodes: AutomationNode[],
  invocations: AutomationNodeInvocation[],
): AutomationNodeExecutionSummary[] {
  const byNode = new Map<string,AutomationNodeInvocation[]>();
  for (const invocation of invocations) {
    byNode.set(invocation.nodeId, [...(byNode.get(invocation.nodeId) ?? []),invocation]);
  }
  return definitionNodes.map((node) => {
    const occurrences = byNode.get(node.id) ?? [];
    if (occurrences.length === 0) return {
      runId: run.id,nodeId: node.id,kind: node.kind,status: 'pending',occurrenceCount: 0,
      activeOccurrenceCount: 0,completedOccurrenceCount: 0,failedOccurrenceCount: 0,
      attemptCount: 0,updatedAt: run.createdAt,revision: 0,
    };
    const latest = [...occurrences].sort((left, right) => (
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
    ))[0];
    return occurrenceNodeSummary(latest, occurrences);
  });
}

export function automationNodeOccurrenceAggregates(
  invocations: AutomationNodeInvocation[],
): Record<string,AutomationNodeOccurrenceAggregate> {
  const aggregates: Record<string,AutomationNodeOccurrenceAggregate> = {};
  const latestUpdates: Record<string,string> = {};
  for (const invocation of invocations) {
    const aggregate = aggregates[invocation.nodeId] ?? {
      nodeId: invocation.nodeId,total: 0,active: 0,failed: 0,completed: 0,latestStatus: invocation.status,
    };
    aggregate.total += 1;
    if (!isInvocationTerminal(invocation.status) || ['ready','running','retry-wait'].includes(invocation.compensationStatus)) {
      aggregate.active += 1;
    }
    if (invocation.status === 'failed' || invocation.compensationStatus === 'failed') aggregate.failed += 1;
    if (isInvocationTerminal(invocation.status)) aggregate.completed += 1;
    if (invocation.updatedAt >= (latestUpdates[invocation.nodeId] ?? '')) {
      aggregate.latestStatus = invocation.status;
      latestUpdates[invocation.nodeId] = invocation.updatedAt;
    }
    aggregates[invocation.nodeId] = aggregate;
  }
  return aggregates;
}

function parseInvocation(
  value: unknown,
  path: string,
  identities: { attemptIDs: Set<string>;inputIDs: Set<string>;outputRefs: Map<string,AutomationNodeOutputRef> },
): AutomationNodeInvocation {
  const entry = objectWithKnownKeys(value, invocationKeys, path);
  const id = requiredString(entry.id, `${path}.id`);
  const runId = requiredString(entry.runId, `${path}.runId`);
  const nodeId = requiredString(entry.nodeId, `${path}.nodeId`);
  const kind = requiredString(entry.kind, `${path}.kind`);
  const status = parseInvocationStatus(entry.status, `${path}.status`);
  const compensationStatus = parseCompensationStatus(entry.compensationStatus, `${path}.compensationStatus`);
  const attempts = parseAttempts(entry.attempts, path, { id,runId }, identities.attemptIDs);
  const outputRefs = parseOutputRefs(entry.outputRefs, `${path}.outputRefs`, { id,runId,nodeId }, identities.outputRefs);
  const inputRefs = parseInputRefs(entry.inputRefs, `${path}.inputRefs`, { id,runId }, identities.inputIDs);
  for (const output of outputRefs) {
    if (!output.attemptId) throw invalidExecution(`${path}.outputRefs`, 'output must identify its producing attempt');
    const attempt = attempts.find((candidate) => candidate.id === output.attemptId);
    if (!attempt || attempt.phase !== 'execution') {
      throw invalidExecution(`${path}.outputRefs`, 'output producing attempt is missing or is not an execution attempt');
    }
  }
  const activeAttemptId = entry.activeAttemptId === undefined ? undefined : requiredString(entry.activeAttemptId, `${path}.activeAttemptId`);
  if (activeAttemptId) {
    const attempt = attempts.find((candidate) => candidate.id === activeAttemptId);
    if (!attempt || isAttemptTerminal(attempt.status)) {
      throw invalidExecution(`${path}.activeAttemptId`, 'must identify a non-terminal attempt on this invocation');
    }
  }
  const currentWaitId = entry.currentWaitId === undefined ? undefined : requiredString(entry.currentWaitId, `${path}.currentWaitId`);
  const waitGeneration = entry.waitGeneration === undefined ? undefined : positiveInteger(entry.waitGeneration, `${path}.waitGeneration`);
  if (currentWaitId && waitGeneration === undefined) {
    throw invalidExecution(path, 'current wait id requires a wait generation');
  }
  return {
    id,runId,nodeId,kind,status,compensationStatus,attempts,inputRefs,outputRefs,
    ...(activeAttemptId ? { activeAttemptId } : {}),
    ...(currentWaitId ? { currentWaitId } : {}),
    ...(waitGeneration === undefined ? {} : { waitGeneration }),
    ...(entry.failure === undefined ? {} : { failure: parseFailure(entry.failure, `${path}.failure`) }),
    ...optionalStringField(entry, 'nextAttemptAt', path),
    ...(entry.compensationFailure === undefined ? {} : { compensationFailure: parseFailure(entry.compensationFailure, `${path}.compensationFailure`) }),
    ...optionalStringField(entry, 'compensationNextAttemptAt', path),
    ...optionalStringField(entry, 'compensationStartedAt', path),
    ...optionalStringField(entry, 'compensationFinishedAt', path),
    ...optionalStringField(entry, 'startedAt', path),
    ...optionalStringField(entry, 'finishedAt', path),
    createdAt: requiredString(entry.createdAt, `${path}.createdAt`),
    updatedAt: requiredString(entry.updatedAt, `${path}.updatedAt`),
    revision: positiveInteger(entry.revision, `${path}.revision`),
  };
}

function parseAttempts(
  value: unknown,
  invocationPath: string,
  invocation: { id: string;runId: string },
  attemptIDs: Set<string>,
): AutomationNodeAttempt[] {
  const path = `${invocationPath}.attempts`;
  if (!Array.isArray(value)) throw invalidExecution(path, 'must be an array');
  const phases = new Set<string>();
  let compensationStarted = false;
  return value.map((attemptValue, index) => {
    const attemptPath = `${path}[${index}]`;
    const entry = objectWithKnownKeys(attemptValue, attemptKeys, attemptPath);
    const id = requiredString(entry.id, `${attemptPath}.id`);
    const runId = requiredString(entry.runId, `${attemptPath}.runId`);
    const invocationId = requiredString(entry.invocationId, `${attemptPath}.invocationId`);
    if (runId !== invocation.runId || invocationId !== invocation.id) {
      throw invalidExecution(attemptPath, 'identity does not match its invocation');
    }
    if (attemptIDs.has(id)) throw invalidExecution(path, `contains duplicate attempt id "${id}"`);
    attemptIDs.add(id);
    const phase = requiredString(entry.phase, `${attemptPath}.phase`);
    if (phase !== 'execution' && phase !== 'compensation') {
      throw invalidExecution(`${attemptPath}.phase`, `has unsupported value "${phase}"`);
    }
    if (phase === 'compensation') compensationStarted = true;
    else if (compensationStarted) throw invalidExecution(path, 'execution attempts must precede compensation attempts');
    const number = positiveInteger(entry.number, `${attemptPath}.number`);
    const phaseNumber = `${phase}:${number}`;
    if (phases.has(phaseNumber)) throw invalidExecution(path, `contains duplicate ${phase} attempt ${number}`);
    phases.add(phaseNumber);
    return {
      id,runId,invocationId,phase,number,status: parseAttemptStatus(entry.status, `${attemptPath}.status`),
      ...optionalNonNegativeIntegerField(entry, 'adoptionCount', attemptPath),
      createdAt: requiredString(entry.createdAt, `${attemptPath}.createdAt`),
      ...optionalStringField(entry, 'startedAt', attemptPath),
      ...optionalStringField(entry, 'finishedAt', attemptPath),
      updatedAt: requiredString(entry.updatedAt, `${attemptPath}.updatedAt`),
      revision: positiveInteger(entry.revision, `${attemptPath}.revision`),
    };
  });
}

function parseOutputRefs(
  value: unknown,
  path: string,
  invocation: { id: string;runId: string;nodeId: string },
  outputIDs: Map<string,AutomationNodeOutputRef>,
) {
  if (!Array.isArray(value)) throw invalidExecution(path, 'must be an array');
  const ports = new Set<string>();
  return value.map((output, index) => {
    const reference = parseOutputRef(output, `${path}[${index}]`);
    if (reference.runId !== invocation.runId || reference.invocationId !== invocation.id || reference.nodeId !== invocation.nodeId) {
      throw invalidExecution(`${path}[${index}]`, 'identity does not match its invocation');
    }
    if (outputIDs.has(reference.id)) throw invalidExecution(path, `contains duplicate output reference id "${reference.id}"`);
    if (ports.has(reference.port)) throw invalidExecution(path, `contains duplicate output port "${reference.port}"`);
    outputIDs.set(reference.id, reference);
    ports.add(reference.port);
    return reference;
  });
}

function parseOutputRef(value: unknown, path: string): AutomationNodeOutputRef {
  const entry = objectWithKnownKeys(value, outputRefKeys, path);
  if (!Object.prototype.hasOwnProperty.call(entry, 'value')) throw invalidExecution(`${path}.value`, 'is required');
  return {
    id: requiredString(entry.id, `${path}.id`),
    runId: requiredString(entry.runId, `${path}.runId`),
    invocationId: requiredString(entry.invocationId, `${path}.invocationId`),
    ...optionalStringField(entry, 'attemptId', path),
    nodeId: requiredString(entry.nodeId, `${path}.nodeId`),
    port: requiredString(entry.port, `${path}.port`),
    value: entry.value,
    valueDigest: digest(entry.valueDigest, `${path}.valueDigest`, true),
  };
}

function parseInputRefs(
  value: unknown,
  path: string,
  invocation: { id: string;runId: string },
  inputIDs: Set<string>,
) {
  if (!Array.isArray(value)) throw invalidExecution(path, 'must be an array');
  const slots = new Set<string>();
  return value.map((input, index) => {
    const inputPath = `${path}[${index}]`;
    const entry = objectWithKnownKeys(input, inputRefKeys, inputPath);
    const reference: AutomationNodeInputRef = {
      id: requiredString(entry.id, `${inputPath}.id`),
      runId: requiredString(entry.runId, `${inputPath}.runId`),
      consumerInvocationId: requiredString(entry.consumerInvocationId, `${inputPath}.consumerInvocationId`),
      edgeId: requiredString(entry.edgeId, `${inputPath}.edgeId`),
      inputKey: requiredString(entry.inputKey, `${inputPath}.inputKey`),
      ordinal: nonNegativeInteger(entry.ordinal, `${inputPath}.ordinal`),
      producer: parseOutputRef(entry.producer, `${inputPath}.producer`),
    };
    if (reference.runId !== invocation.runId || reference.consumerInvocationId !== invocation.id) {
      throw invalidExecution(inputPath, 'identity does not match its consumer invocation');
    }
    if (reference.producer.runId !== invocation.runId) throw invalidExecution(inputPath, 'producer belongs to another run');
    if (inputIDs.has(reference.id)) throw invalidExecution(path, `contains duplicate input reference id "${reference.id}"`);
    const slot = `${reference.edgeId}\0${reference.inputKey}\0${reference.ordinal}`;
    if (slots.has(slot)) throw invalidExecution(path, 'contains duplicate input slot');
    inputIDs.add(reference.id);
    slots.add(slot);
    return reference;
  });
}

function parseFailure(value: unknown, path: string): AutomationOccurrenceFailure {
  const entry = objectWithKnownKeys(value, failureKeys, path);
  const errorClass = requiredString(entry.class, `${path}.class`) as AutomationOccurrenceFailure['class'];
  if (!errorClasses.has(errorClass)) throw invalidExecution(`${path}.class`, `has unsupported value "${errorClass}"`);
  return { class: errorClass,message: requiredString(entry.message, `${path}.message`) };
}

function occurrenceNodeSummary(
  invocation: AutomationNodeInvocation,
  occurrences: AutomationNodeInvocation[],
): AutomationNodeExecutionSummary {
  const inputValues: Record<string,unknown> = {};
  const inputsByKey = new Map<string,AutomationNodeInputRef[]>();
  for (const input of invocation.inputRefs) {
    inputsByKey.set(input.inputKey, [...(inputsByKey.get(input.inputKey) ?? []),input]);
  }
  for (const [key,inputs] of inputsByKey) {
    inputs.sort((left, right) => left.ordinal - right.ordinal);
    inputValues[key] = inputs.length === 1 ? inputs[0].producer.value : inputs.map((input) => input.producer.value);
  }
  const main = invocation.outputRefs.find((output) => output.port === 'main');
  const named = invocation.outputRefs.find((output) => output.port !== 'main');
  const failure = invocation.compensationFailure ?? invocation.failure;
  return {
    runId: invocation.runId,nodeId: invocation.nodeId,kind: invocation.kind,
    status: occurrenceNodeStatus(invocation),latestInvocationId: invocation.id,
    occurrenceCount: occurrences.length,
    activeOccurrenceCount: occurrences.filter((item) => !isInvocationTerminal(item.status)
      || ['ready','running','retry-wait'].includes(item.compensationStatus)).length,
    completedOccurrenceCount: occurrences.filter((item) => isInvocationTerminal(item.status)).length,
    failedOccurrenceCount: occurrences.filter((item) => item.status === 'failed'
      || item.compensationStatus === 'failed').length,
    attemptCount: occurrences.reduce((count, item) => count
      + item.attempts.filter((attempt) => attempt.phase === 'execution').length, 0),
    ...(invocation.inputRefs.length > 0 ? { inputs: inputValues } : {}),
    ...(main ? { output: main.value } : invocation.outputRefs.length === 1 ? { output: invocation.outputRefs[0].value } : {}),
    ...(named ? { route: named.port } : {}),
    ...(failure ? { errorClass: failure.class,error: failure.message } : {}),
    ...optionalDefined('nextAttemptAt', invocation.nextAttemptAt ?? invocation.compensationNextAttemptAt),
    ...optionalDefined('startedAt', invocation.startedAt),
    ...optionalDefined('finishedAt', invocation.compensationFinishedAt ?? invocation.finishedAt),
    updatedAt: invocation.updatedAt,revision: invocation.revision,
  };
}

function occurrenceNodeStatus(invocation: AutomationNodeInvocation): AutomationNodeExecutionSummaryStatus {
  if (invocation.compensationStatus === 'ready' || invocation.compensationStatus === 'running' || invocation.compensationStatus === 'retry-wait') {
    return 'compensating';
  }
  if (invocation.compensationStatus === 'succeeded') return 'compensated';
  // Manual triggers have no compensating side effect. The stopper records
  // that no-op as canceled, but the trigger's successful execution remains
  // the only useful canvas status and must not be rendered as a red failure.
  if (invocation.kind === 'trigger.manual'
    && invocation.status === 'succeeded'
    && invocation.compensationStatus === 'canceled'
    && !invocation.failure
    && !invocation.compensationFailure) return 'succeeded';
  if (invocation.compensationStatus === 'failed' || invocation.compensationStatus === 'canceled') return 'failed';
  if (invocation.status === 'ready' || invocation.status === 'retry-wait') return 'pending';
  if (invocation.status === 'waiting') return 'waiting';
  return invocation.status;
}

function parseInvocationStatus(value: unknown, path: string) {
  const status = requiredString(value, path) as AutomationInvocationStatus;
  if (!invocationStatuses.has(status)) throw invalidExecution(path, `has unsupported value "${status}"`);
  return status;
}

function parseAttemptStatus(value: unknown, path: string) {
  const status = requiredString(value, path) as AutomationAttemptStatus;
  if (!attemptStatuses.has(status)) throw invalidExecution(path, `has unsupported value "${status}"`);
  return status;
}

function parseCompensationStatus(value: unknown, path: string) {
  const status = requiredString(value, path) as AutomationCompensationStatus;
  if (!compensationStatuses.has(status)) throw invalidExecution(path, `has unsupported value "${status}"`);
  return status;
}

function isInvocationTerminal(status: AutomationInvocationStatus) {
  return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'skipped';
}

function isAttemptTerminal(status: AutomationAttemptStatus) {
  return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'abandoned';
}

function sameOutputLineage(left: AutomationNodeOutputRef, right: AutomationNodeOutputRef) {
  return left.id === right.id && left.runId === right.runId && left.invocationId === right.invocationId &&
    left.attemptId === right.attemptId && left.nodeId === right.nodeId && left.port === right.port &&
    left.valueDigest === right.valueDigest && JSON.stringify(left.value) === JSON.stringify(right.value);
}

