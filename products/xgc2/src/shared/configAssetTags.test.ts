import { describe,expect,it } from 'vitest';
import {
  canAddConfigAssetTag,
  configAssetTagsIssue,
  MAX_CONFIG_ASSET_TAG_RUNES,
  MAX_CONFIG_ASSET_TAGS,
  normalizeConfigAssetTags,
  parseConfigAssetTags,
} from './configAssetTags';

describe('configAssetTags', () => {
  it('normalizes and sorts tags', () => {
    expect(normalizeConfigAssetTags([' beta ', 'alpha', 'beta', ' '])).toEqual(['alpha', 'beta']);
    expect(parseConfigAssetTags(' flight , sim,flight ')).toEqual(['flight', 'sim']);
  });

  it('enforces count and rune ceilings and rejects seed-style dots', () => {
    expect(configAssetTagsIssue(['a', 'b', 'c', 'd', 'e'])).toBe('');
    expect(configAssetTagsIssue(['a', 'b', 'c', 'd', 'e', 'f'])).toContain(String(MAX_CONFIG_ASSET_TAGS));
    expect(configAssetTagsIssue(['12345678901'])).toContain(String(MAX_CONFIG_ASSET_TAG_RUNES));
    expect(configAssetTagsIssue(['xgc.seed'])).toContain('.');
    expect(configAssetTagsIssue(['simulation'])).toBe('');
    expect(configAssetTagsIssue(['built-in', 'template'])).toBe('');
  });

  it('blocks add when the tag is invalid, duplicate, or the set is full', () => {
    expect(canAddConfigAssetTag(['a'], 'xgc.seed.px4')).not.toBe('');
    expect(canAddConfigAssetTag(['flight'], 'flight')).toContain('already');
    expect(canAddConfigAssetTag(['a', 'b', 'c', 'd', 'e'], 'f')).toContain(String(MAX_CONFIG_ASSET_TAGS));
    expect(canAddConfigAssetTag(['a'], 'sim')).toBe('');
  });
});
