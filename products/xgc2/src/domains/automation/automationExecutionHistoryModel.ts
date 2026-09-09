import { INGRESS_STATUS_SET } from '../../shared/executionStatusVocabulary';
import {
  isAutomationTriggerKind,
  type AutomationTriggerKind,
  type AutomationTriggerSourceKind,
} from './automationTriggerContracts';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionHistoryPage,
  AutomationExecutionIngressAudit,
  AutomationExecutionRunSummary,
  AutomationIngressTransition,
  AutomationIngressTransitionActor,
  AutomationIngressTransitionFailureCode,
  AutomationIngressTransitionKind,
  AutomationIngressTransitionPage,
} from './automationHistoryTypes';
import {
  enumValue,
  invalidHistory,
  nonNegativeInteger,
  objectWithKnownKeys,
  optionalCanonicalString,
  optionalUnavailableSources,
  positiveInteger,
  requiredBoolean,
  requiredCanonicalString,
  requiredTimestamp,
  sameValue,
} from './automationHistoryValidation';
import { parseAutomationExecutionRunSummary } from './automationRunSummaryModel';

const pageKeys = new Set(['entries','nextCursor','complete','unavailableSources']);
const transitionPageKeys = new Set(['transitions','nextAfterRevision','complete','unavailableSources']);
const transitionKeys = new Set([
  'eventId','revision','kind','fromStatus','toStatus','attemptCount','failureCode','actor','occurredAt',
]);
const entryKeys = new Set(['id','runId','targetId','automationResourceId','acceptedAt','phase','ingress','run']);
const ingressKeys = new Set([
  'eventId','revision','status','sourceKind','entrypointNodeId','triggerKind','sessionId','correlationId',
  'attemptCount','occurredAt','receivedAt','runId',
]);
const sourceKinds = new Set<AutomationTriggerSourceKind>(['action','manual','schedule','startup','chat','form','webhook','call']);
const transitionKinds = new Set<AutomationIngressTransitionKind>([
  'accepted','gate_released','gate_abandoned','claimed','reclaimed','dispatched','requeued','dead_lettered','operator_retried','operator_canceled',
]);
const transitionFailureCodes = new Set<AutomationIngressTransitionFailureCode>([
  'canceled','deadline','idempotency_conflict','runner_panic','dispatch_failed','gate_abandoned',
]);
const transitionActors = new Set<AutomationIngressTransitionActor>([
  'source_adapter','admission_controller','dispatcher','operator',
]);
const triggerKindBySourceKind: Partial<Record<AutomationTriggerSourceKind,AutomationTriggerKind>> = {
  manual: 'trigger.manual',schedule: 'trigger.schedule',chat: 'trigger.chat-message',form: 'trigger.form-submission',
  startup: 'trigger.target-startup',webhook: 'trigger.webhook',call: 'trigger.automation-call',
};

export function parseAutomationExecutionHistoryPage(
  value: unknown,
  path: string,
  expected: { targetId: string;automationResourceId: string },
): AutomationExecutionHistoryPage {
  const page = objectWithKnownKeys(value, pageKeys, path);
  if (!Array.isArray(page.entries)) throw invalidHistory(`${path}.entries`, 'must be an array');
  const entries = page.entries.map((entry, index) => parseAutomationExecutionHistoryEntry(
    entry,
    `${path}.entries[${index}]`,
    expected,
  ));
  const identities = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (identities.has(entry.id)) throw invalidHistory(`${path}.entries`, `contains duplicate id "${entry.id}"`);
    identities.add(entry.id);
    const previous = entries[index - 1];
    if (previous && compareAutomationExecutionHistoryEntries(previous, entry) > 0) {
      throw invalidHistory(`${path}.entries`, 'must be ordered by acceptedAt descending then id descending');
    }
  }
  const complete = requiredBoolean(page.complete, `${path}.complete`);
  const unavailableSources = optionalUnavailableSources(page.unavailableSources, `${path}.unavailableSources`);
  if (complete && unavailableSources !== undefined) {
    throw invalidHistory(path, 'must not declare unavailable sources when complete');
  }
  if (!complete && unavailableSources?.length !== 1) {
    throw invalidHistory(path, 'must identify the unavailable source when incomplete');
  }
  if (!complete && page.nextCursor !== undefined) {
    throw invalidHistory(`${path}.nextCursor`, 'must be omitted for an incomplete page');
  }
  return {
    entries,
    ...optionalCanonicalString(page, 'nextCursor', path),
    complete,
    ...(unavailableSources === undefined ? {} : { unavailableSources }),
  };
}

