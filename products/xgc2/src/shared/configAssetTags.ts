/**
 * Shared config-asset tag policy. Mirrors core-xgc/internal/configuration/tags.go
 * so the browser rejects the same inputs the Core will refuse on commit.
 *
 * Tags are short operator labels for filtering — not workflow seed markers.
 */
export const MAX_CONFIG_ASSET_TAGS = 5;
export const MAX_CONFIG_ASSET_TAG_RUNES = 10;

export function normalizeConfigAssetTag(value: string): string {
  return value.trim();
}

export function normalizeConfigAssetTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = normalizeConfigAssetTag(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.sort((left, right) => left.localeCompare(right));
}

/** Comma-separated authoring field → normalized tag list (may still be invalid). */
export function parseConfigAssetTags(value: string): string[] {
  return normalizeConfigAssetTags(value.split(','));
}

export function configAssetTagIssue(tag: string): string {
  const value = normalizeConfigAssetTag(tag);
  if (!value) return 'Tag is empty.';
  if ([...value].length > MAX_CONFIG_ASSET_TAG_RUNES) {
    return `Tag must be at most ${MAX_CONFIG_ASSET_TAG_RUNES} characters.`;
  }
  if (value.includes('.')) {
    return 'Tag must not contain \'.\'.';
  }
  if (value.includes('\0')) {
    return 'Tag contains a forbidden character.';
  }
  return '';
}

export function configAssetTagsIssue(tags: readonly string[]): string {
  const normalized = normalizeConfigAssetTags(tags);
  if (normalized.length > MAX_CONFIG_ASSET_TAGS) {
    return `At most ${MAX_CONFIG_ASSET_TAGS} tags are allowed.`;
  }
  for (const tag of normalized) {
    const issue = configAssetTagIssue(tag);
    if (issue) return issue;
  }
  return '';
}

export function canAddConfigAssetTag(existing: readonly string[], candidate: string): string {
  const value = normalizeConfigAssetTag(candidate);
  const tagIssue = configAssetTagIssue(value);
  if (tagIssue) return tagIssue;
  if (existing.includes(value)) return 'Tag already exists.';
  if (existing.length >= MAX_CONFIG_ASSET_TAGS) {
    return `At most ${MAX_CONFIG_ASSET_TAGS} tags are allowed.`;
  }
  return '';
}
