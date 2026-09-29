import { useCallback, useSyncExternalStore } from 'react';
import {
  confirmOperatorTransport,
  establishOperatorSessionWithRetry,
  getOperatorIdentity,
  OperatorAccessError,
  subscribeOperatorSessionCheck,
} from './operatorAccessService';
import type { OperatorIdentity } from './operatorAccessTypes';

// Robot motion/control is fenced behind a verified operator session, but the
// station shell itself never gates on it. 'denied' is only a definitive
// unauthenticated answer from the session authority; 'unavailable' means the
// station could not answer (network hiccup, Core restart) and says nothing
// about the session itself. Both disable control affordances inline with a
// retry; neither ever navigates away or replaces the page.
export type OperatorControlSessionPhase = 'idle' | 'ensuring' | 'ready' | 'denied' | 'unavailable';

export type OperatorControlSessionSnapshot = { phase: OperatorControlSessionPhase };

let snapshot: OperatorControlSessionSnapshot = { phase: 'idle' };
const listeners = new Set<() => void>();
let inFlight: Promise<boolean> | null = null;
let probeInFlight: Promise<void> | null = null;
let validating = false;
let subscribed = false;
// A sign-out invalidates an in-flight establish so its late answer cannot
// resurrect a session the operator deliberately ended.
let generation = 0;

function setPhase(phase: OperatorControlSessionPhase) {
  if (snapshot.phase === phase) return;
  snapshot = { phase };
  for (const listener of listeners) listener();
}

function subscribeReports() {
  if (subscribed) return;
  subscribed = true;
  subscribeOperatorSessionCheck(() => {
    // Any business endpoint may 401. Only a fresh, successful answer from the
    // session authority can end a confirmed control session; everything else
    // is 'unknown' and leaves the current phase untouched.
    if (snapshot.phase !== 'ready' || validating) return;
    validating = true;
    void getOperatorIdentity()
      .then((identity) => {
        if (acceptIdentity(identity)) return;
        setPhase('denied');
      })
      .catch(() => undefined)
      .finally(() => { validating = false; });
  });
}

function acceptIdentity(identity: OperatorIdentity): boolean {
  if (!identity.authenticated || !['local', 'header', 'operator-cookie'].includes(identity.transport)) return false;
  confirmOperatorTransport(identity.transport);
  return true;
}

/** Verify (or establish) the operator session before a motion/control command. */
export function ensureOperatorControlSession(): Promise<boolean> {
  if (snapshot.phase === 'ready') return Promise.resolve(true);
  if (inFlight) return inFlight;
  subscribeReports();
  setPhase('ensuring');
  const gen = generation;
  inFlight = establishWithRetry(gen).finally(() => { inFlight = null; });
  return inFlight;
}

async function establishWithRetry(gen: number): Promise<boolean> {
  const fresh = () => gen === generation;
  try {
    const identity = await establishOperatorSessionWithRetry();
    if (!fresh()) return false;
    if (acceptIdentity(identity)) {
      setPhase('ready');
      return true;
    }
    // The session authority answered: this browser is definitively signed out.
    setPhase('denied');
    return false;
  } catch (error) {
    if (!fresh()) return false;
    if (error instanceof OperatorAccessError && (error.status === 401 || error.status === 403)) {
      setPhase('denied');
      return false;
    }
    // Network failures and 5xx are 'unknown', never 'denied'.
    setPhase('unavailable');
    return false;
  }
}

/**
 * Non-blocking startup probe. Confirms the request transport for an already
 * authenticated browser so stale stored headers are not mixed into requests;
 * never establishes a session and never blocks the shell.
 */
export function probeOperatorControlSession(): void {
  if (probeInFlight) return;
  subscribeReports();
  probeInFlight = getOperatorIdentity()
    .then((identity) => { acceptIdentity(identity); })
    .catch(() => undefined)
    .finally(() => { probeInFlight = null; });
}

/** A deliberate sign-out ends the control session without another round trip. */
export function noteOperatorSessionEnded() {
  generation += 1;
  inFlight = null;
  setPhase('denied');
}

/** Synchronous check for hot paths that must not wait on a resolved session. */
export function operatorControlSessionReady(): boolean {
  return snapshot.phase === 'ready';
}

export function getOperatorControlSessionSnapshot(): OperatorControlSessionSnapshot {
  return snapshot;
}

export function subscribeOperatorControlSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test hook: restore the module as if the page had just loaded. */
export function resetOperatorControlSession() {
  generation += 1;
  inFlight = null;
  probeInFlight = null;
  validating = false;
  setPhase('idle');
}

export function useOperatorControlSession() {
  const state = useSyncExternalStore(subscribeOperatorControlSession, getOperatorControlSessionSnapshot);
  const retry = useCallback(() => { void ensureOperatorControlSession(); }, []);
  return {
    phase: state.phase,
    ensuring: state.phase === 'ensuring',
    blocked: state.phase === 'denied' || state.phase === 'unavailable',
    retry,
  };
}
