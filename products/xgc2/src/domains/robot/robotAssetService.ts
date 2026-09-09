import { request, type ApiTargetOptions } from '../../api/http';
import { configurationCollection, configurationMutationInit } from '../../shared/configurationTransport';
import { queryString, segment } from '../../shared/url';
import { builtInRobotAssetKindComposition } from './builtInRobotAssetKindContributions';
import {
  ROBOT_DOMAIN,
  type ArchiveRobotAssetInput,
  type ArchiveRobotNamespaceInput,
  type CommitRobotAssetInput,
  type CreateRobotAssetInput,
  type CreateRobotNamespaceInput,
  type RobotAssetDocument,
  type RobotNamespace,
  type UpdateRobotNamespaceInput,
} from './robotAssetContracts';
import { decodeRobotAssetDocument } from './robotAssetDecoder';
import type { RobotAssetKindComposition } from './robotAssetKindComposition';

export function listRobotAssets(
  signal?: AbortSignal,
  options?: ApiTargetOptions,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Promise<RobotAssetDocument[]> {
  return configurationCollection<unknown>(
    request<unknown>('/robot-assets', { signal }, options),
    '/robot-assets',
  ).then((documents) => documents.map((document) => decodeRobotAssetDocument(document, composition)));
}

export function getRobotAsset(
  resourceId: string,
  signal?: AbortSignal,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Promise<RobotAssetDocument> {
  return request<unknown>(
    `/robot-assets/${segment(resourceId)}${queryString({ branch: 'main' })}`,
    { signal },
  ).then((document) => decodeRobotAssetDocument(document, composition));
}

export type RobotAssetReachability = {
  address: string;
  reachable: boolean;
  latencyMs: number;
  detail: string;
  checkedAt: string;
};

/**
 * Manually diagnose the current Asset's stored management address through Core.
 * This result is not Robot runtime liveness and is not Session admission/readiness.
 */
export function checkRobotAssetReachability(resourceId: string, options?: ApiTargetOptions): Promise<RobotAssetReachability> {
  return request<unknown>(
    `/robot-assets/${segment(resourceId)}/reachability`,
    { method: 'POST' },
    options,
  ).then(decodeRobotAssetReachability);
}

export function createRobotAsset(
  input: CreateRobotAssetInput,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Promise<RobotAssetDocument> {
  return request<unknown>(
    '/robot-assets',
    { method: 'POST', ...configurationMutationInit(input) },
  ).then((document) => decodeRobotAssetDocument(document, composition));
}

export function commitRobotAsset(
  resourceId: string,
  branch: string,
  input: CommitRobotAssetInput,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
): Promise<RobotAssetDocument> {
  return request<unknown>(
    `/robot-assets/${segment(resourceId)}/branches/${segment(branch)}/commits`,
    { method: 'POST', ...configurationMutationInit(input) },
  ).then((document) => decodeRobotAssetDocument(document, composition));
}

export function archiveRobotAsset(resourceId: string, input: ArchiveRobotAssetInput): Promise<void> {
  return request<void>(
    `/robot-assets/${segment(resourceId)}`,
    { method: 'DELETE', ...configurationMutationInit(input) },
  );
}

export function listRobotNamespaces(signal?: AbortSignal): Promise<RobotNamespace[]> {
  return configurationCollection<RobotNamespace>(
    request<unknown>(`/configuration/domains/${ROBOT_DOMAIN}/namespaces`, { signal }),
    `/configuration/domains/${ROBOT_DOMAIN}/namespaces`,
  );
}

export function createRobotNamespace(input: CreateRobotNamespaceInput): Promise<RobotNamespace> {
  return request<RobotNamespace>(
    `/configuration/domains/${ROBOT_DOMAIN}/namespaces`,
    { method: 'POST', ...configurationMutationInit(input) },
  );
}

export function updateRobotNamespace(
  namespaceId: string,
  input: UpdateRobotNamespaceInput,
): Promise<RobotNamespace> {
  return request<RobotNamespace>(
    `/configuration/domains/${ROBOT_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'PATCH', ...configurationMutationInit(input) },
  );
}

export function archiveRobotNamespace(
  namespaceId: string,
  input: ArchiveRobotNamespaceInput,
): Promise<void> {
  return request<void>(
    `/configuration/domains/${ROBOT_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'DELETE', ...configurationMutationInit(input) },
  );
}

export function isRobotAssetCASConflict(error: unknown) {
  return error instanceof Error && /\b409\b.*(?:revision|head|commit|conflict)/i.test(error.message);
}

function decodeRobotAssetReachability(value: unknown): RobotAssetReachability {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Robot management reachability diagnostic response');
  }
  const item = value as Record<string,unknown>;
  if (typeof item.address !== 'string' || typeof item.reachable !== 'boolean'
    || typeof item.latencyMs !== 'number' || typeof item.detail !== 'string'
    || typeof item.checkedAt !== 'string' || !Number.isFinite(item.latencyMs)) {
    throw new Error('Invalid Robot management reachability diagnostic response');
  }
  return {
    address: item.address,
    reachable: item.reachable,
    latencyMs: Math.max(0, item.latencyMs),
    detail: item.detail,
    checkedAt: item.checkedAt,
  };
}
