import { execFile } from 'node:child_process';
import type { IncomingMessage,ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const MARK_PROMPT_COMMAND_PATH = '/__xgc/devtools/mark-prompt/command';
export const MARK_PROMPT_TARGETS_PATH = '/__xgc/devtools/mark-prompt/targets';
export const MARK_PROMPT_DEFAULT_PANE_LABEL = 'xgc2_lead';

const maximumRequestBytes = 128 * 1024;
const closedTargetPattern = /^[A-Za-z0-9_.:-]{1,64}$/;
const primaryAgentAmbiguousMessage = `More than one candidate claims the ${MARK_PROMPT_DEFAULT_PANE_LABEL} lead identity in the focused Herdr workspace; no prompt was sent.`;
const primaryAgentUnavailableMessage = `The ${MARK_PROMPT_DEFAULT_PANE_LABEL} lead could not be uniquely verified in the focused Herdr workspace; no prompt was sent.`;

type BridgeErrorCode =
  | 'bridge-unavailable'
  | 'invalid-request'
  | 'primary-agent-ambiguous'
  | 'prompt-rejected'
  | 'target-blocked'
  | 'target-not-visible'
  | 'target-unavailable';

type HerdrRunner = (args: string[]) => Promise<unknown>;

type ListedAgentStatus = 'idle' | 'working' | 'done' | 'blocked';
type DeliverableAgentStatus = Exclude<ListedAgentStatus, 'blocked'>;

type VisibleWorkspace = {
  workspaceId: string;
  tabId: string;
};

export type MarkPromptListedTarget = {
  paneId: string;
  paneLabel: string;
  kind: string;
  agentStatus: ListedAgentStatus;
  primary: boolean;
};

type OccupiedPane = MarkPromptListedTarget & {
  workspaceId: string;
  tabId: string;
};

type DeliveryTarget = OccupiedPane & {
  agentStatus: DeliverableAgentStatus;
  deliveryTarget: string;
};

export type MarkPromptTargetsPayload = {
  schemaVersion: 'xgc.mark-prompt-targets/v1';
  workspaceId: string;
  tabId: string;
  targets: MarkPromptListedTarget[];
};

export type MarkPromptTargetsUnavailablePayload = {
  schemaVersion: 'xgc.mark-prompt-targets-unavailable/v1';
  status: 'unavailable';
  targets: [];
  error: { code: 'bridge-unavailable'; message: string };
  fallback: 'copy';
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

export function markPromptHerdrBridgePlugin(runner: HerdrRunner = runHerdr): Plugin {
  return {
    name: 'xgc-mark-prompt-herdr-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request,response,next) => {
        const path = requestPath(request);
        if (path !== MARK_PROMPT_COMMAND_PATH && path !== MARK_PROMPT_TARGETS_PATH) {
          next();
          return;
        }
        try {
          if (path === MARK_PROMPT_TARGETS_PATH) {
            validateMarkPromptTargetsRequest(request);
            const payload = await listMarkPromptTargets(runner);
            writeJson(response, 200, payload);
            return;
          }
          validateMarkPromptBrowserRequest(request);
          const body = await readRequestJson(request);
          const receipt = await deliverMarkPromptCommand(body, runner);
          writeJson(response, 202, receipt);
        } catch (error) {
          // Reading availability succeeds when the optional local application is
          // offline. Keep request, protocol and delivery failures as HTTP errors.
          if (path === MARK_PROMPT_TARGETS_PATH && isHerdrOffline(error)) {
            const payload: MarkPromptTargetsUnavailablePayload = {
              schemaVersion: 'xgc.mark-prompt-targets-unavailable/v1',
              status: 'unavailable',
              targets: [],
              error: {
                code: 'bridge-unavailable',
                message: 'Herdr is not running or installed. Copy remains available; open Herdr and refresh the pane list to send.',
              },
              fallback: 'copy',
            };
            writeJson(response, 200, payload);
            return;
          }
          const bridgeError = normalizeBridgeError(error);
          writeJson(response, bridgeError.httpStatus, {
            schemaVersion: path === MARK_PROMPT_TARGETS_PATH
              ? 'xgc.mark-prompt-targets-error/v1'
              : 'xgc.mark-prompt-command-error/v1',
            status: 'error',
            error: {
              code: bridgeError.code,
              message: bridgeError.message,
            },
            fallback: 'copy',
          });
        }
      });
    },
  };
}

