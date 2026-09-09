import { useEffect } from 'react';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';

const MCP_NODE_KINDS = new Set(['mcp.tool.call','mcp.resource.read','mcp.prompt.get']);

export function useAutomationPageResources({
  catalog,
  refreshMCPConnections,
}: {
  catalog: AutomationNodeCatalogEntry[];
  refreshMCPConnections: (signal?: AbortSignal) => Promise<unknown>;
}) {
  const canManageMCP = catalog.some((entry) => MCP_NODE_KINDS.has(entry.kind));

  useEffect(() => {
    if (!canManageMCP) return;
    const controller = new AbortController();
    void refreshMCPConnections(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [canManageMCP,refreshMCPConnections]);

}
