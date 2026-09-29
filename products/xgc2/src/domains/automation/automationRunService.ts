import { HTTPError,request,waitForTransportRetry } from '../../api/http';
import type { ConfigRef,PinnedConfigRef } from '../../shared/configResource';
import { segment } from '../../shared/url';
import { executionTargetPath,executionTargetResourceId } from '../execution/executionPublic';
import { parseAutomationNodeInvocations } from './automationInvocationModel';
import { parseAutomationNodeExecutionSummaries } from './automationNodeExecutionSummaryModel';
import { parseAutomationRun } from './automationRunRecordModel';
import { objectWithKnownKeys,requiredString } from './automationExecutionValidation';
import type { AutomationRunControl } from './automationHistoryTypes';
import { parseAutomationExecutionRelations } from './automationRelationsModel';
import type {
  AutomationRun,
  AutomationPanelActionSelector,
  AutomationRunActionResponse,
  AutomationRunSnapshot,
  AutomationStopRunSetInput,
  AutomationStopRunSetResponse,
} from './automationRunContracts';
import type {
  AutomationExecutionRelations,
} from './automationExecutionContracts';
import { hydrateAutomationSpec } from './automationSpecModel';
import {
  automationOperationHeaders,
  automationOperationRequestId,
  exactRequiredAutomationValue,
  normalizedAutomationRef,
  type AutomationRequestOptions,
} from './automationRequest';
import { parseAutomationStopRunSetResponse } from './automationStopRunSetModel';

const AUTOMATION_START_TIMEOUT_MS = 60_000;

export type StartAutomationRunInput = {
  actionId: string;
  /** Optional Experiment ownership frozen with the selected Automation. */
  experimentRef?: ConfigRef;
  automationRef: ConfigRef;
  /** Refuse a start if Core resolves a different immutable Automation source. */
  expectedAutomationRef?: PinnedConfigRef;
  panelAction?: AutomationPanelActionSelector;
  parameters?: Record<string,unknown>;
  reason?: string;
  requestId?: string;
  idempotencyKey?: string;
  throughNodeId?: string;
  keepalive?: boolean;
};

export async function getAutomationRun(targetId: string, runId: string, options: AutomationRequestOptions = {}): Promise<AutomationRun> {
  const path = `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}`;
  const response = await request<unknown>(
    `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}`,
    { signal: options.signal },
  );
  return parseAutomationRun(response, path);
}

export async function getAutomationRunDetail(
  targetId: string,
  runId: string,
  options: AutomationRequestOptions = {},
) {
  const path = `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/detail`;
  const response = objectWithKnownKeys(
    await request<unknown>(path, { signal: options.signal }),
    new Set(['run','invocations','nodeSummaries','relations']),path,
  );
  const run = parseAutomationRun(response.run, `${path}.run`);
  if (run.id !== runId || run.targetId !== executionTargetResourceId(targetId)) {
    throw new Error('Automation run detail identity does not match the selected Run.');
  }
  return {
    run,
    invocations: parseAutomationNodeInvocations(response.invocations, `${path}.invocations`, runId),
    nodeSummaries: parseAutomationNodeExecutionSummaries(response.nodeSummaries, `${path}.nodeSummaries`, runId),
    relations: parseAutomationExecutionRelations(response.relations, `${path}.relations`, runId, run.targetId),
  };
}

export function getAutomationRunSnapshot(targetId: string, runId: string, options: AutomationRequestOptions = {}): Promise<AutomationRunSnapshot> {
  return request<AutomationRunSnapshot>(
    `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/snapshot`,
    { signal: options.signal },
  ).then((snapshot) => {
    if (!snapshot || snapshot.runId !== runId || snapshot.targetId !== executionTargetResourceId(targetId)) {
      throw new Error('Automation run snapshot identity does not match the selected Run.');
    }
    return { ...snapshot,automationSpec: hydrateAutomationSpec(snapshot.automationSpec) };
  });
}

