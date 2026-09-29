import { requestCookieResponse, requestStationResponse, waitForTransportRetry } from '../../api/http';
import type { OperatorIdentity, OperatorPairingIssued, OperatorPairingOptions } from './operatorAccessTypes';

/** Carries the HTTP status so callers can tell a definitive refusal (401/403) from a network failure. */
export class OperatorAccessError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OperatorAccessError';
    this.status = status;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: string } | undefined;
    throw new OperatorAccessError(response.status, body?.error || `Operator session request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function getOperatorPairingOptions(): Promise<OperatorPairingOptions> {
  return readResponse(await requestStationResponse('/api/access/operator-pairing-options'));
}

export async function issueOperatorPairing(stationId: string, host: string): Promise<OperatorPairingIssued> {
  return readResponse(await requestStationResponse('/api/access/operator-pairings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stationId, host }),
  }));
}

export async function bootstrapOperatorSession(token: string): Promise<OperatorIdentity> {
  const identity = await readResponse<OperatorIdentity>(await requestCookieResponse('/api/access/operator-session/bootstrap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  }));
  if (!identity.authenticated || identity.transport !== 'operator-cookie') {
    throw new Error('The station did not establish an operator session.');
  }
  return identity;
}

export async function getOperatorIdentity(): Promise<OperatorIdentity> {
  return readResponse(await requestStationResponse('/api/access/sessions/current'));
}

/** Local trust must become an individual session before motion clients mount. */
export async function establishOperatorIdentity(): Promise<OperatorIdentity> {
  const identity = await getOperatorIdentity();
  if (!identity.authenticated || identity.transport !== 'local') return identity;
  const session = await readResponse<OperatorIdentity>(await requestStationResponse('/api/access/operator-session/local', {
    method: 'POST',
  }));
  if (!session.authenticated || session.transport !== 'operator-cookie') {
    throw new Error('The station did not establish a local operator session.');
  }
  return session;
}

// Three attempts land inside ~2s of backoff; jitter keeps recovering stations
// from being hit in lockstep by every open control surface.
const ESTABLISH_RETRY_DELAYS_MS = [700, 1300] as const;

/**
 * Establish the operator session with jittered retry. A definitive refusal
 * (401/403 from the session authority) fails fast; transient network or 5xx
 * failures exhaust every attempt before the last one is rethrown, so callers
 * can treat them as 'unknown' rather than 'denied'.
 */
export async function establishOperatorSessionWithRetry(): Promise<OperatorIdentity> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= ESTABLISH_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const delay = ESTABLISH_RETRY_DELAYS_MS[attempt - 1]!;
      await waitForTransportRetry(delay * (0.75 + Math.random() * 0.5));
    }
    try {
      return await establishOperatorIdentity();
    } catch (error) {
      if (error instanceof OperatorAccessError && (error.status === 401 || error.status === 403)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function deleteOperatorSession(): Promise<void> {
  return readResponse(await requestStationResponse('/api/access/sessions/current', { method: 'DELETE' }));
}

// UI consumes the identity service; the request transport remains API-owned.
export {
  confirmStationTransport as confirmOperatorTransport,
  resetStationTransport as resetOperatorTransport,
  subscribeStationUnauthorized as subscribeOperatorSessionCheck,
} from '../../api/stationTransport';
