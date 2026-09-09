import { HTTPError,requestExternalJSON } from '../../api/http';

export const MARK_PROMPT_COMMAND_ENDPOINT = '/__xgc/devtools/mark-prompt/command';
export const MARK_PROMPT_TARGETS_ENDPOINT = '/__xgc/devtools/mark-prompt/targets';
export const MARK_PROMPT_DEFAULT_PANE_LABEL = 'xgc2_lead';

export type MarkPromptCommandErrorCode =
  | 'bridge-unavailable'
  | 'invalid-request'
  | 'invalid-response'
  | 'network-error'
  | 'primary-agent-ambiguous'
  | 'prompt-rejected'
  | 'target-blocked'
  | 'target-not-visible'
  | 'target-unavailable';

export type MarkPromptListedTarget = {
  paneId: string;
  paneLabel: string;
  kind: string;
  agentStatus: 'idle' | 'working' | 'done' | 'blocked';
  primary: boolean;
};

export type MarkPromptTargetsPayload = {
  schemaVersion: 'xgc.mark-prompt-targets/v1';
  workspaceId: string;
  tabId: string;
  targets: MarkPromptListedTarget[];
};

export type MarkPromptCommandReceipt = {
  schemaVersion: 'xgc.mark-prompt-command-receipt/v1';
  status: 'accepted';
  delivery: 'queued' | 'started';
  target: {
    agent: string;
    paneId: string;
    tabId: string;
    workspaceId: string;
    primary: boolean;
    visible: true;
  };
};

type MarkPromptCommandErrorResponse = {
  schemaVersion: 'xgc.mark-prompt-command-error/v1' | 'xgc.mark-prompt-targets-error/v1';
  status: 'error';
  error: {
    code: MarkPromptCommandErrorCode;
    message: string;
  };
  fallback: 'copy';
};

export class MarkPromptCommandError extends Error {
  readonly code: MarkPromptCommandErrorCode;

  constructor(code: MarkPromptCommandErrorCode, message: string) {
    super(message);
    this.name = 'MarkPromptCommandError';
    this.code = code;
  }
}

export async function listMarkPromptTargets(): Promise<MarkPromptListedTarget[]> {
  let payload: unknown;
  try {
    payload = await requestExternalJSON<unknown>(MARK_PROMPT_TARGETS_ENDPOINT, {
      method: 'GET',
      headers: {
        'X-XGC-Mark-Prompt': 'v1',
      },
    }, { timeoutMs: 8_000 });
  } catch (error) {
    throw markPromptTransportError(error, 'The local prompt target list is unreachable.');
  }
  if (isRecord(payload)
      && payload.schemaVersion === 'xgc.mark-prompt-targets-unavailable/v1'
      && payload.status === 'unavailable'
      && payload.fallback === 'copy'
      && Array.isArray(payload.targets) && payload.targets.length === 0
      && isRecord(payload.error) && payload.error.code === 'bridge-unavailable'
      && typeof payload.error.message === 'string') {
    throw new MarkPromptCommandError('bridge-unavailable', payload.error.message);
  }
  if (isTargetsPayload(payload)) return payload.targets;
  throw new MarkPromptCommandError(
    'invalid-response',
    'The local prompt bridge returned an invalid target list.',
  );
}

export async function sendMarkPromptCommand(
  prompt: string,
  target: string,
): Promise<MarkPromptCommandReceipt> {
  let payload: unknown;
  try {
    payload = await requestExternalJSON<unknown>(MARK_PROMPT_COMMAND_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-XGC-Mark-Prompt': 'v1',
      },
      body: JSON.stringify({
        schemaVersion: 'xgc.mark-prompt-command/v1',
        prompt,
        target,
      }),
    }, { timeoutMs: 12_000 });
  } catch (error) {
    throw markPromptTransportError(error, 'The local prompt bridge is unreachable.');
  }

  if (isReceipt(payload)) return payload;
  throw new MarkPromptCommandError(
    'invalid-response',
    'The local prompt bridge returned an invalid response.',
  );
}

function markPromptTransportError(error: unknown, fallback: string): MarkPromptCommandError {
  if (error instanceof HTTPError && isErrorResponse(error.body)) {
    return new MarkPromptCommandError(error.body.error.code, error.body.error.message);
  }
  return new MarkPromptCommandError('network-error', compactMessage(error, fallback));
}

function isTargetsPayload(value: unknown): value is MarkPromptTargetsPayload {
  if (!isRecord(value)
      || value.schemaVersion !== 'xgc.mark-prompt-targets/v1'
      || typeof value.workspaceId !== 'string'
      || typeof value.tabId !== 'string'
      || !Array.isArray(value.targets)) {
    return false;
  }
  return value.targets.every(isListedTarget);
}

function isListedTarget(value: unknown): value is MarkPromptListedTarget {
  if (!isRecord(value)) return false;
  return typeof value.paneId === 'string'
    && typeof value.paneLabel === 'string'
    && typeof value.kind === 'string'
    && ['idle','working','done','blocked'].includes(String(value.agentStatus))
    && typeof value.primary === 'boolean';
}

function isReceipt(value: unknown): value is MarkPromptCommandReceipt {
  if (!isRecord(value)
      || value.schemaVersion !== 'xgc.mark-prompt-command-receipt/v1'
      || value.status !== 'accepted'
      || !['queued','started'].includes(String(value.delivery))
      || !isRecord(value.target)) {
    return false;
  }
  return typeof value.target.agent === 'string'
    && typeof value.target.paneId === 'string'
    && typeof value.target.tabId === 'string'
    && typeof value.target.workspaceId === 'string'
    && typeof value.target.primary === 'boolean'
    && value.target.visible === true;
}

function isErrorResponse(value: unknown): value is MarkPromptCommandErrorResponse {
  if (!isRecord(value)
      || (value.schemaVersion !== 'xgc.mark-prompt-command-error/v1'
        && value.schemaVersion !== 'xgc.mark-prompt-targets-error/v1')
      || value.status !== 'error'
      || value.fallback !== 'copy'
      || !isRecord(value.error)) {
    return false;
  }
  return isErrorCode(value.error.code) && typeof value.error.message === 'string';
}

function isErrorCode(value: unknown): value is MarkPromptCommandErrorCode {
  return [
    'bridge-unavailable',
    'invalid-request',
    'invalid-response',
    'network-error',
    'primary-agent-ambiguous',
    'prompt-rejected',
    'target-blocked',
    'target-not-visible',
    'target-unavailable',
  ].includes(String(value));
}

function compactMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/\s+/g, ' ').trim().slice(0, 240) || fallback;
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
