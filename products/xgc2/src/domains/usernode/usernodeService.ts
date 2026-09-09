import { request, withTerminalAuth, type ApiTargetOptions } from '../../api/http';
import { configurationCollection,configurationMutationInit } from '../../shared/configurationTransport';
import { queryString,segment } from '../../shared/url';
import {
  USERNODE_DOMAIN,
  type ArchiveUsernodeAssetInput,
  type ArchiveUsernodeNamespaceInput,
  type CommitUsernodeAssetInput,
  type CreateUsernodeAssetInput,
  type CreateUsernodeNamespaceInput,
  type UpdateUsernodeNamespaceInput,
  type UsernodeAssetDocument,
  type UsernodeNamespace,
} from './usernodeContractsPublic';
import { decodeUsernodeAssetDocument } from './usernodeDocumentDecoder';

export function getUsernodeAsset(resourceId: string, signal?: AbortSignal): Promise<UsernodeAssetDocument> {
  return request<unknown>(`/usernode-assets/${segment(resourceId)}${queryString({ branch: 'main' })}`, { signal })
    .then(decodeUsernodeAssetDocument);
}

export function createUsernodeAsset(input: CreateUsernodeAssetInput): Promise<UsernodeAssetDocument> {
  return request<unknown>('/usernode-assets', { method: 'POST',...configurationMutationInit(input) })
    .then(decodeUsernodeAssetDocument);
}

export function commitUsernodeAsset(
  resourceId: string,
  branch: string,
  input: CommitUsernodeAssetInput,
): Promise<UsernodeAssetDocument> {
  return request<unknown>(
    `/usernode-assets/${segment(resourceId)}/branches/${segment(branch)}/commits`,
    { method: 'POST',...configurationMutationInit(input) },
  ).then(decodeUsernodeAssetDocument);
}

export function archiveUsernodeAsset(resourceId: string, input: ArchiveUsernodeAssetInput): Promise<void> {
  return request<void>(`/usernode-assets/${segment(resourceId)}`, { method: 'DELETE',...configurationMutationInit(input) });
}

export function listUsernodeNamespaces(
  signal?: AbortSignal,
  options?: ApiTargetOptions,
): Promise<UsernodeNamespace[]> {
  return configurationCollection(
    request<unknown>(`/configuration/domains/${USERNODE_DOMAIN}/namespaces`, { signal }, options),
    `/configuration/domains/${USERNODE_DOMAIN}/namespaces`,
  );
}

export function createUsernodeNamespace(input: CreateUsernodeNamespaceInput): Promise<UsernodeNamespace> {
  return request<UsernodeNamespace>(
    `/configuration/domains/${USERNODE_DOMAIN}/namespaces`,
    { method: 'POST',...configurationMutationInit(input) },
  );
}

export function updateUsernodeNamespace(namespaceId: string, input: UpdateUsernodeNamespaceInput): Promise<UsernodeNamespace> {
  return request<UsernodeNamespace>(
    `/configuration/domains/${USERNODE_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'PATCH',...configurationMutationInit(input) },
  );
}

export function archiveUsernodeNamespace(namespaceId: string, input: ArchiveUsernodeNamespaceInput): Promise<void> {
  return request<void>(
    `/configuration/domains/${USERNODE_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'DELETE',...configurationMutationInit(input) },
  );
}

export function isUsernodeAssetCASConflict(error: unknown) {
  return error instanceof Error && /\b409\b.*(?:revision|head|commit|conflict)/i.test(error.message);
}

export function readUsernodeCommandFile(path: string): Promise<string> {
  return request<{ content: string }>(
    `/host/files/content${queryString({ path })}`,
    undefined,
    withTerminalAuth(),
  ).then((result) => result.content ?? '');
}

export function writeUsernodeCommandFile(path: string, content: string): Promise<void> {
  return request<{ path: string }>(
    '/host/files/content',
    { method: 'PUT', body: JSON.stringify({ path, content }) },
    withTerminalAuth(),
  ).then(() => undefined);
}
