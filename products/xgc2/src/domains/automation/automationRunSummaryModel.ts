import { isAutomationTriggerKind } from './automationTriggerContracts';
import type {
  AutomationRunAdmissionConflict,
  AutomationRunSourceKind,
  AutomationRunTerminationKind,
  AutomationTriggerInvocation,
} from './automationRunContracts';
import type { PinnedConfigRef } from '../../shared/configResource';
import {
  RUN_STATUS_SET,
  isRunStatusActive,
  isRunStatusTerminal,
  type AutomationRunStatus,
} from '../../shared/executionStatusVocabulary';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionRunSummary,
  AutomationRunControl,
  AutomationRunSummaryView,
} from './automationHistoryTypes';
import {
  enumValue,
  invalidHistory,
  objectWithKnownKeys,
  optionalCanonicalString,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalTimestamp,
  positiveInteger,
  requiredCanonicalString,
  requiredTimestamp,
} from './automationHistoryValidation';

const runKeys = new Set([
  'id','targetId','automationResourceId','definitionId','definitionVersion','actionId','actionVersion','configDigest','executionPlanDigest','registryDigest',
  'definitionDigest','executionModel','sourceKind','sourceRef','status','terminationKind','revision','parentRunId','rootRunId','callNodeId','throughNodeId',
  'experimentSelector',
  'depth','admissionMode','admissionScope','admissionLimit','admissionOnConflict','replacesRunId','triggerInvocation','acceptedAt',
  'createdAt','startedAt','updatedAt','finishedAt',
]);
const triggerInvocationKeys = new Set(['eventId','nodeId','kind','sessionId','occurredAt']);
const runTerminationKinds = new Set<AutomationRunTerminationKind>(['completed','failed','canceled','stopped','rejected']);
const admissionModes = new Set<AutomationExecutionRunSummary['admissionMode']>(['parallel','limited']);
const admissionScopes = new Set<AutomationExecutionRunSummary['admissionScope']>(['all','root']);
const admissionConflicts = new Set<AutomationRunAdmissionConflict>(['queue','reject','replace']);
const sourceKinds = new Set<AutomationRunSourceKind>(['experiment','automation']);
const pinnedConfigRefKeys = new Set(['domain','resourceId','branch','componentId','commitId','version','digest']);
const experimentSelectorKeys = new Set(['runMode','panelId','presetId']);

export function automationExecutionRunSummaries(
  entries: readonly AutomationExecutionHistoryEntry[],
): AutomationExecutionRunSummary[] {
  return entries.flatMap((entry) => entry.run ? [entry.run] : []);
}

export function isAutomationExecutionRunActive(run: AutomationRunControl) {
  return isRunStatusActive(run.status);
}

const CONTROL_STATUS_PRIORITY: Record<AutomationRunStatus,number> = {
  running: 0,
  waiting: 1,
  accepted: 2,
  queued: 3,
  stopping: 4,
  succeeded: 5,
  failed: 5,
  canceled: 5,
  stopped: 5,
  rejected: 5,
};

export function compareAutomationExecutionRunsForControl(
  left: AutomationRunSummaryView,
  right: AutomationRunSummaryView,
) {
  return CONTROL_STATUS_PRIORITY[left.status] - CONTROL_STATUS_PRIORITY[right.status]
    || right.createdAt.localeCompare(left.createdAt)
    || right.revision - left.revision
    || left.id.localeCompare(right.id);
}

