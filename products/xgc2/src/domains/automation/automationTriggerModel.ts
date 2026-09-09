import type { PinnedConfigRef } from '../../shared/configResource';
import { INGRESS_STATUS_SET } from '../../shared/executionStatusVocabulary';
import {
  parseAutomationExecutionIngressAudit,
} from './automationExecutionHistoryModel';
import type { AutomationExecutionIngressAudit } from './automationHistoryTypes';
import {
  isAutomationTriggerKind,
  type AutomationActivation,
  type AutomationActivationFailureCode,
  type AutomationActivationResponse,
  type AutomationActivationState,
  type AutomationTestListener,
  type AutomationTestListenerStatus,
  type AutomationTriggerCredential,
  type AutomationTriggerEventReceipt,
} from './automationTriggerContracts';

const activationKeys = new Set([
  'resourceId','entrypointNodeId','revision','desiredState','observedState','pinnedRef','targetId','triggerKind',
  'triggerVersion','scheduleId','publicId','requiredCapabilities','failureCode','createdAt','updatedAt',
  'reachability','lastObservedAt',
]);
const activationEnvelopeKeys = new Set(['activation','credential']);
const listenerKeys = new Set([
  'id','resourceId','entrypointNodeId','revision','status','pinnedRef','targetId','triggerKind','triggerVersion',
  'oneShot','publicId','expiresAt','consumedAt','closedAt','createdAt','updatedAt',
]);
const listenerEnvelopeKeys = new Set(['listener','credential']);
const credentialKeys = new Set(['publicId','token']);
const pinnedRefKeys = new Set(['domain','resourceId','branch','componentId','commitId','version','digest']);
const triggerIngressReceiptKeys = new Set(['eventId','runId','status','created']);
const triggerIngressAuditEnvelopeKeys = new Set(['ingress']);
const activationStates = new Set<AutomationActivationState>(['inactive','activating','active','error']);
const activationFailureCodes = new Set<AutomationActivationFailureCode>([
  'schedule_policy_rejected','schedule_reconcile_failed',
]);
const listenerStatuses = new Set<AutomationTestListenerStatus>(['listening','consumed','cancelled','expired']);
const ingressTriggerKinds = new Set(['trigger.chat-message','trigger.form-submission','trigger.webhook']);

export function parseAutomationActivations(value: unknown, path: string): AutomationActivation[] {
  if (!Array.isArray(value)) throw invalidTrigger(path, 'must be an array');
  const identities = new Set<string>();
  return value.map((entry, index) => {
    const activation = parseAutomationActivation(entry, `${path}[${index}]`);
    const identity = `${activation.resourceId}\u0000${activation.entrypointNodeId}`;
    if (identities.has(identity)) throw invalidTrigger(path, `contains duplicate activation identity "${identity}"`);
    identities.add(identity);
    return activation;
  });
}

export function parseAutomationActivation(value: unknown, path: string): AutomationActivation {
  const entry = objectWithKnownKeys(value, activationKeys, path);
  const desiredState = enumValue(entry.desiredState, activationStates, `${path}.desiredState`);
  const observedState = enumValue(entry.observedState, activationStates, `${path}.observedState`);
  const triggerKind = triggerKindValue(entry.triggerKind, `${path}.triggerKind`);
  const requiredCapabilities = optionalStringArray(entry.requiredCapabilities, `${path}.requiredCapabilities`);
  const failureCode = entry.failureCode === undefined
    ? undefined
    : enumValue(entry.failureCode, activationFailureCodes, `${path}.failureCode`);
  if ((observedState === 'error') !== (failureCode !== undefined)) {
    throw invalidTrigger(path, 'error observedState and failureCode must be present together');
  }
  return {
    resourceId: requiredString(entry.resourceId, `${path}.resourceId`),
    entrypointNodeId: requiredString(entry.entrypointNodeId, `${path}.entrypointNodeId`),
    revision: positiveInteger(entry.revision, `${path}.revision`),
    desiredState,
    observedState,
    pinnedRef: pinnedAutomationRef(entry.pinnedRef, `${path}.pinnedRef`),
    targetId: requiredString(entry.targetId, `${path}.targetId`),
    triggerKind,
    triggerVersion: positiveInteger(entry.triggerVersion, `${path}.triggerVersion`),
    ...optionalString(entry, 'scheduleId', path),
    ...optionalString(entry, 'publicId', path),
    ...(requiredCapabilities === undefined ? {} : { requiredCapabilities }),
    ...(failureCode === undefined ? {} : { failureCode }),
    reachability: enumValue(entry.reachability, new Set(['reachable','unreachable'] as const), `${path}.reachability`),
    lastObservedAt: requiredTimestamp(entry.lastObservedAt, `${path}.lastObservedAt`),
    createdAt: requiredTimestamp(entry.createdAt, `${path}.createdAt`),
    updatedAt: requiredTimestamp(entry.updatedAt, `${path}.updatedAt`),
  };
}

