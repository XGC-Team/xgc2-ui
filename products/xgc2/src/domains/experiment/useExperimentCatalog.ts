import { useCallback,useEffect,useSyncExternalStore } from 'react';
import { createMutationIdentity } from '../../shared/utils/intent';
import { useRobotAssetKindComposition } from '../robot/robotAssetPublic';
import type { ExperimentDocument,ExperimentNamespace,ExperimentSpec } from './experimentModel';
import { normalizeExperimentSpec,validateExperimentSpec } from './experimentModel';
import {
  archiveExperiment as archiveExperimentRequest,
  archiveExperimentNamespace as archiveExperimentNamespaceRequest,
  commitExperiment,
  createExperiment as createExperimentRequest,
  createExperimentNamespace as createExperimentNamespaceRequest,
  getExperiment,
  isExperimentCASConflict,
  listExperimentNamespaces,
  listExperiments,
  updateExperimentNamespace as updateExperimentNamespaceRequest,
} from './experimentService';

export class ExperimentCommitConflict extends Error {
  readonly latest: ExperimentDocument;

  constructor(message: string, latest: ExperimentDocument) {
    super(message);
    this.name = 'ExperimentCommitConflict';
    this.latest = latest;
  }
}

export type CreateStoredExperimentInput = {
  namespaceId?: string;
  spec: ExperimentSpec;
};

type ExperimentCatalogSnapshot = {
  experiments: ExperimentDocument[];
  namespaces: ExperimentNamespace[];
  loaded: boolean;
  loading: boolean;
  experimentsResolved: boolean;
  error: string;
};

const emptyCatalogSnapshot: ExperimentCatalogSnapshot = {
  experiments: [],
  namespaces: [],
  loaded: false,
  loading: false,
  experimentsResolved: false,
  error: '',
};

let catalogSnapshot: ExperimentCatalogSnapshot = emptyCatalogSnapshot;
let catalogLoadGeneration = 0;
const catalogListeners = new Set<() => void>();

function emitCatalog() {
  catalogListeners.forEach((listener) => listener());
}

function patchExperimentCatalog(patch: Partial<ExperimentCatalogSnapshot>) {
  catalogSnapshot = { ...catalogSnapshot,...patch };
  emitCatalog();
}

