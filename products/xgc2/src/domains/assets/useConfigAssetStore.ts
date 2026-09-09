import { useCallback,useEffect,useRef,useState } from 'react';
import { CONFIGURATION_MAIN_BRANCH } from '../../shared/configResource';
import { configResourceArchiveLocked } from '../../shared/configResourceProtection';
import type {
  ConfigAssetDocumentShape,
  ConfigAssetNamespaceShape,
  ConfigAssetStoreAdapter,
} from './configAssetStoreAdapter';

export function useConfigAssetStore<
  Document extends ConfigAssetDocumentShape<Spec>,
  Spec,
  Namespace extends ConfigAssetNamespaceShape,
>(requestedResourceId: string | undefined, adapter: ConfigAssetStoreAdapter<Document,Spec,Namespace>) {
  const [assets,setAssets] = useState<Document[]>([]);
  const [namespaces,setNamespaces] = useState<Namespace[]>([]);
  const [selectedResourceId,setSelectedResourceId] = useState(requestedResourceId ?? '');
  const [loading,setLoading] = useState(true);
  const [catalogError,setCatalogError] = useState('');
  const [selectionError,setSelectionError] = useState('');
  const loadGeneration = useRef(0);
  const openGeneration = useRef(0);
  const selected = assets.find((asset) => asset.head.resourceId === selectedResourceId) ?? null;

  useEffect(() => {
    if (requestedResourceId === undefined) return;
    openGeneration.current += 1;
    setSelectionError('');
    setSelectedResourceId(requestedResourceId);
  }, [requestedResourceId]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setCatalogError('');
    const [assetResult,namespaceResult] = await Promise.allSettled([
      Promise.resolve().then(() => adapter.listAssets(signal)),
      Promise.resolve().then(() => adapter.listNamespaces(signal)),
    ]);
    if (signal?.aborted || loadGeneration.current !== generation) return;
    if (assetResult.status === 'fulfilled') setAssets(assetResult.value);
    if (namespaceResult.status === 'fulfilled') setNamespaces(namespaceResult.value);
    const failures = [assetResult,namespaceResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => messageOf(result.reason));
    setCatalogError(Array.from(new Set(failures)).join(' · '));
    setLoading(false);
  }, [adapter]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
      loadGeneration.current += 1;
      openGeneration.current += 1;
    };
  }, [refresh]);

  const open = useCallback(async (resourceId: string) => {
    const generation = openGeneration.current + 1;
    openGeneration.current = generation;
    setSelectionError('');
    try {
      const document = await adapter.getAsset(resourceId);
      if (openGeneration.current !== generation) return document;
      if (requestedResourceId === undefined) setSelectedResourceId(resourceId);
      setAssets((items) => [document,...items.filter((item) => item.head.resourceId !== resourceId)]);
      return document;
    } catch (cause) {
      if (openGeneration.current === generation) setSelectionError(messageOf(cause));
      throw cause;
    }
  }, [adapter,requestedResourceId]);

  const create = useCallback(async (namespaceId: string | undefined, spec: Spec) => {
    const normalized = validatedSpec(spec, adapter);
    const document = await adapter.createAsset(namespaceId || undefined, normalized);
    setAssets((items) => [document,...items.filter((item) => item.head.resourceId !== document.head.resourceId)]);
    return document;
  }, [adapter]);

  const commit = useCallback(async (
    base: Document,
    draft: Spec,
    reason: string,
    namespaceId = base.head.namespaceId ?? '',
    selectResult = true,
  ) => {
    const normalized = validatedSpec(draft, adapter);
    try {
      const saved = await adapter.commitAsset(base, normalized, reason, namespaceId);
      if (selectResult) setSelectedResourceId(saved.head.resourceId);
      setAssets((items) => items.map((item) => {
        if (item.head.resourceId !== saved.head.resourceId) return item;
        return saved.branch.name === CONFIGURATION_MAIN_BRANCH ? saved : { ...item,head: saved.head };
      }));
      return saved;
    } catch (cause) {
      if (!adapter.isCommitConflict(cause)) throw cause;
      let latest: Document | undefined;
      try {
        latest = await adapter.getAsset(base.head.resourceId);
        if (selectResult) setSelectedResourceId(latest.head.resourceId);
        setAssets((items) => items.map((item) => item.head.resourceId === latest?.head.resourceId ? latest : item));
      } catch {
        // Preserve the authoritative commit conflict if its best-effort reload also fails.
      }
      throw adapter.commitConflict(messageOf(cause), latest);
    }
  }, [adapter]);

  const update = useCallback((base: Document, draft: Spec, namespaceId?: string) => (
    commit(base, draft, adapter.updateReason, namespaceId ?? '', false)
  ), [adapter.updateReason,commit]);

  const move = useCallback((base: Document, namespaceId?: string) => (
    commit(base, base.spec, adapter.moveReason, namespaceId ?? '', false)
  ), [adapter.moveReason,commit]);

  const archive = useCallback(async (document: Document) => {
    if (configResourceArchiveLocked(document.head)) return;
    await adapter.archiveAsset(document);
    setAssets((items) => items.filter((item) => item.head.resourceId !== document.head.resourceId));
    setSelectedResourceId((current) => current === document.head.resourceId ? '' : current);
  }, [adapter]);

  const addNamespace = useCallback(async (name: string, parentNamespaceId?: string) => {
    const created = await adapter.createNamespace(name.trim(), parentNamespaceId || undefined);
    setNamespaces((items) => [...items.filter((item) => item.namespaceId !== created.namespaceId),created]);
    return created;
  }, [adapter]);

  const renameNamespace = useCallback(async (namespace: Namespace, name: string) => {
    const saved = await adapter.renameNamespace(namespace, name.trim());
    setNamespaces((items) => [...items.filter((item) => item.namespaceId !== saved.namespaceId),saved]);
    return saved;
  }, [adapter]);

  const archiveNamespace = useCallback(async (namespace: Namespace) => {
    await adapter.archiveNamespace(namespace);
    setNamespaces((items) => items.filter((item) => item.namespaceId !== namespace.namespaceId));
  }, [adapter]);

  return {
    assets,
    namespaces,
    selected,
    loading,
    error: [catalogError,selectionError].filter(Boolean).join(' · '),
    refresh,
    open,
    create,
    commit,
    update,
    move,
    archive,
    addNamespace,
    renameNamespace,
    archiveNamespace,
    close: () => {
      openGeneration.current += 1;
      setSelectionError('');
      setSelectedResourceId('');
    },
  };
}

function validatedSpec<Document extends ConfigAssetDocumentShape<Spec>,Spec,Namespace extends ConfigAssetNamespaceShape>(
  spec: Spec,
  adapter: ConfigAssetStoreAdapter<Document,Spec,Namespace>,
) {
  const normalized = adapter.normalize(spec);
  const validation = adapter.validate(normalized);
  if (validation) throw new Error(validation);
  return normalized;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