export function parseAutomationExecutionRunSummary(
  value: unknown,
  path: string,
  expected: { runId: string;targetId: string;automationResourceId: string;acceptedAt: string },
): AutomationExecutionRunSummary {
  const run = objectWithKnownKeys(value, runKeys, path);
  const id = requiredCanonicalString(run.id, `${path}.id`);
  const targetId = requiredCanonicalString(run.targetId, `${path}.targetId`);
  const automationResourceId = requiredCanonicalString(run.automationResourceId, `${path}.automationResourceId`);
  const acceptedAt = requiredTimestamp(run.acceptedAt, `${path}.acceptedAt`);
  if (id !== expected.runId || targetId !== expected.targetId || automationResourceId !== expected.automationResourceId) {
    throw invalidHistory(path, 'identity does not match its history entry');
  }
  if (acceptedAt !== expected.acceptedAt) throw invalidHistory(`${path}.acceptedAt`, 'does not match its history entry');
  if (run.executionModel !== 'orchestration-occurrence-v1') {
    throw invalidHistory(`${path}.executionModel`, `has unsupported value "${String(run.executionModel ?? '')}"`);
  }
  const status = enumValue(run.status, RUN_STATUS_SET, `${path}.status`);
  const terminationKind = run.terminationKind === undefined
    ? undefined
    : enumValue(run.terminationKind, runTerminationKinds, `${path}.terminationKind`);
  validateRunSummaryTermination(status, terminationKind, path);
  const source = parseSummarySource(run, path);
  const result: AutomationExecutionRunSummary = {
    id,targetId,automationResourceId,
    definitionId: requiredCanonicalString(run.definitionId, `${path}.definitionId`),
    definitionVersion: positiveInteger(run.definitionVersion, `${path}.definitionVersion`),
    actionId: requiredCanonicalString(run.actionId, `${path}.actionId`),
    actionVersion: positiveInteger(run.actionVersion, `${path}.actionVersion`),
    configDigest: requiredDigest(run.configDigest, `${path}.configDigest`),
    executionPlanDigest: requiredDigest(run.executionPlanDigest, `${path}.executionPlanDigest`),
    registryDigest: requiredDigest(run.registryDigest, `${path}.registryDigest`),
    definitionDigest: requiredDigest(run.definitionDigest, `${path}.definitionDigest`),
    executionModel: 'orchestration-occurrence-v1',
    ...source,
    ...(run.experimentSelector === undefined
      ? {}
      : { experimentSelector:parseExperimentRunnerSelector(run.experimentSelector,`${path}.experimentSelector`) }),
    status,
    ...(terminationKind === undefined ? {} : { terminationKind }),
    revision: positiveInteger(run.revision, `${path}.revision`),
    ...optionalCanonicalString(run, 'parentRunId', path),
    ...optionalCanonicalString(run, 'rootRunId', path),
    ...optionalCanonicalString(run, 'callNodeId', path),
    ...optionalCanonicalString(run, 'throughNodeId', path),
    ...optionalNonNegativeInteger(run, 'depth', path),
    admissionMode: enumValue(run.admissionMode, admissionModes, `${path}.admissionMode`),
    admissionScope: enumValue(run.admissionScope, admissionScopes, `${path}.admissionScope`),
    ...optionalPositiveInteger(run, 'admissionLimit', path),
    ...(run.admissionOnConflict === undefined
      ? {}
      : { admissionOnConflict: enumValue(run.admissionOnConflict, admissionConflicts, `${path}.admissionOnConflict`) }),
    ...optionalCanonicalString(run, 'replacesRunId', path),
    ...(run.triggerInvocation === undefined
      ? {}
      : { triggerInvocation: parseTriggerInvocation(run.triggerInvocation, `${path}.triggerInvocation`) }),
    acceptedAt,
    createdAt: requiredTimestamp(run.createdAt, `${path}.createdAt`),
    ...optionalTimestamp(run, 'startedAt', path),
    updatedAt: requiredTimestamp(run.updatedAt, `${path}.updatedAt`),
    ...optionalTimestamp(run, 'finishedAt', path),
  };
  validateRunSummaryProjection(result, path);
  return result;
}

/** Decodes the whitelisted Run summary nested in one lifecycle SSE payload. */
export function parseAutomationExecutionEventRunSummary(
  value:unknown,
  path:string,
  expected:{ runId:string;targetId:string },
) {
  const run=objectWithKnownKeys(value,runKeys,path);
  const automationResourceId=requiredCanonicalString(run.automationResourceId,`${path}.automationResourceId`);
  const acceptedAt=requiredTimestamp(run.acceptedAt,`${path}.acceptedAt`);
  return parseAutomationExecutionRunSummary(value,path,{
    ...expected,automationResourceId,acceptedAt,
  });
}

function parseExperimentRunnerSelector(value:unknown,path:string) {
  const selector=objectWithKnownKeys(value,experimentSelectorKeys,path);
  return {
    runMode:requiredCanonicalString(selector.runMode,`${path}.runMode`),
    ...optionalCanonicalString(selector,'panelId',path),
    ...optionalCanonicalString(selector,'presetId',path),
  };
}

function parseSummarySource(
  run: Record<string,unknown>,
  path: string,
): Pick<AutomationExecutionRunSummary,'sourceKind' | 'sourceRef'> {
  if (run.sourceKind === undefined && run.sourceRef === undefined) return {};
  if (run.sourceKind === undefined || run.sourceRef === undefined) {
    throw invalidHistory(path, 'sourceKind and sourceRef must be present together');
  }
  const sourceKind = enumValue(run.sourceKind, sourceKinds, `${path}.sourceKind`);
  return { sourceKind,sourceRef: parseSummarySourceRef(run.sourceRef, `${path}.sourceRef`, sourceKind) };
}

function parseSummarySourceRef(
  value: unknown,
  path: string,
  sourceKind: AutomationRunSourceKind,
): PinnedConfigRef<AutomationRunSourceKind> {
  const reference = objectWithKnownKeys(value, pinnedConfigRefKeys, path);
  if (reference.domain !== sourceKind) {
    throw invalidHistory(`${path}.domain`, `must be "${sourceKind}"`);
  }
  return {
    domain: sourceKind,
    resourceId: requiredCanonicalString(reference.resourceId, `${path}.resourceId`),
    branch: requiredCanonicalString(reference.branch, `${path}.branch`),
    ...optionalCanonicalString(reference, 'componentId', path),
    commitId: requiredCanonicalString(reference.commitId, `${path}.commitId`),
    version: positiveInteger(reference.version, `${path}.version`),
    digest: requiredDigest(reference.digest, `${path}.digest`),
  };
}

