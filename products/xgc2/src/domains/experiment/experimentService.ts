import { request } from '../../api/http';
import { configurationCollection,configurationMutationInit } from '../../shared/configurationTransport';
import { queryString,segment } from '../../shared/url';
import type {
  ExperimentDocument,
  ExperimentNamespace,
  ExperimentSpec,
} from './experimentModel';
import { decodeExperimentDocument } from './experimentDocumentDecoder';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';

const EXPERIMENT_DOMAIN = 'experiment';

export type CreateExperimentInput = {
  namespaceId?: string;
  spec: ExperimentSpec;
  reason: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type CommitExperimentInput = {
  spec: ExperimentSpec;
  baseCommitId: string;
  expectedBranchRevision: number;
  expectedResourceRevision?: number;
  namespaceId?: string;
  reason: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type ExperimentResourceStateInput = {
  expectedRevision: number;
  reason: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type CreateExperimentNamespaceInput = {
  parentNamespaceId?: string;
  name: string;
  reason?: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type UpdateExperimentNamespaceInput = {
  name: string;
  parentNamespaceId?: string;
  expectedRevision: number;
  reason?: string;
  requestId?: string;
  idempotencyKey?: string;
};

export function listExperiments(
  signal?: AbortSignal,
  robotKindComposition?: RobotAssetKindComposition,
): Promise<ExperimentDocument[]> {
  return configurationCollection<unknown>(request<unknown>('/experiments', { signal }), '/experiments')
    .then((documents) => documents.map((document) => (
      decodeExperimentDocument(document, robotKindComposition)
    )));
}

export function getExperiment(
  resourceId: string,
  signal?: AbortSignal,
  robotKindComposition?: RobotAssetKindComposition,
): Promise<ExperimentDocument> {
  return request<unknown>(
    `/experiments/${segment(resourceId)}${queryString({ branch: 'main' })}`,
    { signal },
  ).then((document) => decodeExperimentDocument(document, robotKindComposition));
}

/** Read the immutable Experiment configuration used by an existing Run. */
export function getExperimentAtCommit(
  resourceId: string,
  commitId: string,
  signal?: AbortSignal,
  robotKindComposition?: RobotAssetKindComposition,
): Promise<ExperimentDocument> {
  return request<unknown>(
    `/experiments/${segment(resourceId)}${queryString({ commitId })}`,
    { signal },
  ).then((document) => decodeExperimentDocument(document, robotKindComposition));
}

/**
 * What one recording binding would capture, derived by Core from the
 * Experiment's frozen Robot selection.
 *
 * The expansion of a relative robot topic into a per-namespace absolute graph
 * name is the recorder's rule, so it is asked for rather than reproduced here:
 * a browser-side copy would disagree with the recorder exactly when a robot
 * namespace has just been edited, which is when an operator most needs to
 * trust the preview.
 */
export type ROSBagTopicPreview = {
  bindingId: string;
  experimentResourceId: string;
  experimentCommitId: string;
  robotSelectionDigest: string;
  slotIds: string[];
  topics: string[];
};

export function getExperimentROSBagTopicPreview(
  resourceId: string,
  bindingId: string,
  signal?: AbortSignal,
): Promise<ROSBagTopicPreview> {
  return request<ROSBagTopicPreview>(
    `/experiments/${segment(resourceId)}/rosbag-topic-preview${queryString({ branch: 'main',bindingId })}`,
    { signal },
  );
}

export function createExperiment(
  input: CreateExperimentInput,
  robotKindComposition?: RobotAssetKindComposition,
): Promise<ExperimentDocument> {
  return request<unknown>('/experiments', { method: 'POST',...configurationMutationInit(input) })
    .then((document) => decodeExperimentDocument(document, robotKindComposition));
}

export function commitExperiment(
  resourceId: string,
  branch: string,
  input: CommitExperimentInput,
  robotKindComposition?: RobotAssetKindComposition,
): Promise<ExperimentDocument> {
  return request<unknown>(
    `/experiments/${segment(resourceId)}/branches/${segment(branch)}/commits`,
    { method: 'POST',...configurationMutationInit(input) },
  ).then((document) => decodeExperimentDocument(document, robotKindComposition));
}

export async function archiveExperiment(resourceId: string, input: ExperimentResourceStateInput): Promise<void> {
  await request<void>(`/experiments/${segment(resourceId)}`, { method: 'DELETE',...configurationMutationInit(input) });
}

export function listExperimentNamespaces(signal?: AbortSignal): Promise<ExperimentNamespace[]> {
  return configurationCollection(
    request<unknown>(`/configuration/domains/${EXPERIMENT_DOMAIN}/namespaces`, { signal }),
    `/configuration/domains/${EXPERIMENT_DOMAIN}/namespaces`,
  );
}

export function createExperimentNamespace(input: CreateExperimentNamespaceInput): Promise<ExperimentNamespace> {
  return request<ExperimentNamespace>(
    `/configuration/domains/${EXPERIMENT_DOMAIN}/namespaces`,
    { method: 'POST',...configurationMutationInit(input) },
  );
}

export function updateExperimentNamespace(namespaceId: string, input: UpdateExperimentNamespaceInput): Promise<ExperimentNamespace> {
  return request<ExperimentNamespace>(
    `/configuration/domains/${EXPERIMENT_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'PATCH',...configurationMutationInit(input) },
  );
}

export async function archiveExperimentNamespace(namespaceId: string, input: ExperimentResourceStateInput): Promise<void> {
  await request<void>(
    `/configuration/domains/${EXPERIMENT_DOMAIN}/namespaces/${segment(namespaceId)}`,
    { method: 'DELETE',...configurationMutationInit(input) },
  );
}

export function isExperimentCASConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/experiment has a live Session|experiment_robot_bindings_frozen/i.test(error.message)) return false;
  if (/\b409\b|revision conflict|branch head|commit conflict/i.test(error.message)) return true;
  // Wrappers that translate a conflict into operator wording keep the original
  // rejection as `cause`, so conflict-ness stays detectable through the chain.
  return isExperimentCASConflict(error.cause);
}
