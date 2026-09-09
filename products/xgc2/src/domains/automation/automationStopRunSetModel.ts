import type { CommandReceipt } from '../execution/executionPublic';
import { isStopRunSetPriorStatus } from '../../shared/executionStatusVocabulary';
import { workflowRuntimeActions } from '../../shared/workflowRuntimeProtocol';
import type {
  AutomationStopRunSetInput,
  AutomationStopRunSetOutcome,
  AutomationStopRunSetResponse,
} from './automationRunContracts';

const responseKeys = new Set(['receipt','anchorRunId','outcomes']);
const outcomeKeys = new Set(['runId','priorStatus','accepted','alreadyTerminal','error']);
const receiptKeys = new Set([
  'commandId','requestId','idempotencyKey','actor','risk','target','action','reason','payload','status',
  'resultRef','result','errorCode','errorMessage','createdAt','completedAt',
]);
export function parseAutomationStopRunSetResponse(
  value: unknown,
  path: string,
  expectedAnchorRunId: string,
  intent: AutomationStopRunSetInput,
): AutomationStopRunSetResponse {
  const envelope = exactObject(value, responseKeys, path);
  const anchorRunId = canonicalString(envelope.anchorRunId, `${path}.anchorRunId`);
  if (anchorRunId !== expectedAnchorRunId) {
    throw invalid(path, `belongs to unexpected anchor Run "${anchorRunId}"`);
  }
  if (!Array.isArray(envelope.outcomes)) throw invalid(`${path}.outcomes`, 'must be an array');
  const outcomes = envelope.outcomes.map((outcome, index) => (
    parseOutcome(outcome, `${path}.outcomes[${index}]`)
  ));
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    if (seen.has(outcome.runId)) throw invalid(`${path}.outcomes`, `contains duplicate Run "${outcome.runId}"`);
    seen.add(outcome.runId);
  }
  const receipt = parseReceipt(envelope.receipt, `${path}.receipt`);
  if (receipt.requestId !== intent.requestId || receipt.idempotencyKey !== intent.idempotencyKey) {
    throw invalid(`${path}.receipt`, 'does not match the submitted operator intent');
  }
  if (receipt.risk !== 'moderate' || receipt.target !== `orchestration-run:${expectedAnchorRunId}` ||
      receipt.action !== workflowRuntimeActions.stopSet || receipt.reason !== intent.reason ||
      receipt.status !== 'succeeded' || !receipt.completedAt ||
      receipt.resultRef !== `orchestration-stop-set:${receipt.commandId}`) {
    throw invalid(`${path}.receipt`, 'is not bound to the completed stop-set command');
  }
  validateReceiptPayload(receipt.payload, `${path}.receipt.payload`, intent);
  validateReceiptResult(receipt.result, `${path}.receipt.result`, anchorRunId, outcomes);
  return { receipt,anchorRunId,outcomes };
}

function validateReceiptPayload(value: unknown, path: string, intent: AutomationStopRunSetInput) {
  const payload = exactObject(value, new Set(['expectedRevision','includeAnchor','includeDetached','reason']), path);
  if (payload.expectedRevision !== intent.expectedRevision || payload.includeAnchor !== intent.includeAnchor ||
      payload.includeDetached !== intent.includeDetached || payload.reason !== intent.reason) {
    throw invalid(path, 'does not match the submitted stop-set intent');
  }
}

function validateReceiptResult(
  value: unknown,
  path: string,
  anchorRunId: string,
  outcomes: AutomationStopRunSetOutcome[],
) {
  const result = exactObject(value, new Set(['anchorRunId','outcomes']), path);
  if (result.anchorRunId !== anchorRunId || !Array.isArray(result.outcomes) || result.outcomes.length !== outcomes.length) {
    throw invalid(path, 'does not match the returned stop-set result');
  }
  for (let index = 0; index < outcomes.length; index += 1) {
    const parsed = parseOutcome(result.outcomes[index], `${path}.outcomes[${index}]`);
    const expected = outcomes[index];
    if (parsed.runId !== expected.runId || parsed.priorStatus !== expected.priorStatus ||
        parsed.accepted !== expected.accepted || parsed.alreadyTerminal !== expected.alreadyTerminal ||
        parsed.error !== expected.error) {
      throw invalid(path, 'does not match the returned stop-set outcomes');
    }
  }
}