export function parseAutomationActivationLookup(value: unknown, path: string): AutomationActivation | undefined {
  const envelope = objectWithKnownKeys(value, new Set(['activation']), path);
  if (envelope.activation === null) return undefined;
  return parseAutomationActivation(envelope.activation, `${path}.activation`);
}

export function parseAutomationActivationResponse(value: unknown, path: string): AutomationActivationResponse {
  const envelope = objectWithKnownKeys(value, activationEnvelopeKeys, path);
  return {
    activation: parseAutomationActivation(envelope.activation, `${path}.activation`),
    ...(envelope.credential === undefined
      ? {}
      : { credential: parseAutomationTriggerCredential(envelope.credential, `${path}.credential`) }),
  };
}

export function parseAutomationTestListener(value: unknown, path: string): AutomationTestListener {
  const entry = objectWithKnownKeys(value, listenerKeys, path);
  const triggerKind = requiredString(entry.triggerKind, `${path}.triggerKind`);
  if (!ingressTriggerKinds.has(triggerKind)) throw invalidTrigger(`${path}.triggerKind`, `has unsupported value "${triggerKind}"`);
  return {
    id: requiredString(entry.id, `${path}.id`),
    resourceId: requiredString(entry.resourceId, `${path}.resourceId`),
    entrypointNodeId: requiredString(entry.entrypointNodeId, `${path}.entrypointNodeId`),
    revision: positiveInteger(entry.revision, `${path}.revision`),
    status: enumValue(entry.status, listenerStatuses, `${path}.status`),
    pinnedRef: pinnedAutomationRef(entry.pinnedRef, `${path}.pinnedRef`),
    targetId: requiredString(entry.targetId, `${path}.targetId`),
    triggerKind: triggerKind as AutomationTestListener['triggerKind'],
    triggerVersion: positiveInteger(entry.triggerVersion, `${path}.triggerVersion`),
    oneShot: requiredBoolean(entry.oneShot, `${path}.oneShot`),
    publicId: requiredString(entry.publicId, `${path}.publicId`),
    expiresAt: requiredTimestamp(entry.expiresAt, `${path}.expiresAt`),
    ...optionalTimestamp(entry, 'consumedAt', path),
    ...optionalTimestamp(entry, 'closedAt', path),
    createdAt: requiredTimestamp(entry.createdAt, `${path}.createdAt`),
    updatedAt: requiredTimestamp(entry.updatedAt, `${path}.updatedAt`),
  };
}

export function parseAutomationTestListenerEnvelope(
  value: unknown,
  path: string,
): { listener: AutomationTestListener;credential?: AutomationTriggerCredential } {
  const envelope = objectWithKnownKeys(value, listenerEnvelopeKeys, path);
  return {
    listener: parseAutomationTestListener(envelope.listener, `${path}.listener`),
    ...(envelope.credential === undefined
      ? {}
      : { credential: parseAutomationTriggerCredential(envelope.credential, `${path}.credential`) }),
  };
}

export function parseAutomationTriggerIngressReceipt(value: unknown, path: string): AutomationTriggerEventReceipt {
  const receipt = objectWithKnownKeys(value, triggerIngressReceiptKeys, path);
  enumValue(receipt.status, INGRESS_STATUS_SET, `${path}.status`);
  return {
    eventId: requiredString(receipt.eventId, `${path}.eventId`),
    runId: requiredString(receipt.runId, `${path}.runId`),
    created: requiredBoolean(receipt.created, `${path}.created`),
  };
}