function validateRunSummaryProjection(run: AutomationExecutionRunSummary, path: string) {
  if (run.parentRunId) {
    if (!run.rootRunId || !run.callNodeId || !run.depth || run.depth < 1 ||
      run.id === run.parentRunId || run.id === run.rootRunId || run.throughNodeId) {
      throw invalidHistory(path, 'a child Run requires exact non-self parent, root, call-node, and depth lineage');
    }
  } else if (run.rootRunId !== run.id || run.callNodeId || (run.depth !== undefined && run.depth !== 0)) {
    throw invalidHistory(path, 'a root Run requires self root identity and zero call depth');
  }
  if (run.admissionMode === 'parallel') {
    if (run.admissionLimit !== undefined || run.admissionOnConflict !== undefined || run.replacesRunId !== undefined) {
      throw invalidHistory(path, 'parallel admission must omit limited-admission facts');
    }
  } else if (!run.admissionLimit || !run.admissionOnConflict) {
    throw invalidHistory(path, 'limited admission requires a limit and conflict policy');
  }
  if (run.replacesRunId && (run.admissionOnConflict !== 'replace' || run.replacesRunId === run.id)) {
    throw invalidHistory(`${path}.replacesRunId`, 'must identify another Run under replace admission');
  }
  if (run.triggerInvocation && !isAutomationTriggerKind(run.triggerInvocation.kind)) {
    throw invalidHistory(`${path}.triggerInvocation.kind`, 'must be a supported Automation trigger kind');
  }
  if (run.acceptedAt > run.createdAt || run.createdAt > run.updatedAt) {
    throw invalidHistory(path, 'acceptedAt, createdAt, and updatedAt are out of order');
  }
  if (run.startedAt && (run.startedAt < run.createdAt || run.startedAt > run.updatedAt)) {
    throw invalidHistory(`${path}.startedAt`, 'is outside the Run lifecycle');
  }
  if (run.finishedAt && (run.finishedAt < run.createdAt || run.finishedAt > run.updatedAt ||
    Boolean(run.startedAt && run.finishedAt < run.startedAt))) {
    throw invalidHistory(`${path}.finishedAt`, 'is outside the Run lifecycle');
  }
  const terminal = isRunStatusTerminal(run.status);
  if (terminal !== Boolean(run.finishedAt)) {
    throw invalidHistory(path, 'terminal status and finishedAt must be present together');
  }
  if (['accepted','queued','rejected'].includes(run.status) && run.startedAt) {
    throw invalidHistory(path, 'a not-started Run cannot expose startedAt');
  }
  if (['running','waiting','stopping','succeeded'].includes(run.status) && !run.startedAt) {
    throw invalidHistory(path, 'a started Run must expose startedAt');
  }
}

function validateRunSummaryTermination(
  status: AutomationRunStatus,
  terminationKind: AutomationRunTerminationKind | undefined,
  path: string,
) {
  if (isRunStatusActive(status) && status !== 'stopping') {
    if (terminationKind) throw invalidHistory(`${path}.terminationKind`, 'must be omitted for an active Run');
    return;
  }
  if (status === 'stopping') {
    if (!terminationKind || !['failed','canceled','stopped'].includes(terminationKind)) {
      throw invalidHistory(`${path}.terminationKind`, 'must identify the requested stopping outcome');
    }
    return;
  }
  const expected: Partial<Record<AutomationRunStatus,AutomationRunTerminationKind>> = {
    succeeded: 'completed',canceled: 'canceled',stopped: 'stopped',rejected: 'rejected',
  };
  if (status === 'failed') {
    if (!terminationKind || !['failed','canceled','stopped'].includes(terminationKind)) {
      throw invalidHistory(`${path}.terminationKind`, 'must identify the primary or cleanup failure origin');
    }
  } else if (terminationKind !== expected[status]) {
    throw invalidHistory(`${path}.terminationKind`, 'does not match the terminal Run status');
  }
}

function requiredDigest(value: unknown, path: string) {
  const result = requiredCanonicalString(value, path);
  if (!/^[a-f0-9]{64}$/.test(result)) throw invalidHistory(path, 'must be a canonical SHA-256 digest');
  return result;
}

function parseTriggerInvocation(value: unknown, path: string): AutomationTriggerInvocation {
  const invocation = objectWithKnownKeys(value, triggerInvocationKeys, path);
  const result = {
    eventId: requiredCanonicalString(invocation.eventId, `${path}.eventId`),
    nodeId: requiredCanonicalString(invocation.nodeId, `${path}.nodeId`),
    kind: requiredCanonicalString(invocation.kind, `${path}.kind`),
    ...optionalCanonicalString(invocation, 'sessionId', path),
    occurredAt: requiredTimestamp(invocation.occurredAt, `${path}.occurredAt`),
  };
  if (!isAutomationTriggerKind(result.kind)) {
    throw invalidHistory(`${path}.kind`, 'must be a supported Automation trigger kind');
  }
  return result;
}
