import { request } from '../../api/http';
import { configurationCollection } from '../../shared/configurationTransport';
import { segment } from '../../shared/url';
import { executionTargetPath } from '../execution/executionPublic';
import type {
  MCPConnection,
  MCPCatalogSnapshot,
  PutMCPConnectionInput,
} from './automationMCPContracts';
import type { AutomationRequestOptions } from './automationRequest';

export function listMCPConnections(targetId: string, options: AutomationRequestOptions = {}): Promise<MCPConnection[]> {
  const path = `${executionTargetPath(targetId)}/mcp/connections`;
  return configurationCollection(request<unknown>(path, { signal: options.signal }), path);
}

export function putMCPConnection(targetId: string, connectionId: string, input: PutMCPConnectionInput): Promise<MCPConnection> {
  return request<MCPConnection>(`${executionTargetPath(targetId)}/mcp/connections/${segment(connectionId)}`, {
    method: 'PUT',body: JSON.stringify(input),
  });
}

export function deleteMCPConnection(targetId: string, connectionId: string, expectedRevision: number): Promise<{ id: string }> {
  return request<{ id: string }>(`${executionTargetPath(targetId)}/mcp/connections/${segment(connectionId)}`, {
    method: 'DELETE',body: JSON.stringify({ expectedRevision }),
  });
}

export function getMCPCatalog(targetId: string, connectionId: string, options: AutomationRequestOptions = {}): Promise<MCPCatalogSnapshot> {
  return request<MCPCatalogSnapshot>(
    `${executionTargetPath(targetId)}/mcp/connections/${segment(connectionId)}/catalog`,
    { signal: options.signal },
  );
}