export function parseAutomationExecutionHistoryEntry(
  value: unknown,
  path: string,
  expected?: { targetId: string;automationResourceId: string },
): AutomationExecutionHistoryEntry {
  const entry = objectWithKnownKeys(value, entryKeys, path);
  const id = requiredCanonicalString(entry.id, `${path}.id`);
  const runId = requiredCanonicalString(entry.runId, `${path}.runId`);
  const targetId = requiredCanonicalString(entry.targetId, `${path}.targetId`);
  const automationResourceId = requiredCanonicalString(entry.automationResourceId, `${path}.automationResourceId`);
  const acceptedAt = requiredTimestamp(entry.acceptedAt, `${path}.acceptedAt`);
  const phase = enumValue(entry.phase, new Set(['ingress','run'] as const), `${path}.phase`);
  if (id !== runId) throw invalidHistory(path, 'id must equal the preallocated runId');
  if (expected && (targetId !== expected.targetId || automationResourceId !== expected.automationResourceId)) {
    throw invalidHistory(path, 'identity does not match the requested target and Automation resource');
  }
  const ingress = entry.ingress === undefined
    ? undefined
    : parseAutomationExecutionIngressAudit(entry.ingress, `${path}.ingress`, runId);
  const run = entry.run === undefined
    ? undefined
    : parseAutomationExecutionRunSummary(entry.run, `${path}.run`, { runId,targetId,automationResourceId,acceptedAt });
  if (phase === 'ingress' && (!ingress || run)) {
    throw invalidHistory(path, 'ingress phase requires ingress facts and forbids a Run summary');
  }
  if (phase === 'run' && !run) throw invalidHistory(path, 'run phase requires a Run summary');
  if (ingress && ingress.receivedAt !== acceptedAt) {
    throw invalidHistory(path, 'ingress receivedAt must equal the stable acceptedAt ordering anchor');
  }
  if (ingress && run?.triggerInvocation && (
    ingress.eventId !== run.triggerInvocation.eventId
    || ingress.entrypointNodeId !== run.triggerInvocation.nodeId
    || ingress.triggerKind !== run.triggerInvocation.kind
    || ingress.sessionId !== run.triggerInvocation.sessionId
    || ingress.occurredAt !== run.triggerInvocation.occurredAt
  )) {
    throw invalidHistory(path, 'ingress and Run trigger invocation facts must match exactly');
  }
  return {
    id,runId,targetId,automationResourceId,acceptedAt,phase,
    ...(ingress === undefined ? {} : { ingress }),
    ...(run === undefined ? {} : { run }),
  };
}

export function parseAutomationIngressTransitionPage(
  value: unknown,
  path: string,
  expected: { eventId: string;afterRevision: number },
): AutomationIngressTransitionPage {
  const page = objectWithKnownKeys(value, transitionPageKeys, path);
  if (!Array.isArray(page.transitions)) throw invalidHistory(`${path}.transitions`, 'must be an array');
  const transitions = page.transitions.map((transition, index) => parseAutomationIngressTransition(
    transition,
    `${path}.transitions[${index}]`,
    expected.eventId,
  ));
  let previousRevision = expected.afterRevision;
  for (const transition of transitions) {
    if (transition.revision <= previousRevision) {
      throw invalidHistory(`${path}.transitions`, 'must be strictly ordered after the requested revision');
    }
    previousRevision = transition.revision;
  }
  const complete = requiredBoolean(page.complete, `${path}.complete`);
  const unavailableSources = optionalUnavailableSources(page.unavailableSources, `${path}.unavailableSources`);
  if (complete && unavailableSources !== undefined) {
    throw invalidHistory(path, 'must not declare unavailable sources when complete');
  }
  if (!complete && (unavailableSources?.length !== 1 || transitions.length !== 0)) {
    throw invalidHistory(path, 'an incomplete transition ledger must be an empty unavailable Agent projection');
  }
  const nextAfterRevision = page.nextAfterRevision === undefined
    ? undefined
    : positiveInteger(page.nextAfterRevision, `${path}.nextAfterRevision`);
  if (nextAfterRevision !== undefined && (
    !complete
    || transitions.length === 0
    || transitions[transitions.length - 1]?.revision !== nextAfterRevision
  )) {
    throw invalidHistory(`${path}.nextAfterRevision`, 'must identify the last transition of a complete source page with more results');
  }
  return {
    transitions,
    ...(nextAfterRevision === undefined ? {} : { nextAfterRevision }),
    complete,
    ...(unavailableSources === undefined ? {} : { unavailableSources }),
  };
}

