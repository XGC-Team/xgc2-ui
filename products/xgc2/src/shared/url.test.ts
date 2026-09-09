import { describe,expect,it } from 'vitest';
import { clampLimit,queryString,segment } from './url';

describe('shared URL helpers', () => {
  it('encodes path segments', () => {
    expect(segment('a/b c')).toBe('a%2Fb%20c');
    expect(segment(42)).toBe('42');
  });

  it('builds query strings and skips empty values', () => {
    expect(queryString({ path: '/tmp/a b', hidden: true, search: 'x/y', empty: undefined, none: null })).toBe(
      '?path=%2Ftmp%2Fa+b&hidden=true&search=x%2Fy',
    );
    expect(queryString({ empty: undefined })).toBe('');
  });

  it('clamps numeric request limits', () => {
    expect(clampLimit(undefined)).toBe(200);
    expect(clampLimit(Number.NaN)).toBe(200);
    expect(clampLimit(-1)).toBe(1);
    expect(clampLimit(12.8)).toBe(12);
    expect(clampLimit(999999)).toBe(5000);
  });
});
