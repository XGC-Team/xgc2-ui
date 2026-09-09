import { HTTPError,request } from '../../api/http';
import type { ConfigResourceHead } from '../../shared/configResource';
import { configurationCollection,configurationMutationInit } from '../../shared/configurationTransport';
import { queryString,segment } from '../../shared/url';
import {
  AUTOMATION_DOMAIN,
  type ArchiveAutomationNamespaceInput,
  type AutomationDocument,
  type AutomationNamespace,
  type AutomationResourceStateInput,
  type CommitAutomationInput,
  type CreateAutomationInput,
  type CreateAutomationNamespaceInput,
  type UpdateAutomationNamespaceInput,
} from './automationDefinitionContracts';
import type { AutomationRequestOptions } from './automationRequest';
import { normalizeAutomationDocument } from './automationSpecModel';

export type DuplicateAutomationDocumentInput = {
  sourceCommitId: string;
  targetNamespaceId?: string;
  name: string;
  expectedRevision: number;
  reason: string;
  requestId?: string;
  idempotencyKey?: string;
};

export function listAutomationDocuments(options: {
  namespaceId?: string;
  includeArchived?: boolean;
  signal?: AbortSignal;
} = {}): Promise<AutomationDocument[]> {
  const path = `/automations${queryString({
    namespaceId: options.namespaceId,
    includeArchived: options.includeArchived || undefined,
  })}`;
  return configurationCollection<AutomationDocument>(request<unknown>(path, { signal: options.signal }), path)
    .then((documents) => documents.map(normalizeAutomationDocument));
}

export function getAutomationDocument(resourceId: string, options: AutomationRequestOptions = {}): Promise<AutomationDocument> {
  return request<AutomationDocument>(`/automations/${segment(resourceId)}${queryString({ branch: 'main' })}`, { signal: options.signal })
    .then(normalizeAutomationDocument);
}

export function isAutomationDocumentNotFound(error: unknown): boolean {
  return error instanceof HTTPError && error.status === 404;
}

export function createAutomationDocument(input: CreateAutomationInput): Promise<AutomationDocument> {
  return request<AutomationDocument>('/automations', { method: 'POST',...configurationMutationInit(input) })
    .then(normalizeAutomationDocument);
}

export async function duplicateAutomationDocument(resourceId: string, input: DuplicateAutomationDocumentInput): Promise<AutomationDocument> {
  const head = await request<ConfigResourceHead>(
    `/configuration/domains/${AUTOMATION_DOMAIN}/resources/${segment(resourceId)}/clone`,
    { method: 'POST',...configurationMutationInit({ ...input,targetNamespaceId: input.targetNamespaceId ?? '' }) },
  );
  return getAutomationDocument(head.resourceId);
}

export function commitAutomationDocument(resourceId: string, branch: string, input: CommitAutomationInput): Promise<AutomationDocument> {
  return request<AutomationDocument>(
    `/automations/${segment(resourceId)}/branches/${segment(branch)}/commits`,
    { method: 'POST',...configurationMutationInit(input) },
  ).then(normalizeAutomationDocument);
}

export function archiveAutomationDocument(resourceId: string, input: AutomationResourceStateInput): Promise<AutomationDocument> {
  return request<AutomationDocument>(
    `/automations/${segment(resourceId)}`,
    { method: 'DELETE',...configurationMutationInit(input) },
  ).then(normalizeAutomationDocument);
}

export function restoreAutomationDocument(resourceId: string, input: AutomationResourceStateInput): Promise<AutomationDocument> {
  return request<AutomationDocument>(
    `/automations/${segment(resourceId)}/restore`,
    { method: 'POST',...configurationMutationInit(input) },
  ).then(normalizeAutomationDocument);
}

export function listAutomationNamespaces(options: AutomationRequestOptions = {}): Promise<AutomationNamespace[]> {
  const path = `/configuration/domains/${AUTOMATION_DOMAIN}/namespaces`;
  return configurationCollection(request<unknown>(path, { signal: options.signal }), path);
}

export function createAutomationNamespace(input: CreateAutomationNamespaceInput): Promise<AutomationNamespace> {
  return request<AutomationNamespace>(
    `/configuration/domains/${AUTOMATION_DOMAIN}/namespaces`,
    { method: 'POST',...configurationMutationInit(input) },
  );
}

export function updateAutomationNamespace(namespaceId: string, input: UpdateAutomationNamespaceInput): Promise<AutomationNamespace> {
  return request<AutomationNamespace>(
    `/configuration/domains/${AUTOMATION_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'PATCH',...configurationMutationInit(input) },
  );
}

export function archiveAutomationNamespace(namespaceId: string, input: ArchiveAutomationNamespaceInput): Promise<void> {
  return request<void>(
    `/configuration/domains/${AUTOMATION_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'DELETE',...configurationMutationInit(input) },
  );
}

export function isAutomationCASConflict(error: unknown) {
  return error instanceof Error && /\b409\b.*(?:revision|head|commit|conflict)/i.test(error.message);
}