export function mergeAutomationIngressTransitions(
  current: readonly AutomationIngressTransition[],
  incoming: readonly AutomationIngressTransition[],
) {
  const byRevision = new Map(current.map((transition) => [transition.revision,transition]));
  for (const transition of incoming) {
    const previous = byRevision.get(transition.revision);
    if (previous && !sameValue(previous, transition)) {
      throw new Error(`Automation ingress transition revision ${transition.revision} contains conflicting immutable facts.`);
    }
    byRevision.set(transition.revision, previous ?? transition);
  }
  const transitions = [...byRevision.values()].sort((left, right) => left.revision - right.revision);
  const eventId = transitions[0]?.eventId;
  if (eventId && transitions.some((transition) => transition.eventId !== eventId)) {
    throw new Error('Automation ingress transition ledger contains multiple event identities.');
  }
  return transitions;
}

function parseAutomationIngressTransition(value: unknown, path: string, expectedEventId: string): AutomationIngressTransition {
  const transition = objectWithKnownKeys(value, transitionKeys, path);
  const eventId = requiredCanonicalString(transition.eventId, `${path}.eventId`);
  if (eventId !== expectedEventId) throw invalidHistory(`${path}.eventId`, 'does not match the selected ingress event');
  const revision = positiveInteger(transition.revision, `${path}.revision`);
  const kind = enumValue(transition.kind, transitionKinds, `${path}.kind`);
  const fromStatus = transition.fromStatus === undefined
    ? undefined
    : enumValue(transition.fromStatus, INGRESS_STATUS_SET, `${path}.fromStatus`);
  if ((kind === 'accepted') !== (fromStatus === undefined)) {
    throw invalidHistory(path, 'accepted must omit fromStatus and every later transition must include it');
  }
  const toStatus = enumValue(transition.toStatus, INGRESS_STATUS_SET, `${path}.toStatus`);
  const failureCode = transition.failureCode === undefined
    ? undefined
    : enumValue(transition.failureCode, transitionFailureCodes, `${path}.failureCode`);
  const actor = enumValue(transition.actor, transitionActors, `${path}.actor`);
  if (!validAutomationIngressTransitionShape({ revision,kind,fromStatus,toStatus,failureCode,actor })) {
    throw invalidHistory(path, 'contains an inconsistent controlled transition shape');
  }
  return {
    eventId,
    revision,
    kind,
    ...(fromStatus === undefined ? {} : { fromStatus }),
    toStatus,
    attemptCount: nonNegativeInteger(transition.attemptCount, `${path}.attemptCount`),
    ...(failureCode === undefined ? {} : { failureCode }),
    actor,
    occurredAt: requiredTimestamp(transition.occurredAt, `${path}.occurredAt`),
  };
}

