import { describe,expect,it } from 'vitest';
import { formatBytes,formatDuration,formatTimestamp } from './homeFormat';

describe('homeFormat', () => {
  it('formats byte sizes with adaptive units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('formats durations as minutes/seconds and hours when needed', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(48_000)).toBe('0:48');
    expect(formatDuration(134_000)).toBe('2:14');
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('returns the raw value for an unparseable timestamp', () => {
    expect(formatTimestamp('not-a-date', 'en-US')).toBe('not-a-date');
    expect(formatTimestamp('2026-07-18T02:14:00.000Z', 'zh-CN')).not.toBe('');
  });
});
