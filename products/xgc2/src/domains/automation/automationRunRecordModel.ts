import type { PinnedConfigRef } from '../../shared/configResource';
import {
  RUN_STATUS_SET,
  isRunStatusActive,
  isRunStatusTerminal,
  type AutomationRunStatus,
} from '../../shared/executionStatusVocabulary';
import type {
  AutomationRun,
  AutomationRunAdmissionConflict,
  AutomationRunTerminationKind,
} from './automationRunContracts';
import {
  boundedString,
  compareTimestamps,
  digest,
  enumField,
  invalidExecution,
  isObject,
  objectWithKnownKeys,
  optionalBoundedString,
  optionalNonNegativeIntegerValue,
  optionalPositiveInteger,
  optionalString,
  optionalStringField,
  optionalTimestampValue,
  positiveInteger,
  requiredString,
  requiredTimestamp,
} from './automationExecutionValidation';

const runTerminationKinds = new Set<AutomationRunTerminationKind>(['completed','failed','canceled','stopped','rejected']);
const runAdmissionConflicts = new Set<AutomationRunAdmissionConflict>(['queue','reject','replace']);
const triggerInvocationKeys = new Set(['eventId','nodeId','kind','sessionId','occurredAt']);
const runKeys = new Set([
  'id','targetId','automationResourceId','definitionId','definitionVersion','actionId','actionVersion','configDigest','executionPlanDigest','registryDigest',
  'definitionDigest','executionModel','sourceKind','sourceRef','automationRef','status','revision','parameters','reason',
  'terminationKind','primaryError','cleanupErrors','parentRunId','admissionMode','admissionScope','admissionKey','admissionLimit',
  'admissionOnConflict','replacesRunId','rootRunId','callNodeId','throughNodeId','depth','correlationId','triggerInvocation',
  'result','acceptedAt','createdAt','startedAt','updatedAt','finishedAt',
]);
const pinnedConfigRefKeys = new Set(['domain','resourceId','branch','componentId','commitId','version','digest']);
const runSourceKinds = new Set<AutomationRun['sourceKind']>(['experiment','automation']);
const runAdmissionModes = new Set<AutomationRun['admissionMode']>(['parallel','limited']);
const runAdmissionScopes = new Set<AutomationRun['admissionScope']>(['all','root']);

