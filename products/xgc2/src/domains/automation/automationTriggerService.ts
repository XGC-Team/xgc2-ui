import { request } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import { executionTargetPath } from '../execution/executionPublic';
import type {
  AutomationActivation,
  AutomationActivationInput,
  AutomationActivationResponse,
  AutomationRunOnceInput,
  AutomationTestListener,
  AutomationTestListenerResponse,
  AutomationTriggerCredential,
  AutomationTriggerEventReceipt,
  CreateAutomationTestListenerInput,
} from './automationTriggerContracts';
import {
  automationOperationHeaders,
  automationOperationRequestId,
  type AutomationRequestOptions,
} from './automationRequest';
import {
  parseAutomationActivationLookup,
  parseAutomationActivationResponse,
  parseAutomationActivations,
  parseAutomationRunOnceReceipt,
  parseAutomationTestListenerEnvelope,
  parseAutomationTriggerIngressReceipt,
} from './automationTriggerModel';

export async function getAutomationActivation(
  targetId: string,
  resourceId: string,
  entrypointNodeId: string,
  options: AutomationRequestOptions = {},
): Promise<AutomationActivation | undefined> {
  if (!entrypointNodeId || entrypointNodeId.trim() !== entrypointNodeId) {
    throw new Error('entrypointNodeId must be a non-empty canonical node ID.');
  }
  const path = `${executionTargetPath(targetId)}/automation-activations/${segment(resourceId)}${queryString({ entrypointNodeId })}`;
  return parseAutomationActivationLookup(await request<unknown>(path, { signal: options.signal }), path);
}

export async function listAutomationActivations(
  targetId: string,
  options: AutomationRequestOptions = {},
): Promise<AutomationActivation[]> {
  const path = `${executionTargetPath(targetId)}/automation-activations?limit=1000`;
  return parseAutomationActivations(await request<unknown>(path, { signal: options.signal }), path);
}

export function putAutomationActivation(
  targetId: string,
  resourceId: string,
  input: AutomationActivationInput,
): Promise<AutomationActivationResponse> {
  const path = `${executionTargetPath(targetId)}/automation-activations/${segment(resourceId)}`;
  return request<unknown>(path, { method: 'PUT',body: JSON.stringify(input) })
    .then((value) => parseAutomationActivationResponse(value, path));
}

export function createAutomationTestListener(
  targetId: string,
  input: CreateAutomationTestListenerInput,
): Promise<AutomationTestListenerResponse> {
  const path = `${executionTargetPath(targetId)}/automation-test-listeners`;
  return request<unknown>(path, { method: 'POST',body: JSON.stringify(input) }).then((value) => {
    const response = parseAutomationTestListenerEnvelope(value, path);
    if (!response.credential) throw new Error(`Invalid Automation trigger response at ${path}.credential: is required.`);
    return { listener: response.listener,credential: response.credential };
  });
}

export async function getAutomationTestListener(
  targetId: string,
  listenerId: string,
  options: AutomationRequestOptions = {},
): Promise<AutomationTestListener> {
  const path = `${executionTargetPath(targetId)}/automation-test-listeners/${segment(listenerId)}`;
  const response = await request<unknown>(path, { signal: options.signal });
  return parseAutomationTestListenerEnvelope(response, path).listener;
}

export async function cancelAutomationTestListener(
  targetId: string,
  listenerId: string,
  expectedRevision: number,
): Promise<AutomationTestListener> {
  const path = `${executionTargetPath(targetId)}/automation-test-listeners/${segment(listenerId)}`;
  const response = await request<unknown>(path, { method: 'DELETE',body: JSON.stringify({ expectedRevision }) });
  return parseAutomationTestListenerEnvelope(response, path).listener;
}

export async function submitAutomationTestEvent(
  publicId: string,
  credential: AutomationTriggerCredential,
  payload: Record<string,unknown>,
  eventId = automationOperationRequestId('automation.trigger.test', publicId),
): Promise<AutomationTriggerEventReceipt> {
  const mode = 'test' as const;
  const path = `/automation-trigger-ingress/${mode}/${segment(publicId)}`;
  const response = await request<unknown>(path, {
    method: 'POST',
    headers: { 'X-XGC-Trigger-Token': credential.token,'X-XGC-Event-ID': eventId },
    body: JSON.stringify(payload),
  });
  return parseAutomationTriggerIngressReceipt(response, path);
}

export async function enqueueAutomationRunOnce(
  targetId: string,
  input: AutomationRunOnceInput,
): Promise<AutomationTriggerEventReceipt> {
  const sourceEventKey = input.sourceEventKey?.trim()
    || automationOperationRequestId(
      'automation.trigger.run-once',
      `${targetId}:${input.resourceId}:${input.commitId}:${input.entrypointNodeId}`,
    );
  const body = { ...input,sourceEventKey };
  const path = `${executionTargetPath(targetId)}/automation-trigger-events/run-once`;
  const response = await request<unknown>(path, {
    method: 'POST',
    headers: automationOperationHeaders({ requestId: sourceEventKey,idempotencyKey: sourceEventKey }),
    body: JSON.stringify(body),
  });
  return parseAutomationRunOnceReceipt(response, path);
}
