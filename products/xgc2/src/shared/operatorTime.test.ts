import { describe,expect,it } from 'vitest';
import {
  formatOperatorDateTime,
  sameOperatorDay,
  setResolvedOperatorTimeZone,
} from './operatorTime';

describe('operatorTime', () => {
  it('formats UTC instants in the resolved operator zone', () => {
    setResolvedOperatorTimeZone('Asia/Shanghai');
    expect(formatOperatorDateTime('2026-09-21T10:22:17.000Z', 'en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })).toMatch(/18:22/);
    setResolvedOperatorTimeZone('UTC');
    expect(formatOperatorDateTime('2026-09-21T10:22:17.000Z', 'en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })).toMatch(/10:22/);
  });

  it('compares calendar days in the resolved zone, not UTC', () => {
    setResolvedOperatorTimeZone('Asia/Shanghai');
    const lateUtc = new Date('2026-09-21T16:30:00.000Z');
    const nextUtcMorning = new Date('2026-09-21T17:30:00.000Z');
    expect(sameOperatorDay(lateUtc, new Date('2026-09-21T10:00:00.000Z'))).toBe(false);
    expect(sameOperatorDay(nextUtcMorning, new Date('2026-09-21T20:00:00.000Z'))).toBe(true);
  });
});