export async function listMarkPromptTargets(
  runner: HerdrRunner = runHerdr,
): Promise<MarkPromptTargetsPayload> {
  const { workspace,targets } = await listOccupiedPanes(runner);
  return {
    schemaVersion: 'xgc.mark-prompt-targets/v1',
    workspaceId: workspace.workspaceId,
    tabId: workspace.tabId,
    targets: targets.map((target) => ({
      paneId: target.paneId,
      paneLabel: target.paneLabel,
      kind: target.kind,
      agentStatus: target.agentStatus,
      primary: target.primary,
    })),
  };
}

export async function deliverMarkPromptCommand(
  value: unknown,
  runner: HerdrRunner = runHerdr,
): Promise<MarkPromptCommandReceipt> {
  const command = readCommandRequest(value);
  let target: DeliveryTarget;
  try {
    target = await resolveDeliveryTarget(command.target, runner);
  } catch (error) {
    if (error instanceof MarkPromptBridgeError) throw error;
    throw bridgeInvocationError(error, 'target-unavailable', 'The selected Herdr pane could not be resolved.');
  }

  try {
    await runner(['agent','prompt',target.deliveryTarget,command.prompt]);
  } catch (error) {
    const invocation = invocationDetails(error);
    if (invocation.code === 'agent_blocked') {
      throw new MarkPromptBridgeError(
        'target-blocked',
        409,
        'The selected Herdr pane is waiting for operator input; the prompt was not sent.',
      );
    }
    if (invocation.code === 'agent_not_found') {
      throw new MarkPromptBridgeError(
        'target-unavailable',
        409,
        command.target
          ? `The selected Herdr pane ${command.target} is no longer available; no prompt was sent.`
          : primaryAgentUnavailableMessage,
      );
    }
    throw bridgeInvocationError(error, 'prompt-rejected', 'Herdr rejected the prompt before delivery.');
  }

  return {
    schemaVersion: 'xgc.mark-prompt-command-receipt/v1',
    status: 'accepted',
    delivery: target.agentStatus === 'working' ? 'queued' : 'started',
    target: {
      agent: target.paneLabel,
      paneId: target.paneId,
      tabId: target.tabId,
      workspaceId: target.workspaceId,
      primary: target.primary,
      visible: true,
    },
  };
}

export async function resolveCurrentPrimaryAgent(runner: HerdrRunner = runHerdr): Promise<DeliveryTarget> {
  return resolveDeliveryTarget(undefined, runner);
}

async function resolveDeliveryTarget(
  requested: string | undefined,
  runner: HerdrRunner,
): Promise<DeliveryTarget> {
  const { targets } = await listOccupiedPanes(runner);
  const selected = requested ? matchRequestedTarget(targets, requested) : matchDefaultPrimary(targets);
  if (selected.agentStatus === 'blocked') {
    throw new MarkPromptBridgeError(
      'target-blocked',
      409,
      'The selected Herdr pane is waiting for operator input; the prompt was not sent.',
    );
  }
  if (!isDeliverableAgentStatus(selected.agentStatus)) {
    throw new MarkPromptBridgeError(
      'target-unavailable',
      409,
      `The selected Herdr pane state is ${selected.agentStatus || 'unknown'}; the prompt was not sent.`,
    );
  }
  return {
    ...selected,
    agentStatus: selected.agentStatus,
    deliveryTarget: selected.paneId,
  };
}

