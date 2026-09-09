import { useEffect,useMemo,useRef,useState,type SetStateAction } from 'react';
import type { ApiTargetOptions } from '../../api/http';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { TerminalCollectionProjection } from './terminalCatalogModel';
import { upsertTerminalRecord } from './terminalCatalogModel';
import { isString,isStringArray,terminalPersistenceKey } from './terminalPersistenceModel';

type TerminalResource = {
  id: string;
  group: string;
};

type MutationOperation = 'save' | 'remove' | 'move';
type CatalogScope = { persistenceScope: string;targetCoreId: string };
type MutationLease = { operation: MutationOperation;scope: CatalogScope };
type MutationErrors = Record<MutationOperation,string>;

export type TerminalResourceCatalogBusy = Record<MutationOperation,boolean>;

type CatalogScopeState<Item> = {
  scope: CatalogScope;
  items: Item[];
  draft: Item;
  drawerOpen: boolean;
  error: string;
  mutationErrors: MutationErrors;
  busy: TerminalResourceCatalogBusy;
};

export type TerminalResourceCatalogPort<Item extends TerminalResource> = {
  persistenceKind: 'hosts';
  empty: () => Item;
  project: (items: Item[],query: string,groupFilter: string) => TerminalCollectionProjection<Item>;
  list: (target?: ApiTargetOptions) => Promise<Item[]>;
  save: (item: Item,target?: ApiTargetOptions) => Promise<Item>;
  delete: (id: string,target?: ApiTargetOptions) => Promise<unknown>;
};

