import { request } from '../../api/http';
import type { AutomationExecutionIngressStatus } from '../../shared/executionStatusVocabulary';
import { queryString,segment } from '../../shared/url';
import { executionTargetPath,executionTargetResourceId } from '../execution/executionPublic';
import type { AutomationRun } from './automationRunContracts';
import {
  parseAutomationExecutionHistoryPage,
  parseAutomationIngressTransitionPage,
} from './automationExecutionHistoryModel';
import type {
  AutomationExecutionHistoryPage,
  AutomationExecutionIngressAudit,
  AutomationIngressTransitionPage,
} from './automationHistoryTypes';
import {
  exactOptionalAutomationValue,
  exactRequiredAutomationValue,
  type AutomationRequestOptions,
} from './automationRequest';
import { parseAutomationIngressAuditEnvelope } from './automationTriggerModel';

export type ListAutomationExecutionHistoryOptions = AutomationRequestOptions & {
  automationResourceId: string;
  entrypointNodeId?: string;
  ingressStatuses?: readonly AutomationExecutionIngressStatus[];
  runStatuses?: readonly AutomationRun['status'][];
  limit?: number;
  cursor?: string;
};

export type ListAutomationIngressTransitionsOptions = AutomationRequestOptions & {
  automationResourceId: string;
  eventId: string;
  afterRevision?: number;
  limit?: number;
};

export async function retryAutomationExecutionIngress(
  targetId: string,
  eventId: string,
  expectedRevision: number,
): Promise<AutomationExecutionIngressAudit> {
  const canonicalEventId = exactRequiredAutomationValue(eventId, 'Automation ingress event ID');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('Automation ingress retry requires a positive expected revision.');
  }
  const path = `${executionTargetPath(targetId)}/automation-trigger-events/${segment(canonicalEventId)}/retry`;
  const ingress = parseAutomationIngressAuditEnvelope(
    await request<unknown>(path, { method: 'POST',body: JSON.stringify({ expectedRevision }) }),
    path,
  );
  if (ingress.eventId !== canonicalEventId) {
    throw new Error(`Invalid Automation ingress retry response from ${path}: event identity changed.`);
  }
  return ingress;
}

export async function listAutomationExecutionHistory(
  targetId: string,
  options: ListAutomationExecutionHistoryOptions,
): Promise<AutomationExecutionHistoryPage> {
  const automationResourceId = exactRequiredAutomationValue(options.automationResourceId, 'Automation execution history resource');
  const entrypointNodeId = exactOptionalAutomationValue(options.entrypointNodeId, 'Automation execution history entrypoint');
  const cursor = exactOptionalAutomationValue(options.cursor, 'Automation execution history cursor');
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Automation execution history page limit must be between 1 and 1000.');
  }
  const path = `${executionTargetPath(targetId)}/automation-execution-history${queryString({
    automationResourceId,
    entrypointNodeId,
    ingressStatus: options.ingressStatuses?.length ? options.ingressStatuses.join(',') : undefined,
    runStatus: options.runStatuses?.length ? options.runStatuses.join(',') : undefined,
    limit,
    cursor,
  })}`;
  const response = await request<unknown>(path, { signal: options.signal });
  return parseAutomationExecutionHistoryPage(response, path, {
    targetId: executionTargetResourceId(targetId),automationResourceId,
  });
}

export async function listAutomationIngressTransitions(
  targetId: string,
  runId: string,
  options: ListAutomationIngressTransitionsOptions,
): Promise<AutomationIngressTransitionPage> {
  const canonicalRunId = exactRequiredAutomationValue(runId, 'Automation ingress transition Run');
  const automationResourceId = exactRequiredAutomationValue(options.automationResourceId, 'Automation ingress transition resource');
  const eventId = exactRequiredAutomationValue(options.eventId, 'Automation ingress transition event');
  const afterRevision = options.afterRevision ?? 0;
  if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) {
    throw new Error('Automation ingress transition revision must be a non-negative integer.');
  }
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Automation ingress transition page limit must be between 1 and 1000.');
  }
  const path = `${executionTargetPath(targetId)}/automation-execution-history/${segment(canonicalRunId)}/ingress-transitions${queryString({
    automationResourceId,
    afterRevision: afterRevision > 0 ? afterRevision : undefined,
    limit,
  })}`;
  const response = await request<unknown>(path, { signal: options.signal });
  return parseAutomationIngressTransitionPage(response, path, { eventId,afterRevision });
}