async function listOccupiedPanes(runner: HerdrRunner): Promise<{
  workspace: VisibleWorkspace;
  targets: OccupiedPane[];
}> {
  const workspace = await resolveFocusedVisibleWorkspace(runner);
  const [panePayload,agentPayload] = await Promise.all([
    runner(['pane','list','--workspace',workspace.workspaceId]),
    runner(['agent','list']),
  ]);
  const visiblePanes = nestedArray(panePayload, 'result', 'panes')
    .filter((pane) => readString(pane, 'tab_id') === workspace.tabId
      && (!readString(pane, 'workspace_id') || readString(pane, 'workspace_id') === workspace.workspaceId));
  const agents = nestedArray(agentPayload, 'result', 'agents').filter((agent) => (
    readString(agent, 'workspace_id') === workspace.workspaceId
    && readString(agent, 'tab_id') === workspace.tabId
  ));
  const byPaneId = new Map<string, OccupiedPane>();

  for (const pane of visiblePanes) {
    const paneId = readString(pane, 'pane_id');
    if (!paneId) continue;
    const occupant = uniqueOccupant(agents, paneId);
    const kind = readString(pane, 'agent') || (occupant ? readString(occupant, 'agent') : '');
    if (!kind) continue;
    const agentStatus = listedAgentStatus(occupant ?? pane);
    if (!agentStatus) continue;
    byPaneId.set(paneId, occupiedPaneFrom(
      paneId,
      paneLabelOf(pane, occupant, paneId),
      kind,
      agentStatus,
      workspace,
    ));
  }

  for (const agent of agents) {
    const paneId = readString(agent, 'pane_id');
    const kind = readString(agent, 'agent');
    const agentStatus = listedAgentStatus(agent);
    if (!paneId || !kind || !agentStatus || byPaneId.has(paneId)) continue;
    const pane = visiblePanes.find((item) => readString(item, 'pane_id') === paneId);
    byPaneId.set(paneId, occupiedPaneFrom(
      paneId,
      paneLabelOf(pane, agent, paneId),
      kind,
      agentStatus,
      workspace,
    ));
  }

  const targets = [...byPaneId.values()].sort(compareOccupiedPanes);
  return { workspace,targets };
}

async function resolveFocusedVisibleWorkspace(runner: HerdrRunner): Promise<VisibleWorkspace> {
  const workspacePayload = await runner(['workspace','list']);
  const workspaces = nestedArray(workspacePayload, 'result', 'workspaces');
  const focusedWorkspaces = workspaces.filter((workspace) => readBoolean(workspace, 'focused'));
  if (focusedWorkspaces.length !== 1) {
    throw new MarkPromptBridgeError(
      focusedWorkspaces.length > 1 ? 'primary-agent-ambiguous' : 'target-not-visible',
      409,
      focusedWorkspaces.length > 1
        ? 'More than one Herdr workspace is focused; no prompt was sent.'
        : 'No focused Herdr workspace is visible; no prompt was sent.',
    );
  }

  const workspace = focusedWorkspaces[0];
  const workspaceId = requiredString(workspace, 'workspace_id');
  const tabId = requiredString(workspace, 'active_tab_id');
  const tabPayload = await runner(['tab','list','--workspace',workspaceId]);
  const tabs = nestedArray(tabPayload, 'result', 'tabs');
  const activeTab = tabs.find((tab) => readString(tab, 'tab_id') === tabId);
  if (!activeTab || !readBoolean(activeTab, 'focused')) {
    throw new MarkPromptBridgeError(
      'target-not-visible',
      409,
      'The active Herdr tab is not visible; no prompt was sent.',
    );
  }
  return { workspaceId,tabId };
}

function matchRequestedTarget(targets: OccupiedPane[], requested: string): OccupiedPane {
  const matches = targets.filter((target) => target.paneId === requested || target.paneLabel === requested);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new MarkPromptBridgeError(
      'primary-agent-ambiguous',
      409,
      `More than one Herdr pane matches ${requested}; no prompt was sent.`,
    );
  }
  throw new MarkPromptBridgeError(
    'target-unavailable',
    409,
    `The selected Herdr pane ${requested} is not in the focused workspace; no prompt was sent.`,
  );
}

function matchDefaultPrimary(targets: OccupiedPane[]): OccupiedPane {
  const matches = targets.filter((target) => target.primary);
  if (matches.length === 1) return matches[0];
  throw new MarkPromptBridgeError(
    matches.length > 1 ? 'primary-agent-ambiguous' : 'target-unavailable',
    409,
    matches.length > 1 ? primaryAgentAmbiguousMessage : primaryAgentUnavailableMessage,
  );
}

function occupiedPaneFrom(
  paneId: string,
  paneLabel: string,
  kind: string,
  agentStatus: ListedAgentStatus,
  workspace: VisibleWorkspace,
): OccupiedPane {
  return {
    paneId,
    paneLabel,
    kind,
    agentStatus,
    primary: paneLabel === MARK_PROMPT_DEFAULT_PANE_LABEL,
    workspaceId: workspace.workspaceId,
    tabId: workspace.tabId,
  };
}

function paneLabelOf(
  pane: Record<string, unknown> | undefined,
  occupant: Record<string, unknown> | undefined,
  paneId: string,
): string {
  return (pane ? readString(pane, 'label') : '')
    || (occupant ? readAgentName(occupant) : '')
    || paneId;
}

