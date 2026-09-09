import { useMemo } from 'react';
import type { AutomationParameterOptions } from './AutomationParameterControls';
import {
  AUTOMATION_CALL_KIND,
  type AutomationDocument,
  type AutomationNode,
} from './automationDefinitionContracts';
import type {
  MCPConnection,
  MCPCatalogSnapshot,
} from './automationMCPContracts';
import {
  automationSelectOptions,
  mcpConnectionSelectOptions,
  mcpPromptSelectOptions,
  mcpResourceSelectOptions,
  mcpToolSelectOptions,
} from './automationAuthoringProjection';

const MCP_NODE_KINDS = new Set(['mcp.tool.call','mcp.resource.read','mcp.prompt.get']);

export function useAutomationNodeDialogOptions({
  node,
  automationDocuments,
  currentResourceId,
  executionTargetId,
  mcpConnections,
  mcpCatalogs,
}: {
  node?: AutomationNode;
  automationDocuments: readonly AutomationDocument[];
  currentResourceId: string;
  executionTargetId: string;
  mcpConnections: readonly MCPConnection[];
  mcpCatalogs: Readonly<Record<string,MCPCatalogSnapshot>>;
}) {
  return useMemo<AutomationParameterOptions | undefined>(() => {
    if (node?.kind === AUTOMATION_CALL_KIND) {
      return {
        automationId: automationSelectOptions(automationDocuments, currentResourceId, executionTargetId),
      };
    }
    if (node && MCP_NODE_KINDS.has(node.kind)) {
      const connectionID = typeof node.parameters.connectionId === 'string'
        ? node.parameters.connectionId
        : '';
      const catalog = mcpCatalogs[connectionID];
      const options: AutomationParameterOptions = {
        connectionId: mcpConnectionSelectOptions(mcpConnections),
      };
      if (node.kind === 'mcp.tool.call') options.toolName = mcpToolSelectOptions(catalog);
      if (node.kind === 'mcp.resource.read') options.uri = mcpResourceSelectOptions(catalog);
      if (node.kind === 'mcp.prompt.get') options.promptName = mcpPromptSelectOptions(catalog);
      return options;
    }
    return undefined;
  }, [automationDocuments,currentResourceId,executionTargetId,mcpCatalogs,mcpConnections,node]);
}
