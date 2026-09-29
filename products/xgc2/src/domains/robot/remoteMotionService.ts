import { HTTPError } from '../../api/http';

/** Shared-entry motion conflict. Distinct from the station robot-motion-intent poster. */
export function isRemoteMotionHeld(error: unknown): boolean {
  return error instanceof HTTPError && error.status === 409
    && typeof error.body === 'object' && error.body !== null
    && (error.body as { code?: unknown }).code === 'motion_held';
}

export function remoteMotionHeldError(body: { error: string; code: 'motion_held' }): HTTPError {
  return new HTTPError(409, 'Conflict', body);
}