function uniqueOccupant(agents: Record<string, unknown>[], paneId: string): Record<string, unknown> | undefined {
  const occupants = agents.filter((agent) => readString(agent, 'pane_id') === paneId);
  return occupants.length === 1 ? occupants[0] : undefined;
}

function compareOccupiedPanes(left: OccupiedPane, right: OccupiedPane): number {
  if (left.primary !== right.primary) return left.primary ? -1 : 1;
  const byLabel = left.paneLabel.localeCompare(right.paneLabel);
  return byLabel !== 0 ? byLabel : left.paneId.localeCompare(right.paneId);
}

class MarkPromptBridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly httpStatus: number;

  constructor(code: BridgeErrorCode, httpStatus: number, message: string) {
    super(message);
    this.name = 'MarkPromptBridgeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

class HerdrInvocationError extends Error {
  readonly commandCode?: string;

  constructor(message: string, commandCode?: string) {
    super(message);
    this.name = 'HerdrInvocationError';
    this.commandCode = commandCode;
  }
}

function runHerdr(args: string[]): Promise<unknown> {
  return new Promise((resolve,reject) => {
    execFile('herdr', args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 8_000,
      windowsHide: true,
    }, (error,stdout,stderr) => {
      if (error) {
        const details = parseJson(stderr) ?? parseJson(stdout);
        reject(new HerdrInvocationError(
          invocationMessage(details, error.message),
          invocationCode(details) ?? (typeof error.code === 'string' ? error.code : undefined),
        ));
        return;
      }
      const parsed = parseJson(stdout);
      if (parsed === undefined) {
        reject(new HerdrInvocationError('Herdr returned a non-JSON response.'));
        return;
      }
      resolve(parsed);
    });
  });
}

export function validateMarkPromptBrowserRequest(request: IncomingMessage) {
  validateMarkPromptLoopbackRequest(request, 'POST');
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new MarkPromptBridgeError('invalid-request', 415, 'Mark Prompt delivery requires JSON.');
  }
}

export function validateMarkPromptTargetsRequest(request: IncomingMessage) {
  validateMarkPromptLoopbackRequest(request, 'GET');
}

function validateMarkPromptLoopbackRequest(request: IncomingMessage, method: 'GET' | 'POST') {
  if (request.method !== method) {
    throw new MarkPromptBridgeError(
      'invalid-request',
      405,
      method === 'GET' ? 'Mark Prompt targets require GET.' : 'Mark Prompt delivery requires POST.',
    );
  }
  if (request.headers['x-xgc-mark-prompt'] !== 'v1') {
    throw new MarkPromptBridgeError('invalid-request', 403, 'The Mark Prompt bridge header is missing.');
  }
  const host = String(request.headers.host ?? '');
  const origin = String(request.headers.origin ?? '').trim();
  let hostUrl: URL;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    throw new MarkPromptBridgeError('invalid-request', 403, 'The Mark Prompt request origin is invalid.');
  }
  const loopbackHosts = new Set(['127.0.0.1','localhost','[::1]']);
  if (!loopbackHosts.has(hostUrl.hostname)
      || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin')) {
    throw new MarkPromptBridgeError('invalid-request', 403, 'The Mark Prompt bridge accepts same-origin loopback requests only.');
  }
  // Same-origin GET with referrerPolicy=no-referrer omits Origin. Cross-origin
  // fetch still sends Origin, so an explicit Origin must match the loopback host.
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new MarkPromptBridgeError('invalid-request', 403, 'The Mark Prompt request origin is invalid.');
    }
    if (originUrl.host !== hostUrl.host || !['http:','https:'].includes(originUrl.protocol)) {
      throw new MarkPromptBridgeError('invalid-request', 403, 'The Mark Prompt bridge accepts same-origin loopback requests only.');
    }
  }
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maximumRequestBytes) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }
  if (tooLarge) {
    throw new MarkPromptBridgeError('invalid-request', 413, 'The generated prompt is too large to deliver.');
  }
  const parsed = parseJson(Buffer.concat(chunks).toString('utf8'));
  if (parsed === undefined) {
    throw new MarkPromptBridgeError('invalid-request', 400, 'The Mark Prompt request body is not valid JSON.');
  }
  return parsed;
}

