export function automationCatalogTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter((tag) => !tag.startsWith('xgc.'));
}

export function mergeAutomationCatalogTags(
  existing: readonly string[] | null | undefined,
  catalogTags: readonly string[],
): string[] {
  return [...(existing ?? []).filter((tag) => tag.startsWith('xgc.')), ...catalogTags];
}

export function automationCatalogSearchTerms(document: {
  head: { resourceId: string };
  spec: { metadata: { name: string;description: string;tags: readonly string[] } };
}): string[] {
  return [
    document.spec.metadata.name,
    document.spec.metadata.description,
    document.head.resourceId,
    ...automationCatalogTags(document.spec.metadata.tags),
  ];
}
