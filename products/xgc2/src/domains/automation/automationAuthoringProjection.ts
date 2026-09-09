import type {
  AutomationDocument,
  AutomationNodeLibraryItem,
  AutomationSpec,
} from './automationDefinitionContracts';
import type {
  MCPConnection,
  MCPCatalogSnapshot,
} from './automationMCPContracts';
import type { AutomationRuntimeInputSource } from './AutomationRuntimePanels';
import { automationNodeLibraryItemForNode } from './automationNodeLibrary';

export function automationSelectOptions(documents: readonly AutomationDocument[], currentResourceId: string, executionTargetId: string) {
  const current = documents.find((candidate) => candidate.head.resourceId === currentResourceId);
  const available = documents
    .filter((candidate) => !candidate.head.archived
      && candidate.head.resourceId !== currentResourceId
      && (current
        ? compatibleAutomationTargetPolicies(current, candidate)
        : candidate.spec.targetPolicy.mode === 'fixed'
          && candidate.spec.targetPolicy.executionTargetId === executionTargetId))
    .map((candidate) => ({
      value: candidate.head.resourceId,
      label: candidate.spec.metadata.name.trim() || candidate.head.name.trim() || candidate.head.resourceId,
    }));
  const labelCounts = new Map<string,number>();
  available.forEach((candidate) => labelCounts.set(candidate.label, (labelCounts.get(candidate.label) ?? 0) + 1));
  return available
    .map((candidate) => ({ ...candidate,label: (labelCounts.get(candidate.label) ?? 0) > 1 ? `${candidate.label} · ${candidate.value}` : candidate.label }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

function compatibleAutomationTargetPolicies(parent: AutomationDocument, child: AutomationDocument) {
  const parentPolicy = parent.spec.targetPolicy;
  const childPolicy = child.spec.targetPolicy;
  if (parentPolicy.mode !== childPolicy.mode) return false;
  return parentPolicy.mode === 'inherit'
    || parentPolicy.executionTargetId === childPolicy.executionTargetId;
}

export function mcpConnectionSelectOptions(connections: readonly MCPConnection[]) {
  return connections
    .filter((connection) => connection.enabled)
    .map((connection) => ({ value: connection.id,label: connection.name.trim() ? `${connection.name} · ${connection.id}` : connection.id }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export function mcpToolSelectOptions(catalog?: MCPCatalogSnapshot) {
  return (catalog?.tools ?? [])
    .map((tool) => ({ value: tool.name,label: tool.title?.trim() || tool.name }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export function mcpResourceSelectOptions(catalog?: MCPCatalogSnapshot) {
  return (catalog?.resources ?? [])
    .map((resource) => ({ value: resource.uri,label: resource.title?.trim() || resource.name?.trim() || resource.uri }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export function mcpPromptSelectOptions(catalog?: MCPCatalogSnapshot) {
  return (catalog?.prompts ?? [])
    .map((prompt) => ({ value: prompt.name,label: prompt.title?.trim() || prompt.name }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
}

export function automationInputSources(spec: AutomationSpec, nodeId: string, libraryItems: AutomationNodeLibraryItem[]): AutomationRuntimeInputSource[] {
  const nodes = new Map(spec.nodes.map((node) => [node.id,node]));
  const seen = new Set<string>();
  return spec.edges.flatMap((edge) => {
    if (edge.to !== nodeId || seen.has(edge.from)) return [];
    seen.add(edge.from);
    const source = nodes.get(edge.from);
    const item = source ? automationNodeLibraryItemForNode(libraryItems, source) : undefined;
    const outputSchema = source && item && source.typeVersion === item.runtimeTypeVersion
      ? item.outputSchema
      : undefined;
    return [{ id: edge.from,label: source?.displayName ? `${source.displayName} · ${edge.from}` : edge.from,outputSchema }];
  });
}
