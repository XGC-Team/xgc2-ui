import { describe,expect,it } from 'vitest';
import {
  isUsernodePlumbingTag,
  mergeUsernodeCatalogTags,
  usernodeCatalogTags,
} from './usernodeCatalogTags';

describe('usernodeCatalogTags', () => {
  it('hides catalog fixture and order plumbing from the operator surface', () => {
    expect(usernodeCatalogTags(['fs150', 'order-5', 'lab'])).toEqual(['lab']);
    expect(usernodeCatalogTags(['fs150', 'order-1'])).toEqual([]);
    expect(usernodeCatalogTags(['scan', 'night'])).toEqual(['scan', 'night']);
  });

  it('treats only fixtureTag and order-N as plumbing, not folder names', () => {
    expect(isUsernodePlumbingTag('fs150')).toBe(true);
    expect(isUsernodePlumbingTag('order-5')).toBe(true);
    expect(isUsernodePlumbingTag('order-')).toBe(false);
    expect(isUsernodePlumbingTag('FS150')).toBe(false);
    expect(isUsernodePlumbingTag('Scout')).toBe(false);
  });

  it('keeps plumbing when merging operator catalog tags', () => {
    expect(mergeUsernodeCatalogTags(
      ['fs150', 'order-5', 'stale'],
      ['lab'],
    )).toEqual(['fs150', 'order-5', 'lab']);
  });

  it('drops plumbing the operator tries to re-author as a visible tag', () => {
    expect(mergeUsernodeCatalogTags(
      ['fs150', 'order-5'],
      ['fs150', 'order-7', 'lab'],
    )).toEqual(['fs150', 'order-5', 'lab']);
  });
});