function parseOutcome(value: unknown, path: string): AutomationStopRunSetOutcome {
  const outcome = exactObject(value, outcomeKeys, path);
  const runId = canonicalString(outcome.runId, `${path}.runId`);
  if (!isStopRunSetPriorStatus(outcome.priorStatus)) {
    throw invalid(`${path}.priorStatus`, `has unsupported value "${String(outcome.priorStatus ?? '')}"`);
  }
  if (typeof outcome.accepted !== 'boolean') throw invalid(`${path}.accepted`, 'must be a boolean');
  if (typeof outcome.alreadyTerminal !== 'boolean') throw invalid(`${path}.alreadyTerminal`, 'must be a boolean');
  if (typeof outcome.error !== 'string') throw invalid(`${path}.error`, 'must be a string');
  if (outcome.accepted && outcome.alreadyTerminal) {
    throw invalid(path, 'cannot be both accepted and already terminal');
  }
  if (outcome.error && (outcome.accepted || outcome.alreadyTerminal)) {
    throw invalid(path, 'an accepted or already-terminal stop cannot expose an error');
  }
  if (!outcome.accepted && !outcome.alreadyTerminal && !outcome.error) {
    throw invalid(path, 'must report an accepted stop, an already-terminal Run, or an error');
  }
  return {
    runId,
    priorStatus: outcome.priorStatus,
    accepted: outcome.accepted,
    alreadyTerminal: outcome.alreadyTerminal,
    error: outcome.error,
  };
}

function parseReceipt(value: unknown, path: string): CommandReceipt {
  const receipt = exactObject(value, receiptKeys, path);
  const commandId = canonicalString(receipt.commandId, `${path}.commandId`);
  const requestId = string(receipt.requestId, `${path}.requestId`);
  const idempotencyKey = string(receipt.idempotencyKey, `${path}.idempotencyKey`);
  const actor = string(receipt.actor, `${path}.actor`);
  if (receipt.risk !== 'low' && receipt.risk !== 'moderate' && receipt.risk !== 'high') {
    throw invalid(`${path}.risk`, 'must be low, moderate, or high');
  }
  const target = string(receipt.target, `${path}.target`);
  const action = string(receipt.action, `${path}.action`);
  if (receipt.status !== 'accepted' && receipt.status !== 'succeeded' && receipt.status !== 'failed' && receipt.status !== 'rejected') {
    throw invalid(`${path}.status`, 'has an unsupported value');
  }
  const createdAt = timestamp(receipt.createdAt, `${path}.createdAt`);
  return {
    commandId,requestId,idempotencyKey,actor,risk: receipt.risk,target,action,status: receipt.status,createdAt,
    ...optionalString(receipt, 'reason', path),
    ...(receipt.payload === undefined ? {} : { payload: receipt.payload }),
    ...optionalString(receipt, 'resultRef', path),
    ...(receipt.result === undefined ? {} : { result: receipt.result }),
    ...optionalString(receipt, 'errorCode', path),
    ...optionalString(receipt, 'errorMessage', path),
    ...(receipt.completedAt === undefined ? {} : { completedAt: timestamp(receipt.completedAt, `${path}.completedAt`) }),
  };
}

function exactObject(value: unknown, keys: Set<string>, path: string): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(path, 'must be an object');
  const object = value as Record<string,unknown>;
  const unknown = Object.keys(object).find((key) => !keys.has(key));
  if (unknown) throw invalid(path, `contains unknown property "${unknown}"`);
  return object;
}

function optionalString<T extends string>(value: Record<string,unknown>, key: T, path: string): Partial<Record<T,string>> {
  if (value[key] === undefined) return {};
  return { [key]: string(value[key], `${path}.${key}`) } as Partial<Record<T,string>>;
}

function canonicalString(value: unknown, path: string) {
  const parsed = string(value, path);
  if (!parsed || parsed.trim() !== parsed) throw invalid(path, 'must be a non-empty canonical string');
  return parsed;
}

function string(value: unknown, path: string) {
  if (typeof value !== 'string') throw invalid(path, 'must be a string');
  return value;
}

function timestamp(value: unknown, path: string) {
  const parsed = string(value, path);
  if (!parsed || Number.isNaN(Date.parse(parsed))) throw invalid(path, 'must be an RFC 3339 timestamp');
  return parsed;
}

function invalid(path: string, reason: string) {
  return new Error(`Invalid Automation stop-set response at ${path}: ${reason}.`);
}