function subscribeExperimentCatalog(listener: () => void) {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

export function resetExperimentCatalogForTests() {
  catalogLoadGeneration += 1;
  catalogSnapshot = emptyCatalogSnapshot;
  catalogListeners.clear();
}

export function useExperimentCatalog() {
  const robotKindComposition = useRobotAssetKindComposition();
  const catalog = useSyncExternalStore(
    subscribeExperimentCatalog,
    () => catalogSnapshot,
    () => catalogSnapshot,
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = catalogLoadGeneration + 1;
    catalogLoadGeneration = generation;
    const isCurrent = () => !signal?.aborted && catalogLoadGeneration === generation;
    const keepResolved = catalogSnapshot.experimentsResolved;
    // A later listing must not blank an already-resolved catalog; Experiment
    // route remount re-fetches in the background.
    patchExperimentCatalog({
      loading: true,
      error: '',
      ...(keepResolved ? {} : { experimentsResolved: false }),
    });
    try {
      const [experimentResult,namespaceResult] = await Promise.allSettled([
        listExperiments(signal, robotKindComposition),
        listExperimentNamespaces(signal),
      ]);
      if (!isCurrent()) return;
      const patch: Partial<ExperimentCatalogSnapshot> = {};
      if (experimentResult.status === 'fulfilled') {
        patch.experiments = experimentResult.value;
        patch.experimentsResolved = true;
      }
      if (namespaceResult.status === 'fulfilled') patch.namespaces = namespaceResult.value;
      const failures = [experimentResult,namespaceResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => messageOf(result.reason));
      patch.error = failures.join(' ');
      patchExperimentCatalog(patch);
    } finally {
      if (isCurrent()) patchExperimentCatalog({ loaded: true,loading: false });
    }
  }, [robotKindComposition]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replaceExperiment = useCallback((next: ExperimentDocument) => {
    patchExperimentCatalog({
      experiments: [
        ...catalogSnapshot.experiments.filter((item) => item.head.resourceId !== next.head.resourceId),
        next,
      ],
    });
  }, []);

  const saveExperimentDraft = useCallback(async (
    draft: ExperimentDocument,
    reason = 'Update experiment configuration',
  ) => {
    // Validate the author draft before normalize so residual kind-arm transport
    // (non-empty px4/mecanum) fails closed — normalize would otherwise strip it.
    const draftValidation = validateExperimentSpec(draft.spec, robotKindComposition);
    if (draftValidation) throw new Error(draftValidation);
    const spec = normalizeExperimentSpec(draft.spec, robotKindComposition);
    const validation = validateExperimentSpec(spec, robotKindComposition);
    if (validation) throw new Error(validation);
    try {
      const saved = await commitExperiment(draft.head.resourceId, draft.branch.name, {
        spec,
        baseCommitId: draft.branch.headCommitId,
        expectedBranchRevision: draft.branch.revision,
        expectedResourceRevision: draft.head.revision,
        namespaceId: draft.head.namespaceId,
        reason,
        ...createMutationIdentity('experiment.commit'),
      }, robotKindComposition);
      replaceExperiment(saved);
      return saved;
    } catch (cause) {
      if (!isExperimentCASConflict(cause)) throw cause;
      const latest = await getExperiment(draft.head.resourceId, undefined, robotKindComposition);
      replaceExperiment(latest);
      throw new ExperimentCommitConflict(messageOf(cause), latest);
    }
  }, [replaceExperiment,robotKindComposition]);

  const createExperiment = useCallback(async (input: CreateStoredExperimentInput) => {
    const created = await createExperimentRequest({
      ...input,
      reason: 'Create experiment',
      ...createMutationIdentity('experiment.create'),
    }, robotKindComposition);
    patchExperimentCatalog({
      experiments: [
        ...catalogSnapshot.experiments.filter((item) => item.head.resourceId !== created.head.resourceId),
        created,
      ],
    });
    return created;
  }, [robotKindComposition]);

  const archiveExperiment = useCallback(async (experiment: ExperimentDocument) => {
    await archiveExperimentRequest(experiment.head.resourceId, {
      expectedRevision: experiment.head.revision,
      reason: 'Archive experiment',
      ...createMutationIdentity('experiment.archive'),
    });
    patchExperimentCatalog({
      experiments: catalogSnapshot.experiments.filter((item) => item.head.resourceId !== experiment.head.resourceId),
    });
  }, []);

  const createNamespace = useCallback(async (name: string) => {
    const created = await createExperimentNamespaceRequest({
      name,
      reason: 'Create experiment folder',
      ...createMutationIdentity('experiment.namespace.create'),
    });
    patchExperimentCatalog({
      namespaces: [...catalogSnapshot.namespaces,created]
        .sort((left, right) => left.name.localeCompare(right.name)),
    });
    return created;
  }, []);

  const updateNamespace = useCallback(async (namespace: ExperimentNamespace, name: string) => {
    const saved = await updateExperimentNamespaceRequest(namespace.namespaceId, {
      name,
      parentNamespaceId: namespace.parentNamespaceId,
      expectedRevision: namespace.revision,
      reason: 'Rename experiment folder',
      ...createMutationIdentity('experiment.namespace.rename'),
    });
    patchExperimentCatalog({
      namespaces: catalogSnapshot.namespaces.map((item) => (
        item.namespaceId === saved.namespaceId ? saved : item
      )),
    });
    return saved;
  }, []);

  const archiveNamespace = useCallback(async (namespace: ExperimentNamespace) => {
    await archiveExperimentNamespaceRequest(namespace.namespaceId, {
      expectedRevision: namespace.revision,
      reason: 'Archive experiment folder',
      ...createMutationIdentity('experiment.namespace.archive'),
    });
    patchExperimentCatalog({
      namespaces: catalogSnapshot.namespaces.filter((item) => item.namespaceId !== namespace.namespaceId),
    });
  }, []);

  return {
    experiments: catalog.experiments,
    namespaces: catalog.namespaces,
    loaded: catalog.loaded,
    loading: catalog.loading,
    experimentsResolved: catalog.experimentsResolved,
    error: catalog.error,
    refresh,
    saveExperimentDraft,
    createExperiment,
    archiveExperiment,
    createNamespace,
    updateNamespace,
    archiveNamespace,
  };
}

export type ExperimentCatalog = ReturnType<typeof useExperimentCatalog>;

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