export function useTerminalResourceCatalog<Item extends TerminalResource>({
  persistenceScope,
  targetCoreId,
  managedHostId,
  enabled = true,
  port,
  onLoaded,
}: {
  persistenceScope: string;
  targetCoreId?: string;
  managedHostId?: string;
  /** When false, skip network load and report empty ready catalog. */
  enabled?: boolean;
  port: TerminalResourceCatalogPort<Item>;
  onLoaded?: (items: Item[]) => void;
}) {
  const normalizedTargetCoreId = targetCoreId?.trim() ?? '';
  const normalizedManagedHostId = managedHostId?.trim() ?? '';
  const scope = useMemo<CatalogScope>(
    () => ({ persistenceScope,targetCoreId: normalizedTargetCoreId }),
    [normalizedTargetCoreId,persistenceScope],
  );
  const emptyState = useMemo(() => createScopeState(scope,port),[port,scope]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const [scopeState,setScopeState] = useState(emptyState);
  const state = scopeState.scope === scope ? scopeState : emptyState;
  const mutationLeases = useRef<Record<MutationOperation,MutationLease | null>>(emptyMutationLeases());
  const loadLease = useRef<{ scope: CatalogScope } | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const apiTarget = useMemo(
    () => {
      if (!normalizedTargetCoreId && !normalizedManagedHostId) return undefined;
      return {
        ...(normalizedTargetCoreId ? { targetCoreId: normalizedTargetCoreId } : {}),
        ...(normalizedManagedHostId ? { managedHostId: normalizedManagedHostId } : {}),
      };
    },
    [normalizedManagedHostId,normalizedTargetCoreId],
  );
  const [query,setQuery] = usePersistentState(
    terminalPersistenceKey(persistenceScope,`${port.persistenceKind}-search`),
    '',
    isString,
  );
  const [groupFilter,setGroupFilter] = usePersistentState(
    terminalPersistenceKey(persistenceScope,`${port.persistenceKind}-group`),
    'all',
    isString,
  );
  const [collapsedFolders,setCollapsedFolders] = usePersistentState<string[]>(
    terminalPersistenceKey(persistenceScope,`${port.persistenceKind}-collapsed-folders`),
    [],
    isStringArray,
  );
  const collection = useMemo(
    () => port.project(state.items,query,groupFilter),
    [groupFilter,port,query,state.items],
  );

  useEffect(() => {
    mutationLeases.current = emptyMutationLeases();
    setScopeState(emptyState);
    const lease = { scope };
    loadLease.current = lease;
    const updateForLoad = (update: (current: CatalogScopeState<Item>) => CatalogScopeState<Item>) => {
      setScopeState((current) => {
        if (liveScope.current !== scope) return current;
        return update(current.scope === scope ? current : emptyState);
      });
    };
    if (!enabled) {
      updateForLoad((current) => ({ ...current,items: [],error: '' }));
      onLoadedRef.current?.([]);
      return () => {
        if (loadLease.current === lease) loadLease.current = null;
      };
    }
    void (async () => {
      try {
        const loadedItems = await port.list(apiTarget);
        if (!ownsLoad(lease)) return;
        updateForLoad((current) => ({ ...current,items: loadedItems,error: '' }));
        onLoadedRef.current?.(loadedItems);
      } catch (cause) {
        if (ownsLoad(lease)) updateForLoad((current) => ({ ...current,error: messageOf(cause) }));
      }
    })();
    return () => {
      if (loadLease.current === lease) loadLease.current = null;
      for (const operation of mutationOperations) {
        if (mutationLeases.current[operation]?.scope === scope) mutationLeases.current[operation] = null;
      }
    };
  },[apiTarget,emptyState,enabled,port,scope]);

  async function saveDraft(): Promise<boolean> {
    const lease = acquireMutation('save');
    if (!lease) return false;
    try {
      const saved = await port.save(state.draft,apiTarget);
      return completeMutation(lease,(current) => ({
        ...current,
        items: upsertTerminalRecord(current.items,saved),
        draft: port.empty(),
        drawerOpen: false,
      }));
    } catch (cause) {
      failMutation(lease,cause);
      return false;
    }
  }

  async function remove(id: string): Promise<boolean> {
    const lease = acquireMutation('remove');
    if (!lease) return false;
    try {
      await port.delete(id,apiTarget);
      return completeMutation(lease,(current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== id),
      }));
    } catch (cause) {
      failMutation(lease,cause);
      return false;
    }
  }

  async function move(item: Item,group: string): Promise<boolean> {
    const lease = acquireMutation('move');
    if (!lease) return false;
    try {
      const saved = await port.save({ ...item,group },apiTarget);
      return completeMutation(lease,(current) => ({
        ...current,
        items: upsertTerminalRecord(current.items,saved),
      }));
    } catch (cause) {
      failMutation(lease,cause);
      return false;
    }
  }

  function setDraft(next: SetStateAction<Item>) {
    updateCurrent((current) => ({
      ...current,
      draft: typeof next === 'function' ? (next as (item: Item) => Item)(current.draft) : next,
    }));
  }

  function setDrawerOpen(next: SetStateAction<boolean>) {
    updateCurrent((current) => ({
      ...current,
      drawerOpen: typeof next === 'function' ? next(current.drawerOpen) : next,
    }));
  }

  function createDraft() {
    updateCurrent((current) => ({
      ...current,
      draft: port.empty(),
      drawerOpen: true,
      mutationErrors: { ...current.mutationErrors,save: '' },
    }));
  }

  function editDraft(item: Item) {
    updateCurrent((current) => ({
      ...current,
      draft: item,
      drawerOpen: true,
      mutationErrors: { ...current.mutationErrors,save: '' },
    }));
  }

  function ownsLoad(lease: { scope: CatalogScope }) {
    return liveScope.current === lease.scope && loadLease.current === lease;
  }

  function updateCurrent(update: (current: CatalogScopeState<Item>) => CatalogScopeState<Item>) {
    setScopeState((current) => {
      if (liveScope.current !== scope) return current;
      return update(current.scope === scope ? current : emptyState);
    });
  }

  function acquireMutation(operation: MutationOperation): MutationLease | null {
    const active = mutationLeases.current[operation];
    if (active?.scope === scope) return null;
    const lease = { operation,scope };
    mutationLeases.current[operation] = lease;
    updateCurrent((current) => ({
      ...current,
      busy: { ...current.busy,[operation]: true },
      mutationErrors: { ...current.mutationErrors,[operation]: '' },
    }));
    return lease;
  }

  function ownsMutation(lease: MutationLease) {
    return liveScope.current === lease.scope && mutationLeases.current[lease.operation] === lease;
  }

  function completeMutation(
    lease: MutationLease,
    update: (current: CatalogScopeState<Item>) => CatalogScopeState<Item>,
  ) {
    if (!ownsMutation(lease)) return false;
    mutationLeases.current[lease.operation] = null;
    updateCurrent((current) => ({
      ...update(current),
      busy: { ...current.busy,[lease.operation]: false },
    }));
    return true;
  }

  function failMutation(lease: MutationLease,cause: unknown) {
    if (!ownsMutation(lease)) return;
    mutationLeases.current[lease.operation] = null;
    updateCurrent((current) => ({
      ...current,
      busy: { ...current.busy,[lease.operation]: false },
      mutationErrors: { ...current.mutationErrors,[lease.operation]: messageOf(cause) },
    }));
  }

  return {
    items: state.items,
    collection,
    draft: state.draft,
    drawerOpen: state.drawerOpen,
    error: state.error,
    mutationError: combinedMutationError(state.mutationErrors),
    busy: state.busy,
    query,
    groupFilter,
    collapsedFolders,
    setDraft,
    setDrawerOpen,
    setQuery,
    setGroupFilter,
    setCollapsedFolders,
    createDraft,
    editDraft,
    saveDraft,
    remove,
    move,
  };
}

const mutationOperations: MutationOperation[] = ['save','remove','move'];

function createScopeState<Item extends TerminalResource>(scope: CatalogScope,port: TerminalResourceCatalogPort<Item>): CatalogScopeState<Item> {
  return {
    scope,
    items: [],
    draft: port.empty(),
    drawerOpen: false,
    error: '',
    mutationErrors: emptyMutationErrors(),
    busy: emptyBusyState(),
  };
}

function emptyMutationLeases(): Record<MutationOperation,MutationLease | null> {
  return { save: null,remove: null,move: null };
}

function emptyMutationErrors(): MutationErrors {
  return { save: '',remove: '',move: '' };
}

function emptyBusyState(): TerminalResourceCatalogBusy {
  return { save: false,remove: false,move: false };
}

function combinedMutationError(errors: MutationErrors) {
  return Array.from(new Set(mutationOperations.map((operation) => errors[operation]).filter(Boolean))).join(' · ');
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