function validAutomationIngressTransitionShape(
  transition: Pick<AutomationIngressTransition,'revision' | 'kind' | 'fromStatus' | 'toStatus' | 'failureCode' | 'actor'>,
) {
  const noFailure = transition.failureCode === undefined;
  switch (transition.kind) {
    case 'accepted':
      return transition.revision === 1 && transition.actor === 'source_adapter' && transition.fromStatus === undefined &&
        transition.toStatus === 'pending' && noFailure;
    case 'gate_released':
      return transition.actor === 'admission_controller' && transition.fromStatus === 'pending' &&
        transition.toStatus === 'pending' && noFailure;
    case 'gate_abandoned':
      return transition.actor === 'admission_controller' && transition.fromStatus === 'pending' &&
        transition.toStatus === 'abandoned' && transition.failureCode === 'gate_abandoned';
    case 'claimed':
      return transition.actor === 'dispatcher' && transition.fromStatus === 'pending' &&
        transition.toStatus === 'claimed' && noFailure;
    case 'reclaimed':
      return transition.actor === 'dispatcher' && transition.fromStatus === 'claimed' &&
        transition.toStatus === 'claimed' && noFailure;
    case 'dispatched':
      return transition.actor === 'dispatcher' && transition.fromStatus === 'claimed' &&
        transition.toStatus === 'dispatched' && noFailure;
    case 'requeued':
      return transition.actor === 'dispatcher' && transition.fromStatus === 'claimed' &&
        transition.toStatus === 'pending' && !noFailure && transition.failureCode !== 'gate_abandoned';
    case 'dead_lettered':
      return transition.actor === 'dispatcher' && transition.fromStatus === 'claimed' &&
        transition.toStatus === 'dead_letter' && !noFailure && transition.failureCode !== 'gate_abandoned';
    case 'operator_retried':
      return transition.actor === 'operator' && transition.fromStatus === 'dead_letter' &&
        transition.toStatus === 'pending' && noFailure;
    case 'operator_canceled':
      return transition.actor === 'operator' &&
        (transition.fromStatus === 'pending' || transition.fromStatus === 'claimed') &&
        transition.toStatus === 'abandoned' && transition.failureCode === 'canceled';
  }
}

export function compareAutomationExecutionHistoryEntries(
  left: Pick<AutomationExecutionHistoryEntry,'acceptedAt' | 'id'>,
  right: Pick<AutomationExecutionHistoryEntry,'acceptedAt' | 'id'>,
) {
  return right.acceptedAt.localeCompare(left.acceptedAt) || right.id.localeCompare(left.id);
}

export function mergeAutomationExecutionHistoryEntries(
  current: readonly AutomationExecutionHistoryEntry[],
  incoming: readonly AutomationExecutionHistoryEntry[],
) {
  const byID = new Map(current.map((entry) => [entry.id,entry]));
  for (const entry of incoming) {
    const previous = byID.get(entry.id);
    byID.set(entry.id, previous ? mergeHistoryEntry(previous, entry) : entry);
  }
  return [...byID.values()].sort(compareAutomationExecutionHistoryEntries);
}

function mergeHistoryEntry(
  current: AutomationExecutionHistoryEntry,
  incoming: AutomationExecutionHistoryEntry,
): AutomationExecutionHistoryEntry {
  if (current.runId !== incoming.runId || current.targetId !== incoming.targetId ||
    current.automationResourceId !== incoming.automationResourceId || current.acceptedAt !== incoming.acceptedAt) {
    throw new Error(`Automation execution history identity drift for ${current.id}.`);
  }
  const ingress = chooseIngress(current.ingress, incoming.ingress);
  const run = chooseRun(current.run, incoming.run);
  return {
    id: current.id,
    runId: current.runId,
    targetId: current.targetId,
    automationResourceId: current.automationResourceId,
    acceptedAt: current.acceptedAt,
    phase: run ? 'run' : 'ingress',
    ...(ingress ? { ingress } : {}),
    ...(run ? { run } : {}),
  };
}

function chooseIngress(
  current: AutomationExecutionIngressAudit | undefined,
  incoming: AutomationExecutionIngressAudit | undefined,
) {
  if (!current) return incoming;
  if (!incoming) return current;
  if (incoming.revision !== current.revision) return incoming.revision > current.revision ? incoming : current;
  if (!sameValue(current, incoming)) {
    throw new Error(`Automation execution ingress revision ${current.revision} contains conflicting immutable facts.`);
  }
  return current;
}

function chooseRun(
  current: AutomationExecutionRunSummary | undefined,
  incoming: AutomationExecutionRunSummary | undefined,
) {
  if (!current) return incoming;
  if (!incoming) return current;
  const selected = incoming.revision > current.revision ? incoming : current;
  if (incoming.revision === current.revision && !sameRunBase(current, incoming)) {
    throw new Error(`Automation execution Run revision ${current.revision} contains conflicting immutable facts.`);
  }
  return mergeRunHistoryEnrichment(selected, current, incoming);
}

function sameRunBase(
  current: AutomationExecutionRunSummary,
  incoming: AutomationExecutionRunSummary,
) {
  return sameValue(withoutRunHistoryEnrichment(current), withoutRunHistoryEnrichment(incoming));
}