export function parseAutomationRun(value: unknown, path: string): AutomationRun {
  const entry = objectWithKnownKeys(value, runKeys, path);
  const id = boundedString(entry.id, `${path}.id`, 64);
  const targetId = boundedString(entry.targetId, `${path}.targetId`, 128);
  const automationResourceId = boundedString(entry.automationResourceId, `${path}.automationResourceId`, 64);
  const definitionId = requiredString(entry.definitionId, `${path}.definitionId`);
  const definitionVersion = positiveInteger(entry.definitionVersion, `${path}.definitionVersion`);
  const actionId = requiredString(entry.actionId, `${path}.actionId`);
  const actionVersion = positiveInteger(entry.actionVersion, `${path}.actionVersion`);
  const configDigest = digest(entry.configDigest, `${path}.configDigest`, false);
  const executionPlanDigest = digest(entry.executionPlanDigest, `${path}.executionPlanDigest`, false);
  const registryDigest = digest(entry.registryDigest, `${path}.registryDigest`, false);
  const definitionDigest = digest(entry.definitionDigest, `${path}.definitionDigest`, false);
  if (entry.executionModel !== 'orchestration-occurrence-v1') {
    throw invalidExecution(`${path}.executionModel`, `has unsupported value "${String(entry.executionModel ?? '')}"`);
  }
  const sourceKind = enumField(entry.sourceKind, runSourceKinds, `${path}.sourceKind`);
  const sourceRef = parsePinnedConfigRef(entry.sourceRef, `${path}.sourceRef`, sourceKind);
  const automationRef = entry.automationRef === undefined
    ? undefined
    : parsePinnedConfigRef(entry.automationRef, `${path}.automationRef`, 'automation');
  if (sourceKind === 'experiment' && !automationRef) {
    throw invalidExecution(`${path}.automationRef`, 'is required for an Experiment-sourced Automation Run');
  }
  if (sourceKind === 'automation' && sourceRef.resourceId !== automationResourceId) {
    throw invalidExecution(`${path}.sourceRef.resourceId`, 'must match the Automation resource identity');
  }
  if (automationRef && automationRef.resourceId !== automationResourceId) {
    throw invalidExecution(`${path}.automationRef.resourceId`, 'must match the Automation resource identity');
  }
  if (sourceKind === 'automation' && automationRef && !samePinnedConfigRef(sourceRef, automationRef)) {
    throw invalidExecution(`${path}.automationRef`, 'must match the Automation source reference');
  }
  const status = enumField(entry.status, RUN_STATUS_SET, `${path}.status`);
  const termination = parseRunTermination(entry, status, path);
  const revision = positiveInteger(entry.revision, `${path}.revision`);
  if (!isObject(entry.parameters)) throw invalidExecution(`${path}.parameters`, 'must be a JSON object');
  const parameters = entry.parameters;
  const admissionMode = enumField(entry.admissionMode, runAdmissionModes, `${path}.admissionMode`);
  const admissionScope = enumField(entry.admissionScope, runAdmissionScopes, `${path}.admissionScope`);
  const admissionKey = optionalString(entry, 'admissionKey', path);
  const admissionLimit = optionalPositiveInteger(entry, 'admissionLimit', path);
  const admissionOnConflict = entry.admissionOnConflict === undefined
    ? undefined
    : enumField(entry.admissionOnConflict, runAdmissionConflicts, `${path}.admissionOnConflict`);
  if (admissionMode === 'parallel' && (admissionKey || admissionLimit || admissionOnConflict)) {
    throw invalidExecution(path, 'parallel admission must not expose limited-admission metadata');
  }
  if (admissionMode === 'limited' && (!admissionKey || !admissionLimit || !admissionOnConflict)) {
    throw invalidExecution(path, 'limited admission requires a key, limit, and conflict policy');
  }
  const replacesRunId = optionalBoundedString(entry, 'replacesRunId', path, 64);
  if (replacesRunId && admissionOnConflict !== 'replace') {
    throw invalidExecution(`${path}.replacesRunId`, 'requires the replace admission conflict policy');
  }
  if (replacesRunId === id) throw invalidExecution(`${path}.replacesRunId`, 'must not reference the same Run');
  const parentRunId = optionalBoundedString(entry, 'parentRunId', path, 64);
  const rootRunId = optionalBoundedString(entry, 'rootRunId', path, 64);
  const callNodeId = optionalString(entry, 'callNodeId', path);
  const depth = optionalNonNegativeIntegerValue(entry, 'depth', path);
  const correlationId = optionalString(entry, 'correlationId', path);
  if (depth === undefined) throw invalidExecution(`${path}.depth`, 'is required');
  if (depth === 0) {
    if (parentRunId || callNodeId) throw invalidExecution(path, 'a root Run must not expose parent or call-node lineage');
    if (rootRunId !== id) throw invalidExecution(`${path}.rootRunId`, 'must equal the root Run id');
    if (correlationId !== id) throw invalidExecution(`${path}.correlationId`, 'must equal the root Run id');
  } else {
    if (!parentRunId || !rootRunId || !callNodeId || !correlationId) {
      throw invalidExecution(path, 'a child Run requires complete parent, root, call-node, and correlation lineage');
    }
    if (parentRunId === id || rootRunId === id) throw invalidExecution(path, 'a child Run must not reference itself as parent or root');
  }
  const triggerInvocation = entry.triggerInvocation === undefined
    ? undefined
    : parseTriggerInvocation(entry.triggerInvocation, `${path}.triggerInvocation`);
  const acceptedAt = requiredTimestamp(entry.acceptedAt, `${path}.acceptedAt`);
  const createdAt = requiredTimestamp(entry.createdAt, `${path}.createdAt`);
  const startedAt = optionalTimestampValue(entry, 'startedAt', path);
  const updatedAt = requiredTimestamp(entry.updatedAt, `${path}.updatedAt`);
  const finishedAt = optionalTimestampValue(entry, 'finishedAt', path);
  if (compareTimestamps(acceptedAt, createdAt) > 0) throw invalidExecution(path, 'acceptedAt must not follow createdAt');
  if (compareTimestamps(createdAt, updatedAt) > 0) throw invalidExecution(path, 'updatedAt must not precede createdAt');
  if (startedAt && compareTimestamps(createdAt, startedAt) > 0) throw invalidExecution(path, 'startedAt must not precede createdAt');
  if (startedAt && compareTimestamps(startedAt, updatedAt) > 0) throw invalidExecution(path, 'startedAt must not follow updatedAt');
  if (finishedAt && compareTimestamps(createdAt, finishedAt) > 0) throw invalidExecution(path, 'finishedAt must not precede createdAt');
  if (finishedAt && compareTimestamps(finishedAt, updatedAt) > 0) throw invalidExecution(path, 'finishedAt must not follow updatedAt');
  const terminal = isRunStatusTerminal(status);
  if (terminal !== Boolean(finishedAt)) throw invalidExecution(path, 'terminal status and finishedAt must be present together');
  if (status === 'rejected' && startedAt) throw invalidExecution(path, 'a rejected Run must not have startedAt');
  const resultPresent = Object.prototype.hasOwnProperty.call(entry, 'result');
  return {
    id,targetId,automationResourceId,definitionId,definitionVersion,actionId,actionVersion,
    configDigest,executionPlanDigest,registryDigest,definitionDigest,
    executionModel: 'orchestration-occurrence-v1',sourceKind,sourceRef,
    ...(automationRef === undefined ? {} : { automationRef }),status,revision,parameters,
    ...optionalStringField(entry, 'reason', path),
    ...termination,
    ...(parentRunId === undefined ? {} : { parentRunId }),
    admissionMode,admissionScope,
    ...(admissionKey === undefined ? {} : { admissionKey }),
    ...(admissionLimit === undefined ? {} : { admissionLimit }),
    ...(admissionOnConflict === undefined ? {} : { admissionOnConflict }),
    ...(replacesRunId === undefined ? {} : { replacesRunId }),
    rootRunId: rootRunId!,
    ...(callNodeId === undefined ? {} : { callNodeId }),
    ...optionalStringField(entry, 'throughNodeId', path),
    depth,
    correlationId: correlationId!,
    ...(triggerInvocation === undefined ? {} : { triggerInvocation }),
    ...(resultPresent ? { result: entry.result } : {}),
    acceptedAt,createdAt,
    ...(startedAt === undefined ? {} : { startedAt }),
    updatedAt,
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

function parseRunTermination(
  entry: Record<string,unknown>,
  status: AutomationRunStatus,
  path: string,
): Pick<AutomationRun,'terminationKind' | 'primaryError' | 'cleanupErrors'> {
  const terminationKind = entry.terminationKind === undefined
    ? undefined
    : enumField(entry.terminationKind, runTerminationKinds, `${path}.terminationKind`);
  const primaryError = optionalString(entry, 'primaryError', path);
  let cleanupErrors: string[] | undefined;
  if (entry.cleanupErrors !== undefined) {
    if (!Array.isArray(entry.cleanupErrors) || entry.cleanupErrors.length === 0) {
      throw invalidExecution(`${path}.cleanupErrors`, 'must be a non-empty array when present');
    }
    cleanupErrors = entry.cleanupErrors.map((value, index) => requiredString(value, `${path}.cleanupErrors[${index}]`));
  }
  const active = isRunStatusActive(status) && status !== 'stopping';
  if (active && (terminationKind || primaryError || cleanupErrors)) {
    throw invalidExecution(path, 'an active Run must not expose termination facts');
  }
  if (status === 'stopping') {
    if (!terminationKind || !['failed','canceled','stopped'].includes(terminationKind) || cleanupErrors ||
      ((terminationKind === 'failed') !== Boolean(primaryError))) {
      throw invalidExecution(path, 'a stopping Run has inconsistent termination facts');
    }
  }
  const expected: Partial<Record<AutomationRunStatus,AutomationRunTerminationKind>> = {
    succeeded: 'completed',canceled: 'canceled',stopped: 'stopped',rejected: 'rejected',
  };
  if (expected[status] && (terminationKind !== expected[status] || primaryError || cleanupErrors)) {
    throw invalidExecution(path, 'terminal status and termination facts disagree');
  }
  if (status === 'failed') {
    const cleanupFailure = Boolean(cleanupErrors);
    if (!terminationKind || (cleanupFailure
      ? !['failed','canceled','stopped'].includes(terminationKind)
      : terminationKind !== 'failed') || ((terminationKind === 'failed') !== Boolean(primaryError))) {
      throw invalidExecution(path, 'a failed Run has inconsistent primary or cleanup failure facts');
    }
  }
  return {
    ...(terminationKind === undefined ? {} : { terminationKind }),
    ...(primaryError === undefined ? {} : { primaryError }),
    ...(cleanupErrors === undefined ? {} : { cleanupErrors }),
  };
}

function parseTriggerInvocation(value: unknown, path: string): AutomationRun['triggerInvocation'] {
  const invocation = objectWithKnownKeys(value, triggerInvocationKeys, path);
  return {
    eventId: requiredString(invocation.eventId, `${path}.eventId`),
    nodeId: requiredString(invocation.nodeId, `${path}.nodeId`),
    kind: requiredString(invocation.kind, `${path}.kind`),
    ...optionalStringField(invocation, 'sessionId', path),
    occurredAt: requiredTimestamp(invocation.occurredAt, `${path}.occurredAt`),
  };
}

function parsePinnedConfigRef<Domain extends AutomationRun['sourceKind']>(
  value: unknown,
  path: string,
  expectedDomain: Domain,
): PinnedConfigRef<Domain> {
  const reference = objectWithKnownKeys(value, pinnedConfigRefKeys, path);
  const domain = requiredString(reference.domain, `${path}.domain`);
  if (domain !== expectedDomain) throw invalidExecution(`${path}.domain`, `must be "${expectedDomain}"`);
  return {
    domain: expectedDomain,
    resourceId: boundedString(reference.resourceId, `${path}.resourceId`, 128),
    branch: boundedString(reference.branch, `${path}.branch`, 128),
    ...optionalStringField(reference, 'componentId', path),
    commitId: requiredString(reference.commitId, `${path}.commitId`),
    version: positiveInteger(reference.version, `${path}.version`),
    digest: digest(reference.digest, `${path}.digest`, false),
  };
}

function samePinnedConfigRef(left: PinnedConfigRef, right: PinnedConfigRef) {
  return left.domain === right.domain && left.resourceId === right.resourceId && left.branch === right.branch &&
    left.componentId === right.componentId && left.commitId === right.commitId && left.version === right.version &&
    left.digest === right.digest;
}
