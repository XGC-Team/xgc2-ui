import {
  createConfigAssetStoreAdapter,
  useConfigAssetStore,
} from '../assets/assetsPublic';
import { normalizeUsernodeAssetSpec } from './usernodeAuthoring';
import { listUsernodeAssets } from './usernodeCatalogServicePublic';
import type { UsernodeAssetDocument,UsernodeAssetSpec,UsernodeNamespace } from './usernodeContractsPublic';
import {
  archiveUsernodeAsset,
  archiveUsernodeNamespace,
  commitUsernodeAsset,
  createUsernodeAsset,
  createUsernodeNamespace,
  getUsernodeAsset,
  isUsernodeAssetCASConflict,
  listUsernodeNamespaces,
  updateUsernodeNamespace,
} from './usernodeService';
import { validateUsernodeAssetSpec } from './usernodeValidation';

export class UsernodeAssetCommitConflict extends Error {
  readonly latest?: UsernodeAssetDocument;

  constructor(message: string, latest?: UsernodeAssetDocument) {
    super(message);
    this.name = 'UsernodeAssetCommitConflict';
    this.latest = latest;
  }
}

const usernodeAssetStoreAdapter = createConfigAssetStoreAdapter<
  UsernodeAssetDocument,UsernodeAssetSpec,UsernodeNamespace
>({
  intentPrefix: 'usernode',
  resourceLabel: 'user script',
  normalize: normalizeUsernodeAssetSpec,
  validate: validateUsernodeAssetSpec,
  services: {
    listAssets: listUsernodeAssets,
    listNamespaces: listUsernodeNamespaces,
    getAsset: getUsernodeAsset,
    createAsset: createUsernodeAsset,
    commitAsset: commitUsernodeAsset,
    archiveAsset: archiveUsernodeAsset,
    createNamespace: createUsernodeNamespace,
    updateNamespace: updateUsernodeNamespace,
    archiveNamespace: archiveUsernodeNamespace,
    isCommitConflict: isUsernodeAssetCASConflict,
  },
  commitConflict: (message, latest) => new UsernodeAssetCommitConflict(message, latest),
});

export function useUsernodeAssetsStore(requestedResourceId?: string) {
  return useConfigAssetStore(requestedResourceId, usernodeAssetStoreAdapter);
}
