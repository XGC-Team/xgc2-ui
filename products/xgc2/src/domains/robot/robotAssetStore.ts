import { useMemo } from 'react';
import { createConfigAssetStoreAdapter, useConfigAssetStore } from '../assets/assetsPublic';
import { builtInRobotAssetKindComposition } from './builtInRobotAssetKindContributions';
import { normalizeRobotAssetSpec, validateRobotAssetSpec } from './robotAssetAuthoring';
import type { RobotAssetDocument, RobotAssetSpec, RobotNamespace } from './robotAssetContracts';
import type { RobotAssetKindComposition } from './robotAssetKindComposition';
import {
  archiveRobotAsset,
  archiveRobotNamespace,
  commitRobotAsset,
  createRobotAsset,
  createRobotNamespace,
  getRobotAsset,
  isRobotAssetCASConflict,
  listRobotAssets,
  listRobotNamespaces,
  updateRobotNamespace,
} from './robotAssetService';

export class RobotAssetCommitConflict extends Error {
  readonly latest?: RobotAssetDocument;

  constructor(message: string, latest?: RobotAssetDocument) {
    super(message);
    this.name = 'RobotAssetCommitConflict';
    this.latest = latest;
  }
}

type RobotAssetStoreAdapter = ReturnType<typeof createRobotAssetStoreAdapter>;

/**
 * Adapters are keyed by composition object identity. Product roots freeze one
 * composition instance; recreating adapters every render would thrash
 * useConfigAssetStore's refresh effect (loading true/false) and make the
 * Experiment Run button flicker unclickably.
 */
const adaptersByComposition = new WeakMap<RobotAssetKindComposition, RobotAssetStoreAdapter>();

export function createRobotAssetStoreAdapter(
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
) {
  return createConfigAssetStoreAdapter<
    RobotAssetDocument,
    RobotAssetSpec,
    RobotNamespace
  >({
    intentPrefix: 'robot',
    resourceLabel: 'robot asset',
    normalize: (spec) => normalizeRobotAssetSpec(spec, composition),
    validate: (spec) => validateRobotAssetSpec(spec, composition),
    services: {
      listAssets: (signal?: AbortSignal) => listRobotAssets(signal, undefined, composition),
      listNamespaces: listRobotNamespaces,
      getAsset: (resourceId: string) => getRobotAsset(resourceId, undefined, composition),
      createAsset: (input) => createRobotAsset(input, composition),
      commitAsset: (resourceId, branch, input) => commitRobotAsset(
        resourceId, branch, input, composition,
      ),
      archiveAsset: archiveRobotAsset,
      createNamespace: createRobotNamespace,
      updateNamespace: updateRobotNamespace,
      archiveNamespace: archiveRobotNamespace,
      isCommitConflict: isRobotAssetCASConflict,
    },
    commitConflict: (message, latest) => new RobotAssetCommitConflict(message, latest),
  });
}

/** Default store adapter for built-in-only composition (product roots not wired yet). */
export const robotAssetStoreAdapter = createRobotAssetStoreAdapter();
adaptersByComposition.set(builtInRobotAssetKindComposition(), robotAssetStoreAdapter);

function adapterForComposition(composition: RobotAssetKindComposition): RobotAssetStoreAdapter {
  const cached = adaptersByComposition.get(composition);
  if (cached) return cached;
  const created = createRobotAssetStoreAdapter(composition);
  adaptersByComposition.set(composition, created);
  return created;
}

export function useRobotAssetStore(
  requestedResourceId?: string,
  composition: RobotAssetKindComposition = builtInRobotAssetKindComposition(),
) {
  // composition reference is stable from product roots / context; memo + cache
  // guarantee useConfigAssetStore does not restart its catalog load every frame.
  const adapter = useMemo(
    () => adapterForComposition(composition),
    [composition],
  );
  return useConfigAssetStore(requestedResourceId, adapter);
}
