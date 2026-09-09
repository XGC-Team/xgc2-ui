import {
  type GroundStationCancellationResponse,
  type GroundStationDecisionForm,
  GROUND_STATION_INTERACTION_SCHEMA_VERSION,
  GROUND_STATION_MAX_FORM_FIELDS,
  type GroundStationDecisionResponse,
  type GroundStationFormField,
  type GroundStationFormFieldKind,
  type GroundStationFormValue,
  type GroundStationFormValues,
  type GroundStationDismissalResponse,
  type GroundStationInteraction,
  type GroundStationInteractionAudience,
  type GroundStationInteractionKind,
  type GroundStationInteractionOrigin,
  type GroundStationInteractionResponse,
} from './groundStationInteractionTypes';

import { decodeExperimentAgentAction,decodeAgentAdmission } from './experimentAgentContract';

const MAX_ID_LENGTH = 256;
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_LABEL_LENGTH = 120;

export function decodeGroundStationInteraction(value: unknown): GroundStationInteraction | undefined {
  const item = record(value);
  if (!item || item.schemaVersion !== GROUND_STATION_INTERACTION_SCHEMA_VERSION) return undefined;

  const kind = oneOf(item.kind, interactionKinds);
  const status = oneOf(item.status, interactionStatuses);
  const presentation = oneOf(item.presentation, interactionPresentations);
  const responseMode = oneOf(item.responseMode, interactionResponseModes);
  const severity = oneOf(item.severity, interactionSeverities);
  const id = requiredText(item.id, MAX_ID_LENGTH);
  const targetScope = requiredText(item.targetScope, MAX_ID_LENGTH);
  const title = requiredText(item.title, MAX_TITLE_LENGTH);
  const message = requiredText(item.message, MAX_MESSAGE_LENGTH);
  const revision = positiveInteger(item.revision);
  const origin = decodeOrigin(item.origin);
  const audience = decodeAudience(item.audience);
  const response = decodeOptionalResponse(item.response);
  const createdAt = validTimestamp(item.createdAt);
  const updatedAt = validTimestamp(item.updatedAt);
  const expiresAt = optionalTimestamp(item.expiresAt);
  const resolvedAt = optionalTimestamp(item.resolvedAt);
  const payload = record(item.payload);

  if (!kind || !status || !presentation || !responseMode || !severity || !id || !targetScope || !title || !message
    || revision === undefined || !origin || !audience || response === null || !createdAt || !updatedAt
    || expiresAt === null || resolvedAt === null || !payload) return undefined;
  if (!payloadMatchesKind(kind, payload)) return undefined;

  const base = {
    schemaVersion: GROUND_STATION_INTERACTION_SCHEMA_VERSION,
    id,
    targetScope,
    revision,
    status,
    presentation,
    responseMode,
    severity,
    title,
    message,
    origin,
    audience,
    ...(expiresAt ? { expiresAt } : {}),
    createdAt,
    updatedAt,
    ...(resolvedAt ? { resolvedAt } : {}),
  };

  switch (kind) {
    case 'message': {
      if (responseMode !== 'none' || presentation !== 'toast' || !responseMatchesLifecycle(kind, status, response)) return undefined;
      const messageResponse = response && isPassiveResponse(response) ? response : undefined;
      const detail = record(payload.message);
      const durationMs = duration(detail?.durationMs, 6_000);
      const dismissLabel = optionalText(detail?.dismissLabel, MAX_LABEL_LENGTH);
      if (durationMs === undefined || dismissLabel === null) return undefined;
      return {
        ...base,
        kind,
        presentation,
        responseMode,
        ...(messageResponse ? { response: messageResponse } : {}),
        payload: { message: { durationMs,dismissLabel: dismissLabel || 'Got it' } },
      };
    }
    case 'decision': {
      if (responseMode !== 'decision' || presentation !== 'panel' || !responseMatchesLifecycle(kind, status, response)) return undefined;
      const decisionResponse = response && isDecisionResponse(response) ? response : undefined;
      const detail = record(payload.decision);
      const approveLabel = optionalText(detail?.approveLabel, MAX_LABEL_LENGTH);
      const rejectLabel = optionalText(detail?.rejectLabel, MAX_LABEL_LENGTH);
      const requireReason = optionalBoolean(detail?.requireReason, false);
      // Operator-side recording effects were retired. Never downgrade an old
      // semantic request to a plain approval that would falsely report success.
      if (detail?.action !== undefined && detail.action !== null) return undefined;
      const form = decodeDecisionForm(detail?.form);
      const agentAction = decodeExperimentAgentAction(detail?.agentAction);
      if (agentAction === null || (agentAction && (form || origin.type !== 'experiment-agent' || origin.ref !== agentAction.delegationId || origin.experimentId !== agentAction.experimentId || targetScope !== 'local' || !expiresAt))) return undefined;
      if (agentAction && decisionResponse?.action === 'approved' && (!decisionResponse.admission || decisionResponse.admission.runId !== agentAction.runId || decisionResponse.admission.eventId !== agentAction.eventId)) return undefined;
      if (!agentAction && (decisionResponse?.admission || origin.type === 'experiment-agent')) return undefined;
      if (approveLabel === null || rejectLabel === null || requireReason === undefined
        || form === null) return undefined;
      if (decisionResponse && !responseValuesMatchForm(form, decisionResponse)) return undefined;
      return {
        ...base,
        kind,
        presentation,
        responseMode,
        ...(decisionResponse ? { response: decisionResponse } : {}),
        payload: { decision: {
          approveLabel: approveLabel || 'Approve and continue',
          rejectLabel: rejectLabel || 'Reject',
          requireReason,
          ...(form ? { form } : {}),
          ...(agentAction ? { agentAction } : {}),
        } },
      };
    }
    case 'status': {
      if (responseMode !== 'none' || presentation !== 'panel' || !responseMatchesLifecycle(kind, status, response)) return undefined;
      const statusResponse = response && isCancellationResponse(response) ? response : undefined;
      const detail = record(payload.status);
      const statusKey = requiredText(detail?.statusKey, MAX_ID_LENGTH);
      const state = requiredText(detail?.state, 120);
      const statusDetail = optionalText(detail?.detail, MAX_MESSAGE_LENGTH);
      const progress = optionalProgress(detail?.progress);
      if (!statusKey || !state || statusDetail === null || progress === null) return undefined;
      return {
        ...base,
        kind,
        presentation,
        responseMode,
        ...(statusResponse ? { response: statusResponse } : {}),
        payload: { status: {
          statusKey,
          state,
          ...(statusDetail ? { detail: statusDetail } : {}),
          ...(progress === undefined ? {} : { progress }),
        } },
      };
    }
    case 'context': {
      if (responseMode !== 'none' || presentation !== 'panel' || !responseMatchesLifecycle(kind, status, response)) return undefined;
      const contextResponse = response && isPassiveResponse(response) ? response : undefined;
      const detail = record(payload.context);
      const contextKind = requiredText(detail?.kind, 64);
      const contextId = requiredText(detail?.id, MAX_ID_LENGTH);
      const subview = optionalText(detail?.subview, MAX_ID_LENGTH);
      const actionLabel = optionalText(detail?.actionLabel, MAX_LABEL_LENGTH);
      if (!contextKind || !contextId || subview === null || actionLabel === null) return undefined;
      const remote = record(detail?.remoteController);
      let remoteController: {sessionId:string;conversationId:string;robotIds:string[]} | undefined;
      if (detail?.remoteController !== undefined) {
        const sessionId = requiredText(remote?.sessionId,MAX_ID_LENGTH);
        const conversationId = requiredText(remote?.conversationId,MAX_ID_LENGTH);
        const robotIds = remote?.robotIds;
        if (contextKind !== 'robot-remote-controller' || !sessionId || !conversationId
          || !Array.isArray(robotIds) || robotIds.length === 0 || robotIds.length > 64
          || robotIds.some(id => !requiredText(id,MAX_ID_LENGTH)) || new Set(robotIds).size !== robotIds.length) return undefined;
        remoteController = {sessionId,conversationId,robotIds:robotIds as string[]};
      }

      return {
        ...base,
        kind,
        presentation,
        responseMode,
        ...(contextResponse ? { response: contextResponse } : {}),
        payload: { context: {
          ...(remoteController ? {remoteController} : {}),
          kind: contextKind,
          id: contextId,
          ...(subview ? { subview } : {}),
          actionLabel: actionLabel || 'View',
        } },
      };
    }
  }
}

