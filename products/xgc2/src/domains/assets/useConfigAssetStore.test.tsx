// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { ConfigAssetStoreAdapter } from './configAssetStoreAdapter';
import { useConfigAssetStore } from './useConfigAssetStore';

type Spec = { name: string };
type Document = {
  head: { resourceId: string;revision: number;system?: boolean };
  branch: { name: string;headCommitId: string;revision: number };
  spec: Spec;
};
type Namespace = { namespaceId: string;name: string;revision: number };

describe('useConfigAssetStore archive protection', () => {
  it('never calls the archive service for a system resource', async () => {
    const archiveAsset = vi.fn().mockResolvedValue(undefined);
    const adapter = adapterFixture(archiveAsset);
    const system = documentFixture('system-robot', true);
    const user = documentFixture('user-robot', false);
    const view = renderHook(() => useConfigAssetStore<Document,Spec,Namespace>(undefined, adapter));

    await act(async () => view.result.current.archive(system));
    expect(archiveAsset).not.toHaveBeenCalled();

    await act(async () => view.result.current.archive(user));
    expect(archiveAsset).toHaveBeenCalledOnce();
    expect(archiveAsset).toHaveBeenCalledWith(user);
  });
});

function adapterFixture(archiveAsset: ConfigAssetStoreAdapter<Document,Spec,Namespace>['archiveAsset']): ConfigAssetStoreAdapter<Document,Spec,Namespace> {
  return {
    normalize: (spec) => spec,
    validate: () => '',
    listAssets: async () => [],
    listNamespaces: async () => [],
    getAsset: async (resourceId) => documentFixture(resourceId, false),
    createAsset: async (_namespaceId, spec) => ({ ...documentFixture('created', false),spec }),
    commitAsset: async (base, spec) => ({ ...base,spec }),
    archiveAsset,
    createNamespace: async (name) => ({ namespaceId: name,name,revision: 1 }),
    renameNamespace: async (namespace, name) => ({ ...namespace,name }),
    archiveNamespace: async () => undefined,
    isCommitConflict: () => false,
    commitConflict: (message) => new Error(message),
    updateReason: 'Update',
    moveReason: 'Move',
  };
}

function documentFixture(resourceId: string, system: boolean): Document {
  return {
    head: { resourceId,revision: 1,system },
    branch: { name: 'main',headCommitId: 'commit-1',revision: 1 },
    spec: { name: resourceId },
  };
}
