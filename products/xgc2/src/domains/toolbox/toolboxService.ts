import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { queryString } from '../../shared/url';
import { executionTargetResourceId } from '../execution/executionPublic';
import type {
  CleanupActionRequest,
  MaintenanceDefinition,
  RemoteCleanupActionResponse,
  RemoteCleanupApplyResponse,
  RemoteCleanupScanResponse,
  TypedJobResponse,
} from './toolboxModel';
import {
  parseRemoteCleanupOperation,
  parseRemoteCleanupScan,
} from './toolboxModel';

/** Disk walks on Agent can exceed the default 8s browser budget. */
const CLEANUP_ACTION_TIMEOUT_MS = 60_000;

export function listMaintenanceDefinitions(options?: ApiTargetOptions): Promise<MaintenanceDefinition[]> {
  const path = `/toolbox/maintenance${queryString({
    managedHostId: options?.managedHostId,
  })}`;
  return request<MaintenanceDefinition[]>(path, undefined, withTerminalAuth(options));
}

/** Local durable cleanup job submit. Never used for remote managed hosts. */
export function submitCleanupAction(body: CleanupActionRequest, options?: ApiTargetOptions): Promise<TypedJobResponse> {
  if (options?.managedHostId) {
    return Promise.reject(new Error('Remote cleanup must use submitRemoteCleanupAction with explicit managedHostId.'));
  }
  const payload = { ...body,targetId: executionTargetResourceId(body.targetId) };
  return request<TypedJobResponse>('/toolbox/maintenance/cleanup/actions', {
    method: 'POST',
    headers: {
      'X-Request-ID': body.requestId,
      'Idempotency-Key': body.idempotencyKey,
    },
    body: JSON.stringify(payload),
  }, withTerminalAuth({ ...options,timeoutMs: options?.timeoutMs ?? CLEANUP_ACTION_TIMEOUT_MS }));
}

/**
 * Remote Agent direct cleanup: one HTTP request per scan/apply click.
 * Backend returns target-discriminated {mode:"remote",action,scan|operation}.
 */
export function submitRemoteCleanupAction(
  body: {
    action: 'scan' | 'apply';
    ids?: string[];
    scanDigest?: string;
    requestId: string;
    idempotencyKey: string;
    reason: string;
  },
  options: ApiTargetOptions & { managedHostId: string },
): Promise<RemoteCleanupActionResponse> {
  const managedHostId = options.managedHostId.trim();
  if (!managedHostId) {
    return Promise.reject(new Error('Remote cleanup requires managedHostId.'));
  }
  const path = `/toolbox/maintenance/cleanup/actions${queryString({ managedHostId })}`;
  // Core requires body.targetId === managedHostId for the remote path identity check.
  const payload = {
    action: body.action,
    targetId: managedHostId,
    ...(body.action === 'apply' ? { ids: body.ids,scanDigest: body.scanDigest } : {}),
    requestId: body.requestId,
    idempotencyKey: body.idempotencyKey,
    reason: body.reason,
  };
  return request<unknown>(path, {
    method: 'POST',
    headers: {
      'X-Request-ID': body.requestId,
      'Idempotency-Key': body.idempotencyKey,
    },
    body: JSON.stringify(payload),
  }, withTerminalAuth({
    ...options,
    managedHostId,
    timeoutMs: options.timeoutMs ?? CLEANUP_ACTION_TIMEOUT_MS,
  })).then((raw) => parseRemoteCleanupActionResponse(raw, body.action));
}

function parseRemoteCleanupActionResponse(
  raw: unknown,
  expectedAction: 'scan' | 'apply',
): RemoteCleanupActionResponse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Remote cleanup response is missing.');
  }
  const item = raw as Record<string, unknown>;
  if (item.mode !== 'remote') {
    throw new Error('Remote cleanup response must set mode "remote".');
  }
  const action = item.action === 'scan' || item.action === 'apply' ? item.action : expectedAction;
  if (action === 'scan') {
    const scan = parseRemoteCleanupScan(item.scan);
    if (!scan) throw new Error('Remote cleanup scan payload is invalid.');
    const response: RemoteCleanupScanResponse = { mode: 'remote', action: 'scan', scan };
    return response;
  }
  const operation = parseRemoteCleanupOperation(item.operation);
  if (!operation) throw new Error('Remote cleanup apply payload is invalid.');
  if (operation.status === 'failed' || operation.status === 'error') {
    throw new Error(operation.message || `Cleanup operation ${operation.status}`);
  }
  const response: RemoteCleanupApplyResponse = { mode: 'remote', action: 'apply', operation };
  return response;
}