export function isGroundStationInteractionOpen(interaction: GroundStationInteraction, now = Date.now()) {
  if (interaction.status !== 'open') return false;
  const expiry = interaction.expiresAt ? Date.parse(interaction.expiresAt) : Number.POSITIVE_INFINITY;
  return !Number.isFinite(expiry) || expiry > now;
}

/** Old persisted requests are omitted without responding to or rewriting them. */
export function isRetiredGroundStationRecordingRequest(value: unknown): boolean {
  const item = record(value);
  if (item?.schemaVersion !== GROUND_STATION_INTERACTION_SCHEMA_VERSION || item.kind !== 'decision') return false;
  const decision = record(record(item.payload)?.decision);
  return record(decision?.action)?.kind === 'screen-recording';
}

/**
 * A decision form stays a closed declaration at the boundary. null means the
 * decision is undecodable — a form the ground station cannot render exactly is
 * worse than no prompt at all; undefined means a plain decision with no form.
 */
function decodeDecisionForm(value: unknown): GroundStationDecisionForm | null | undefined {
  if (value === undefined || value === null) return undefined;
  const form = record(value);
  if (!form || Object.keys(form).some((key) => key !== 'fields') || !Array.isArray(form.fields)) return null;
  if (form.fields.length === 0 || form.fields.length > GROUND_STATION_MAX_FORM_FIELDS) return null;
  const fields: GroundStationFormField[] = [];
  const names = new Set<string>();
  for (const entry of form.fields) {
    const field = record(entry);
    if (!field || Object.keys(field).some((key) => !formFieldKeys.includes(key))) return null;
    const name = requiredText(field.name, 64);
    const kind = oneOf(field.kind, formFieldKinds);
    const label = optionalText(field.label, MAX_LABEL_LENGTH);
    const required = optionalBoolean(field.required, false);
    if (!name || !formFieldNamePattern.test(name) || !kind || label === null || required === undefined) return null;
    if (names.has(name)) return null;
    names.add(name);
    const fallback = decodeFormValue(field.default, kind);
    if (fallback === null) return null;
    fields.push({
      name,
      ...(label ? { label } : {}),
      kind,
      ...(required ? { required } : {}),
      ...(fallback === undefined ? {} : { default: fallback }),
    });
  }
  return { fields };
}