export async function getAutomationExecutionRelations(
  targetId: string,
  runId: string,
  options: AutomationRequestOptions = {},
): Promise<AutomationExecutionRelations> {
  const path = `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/relations`;
  const response = await request<unknown>(
    `${executionTargetPath(targetId)}/orchestration-runs/${segment(runId)}/relations`,
    { signal: options.signal },
  );
  return parseAutomationExecutionRelations(response, path, runId, executionTargetResourceId(targetId));
}

// Core resolves the live ConfigRef and pins its commit before projecting an
// immutable runtime definition. An optional expected pin guards that resolution.
export class AutomationStartOutcomeUnknownError extends Error {
  readonly originalCause: unknown;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly recoverable: boolean;
  private readonly recoverExactRun?: () => Promise<AutomationRun>;

  constructor(cause: unknown, recovery?: {
    requestId: string;
    idempotencyKey: string;
    recover: () => Promise<AutomationRun>;
  }) {
    super('Automation start was accepted or interrupted before its exact Run could be confirmed.');
    this.name = 'AutomationStartOutcomeUnknownError';
    this.originalCause = cause;
    this.requestId = recovery?.requestId ?? '';
    this.idempotencyKey = recovery?.idempotencyKey ?? '';
    this.recoverExactRun = recovery?.recover;
    this.recoverable = Boolean(recovery);
  }

  async recover(): Promise<AutomationRun> {
    if (!this.recoverExactRun) throw this;
    return this.recoverExactRun();
  }
}

export async function startAutomationRun(targetId: string, input: StartAutomationRunInput): Promise<AutomationRun> {
  if (!input.automationRef) throw new Error('automationRef is required.');
  if (!input.actionId || input.actionId.trim() !== input.actionId) throw new Error('An exact actionId is required.');
  if (!input.automationRef.domain.trim() || !input.automationRef.resourceId.trim()) throw new Error('An Automation resource reference is required.');
  const automationRef = normalizedAutomationRef(input.automationRef);
  const expectedAutomationRef = input.expectedAutomationRef === undefined
    ? undefined
    : validatedExpectedAutomationRef(input.expectedAutomationRef, automationRef);
  if (input.panelAction !== undefined) {
    const selector=objectWithKnownKeys(input.panelAction,new Set(['panelId','portId']),'panelAction');
    for (const key of ['panelId','portId']) requiredString(selector[key],`panelAction.${key}`);
    if (!input.experimentRef || !expectedAutomationRef) throw new Error('A standalone Panel Action requires Experiment ownership and an expected Automation pin.');
    requiredString(input.parameters?.runMode,'parameters.runMode');
  }
  const requestId = input.requestId?.trim() || automationOperationRequestId('automation.run', input.automationRef.resourceId);
  const idempotencyKey = input.idempotencyKey?.trim() || requestId;
  const body = {
    actionId: input.actionId,
    ...(input.experimentRef ? { experimentRef: normalizedExperimentRef(input.experimentRef) } : {}),
    automationRef,
    ...(input.panelAction ? { panelAction:{ ...input.panelAction } } : {}),
    ...(expectedAutomationRef ? { expectedAutomationRef } : {}),
    ...(input.throughNodeId?.trim() ? { throughNodeId: input.throughNodeId.trim() } : {}),
    parameters: input.parameters ?? {},
    requestId,
    idempotencyKey,
    reason: input.reason?.trim() || 'Start configuration run',
  };
  const path = `${executionTargetPath(targetId)}/orchestration-runs`;
  const init = {
    method: 'POST',
    headers: automationOperationHeaders(body),
    body: JSON.stringify(body),
    ...(input.keepalive === true ? { keepalive: true } : {}),
  };
  const requestExactRun = async () => {
    try {
      const response = await request<AutomationRunActionResponse>(
        path,init,{ timeoutMs:AUTOMATION_START_TIMEOUT_MS },
      );
      return parseAutomationRun(response.run, `${path}.run`);
    } catch (cause) {
      const existing = conflictAutomationRun(cause);
      if (existing) return existing;
      throw cause;
    }
  };
  const recoverExactRun = async (): Promise<AutomationRun> => {
    try {
      return await requestExactRun();
    } catch (cause) {
      if (!automationStartOutcomeMayBeUnknown(cause)) throw cause;
      throw new AutomationStartOutcomeUnknownError(cause, {
        requestId,idempotencyKey,recover: recoverExactRun,
      });
    }
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestExactRun();
    } catch (cause) {
      if (!automationStartOutcomeMayBeUnknown(cause)) throw cause;
      if (attempt === 1) {
        throw new AutomationStartOutcomeUnknownError(cause, {
          requestId,idempotencyKey,recover: recoverExactRun,
        });
      }
    }
  }
  throw new Error('Automation start retry exhausted.');
}

