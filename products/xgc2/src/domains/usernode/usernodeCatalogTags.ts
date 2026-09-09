/**
 * Catalog provision identities are not operator tags.
 * `order-N` keeps folder configuration order (P40). `fixtureTag` is the
 * catalog.json provision marker (currently `fs150` for the whole tree,
 * including Common / Scout / Wheeltec) — not a vehicle-folder name.
 */
export const USERNODE_CATALOG_FIXTURE_TAG = 'fs150';

const ORDER_TAG = /^order-\d+$/;

export function isUsernodePlumbingTag(tag: string): boolean {
  return tag === USERNODE_CATALOG_FIXTURE_TAG || ORDER_TAG.test(tag);
}

export function usernodeCatalogTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter((tag) => !isUsernodePlumbingTag(tag));
}

export function mergeUsernodeCatalogTags(
  existing: readonly string[] | null | undefined,
  catalogTags: readonly string[],
): string[] {
  return [
    ...(existing ?? []).filter(isUsernodePlumbingTag),
    ...catalogTags.filter((tag) => !isUsernodePlumbingTag(tag)),
  ];
}