// null means present but not the declared kind; undefined means absent.
function decodeFormValue(value: unknown, kind: GroundStationFormFieldKind): GroundStationFormValue | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (kind === 'string') return typeof value === 'string' && [...value].length <= MAX_MESSAGE_LENGTH ? value : null;
  if (kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : null;
  return typeof value === 'boolean' ? value : null;
}

function responseValuesMatchForm(
  form: GroundStationDecisionForm | undefined,
  response: GroundStationDecisionResponse,
) {
  const values = response.values;
  if (!values) return true;
  if (!form || response.action !== 'approved') return false;
  return Object.entries(values).every(([name, value]) => {
    const field = form.fields.find((candidate) => candidate.name === name);
    return field !== undefined && decodeFormValue(value, field.kind) === value;
  });
}

function decodeOrigin(value: unknown): GroundStationInteractionOrigin | undefined {
  const origin = record(value);
  if (!origin) return undefined;
  const type = requiredText(origin.type, 80);
  const ref = optionalText(origin.ref, MAX_ID_LENGTH);
  const runId = optionalText(origin.runId, MAX_ID_LENGTH);
  const nodeId = optionalText(origin.nodeId, MAX_ID_LENGTH);
  const invocationId = optionalText(origin.invocationId, MAX_ID_LENGTH);
  const experimentId = optionalText(origin.experimentId, 64);
  const displayName = optionalText(origin.displayName, MAX_TITLE_LENGTH);
  if (!type || ref === null || runId === null || nodeId === null || displayName === null
    || invocationId === null || experimentId === null) return undefined;
  return {
    type,
    ...(ref ? { ref } : {}),
    ...(runId ? { runId } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(invocationId ? { invocationId } : {}),
    ...(experimentId ? { experimentId } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

function decodeAudience(value: unknown): GroundStationInteractionAudience | undefined {
  const audience = record(value);
  return audience?.scope === 'all' ? { scope: 'all' } : undefined;
}

function decodeOptionalResponse(value: unknown): GroundStationInteractionResponse | null | undefined {
  if (value === undefined || value === null) return undefined;
  const response = record(value);
  if (!response || Object.keys(response).some((key) => !interactionResponseKeys.includes(key))) return null;
  const action = oneOf(response.action, interactionActions);
  const actor = requiredText(response.actor, MAX_ID_LENGTH);
  const reason = optionalText(response.reason, MAX_MESSAGE_LENGTH);
  const at = validTimestamp(response.at);
  const values = decodeFormValues(response.values);
  const admission = decodeAgentAdmission(response.admission);
  const policy = response.policy === undefined ? undefined : record(response.policy);
  if (response.policy !== undefined && (!policy || Object.keys(policy).some(key => !['policyId','policyRevision','ruleId','mode'].includes(key))
    || !requiredText(policy.policyId,128) || !requiredText(policy.policyRevision,256) || !requiredText(policy.ruleId,128)
    || !['auto','deny'].includes(policy.mode as string) || (policy.mode === 'auto' ? action !== 'approved' : action !== 'rejected') || values)) return null;
  if (admission === null || (admission && (action !== 'approved' || values))) return null;
  if (!action || !actor || reason === null || !at || values === null) return null;
  // Only an approved decision submits a form; anything else carrying values is
  // a response this ground station cannot account for.
  if (values && action !== 'approved') return null;
  return {
    action,
    actor,
    ...(reason ? { reason } : {}),
    ...(values ? { values } : {}),
    ...(admission ? { admission } : {}),
    ...(policy ? {policy:{policyId:policy.policyId as string,policyRevision:policy.policyRevision as string,ruleId:policy.ruleId as string,mode:policy.mode as 'auto'|'deny'}} : {}),
    at,
  };
}

// null means malformed; undefined means the response submitted no form.
function decodeFormValues(value: unknown): GroundStationFormValues | null | undefined {
  if (value === undefined || value === null) return undefined;
  const values = record(value);
  if (!values) return null;
  const entries = Object.entries(values);
  if (entries.length === 0 || entries.length > GROUND_STATION_MAX_FORM_FIELDS) return null;
  const decoded: GroundStationFormValues = {};
  for (const [name, member] of entries) {
    if (!formFieldNamePattern.test(name)) return null;
    if (typeof member === 'string') {
      if ([...member].length > MAX_MESSAGE_LENGTH) return null;
      decoded[name] = member;
      continue;
    }
    if (typeof member === 'boolean' || (typeof member === 'number' && Number.isFinite(member))) {
      decoded[name] = member;
      continue;
    }
    return null;
  }
  return decoded;
}

function payloadMatchesKind(kind: GroundStationInteractionKind, payload: Record<string,unknown>) {
  const keys = Object.keys(payload);
  if (keys.some((key) => !interactionKinds.includes(key as GroundStationInteractionKind)) || keys.length > 1) return false;
  if (keys.length === 0) return kind === 'message' || kind === 'decision';
  return keys[0] === kind && record(payload[kind]) !== undefined;
}

function isDecisionResponse(response: GroundStationInteractionResponse): response is GroundStationDecisionResponse {
  return response.action === 'approved' || response.action === 'rejected' || response.action === 'canceled';
}

function isDismissalResponse(response: GroundStationInteractionResponse): response is GroundStationDismissalResponse {
  return response.action === 'dismissed';
}

function isCancellationResponse(response: GroundStationInteractionResponse): response is GroundStationCancellationResponse {
  return response.action === 'canceled';
}

function isPassiveResponse(
  response: GroundStationInteractionResponse,
): response is GroundStationDismissalResponse | GroundStationCancellationResponse {
  return isDismissalResponse(response) || isCancellationResponse(response);
}

function responseMatchesLifecycle(
  kind: GroundStationInteractionKind,
  status: GroundStationInteraction['status'],
  response: GroundStationInteractionResponse | undefined,
) {
  if (status === 'canceled') return !!response && isCancellationResponse(response);
  if (status === 'open' || status === 'expired') return !response;
  if (kind === 'decision') return !!response && isDecisionResponse(response);
  return !!response && isDismissalResponse(response);
}

function record(value: unknown): Record<string,unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string,unknown>
    : undefined;
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || [...normalized].length > maxLength) return '';
  return normalized;
}

// null means invalid; undefined means omitted.
function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if ([...normalized].length > maxLength) return null;
  return normalized || undefined;
}

function optionalBoolean(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return typeof value === 'boolean' ? value : undefined;
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function duration(value: unknown, fallback: number) {
  if (value === undefined || value === 0) return fallback;
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 300_000
    ? Math.max(1_000, Number(value))
    : undefined;
}

function optionalProgress(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? value.trim() : '';
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return validTimestamp(value) || null;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === 'string' && values.includes(value as T) ? value as T : undefined;
}

const interactionKinds = ['message','decision','status','context'] as const;
const interactionStatuses = ['open','resolved','canceled','expired'] as const;
const interactionPresentations = ['toast','panel'] as const;
const interactionResponseModes = ['none','decision'] as const;
const interactionSeverities = ['info','success','warning','error','critical'] as const;
const interactionActions = ['approved','rejected','canceled','dismissed'] as const;
const interactionResponseKeys = ['action','actor','reason','values','at','admission','policy'];
const formFieldKinds = ['string','number','boolean'] as const;
const formFieldKeys = ['name','label','kind','required','default'];
const formFieldNamePattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
