import type { AutomationNamespace } from './automationDefinitionContracts';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';

export function namespacePath(namespaces: AutomationNamespace[], id: string) {
  const parts: string[] = [];
  const byID = new Map(namespaces.map((namespace) => [namespace.namespaceId,namespace]));
  let current = byID.get(id);
  const visited = new Set<string>();
  while (current && !visited.has(current.namespaceId)) {
    visited.add(current.namespaceId);
    parts.unshift(current.name);
    current = current.parentNamespaceId ? byID.get(current.parentNamespaceId) : undefined;
  }
  return parts.join(' / ');
}

export function localizedUserWorkflowFolderTitle(
  t: (text: string) => string,
  namespaces: AutomationNamespace[],
  id: string,
) {
  const path = namespacePath(namespaces, id);
  return path ? `${t('User workflows')} / ${path}` : t('User workflows');
}

export function splitValues(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
}

export function splitResourceKey(resourceKey: string) {
  return resourceKey ? resourceKey.split('\0').filter(Boolean) : [];
}

export function latestAutomationRunsByResource(runs: readonly AutomationExecutionRunSummary[]) {
  const latest = new Map<string,AutomationExecutionRunSummary>();
  runs.forEach((run) => {
    const current = latest.get(run.automationResourceId);
    if (!current || run.createdAt > current.createdAt || (run.createdAt === current.createdAt && run.id > current.id)) {
      latest.set(run.automationResourceId, run);
    }
  });
  return latest;
}

export function folderMessage(message: string) {
  return message
    .replace(/\bNamespaces\b/g, 'Folders')
    .replace(/\bnamespaces\b/g, 'folders')
    .replace(/\bNamespace\b/g, 'Folder')
    .replace(/\bnamespace\b/g, 'folder');
}
