import { useCallback, useEffect, useRef, useState } from 'react';
import { useProductWebComposition } from '../../../shared/productWebComposition';
import type { SharedSurfaceClient, SharedSurfaceContribution, SharedSurfaceProjection } from '../../../shared/sharedSurface';
import { bootstrapAccessEntry, getAccessEntryProjection, openAccessEntryEvents, takeAccessEntryFragmentToken } from './accessEntryService';
import { leaveAccessEntry } from './accessEntryParticipantService';
import { createSharedSurfaceClient } from './sharedSurfaceService';
import { decodeSharedSurfaceProjection, sharedSurfaceIdentity } from './sharedSurfaceDecoder';

const NO_SHARED_SURFACES: readonly SharedSurfaceContribution[] = [];
type ReadySurface = {
  phase: 'ready';
  projection: SharedSurfaceProjection;
  contribution: SharedSurfaceContribution;
  client: SharedSurfaceClient;
};
type EntryState = ReadySurface
  | { phase: 'connecting' | 'denied' | 'closed' | 'leaving' }
  | { phase: 'left'; cleanupPending: boolean }
  | { phase: 'leave-error' };

/** Owns the one-time exchange, scoped transport and terminal connection lifetime. */
export function useSharedSurfaceEntry() {
  const sharedSurfaces = useProductWebComposition().sharedSurfaces ?? NO_SHARED_SURFACES;
  const [state, setState] = useState<EntryState>({ phase: 'connecting' });
  // StrictMode must reuse the one-time exchange rather than racing a bare GET against Set-Cookie.
  const exchangeRef = useRef<Promise<SharedSurfaceProjection> | null>(null);
  const terminalRef = useRef(false);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    terminalRef.current = true;
    // Unmount local controls/media immediately; only the server receipt can
    // establish durable revocation and whether physical cleanup is complete.
    setState({ phase: 'leaving' });
    try {
      const receipt = await leaveAccessEntry();
      if (mountedRef.current) setState({ phase: 'left', cleanupPending: receipt.cleanupPending });
    } catch {
      if (mountedRef.current) setState({ phase: 'leave-error' });
    } finally {
      leavingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (terminalRef.current) return undefined;
    if (!exchangeRef.current) {
      const token = takeAccessEntryFragmentToken();
      exchangeRef.current = token ? bootstrapAccessEntry(token) : getAccessEntryProjection();
    }
    let alive = true;
    exchangeRef.current.then((value) => {
      if (!alive || terminalRef.current) return;
      const projection = decodeSharedSurfaceProjection(value);
      const matches = sharedSurfaces.filter((owner) => owner.moduleId === projection.moduleId
        && owner.viewContractVersion === projection.viewContractVersion);
      if (matches.length !== 1) throw new Error('This shared surface is not included in this station.');
      setState({ phase: 'ready', projection, contribution: matches[0]!, client: createSharedSurfaceClient(projection) });
    }).catch(() => {
      if (alive) {
        terminalRef.current = true;
        setState({ phase: 'denied' });
      }
    });
    return () => { alive = false; };
  }, [sharedSurfaces]);

  const active = state.phase === 'ready' ? state : null;
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const identity = sharedSurfaceIdentity(active.projection);
    const close = () => {
      if (!alive || terminalRef.current) return;
      alive = false;
      terminalRef.current = true;
      setState({ phase: 'closed' });
    };
    const events = openAccessEntryEvents(active.client, {
      onProjection: (value) => {
        if (!alive) return;
        try {
          if (sharedSurfaceIdentity(decodeSharedSurfaceProjection(value)) !== identity) close();
        } catch {
          close();
        }
      },
      onClosed: close,
    });
    return () => {
      alive = false;
      events.close();
    };
  }, [active]);

  return { state, active, leave };
}