export function parseAutomationIngressAuditEnvelope(value: unknown, path: string): AutomationExecutionIngressAudit {
  const envelope = objectWithKnownKeys(value, triggerIngressAuditEnvelopeKeys, path);
  return parseAutomationExecutionIngressAudit(envelope.ingress, `${path}.ingress`);
}

export function parseAutomationRunOnceReceipt(value: unknown, path: string): AutomationTriggerEventReceipt {
  const ingress = parseAutomationIngressAuditEnvelope(value, path);
  return { eventId: ingress.eventId,runId: ingress.runId };
}

function parseAutomationTriggerCredential(value: unknown, path: string): AutomationTriggerCredential {
  const credential = objectWithKnownKeys(value, credentialKeys, path);
  return {
    publicId: requiredString(credential.publicId, `${path}.publicId`),
    token: requiredString(credential.token, `${path}.token`, true),
  };
}

function pinnedAutomationRef(value: unknown, path: string): PinnedConfigRef<'automation'> {
  const ref = objectWithKnownKeys(value, pinnedRefKeys, path);
  if (ref.domain !== 'automation') throw invalidTrigger(`${path}.domain`, 'must be "automation"');
  return {
    domain: 'automation',
    resourceId: requiredString(ref.resourceId, `${path}.resourceId`),
    branch: requiredString(ref.branch, `${path}.branch`),
    ...optionalString(ref, 'componentId', path),
    commitId: requiredString(ref.commitId, `${path}.commitId`),
    version: positiveInteger(ref.version, `${path}.version`),
    digest: requiredString(ref.digest, `${path}.digest`),
  };
}

function triggerKindValue(value: unknown, path: string) {
  const kind = requiredString(value, path);
  if (!isAutomationTriggerKind(kind)) throw invalidTrigger(path, `has unsupported value "${kind}"`);
  return kind;
}

function objectWithKnownKeys(value: unknown, keys: Set<string>, path: string): Record<string,unknown> {
  if (!isObject(value)) throw invalidTrigger(path, 'must be an object');
  const unknown = Object.keys(value).find((key) => !keys.has(key));
  if (unknown) throw invalidTrigger(path, `contains unknown property "${unknown}"`);
  return value;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, path: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw invalidTrigger(path, `has unsupported value "${String(value ?? '')}"`);
  }
  return value as T;
}

function requiredString(value: unknown, path: string, allowEmpty = false) {
  if (typeof value !== 'string' || value.trim() !== value || (!allowEmpty && value.length === 0)) {
    throw invalidTrigger(path, allowEmpty ? 'must be a canonical string' : 'must be a non-empty canonical string');
  }
  return value;
}

function requiredTimestamp(value: unknown, path: string) {
  const timestamp = requiredString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) throw invalidTrigger(path, 'must be an RFC3339 timestamp');
  return timestamp;
}

function requiredBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw invalidTrigger(path, 'must be a boolean');
  return value;
}

function positiveInteger(value: unknown, path: string) {
  const result = nonNegativeInteger(value, path);
  if (result < 1) throw invalidTrigger(path, 'must be a positive integer');
  return result;
}

function nonNegativeInteger(value: unknown, path: string) {
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidTrigger(path, 'must be a non-negative integer');
  return value as number;
}

function optionalStringArray(value: unknown, path: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalidTrigger(path, 'must be an array');
  const result = value.map((entry, index) => requiredString(entry, `${path}[${index}]`));
  if (new Set(result).size !== result.length) throw invalidTrigger(path, 'must not contain duplicates');
  return result;
}

function optionalString<T extends string>(
  value: Record<string,unknown>, key: T, path: string, allowEmpty = false,
): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: requiredString(value[key], `${path}.${key}`, allowEmpty) } as Partial<Record<T,string>>;
}

function optionalTimestamp<T extends string>(
  value: Record<string,unknown>, key: T, path: string,
): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: requiredTimestamp(value[key], `${path}.${key}`) } as Partial<Record<T,string>>;
}

function isObject(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidTrigger(path: string, reason: string) {
  return new Error(`Invalid Automation trigger response at ${path}: ${reason}.`);
}
