import { useCallback,useEffect,useRef,useState } from 'react';
import { recordWithoutKey } from '../../shared/recordWithoutKey';
import type {
  MCPCatalogSnapshot,
  MCPConnection,
  PutMCPConnectionInput,
} from './automationMCPContracts';
import {
  deleteMCPConnection,
  getMCPCatalog,
  listMCPConnections,
  putMCPConnection,
} from './automationMCPService';
import { useAutomationTargetScope,type AutomationTargetScope } from './useAutomationTargetScope';

type MCPConnectionsSnapshot = {
  scope: AutomationTargetScope;
  connections: MCPConnection[];
  catalogs: Record<string,MCPCatalogSnapshot>;
  loading: boolean;
};

export function useAutomationMCPConnections(targetId: string) {
  const targetScopeRef = useAutomationTargetScope(targetId);
  const targetScope = targetScopeRef.current;
  const [snapshot,setSnapshot] = useState<MCPConnectionsSnapshot>(() => emptyMCPConnections(targetScope));
  const snapshotRef = useRef(snapshot);
  const refreshGenerationRef = useRef(0);

  const replaceSnapshot = useCallback((
    requestScope: AutomationTargetScope,
    update: (current: MCPConnectionsSnapshot) => MCPConnectionsSnapshot,
  ) => {
    if (targetScopeRef.current !== requestScope) return false;
    const current = snapshotRef.current.scope === requestScope
      ? snapshotRef.current
      : emptyMCPConnections(requestScope);
    const next = update(current);
    snapshotRef.current = next;
    setSnapshot(next);
    return true;
  }, [targetScopeRef]);

  useEffect(() => {
    refreshGenerationRef.current += 1;
    replaceSnapshot(targetScope, () => emptyMCPConnections(targetScope));
  }, [replaceSnapshot,targetScope]);

  const refreshMCPConnections = useCallback(async (signal?: AbortSignal) => {
    const requestScope = targetScope;
    if (targetScopeRef.current !== requestScope) return [];
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    replaceSnapshot(requestScope, (current) => ({ ...current,loading: true }));
    try {
      const connections = await listMCPConnections(requestScope.targetId, { signal });
      if (signal?.aborted
        || targetScopeRef.current !== requestScope
        || refreshGenerationRef.current !== generation) return connections;
      replaceSnapshot(requestScope, (current) => ({ ...current,connections }));
      const discovered = await Promise.all(connections.filter((connection) => connection.enabled).map(async (connection) => {
        try {
          return [connection.id,await getMCPCatalog(requestScope.targetId, connection.id, { signal })] as const;
        } catch {
          return undefined;
        }
      }));
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && refreshGenerationRef.current === generation) {
        replaceSnapshot(requestScope, (current) => ({
          ...current,
          catalogs: Object.fromEntries(discovered.filter(
            (entry): entry is readonly [string,MCPCatalogSnapshot] => Boolean(entry),
          )),
        }));
      }
      return connections;
    } catch (cause) {
      if (!signal?.aborted
        && targetScopeRef.current === requestScope
        && refreshGenerationRef.current === generation) {
        replaceSnapshot(requestScope, () => emptyMCPConnections(requestScope));
      }
      throw cause;
    } finally {
      if (targetScopeRef.current === requestScope && refreshGenerationRef.current === generation) {
        replaceSnapshot(requestScope, (current) => ({ ...current,loading: false }));
      }
    }
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const saveMCPConnection = useCallback(async (connectionId: string, input: PutMCPConnectionInput) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const saved = await putMCPConnection(requestScope.targetId, connectionId, input);
    const current = replaceSnapshot(requestScope, (snapshot) => ({
      ...snapshot,
      connections: [saved,...snapshot.connections.filter((connection) => connection.id !== saved.id)],
      catalogs: recordWithoutKey(snapshot.catalogs, saved.id),
    }));
    if (current && saved.enabled) {
      try {
        const catalog = await getMCPCatalog(requestScope.targetId, saved.id);
        replaceSnapshot(requestScope, (snapshot) => ({
          ...snapshot,catalogs: { ...snapshot.catalogs,[saved.id]: catalog },
        }));
      } catch {
        // Saving the connection remains authoritative when discovery is unavailable.
      }
    }
    return saved;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const removeMCPConnection = useCallback(async (connection: Pick<MCPConnection,'id' | 'revision'>) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const deleted = await deleteMCPConnection(requestScope.targetId, connection.id, connection.revision);
    replaceSnapshot(requestScope, (snapshot) => ({
      ...snapshot,
      connections: snapshot.connections.filter((item) => item.id !== connection.id),
      catalogs: recordWithoutKey(snapshot.catalogs, connection.id),
    }));
    return deleted;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const discoverMCPCatalog = useCallback(async (connectionId: string) => {
    const requestScope = targetScope;
    assertCurrentTargetScope(targetScopeRef, requestScope);
    const catalog = await getMCPCatalog(requestScope.targetId, connectionId);
    replaceSnapshot(requestScope, (snapshot) => ({
      ...snapshot,catalogs: { ...snapshot.catalogs,[connectionId]: catalog },
    }));
    return catalog;
  }, [replaceSnapshot,targetScope,targetScopeRef]);

  const active = snapshot.scope === targetScope ? snapshot : emptyMCPConnections(targetScope);
  return {
    mcpConnections: active.connections,
    mcpCatalogs: active.catalogs,
    mcpConnectionsLoading: active.loading,
    refreshMCPConnections,
    saveMCPConnection,
    removeMCPConnection,
    discoverMCPCatalog,
  };
}

function emptyMCPConnections(scope: AutomationTargetScope): MCPConnectionsSnapshot {
  return { scope,connections: [],catalogs: {},loading: false };
}

function assertCurrentTargetScope(
  reference: { current: AutomationTargetScope },
  scope: AutomationTargetScope,
) {
  if (reference.current !== scope) throw new Error('Automation execution target changed.');
}
