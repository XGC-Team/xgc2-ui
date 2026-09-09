import { describe,expect,it } from 'vitest';
import { containerTableRangeSummary } from './containerTableRangeSummary';

describe('containerTableRangeSummary', () => {
  it('omits a zero selection count so the left footer stays short', () => {
    expect(containerTableRangeSummary({
      total: 5,
      rangeStart: 1,
      rangeEnd: 5,
      selectedCount: 0,
      emptyLabel: '0 volumes',
    })).toBe('Showing 1–5 of 5');
  });

  it('prefixes a non-zero selection count', () => {
    expect(containerTableRangeSummary({
      total: 13,
      rangeStart: 1,
      rangeEnd: 13,
      selectedCount: 2,
      emptyLabel: '0 networks',
    })).toBe('2 selected · Showing 1–13 of 13');
  });

  it('uses the empty label when there are no rows', () => {
    expect(containerTableRangeSummary({
      total: 0,
      rangeStart: 0,
      rangeEnd: 0,
      selectedCount: 0,
      emptyLabel: '0 images',
    })).toBe('0 images');
  });
});
