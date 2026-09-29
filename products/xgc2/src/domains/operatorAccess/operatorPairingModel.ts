import type { OperatorPairingIssued } from './operatorAccessTypes';

/** Consume from browser history before any network call or other UI bootstrap. */
export function takeOperatorPairingToken(): string | null {
  const fragment = window.location.hash;
  if (!fragment) return null;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  const tokens = new URLSearchParams(fragment.slice(1)).getAll('token');
  if (tokens.length !== 1 || !tokens[0] || tokens[0] !== tokens[0].trim() || tokens[0].length > 4096) return null;
  return tokens[0];
}

export function buildOperatorPairingLink(issued: OperatorPairingIssued, expectedOrigin: string): string {
  const origin = new URL(issued.publicOrigin);
  if ((origin.protocol !== 'http:' && origin.protocol !== 'https:')
    || origin.origin !== issued.publicOrigin || issued.publicOrigin !== expectedOrigin
    || origin.username || origin.password || origin.search || origin.hash
    || issued.pairingPath !== '/operator-pair' || !issued.bootstrapToken) {
    throw new Error('The pairing address does not match the selected station address.');
  }
  return `${issued.publicOrigin}/operator-pair#token=${encodeURIComponent(issued.bootstrapToken)}`;
}

export function forgetPreviousStationHeader(): void {
  // The new HttpOnly session is already established. Retaining this legacy
  // bearer would make ordinary API requests carry two conflicting identities.
  try {
    window.localStorage.removeItem('xgcStationToken');
  } catch {
    // The legacy transport cannot read a bearer when browser storage is
    // unavailable either; the confirmed HttpOnly session remains usable.
  }
}