function readCommandRequest(value: unknown): { prompt: string;target?: string } {
  if (!isRecord(value)) {
    throw new MarkPromptBridgeError('invalid-request', 400, 'The Mark Prompt request must be an object.');
  }
  const keys = Object.keys(value).sort().join(',');
  if ((keys !== 'prompt,schemaVersion' && keys !== 'prompt,schemaVersion,target')
      || value.schemaVersion !== 'xgc.mark-prompt-command/v1'
      || typeof value.prompt !== 'string') {
    throw new MarkPromptBridgeError('invalid-request', 400, 'The Mark Prompt request contract is invalid.');
  }
  if (!value.prompt.trim()) {
    throw new MarkPromptBridgeError('invalid-request', 400, 'The generated prompt is empty.');
  }
  if (Buffer.byteLength(value.prompt, 'utf8') > maximumRequestBytes) {
    throw new MarkPromptBridgeError('invalid-request', 413, 'The generated prompt is too large to deliver.');
  }
  if (!Object.hasOwn(value, 'target')) {
    return { prompt: value.prompt };
  }
  if (typeof value.target !== 'string' || !closedTargetPattern.test(value.target)) {
    throw new MarkPromptBridgeError('invalid-request', 400, 'The Mark Prompt target is invalid.');
  }
  return { prompt: value.prompt,target: value.target };
}

function requestPath(request: IncomingMessage): string {
  return String(request.url ?? '').split('?', 1)[0];
}

function writeJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

function normalizeBridgeError(error: unknown): MarkPromptBridgeError {
  if (error instanceof MarkPromptBridgeError) return error;
  return bridgeInvocationError(error, 'bridge-unavailable', 'The local Herdr bridge is unavailable.');
}

function isHerdrOffline(error: unknown): boolean {
  const { code } = invocationDetails(error);
  return code === 'server_not_running' || code === 'ENOENT';
}

function bridgeInvocationError(error: unknown, code: BridgeErrorCode, fallback: string): MarkPromptBridgeError {
  const details = invocationDetails(error);
  const unavailable = details.code === 'ENOENT' || /not found|ENOENT/i.test(details.message);
  return new MarkPromptBridgeError(
    unavailable ? 'bridge-unavailable' : code,
    503,
    compactMessage(details.message, fallback),
  );
}

function invocationDetails(error: unknown): { code?: string;message: string } {
  if (error instanceof HerdrInvocationError) {
    return { code: error.commandCode,message: error.message };
  }
  if (isRecord(error)) {
    return {
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : 'Herdr command failed.',
    };
  }
  return { message: error instanceof Error ? error.message : 'Herdr command failed.' };
}

function invocationCode(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) return undefined;
  return readString(value.error, 'code') || undefined;
}

function invocationMessage(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value.error)) return fallback;
  return readString(value.error, 'message') || fallback;
}

function parseJson(value: string): unknown | undefined {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function nestedArray(value: unknown, outer: string, inner: string): Record<string,unknown>[] {
  return requiredArray(requiredRecord(value, outer), inner);
}

function requiredRecord(value: unknown, key: string): Record<string,unknown> {
  if (!isRecord(value) || !isRecord(value[key])) {
    throw new Error(`Herdr response is missing ${key}.`);
  }
  return value[key];
}

function requiredArray(value: Record<string,unknown>, key: string): Record<string,unknown>[] {
  const items = value[key];
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new Error(`Herdr response is missing ${key}.`);
  }
  return items;
}

function requiredString(value: Record<string,unknown>, key: string): string {
  const selected = readString(value, key);
  if (!selected) throw new Error(`Herdr response is missing ${key}.`);
  return selected;
}

function readString(value: Record<string,unknown>, key: string): string {
  return typeof value[key] === 'string' ? value[key].trim() : '';
}

function readAgentName(value: Record<string,unknown>): string {
  return readString(value, 'name') || readString(value, 'agent_name');
}

function readBoolean(value: Record<string,unknown>, key: string): boolean {
  return value[key] === true;
}

function listedAgentStatus(value: Record<string,unknown>): ListedAgentStatus | undefined {
  const agentStatus = readString(value, 'agent_status');
  return isListedAgentStatus(agentStatus) ? agentStatus : undefined;
}

function isListedAgentStatus(value: string): value is ListedAgentStatus {
  return value === 'idle' || value === 'working' || value === 'done' || value === 'blocked';
}

function isDeliverableAgentStatus(value: string): value is DeliverableAgentStatus {
  return value === 'idle' || value === 'working' || value === 'done';
}

function compactMessage(message: string, fallback: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 240) || fallback;
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
