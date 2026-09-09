import type { AutomationDocument } from './automationDefinitionContracts';

export function mergeMainDocument(items: AutomationDocument[], incoming: AutomationDocument) {
  const existing = items.find((item) => item.head.resourceId === incoming.head.resourceId);
  if (existing && existing.head.revision > incoming.head.revision) return items;
  return [incoming,...items.filter((item) => item.head.resourceId !== incoming.head.resourceId)];
}

export function mergeResourceHead(items: AutomationDocument[], incoming: AutomationDocument) {
  return items.map((item) => item.head.resourceId === incoming.head.resourceId
    && item.head.revision <= incoming.head.revision
    ? { ...item,head: incoming.head }
    : item);
}

export function nextAutomationDuplicateName(
  documents: AutomationDocument[],
  sourceName: string,
  namespaceId: string,
) {
  const base = `${sourceName.trim() || 'Automation'} copy`;
  const names = new Set(documents
    .filter((document) => (document.head.namespaceId ?? '') === namespaceId)
    .map((document) => document.spec.metadata.name.trim().toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} ${index}`.toLocaleLowerCase())) index += 1;
  return `${base} ${index}`;
}