function normalizedExperimentRef(ref: ConfigRef): ConfigRef {
  const normalized = normalizedAutomationRef(ref);
  if (normalized.domain !== 'experiment' || normalized.componentId) {
    throw new Error('Experiment-owned Automation start requires an Experiment resource reference.');
  }
  return normalized;
}

function validatedExpectedAutomationRef(ref: PinnedConfigRef, automationRef: ConfigRef): PinnedConfigRef {
  if (!ref || ref.domain !== automationRef.domain || ref.resourceId !== automationRef.resourceId
    || ref.branch !== automationRef.branch || (ref.componentId ?? '') !== (automationRef.componentId ?? '')) {
    throw new Error('expectedAutomationRef must match the selected Automation domain, resource, branch and component.');
  }
  if (typeof ref.commitId !== 'string' || !ref.commitId.trim() || ref.commitId.trim() !== ref.commitId) {
    throw new Error('expectedAutomationRef commitId must be a non-empty canonical value.');
  }
  if (!Number.isSafeInteger(ref.version) || ref.version < 1) {
    throw new Error('expectedAutomationRef version must be a positive integer.');
  }
  if (typeof ref.digest !== 'string' || !/^[a-f0-9]{64}$/.test(ref.digest)) {
    throw new Error('expectedAutomationRef digest must be a 64-character lowercase hexadecimal value.');
  }
  return {
    domain: ref.domain,resourceId: ref.resourceId,branch: ref.branch,
    ...(ref.componentId !== undefined ? { componentId: ref.componentId } : {}),
    commitId: ref.commitId,version: ref.version,digest: ref.digest,
  };
}

export async function recoverAutomationStartOutcome(
  initial: AutomationStartOutcomeUnknownError,
  retryDelaysMs: readonly number[] = [0,150,350,750],
): Promise<AutomationRun> {
  let current = initial;
  for (const delayMs of retryDelaysMs) {
    if (!current.recoverable) throw current;
    if (delayMs > 0) await waitForTransportRetry(delayMs);
    try {
      return await current.recover();
    } catch (cause) {
      if (!(cause instanceof AutomationStartOutcomeUnknownError)) throw cause;
      current = cause;
    }
  }
  throw current;
}

// Core answers the genuinely unconfirmed start with a durable command receipt
// beside its error; every other 5xx is a deterministic refusal whose own message
// must reach the operator instead of the recovery wording. A non-HTTP cause is a
// transport failure that never observed a response and stays unknown.
function automationStartOutcomeMayBeUnknown(cause: unknown) {
  if (!(cause instanceof HTTPError)) return true;
  return cause.status >= 500 && automationStartResponseCarriesReceipt(cause.body);
}

function automationStartResponseCarriesReceipt(body: unknown) {
  if (!body || typeof body !== 'object') return false;
  const receipt = (body as { receipt?: unknown }).receipt;
  return Boolean(receipt) && typeof receipt === 'object';
}

