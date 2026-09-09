import { createMutationIdentity } from '../../shared/utils/intent';

export type ConfigAssetDocumentShape<Spec> = {
  head: { resourceId: string;namespaceId?: string;revision: number;system?: boolean };
  branch: { name: string;headCommitId: string;revision: number };
  spec: Spec;
};

export type ConfigAssetNamespaceShape = {
  namespaceId: string;
  parentNamespaceId?: string;
  name: string;
  revision: number;
};

export type ConfigAssetStoreAdapter<
  Document extends ConfigAssetDocumentShape<Spec>,
  Spec,
  Namespace extends ConfigAssetNamespaceShape,
> = {
  normalize: (spec: Spec) => Spec;
  validate: (spec: Spec) => string;
  listAssets: (signal?: AbortSignal) => Promise<Document[]>;
  listNamespaces: (signal?: AbortSignal) => Promise<Namespace[]>;
  getAsset: (resourceId: string) => Promise<Document>;
  createAsset: (namespaceId: string | undefined, spec: Spec) => Promise<Document>;
  commitAsset: (base: Document, spec: Spec, reason: string, namespaceId: string) => Promise<Document>;
  archiveAsset: (document: Document) => Promise<void>;
  createNamespace: (name: string, parentNamespaceId?: string) => Promise<Namespace>;
  renameNamespace: (namespace: Namespace, name: string) => Promise<Namespace>;
  archiveNamespace: (namespace: Namespace) => Promise<void>;
  isCommitConflict: (cause: unknown) => boolean;
  commitConflict: (message: string, latest?: Document) => Error;
  updateReason: string;
  moveReason: string;
};

type MutationIdentity = { requestId: string;idempotencyKey: string };
type ConfigAssetStoreServices<
  Document extends ConfigAssetDocumentShape<Spec>,
  Spec,
  Namespace extends ConfigAssetNamespaceShape,
> = {
  listAssets: (signal?: AbortSignal) => Promise<Document[]>;
  listNamespaces: (signal?: AbortSignal) => Promise<Namespace[]>;
  getAsset: (resourceId: string) => Promise<Document>;
  createAsset: (input: MutationIdentity & { namespaceId?: string;spec: Spec;reason: string }) => Promise<Document>;
  commitAsset: (resourceId: string, branch: string, input: MutationIdentity & {
    spec: Spec;
    baseCommitId: string;
    expectedBranchRevision: number;
    expectedResourceRevision: number;
    namespaceId?: string;
    reason: string;
  }) => Promise<Document>;
  archiveAsset: (resourceId: string, input: MutationIdentity & {
    expectedRevision: number;
    reason: string;
  }) => Promise<void>;
  createNamespace: (input: MutationIdentity & {
    name: string;
    parentNamespaceId?: string;
  }) => Promise<Namespace>;
  updateNamespace: (namespaceId: string, input: MutationIdentity & {
    name: string;
    expectedRevision: number;
  }) => Promise<Namespace>;
  archiveNamespace: (namespaceId: string, input: MutationIdentity & {
    expectedRevision: number;
  }) => Promise<void>;
  isCommitConflict: (cause: unknown) => boolean;
};

export function createConfigAssetStoreAdapter<
  Document extends ConfigAssetDocumentShape<Spec>,
  Spec,
  Namespace extends ConfigAssetNamespaceShape,
>({
  intentPrefix,
  resourceLabel,
  normalize,
  validate,
  services,
  commitConflict,
}: {
  intentPrefix: string;
  resourceLabel: string;
  normalize: (spec: Spec) => Spec;
  validate: (spec: Spec) => string;
  services: ConfigAssetStoreServices<Document,Spec,Namespace>;
  commitConflict: (message: string, latest?: Document) => Error;
}): ConfigAssetStoreAdapter<Document,Spec,Namespace> {
  return {
    normalize,
    validate,
    listAssets: services.listAssets,
    listNamespaces: services.listNamespaces,
    getAsset: services.getAsset,
    createAsset: (namespaceId, spec) => services.createAsset({
      ...(namespaceId ? { namespaceId } : {}),
      spec,
      reason: `Create ${resourceLabel}`,
      ...createMutationIdentity(`${intentPrefix}.create`),
    }),
    commitAsset: (base, spec, reason, namespaceId) => services.commitAsset(
      base.head.resourceId,
      base.branch.name,
      {
        spec,
        baseCommitId: base.branch.headCommitId,
        expectedBranchRevision: base.branch.revision,
        expectedResourceRevision: base.head.revision,
        namespaceId,
        reason: reason.trim() || `Update ${resourceLabel}`,
        ...createMutationIdentity(`${intentPrefix}.commit`),
      },
    ),
    archiveAsset: (document) => services.archiveAsset(document.head.resourceId, {
      expectedRevision: document.head.revision,
      reason: `Archive ${resourceLabel}`,
      ...createMutationIdentity(`${intentPrefix}.archive`),
    }),
    createNamespace: (name, parentNamespaceId) => services.createNamespace({
      name,
      ...(parentNamespaceId ? { parentNamespaceId } : {}),
      ...createMutationIdentity(`${intentPrefix}.namespace.create`),
    }),
    renameNamespace: (namespace, name) => services.updateNamespace(namespace.namespaceId, {
      name,
      expectedRevision: namespace.revision,
      ...createMutationIdentity(`${intentPrefix}.namespace.rename`),
    }),
    archiveNamespace: (namespace) => services.archiveNamespace(namespace.namespaceId, {
      expectedRevision: namespace.revision,
      ...createMutationIdentity(`${intentPrefix}.namespace.archive`),
    }),
    isCommitConflict: services.isCommitConflict,
    commitConflict,
    updateReason: `Update ${resourceLabel} settings`,
    moveReason: `Move ${resourceLabel}`,
  };
}
