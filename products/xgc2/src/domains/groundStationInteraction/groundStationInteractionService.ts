import { HTTPError,request } from '../../api/http';
import { segment } from '../../shared/url';
import { executionTargetPath,executionTargetResourceId,normalizeExecutionTargetId } from '../execution/executionPublic';
import { decodeGroundStationInteraction,isRetiredGroundStationRecordingRequest } from './groundStationInteractionDecoder';
import {
  GROUND_STATION_MAX_FORM_FIELDS,
  type GroundStationInteraction,
  type GroundStationInteractionActionInput,
} from './groundStationInteractionTypes';

type RequestOptions = { signal?: AbortSignal };
const RECENT_INTERACTION_LIMIT = 256;

export type GroundStationInteractionActionResponse = {
  interaction: GroundStationInteraction;
  receipt?: unknown;
};

export async function listOpenGroundStationInteractions(
  targetId: string,
  options: RequestOptions = {},
): Promise<GroundStationInteraction[]> {
  const target = normalizeExecutionTargetId(targetId);
  const path = `${executionTargetPath(target)}/ground-station-interactions?status=open`;
  const response = await request<unknown>(path, { signal: options.signal });
  return decodeGroundStationInteractionInventory(target, path, response);
}

export async function listRecentGroundStationInteractions(
  targetId: string,
  options: RequestOptions = {},
): Promise<GroundStationInteraction[]> {
  const target = normalizeExecutionTargetId(targetId);
  const path = `${executionTargetPath(target)}/ground-station-interactions?limit=${RECENT_INTERACTION_LIMIT}`;
  const response = await request<unknown>(path, { signal: options.signal });
  return decodeGroundStationInteractionInventory(target, path, response);
}

function decodeGroundStationInteractionInventory(
  target: string,
  path: string,
  response: unknown,
) {
  const targetScope = executionTargetResourceId(target);
  const values = interactionCollection(response, path);
  return values.flatMap((value, index) => {
    if (isRetiredGroundStationRecordingRequest(value)) return [];
    const interaction = decodeGroundStationInteraction(value);
    if (!interaction || interaction.targetScope !== targetScope) {
      throw new Error(`Invalid ground-station interaction at ${path}[${index}]`);
    }
    return [interaction];
  });
}

export async function actOnGroundStationInteraction(
  targetId: string,
  interactionId: string,
  input: GroundStationInteractionActionInput,
): Promise<GroundStationInteractionActionResponse> {
  const target = normalizeExecutionTargetId(targetId);
  const targetScope = executionTargetResourceId(target);
  const id = interactionId.trim();
  if (!id) throw new Error('A ground-station interaction ID is required.');
  validateActionInput(input);

  const response = await request<unknown>(
    `${executionTargetPath(target)}/ground-station-interactions/${segment(id)}/actions`,
    {
      method: 'POST',
      headers: {
        'X-Request-ID': input.requestId,
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Invalid ground-station interaction action response.');
  }
  const envelope = response as Record<string,unknown>;
  const interaction = decodeGroundStationInteraction(envelope.interaction);
  if (!interaction || interaction.targetScope !== targetScope || interaction.id !== id) {
    throw new Error('Invalid ground-station interaction action response.');
  }
  return { interaction,...('receipt' in envelope ? { receipt: envelope.receipt } : {}) };
}

export function isGroundStationInteractionCASConflict(error: unknown) {
  return error instanceof HTTPError
    ? error.status === 409
    : error instanceof Error && /\b409\b.*(?:revision|conflict)/i.test(error.message);
}

function interactionCollection(value: unknown, path: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(`Expected an interaction collection from ${path}`);
}

function validateActionInput(input: GroundStationInteractionActionInput) {
  if (!supportedActions.includes(input.action)
    || Object.keys(input).some((key) => !actionInputKeys.includes(key))) {
    throw new Error('Unsupported ground-station interaction action input.');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new Error('A positive expected interaction revision is required.');
  }
  if (!input.requestId.trim() || !input.idempotencyKey.trim()) {
    throw new Error('Interaction request and idempotency identifiers are required.');
  }
  if (input.requestId.length > 255 || input.idempotencyKey.length > 255 || /[\r\n]/.test(input.requestId + input.idempotencyKey)) {
    throw new Error('Interaction request identifiers must be bounded HTTP header values.');
  }
  if (input.reason && [...input.reason].length > 2_000) {
    throw new Error('An interaction response reason must not exceed 2000 characters.');
  }
  validateActionValues(input);
}

// Form answers are a submitted approval, not a general side channel: the
// transport refuses to send values with any other action so a mistake surfaces
// here rather than as a rejected round trip.
function validateActionValues(input: GroundStationInteractionActionInput) {
  if (!input.values) return;
  const entries = Object.entries(input.values);
  if (input.action !== 'approved' || entries.length === 0 || entries.length > GROUND_STATION_MAX_FORM_FIELDS) {
    throw new Error('Ground-station form values are only submitted when approving a form decision.');
  }
  for (const [, value] of entries) {
    const valid = typeof value === 'string'
      ? [...value].length <= 2_000
      : typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
    if (!valid) throw new Error('Ground-station form values must be bounded strings, finite numbers, or booleans.');
  }
}

const supportedActions = ['approved','rejected','dismissed'] as const;
const actionInputKeys = ['action','expectedRevision','requestId','idempotencyKey','reason','values'];
