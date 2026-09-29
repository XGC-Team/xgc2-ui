import { HTTPError, requestCookieResponse } from '../../../api/http';
import { sharedSurfaceErrorBody } from './sharedSurfaceService';

export type AccessEntryLeaveReceipt = {
  participantId: string;
  status: 'revoked';
  cleanupPending: boolean;
};

/** Revoke this cookie session at its listener, never a station-wide credential. */
export async function leaveAccessEntry(signal?: AbortSignal): Promise<AccessEntryLeaveReceipt> {
  const response = await requestCookieResponse('/api/access/entry/session', {
    method: 'DELETE', signal, cache: 'no-store', headers: new Headers({ Accept: 'application/json' }),
  });
  if (response.status !== 200 && response.status !== 202) {
    throw new HTTPError(response.status, response.statusText, await sharedSurfaceErrorBody(response));
  }
  const receipt: unknown = await response.json();
  if (!receipt || typeof receipt !== 'object' || !('participantId' in receipt)
    || typeof receipt.participantId !== 'string' || !receipt.participantId
    || !('status' in receipt) || receipt.status !== 'revoked'
    || !('cleanupPending' in receipt) || typeof receipt.cleanupPending !== 'boolean'
    || receipt.cleanupPending !== (response.status === 202)) {
    throw new Error('Sharing exit did not return a valid revocation receipt.');
  }
  return { participantId: receipt.participantId, status: 'revoked', cleanupPending: receipt.cleanupPending };
}
