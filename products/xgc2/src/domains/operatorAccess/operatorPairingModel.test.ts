// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildOperatorPairingLink, takeOperatorPairingToken } from './operatorPairingModel';
import type { OperatorPairingIssued } from './operatorAccessTypes';

const issued: OperatorPairingIssued = {
  publicOrigin: 'http://192.168.51.251:5174', pairingPath: '/operator-pair', bootstrapToken: 'once/only', bootstrapExpiresAt: '2026-09-19T12:00:00Z',
  station: { stationId: 'station-main', name: 'Main', role: 'owner', capabilities: ['core.view'], visibleCores: ['local'] },
};

describe('operator pairing link boundary', () => {
  it('takes the fragment once and immediately removes it from browser history', () => {
    window.history.replaceState({ preserve: true }, '', '/operator-pair#token=one%2Fuse');
    expect(takeOperatorPairingToken()).toBe('one/use');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toEqual({ preserve: true });
    expect(takeOperatorPairingToken()).toBeNull();
  });
  it('refuses duplicate fragment credentials and does not consume query credentials', () => {
    window.history.replaceState(null, '', '/operator-pair#token=a&token=b');
    expect(takeOperatorPairingToken()).toBeNull();
    expect(window.location.hash).toBe('');
    window.history.replaceState(null, '', '/operator-pair?token=query-secret');
    expect(takeOperatorPairingToken()).toBeNull();
  });
  it('uses the exact reported public origin and confines the token to a fragment', () => {
    const link = new URL(buildOperatorPairingLink(issued, issued.publicOrigin));
    expect(link.origin).toBe(issued.publicOrigin);
    expect(link.pathname).toBe('/operator-pair');
    expect(link.search).toBe('');
    expect(link.hash).toBe('#token=once%2Fonly');
  });
  it.each(['http://evil.test:5174', 'http://user@192.168.51.251:5174', 'http://192.168.51.251:5174/wrong', 'http://192.168.51.251:5174?token=x', 'javascript:alert(1)'])('rejects unselected or malformed origin %s', (publicOrigin) => {
    expect(() => buildOperatorPairingLink({ ...issued, publicOrigin }, issued.publicOrigin)).toThrow();
  });
});