function withoutRunHistoryEnrichment(run: AutomationExecutionRunSummary) {
  const result: Partial<AutomationExecutionRunSummary> = { ...run };
  delete result.sourceKind;
  delete result.sourceRef;
  delete result.experimentSelector;
  return result;
}

function mergeRunHistoryEnrichment(
  selected: AutomationExecutionRunSummary,
  current: AutomationExecutionRunSummary,
  incoming: AutomationExecutionRunSummary,
) {
  const source = mergeRunSource(current, incoming);
  const experimentSelector = mergeOptionalRunEnrichment(
    current.experimentSelector,
    incoming.experimentSelector,
    current.revision,
  );
  const selectedHasSource = selected.sourceKind !== undefined && selected.sourceRef !== undefined;
  if ((!source || selectedHasSource)
    && (experimentSelector === undefined || selected.experimentSelector !== undefined)) return selected;
  return {
    ...selected,
    ...(source ?? {}),
    ...(experimentSelector === undefined ? {} : { experimentSelector }),
  };
}

function mergeRunSource(
  current: AutomationExecutionRunSummary,
  incoming: AutomationExecutionRunSummary,
) {
  const currentSource = runSource(current);
  const incomingSource = runSource(incoming);
  if (currentSource && incomingSource && !sameValue(currentSource, incomingSource)) {
    throw new Error(`Automation execution Run revision ${current.revision} contains conflicting immutable facts.`);
  }
  return currentSource ?? incomingSource;
}

function runSource(run: AutomationExecutionRunSummary) {
  const hasSourceKind = run.sourceKind !== undefined;
  const hasSourceRef = run.sourceRef !== undefined;
  if (hasSourceKind !== hasSourceRef) {
    throw new Error(`Automation execution Run revision ${run.revision} contains conflicting immutable facts.`);
  }
  return hasSourceKind
    ? { sourceKind:run.sourceKind!,sourceRef:run.sourceRef! }
    : undefined;
}

function mergeOptionalRunEnrichment<T>(
  current: T | undefined,
  incoming: T | undefined,
  revision: number,
) {
  if (current !== undefined && incoming !== undefined && !sameValue(current, incoming)) {
    throw new Error(`Automation execution Run revision ${revision} contains conflicting immutable facts.`);
  }
  return current ?? incoming;
}

export function parseAutomationExecutionIngressAudit(
  value: unknown,
  path: string,
  expectedRunId = '',
): AutomationExecutionIngressAudit {
  const ingress = objectWithKnownKeys(value, ingressKeys, path);
  const runId = requiredCanonicalString(ingress.runId, `${path}.runId`);
  if (expectedRunId && runId !== expectedRunId) throw invalidHistory(`${path}.runId`, 'does not match its history entry');
  const triggerKind = requiredCanonicalString(ingress.triggerKind, `${path}.triggerKind`);
  if (!isAutomationTriggerKind(triggerKind)) throw invalidHistory(`${path}.triggerKind`, `has unsupported value "${triggerKind}"`);
  const result = {
    eventId: requiredCanonicalString(ingress.eventId, `${path}.eventId`),
    revision: positiveInteger(ingress.revision, `${path}.revision`),
    status: enumValue(ingress.status, INGRESS_STATUS_SET, `${path}.status`),
    sourceKind: enumValue(ingress.sourceKind, sourceKinds, `${path}.sourceKind`),
    entrypointNodeId: requiredCanonicalString(ingress.entrypointNodeId, `${path}.entrypointNodeId`),
    triggerKind,
    ...optionalCanonicalString(ingress, 'sessionId', path),
    ...optionalCanonicalString(ingress, 'correlationId', path),
    attemptCount: nonNegativeInteger(ingress.attemptCount, `${path}.attemptCount`),
    occurredAt: requiredTimestamp(ingress.occurredAt, `${path}.occurredAt`),
    receivedAt: requiredTimestamp(ingress.receivedAt, `${path}.receivedAt`),
    runId,
  };
  const expectedTriggerKind = triggerKindBySourceKind[result.sourceKind];
  if (expectedTriggerKind && expectedTriggerKind !== result.triggerKind) {
    throw invalidHistory(path, `sourceKind "${result.sourceKind}" does not match triggerKind "${result.triggerKind}"`);
  }
  return result;
}
