export type MCPConnection = {
  id: string;
  name: string;
  transport: 'streamable-http';
  endpoint: string;
  headerEnvironment: Record<string,string>;
  enabled: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type MCPToolCatalogEntry = { name: string;title?: string;description?: string;inputSchema?: Record<string,unknown> };
export type MCPResourceCatalogEntry = { uri: string;name?: string;title?: string;description?: string;mimeType?: string };
export type MCPResourceTemplateCatalogEntry = { uriTemplate: string;name?: string;title?: string;description?: string;mimeType?: string };
export type MCPPromptCatalogEntry = { name: string;title?: string;description?: string;arguments?: Array<{ name: string;description?: string;required?: boolean }> };
export type MCPCatalogSnapshot = {
  connectionId: string;
  connectionRevision: number;
  tools: MCPToolCatalogEntry[];
  resources: MCPResourceCatalogEntry[];
  resourceTemplates: MCPResourceTemplateCatalogEntry[];
  prompts: MCPPromptCatalogEntry[];
  digest: string;
  observedAt: string;
};
export type PutMCPConnectionInput = {
  name: string;
  transport: 'streamable-http';
  endpoint: string;
  headerEnvironment: Record<string,string>;
  enabled: boolean;
  expectedRevision: number;
};