function conflictAutomationRun(cause: unknown) {
  if (!(cause instanceof HTTPError) || cause.status !== 409 || !cause.body || typeof cause.body !== 'object') return undefined;
  const run = (cause.body as { run?: unknown }).run;
  if (!run || typeof run !== 'object') return undefined;
  const candidate = run as Partial<AutomationRun>;
  return typeof candidate.id === 'string'
    && typeof candidate.targetId === 'string'
    && typeof candidate.definitionId === 'string'
    && typeof candidate.status === 'string'
    && typeof candidate.revision === 'number'
    && candidate.executionModel === 'orchestration-occurrence-v1'
    ? parseAutomationRun(candidate, 'automation conflict response.run')
    : undefined;
}

export async function stopAutomationRun(targetId: string, run: AutomationRunControl, reason = 'Stop Automation run'): Promise<AutomationRun> {
  return controlAutomationRun(targetId, run, 'stop', reason);
}

export async function stopAutomationRunSet(
  targetId: string,
  anchorRunId: string,
  input: AutomationStopRunSetInput,
): Promise<AutomationStopRunSetResponse> {
  const canonicalAnchorRunId = exactRequiredAutomationValue(anchorRunId, 'Automation stop-set anchor Run');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new Error('Automation stop-set expectedRevision must be a positive integer.');
  }
  if (typeof input.includeAnchor !== 'boolean' || typeof input.includeDetached !== 'boolean') {
    throw new Error('Automation stop-set inclusion flags must be booleans.');
  }
  const requestId = exactRequiredAutomationValue(input.requestId, 'Automation stop-set requestId');
  const idempotencyKey = exactRequiredAutomationValue(input.idempotencyKey, 'Automation stop-set idempotencyKey');
  const body: AutomationStopRunSetInput = {
    expectedRevision: input.expectedRevision,
    includeAnchor: input.includeAnchor,
    includeDetached: input.includeDetached,
    reason: input.reason.trim(),
    requestId,
    idempotencyKey,
  };
  const path = `${executionTargetPath(targetId)}/orchestration-runs/${segment(canonicalAnchorRunId)}/stop-set`;
  const response = await request<unknown>(
    `${executionTargetPath(targetId)}/orchestration-runs/${segment(canonicalAnchorRunId)}/stop-set`,
    {
      method: 'POST',
      headers: automationOperationHeaders(body),
      body: JSON.stringify(body),
    },
  );
  return parseAutomationStopRunSetResponse(response, path, canonicalAnchorRunId, body);
}

export async function cancelAutomationRun(targetId: string, run: AutomationRunControl, reason = 'Cancel Automation run'): Promise<AutomationRun> {
  return controlAutomationRun(targetId, run, 'cancel', reason);
}

async function controlAutomationRun(
  targetId: string,
  run: AutomationRunControl,
  action: 'stop' | 'cancel',
  reason: string,
) {
  const requestId = automationOperationRequestId(`automation.${action}`, run.id);
  const body = {
    expectedRevision: run.revision,
    requestId,
    idempotencyKey: requestId,
    reason: reason.trim() || `${action} Automation run`,
  };
  const response = action === 'stop'
    ? await request<AutomationRunActionResponse>(
      `${executionTargetPath(targetId)}/orchestration-runs/${segment(run.id)}/stop`,
      {
        method: 'POST',
        headers: automationOperationHeaders(body),
        body: JSON.stringify(body),
      },
    )
    : await request<AutomationRunActionResponse>(
      `${executionTargetPath(targetId)}/orchestration-runs/${segment(run.id)}/cancel`,
      {
        method: 'POST',
        headers: automationOperationHeaders(body),
        body: JSON.stringify(body),
      },
    );
  return parseAutomationRun(response.run, `${executionTargetPath(targetId)}/orchestration-runs/${segment(run.id)}/${action}.run`);
}
