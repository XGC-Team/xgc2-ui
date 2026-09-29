import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAccessEntry,
  listAccessEntries,
  listAccessEntryParticipants,
  revokeAccessEntry,
  revokeAccessEntryParticipant,
  rotateAccessEntryBootstrap,
  startAccessEntry,
  stopAccessEntry,
} from './accessService';
import type { AccessEntry, AccessEntryIssued, AccessEntryParticipant, CreateAccessEntryBody } from './accessTypes';

/**
 * Failure reasons are category codes, never raw exception text; the page maps
 * them to localized operator copy. Action failures carry the entry id so a
 * late failure is never attributed to a different selected share.
 */
export type AccessEntriesFailure = '' | 'load' | 'action' | 'create';
export type AccessEntriesActionFailure = { id: string; reason: 'action' } | null;

export type AccessEntriesState = {
  entries: AccessEntry[];
  loading: boolean;
  /** List load/refresh failure category. */
  error: AccessEntriesFailure;
  /** Failure of a start/stop/rotate/revoke, attributed to one entry. */
  actionError: AccessEntriesActionFailure;
  /** Failure of the last create attempt; rendered inside the create drawer. */
  createError: AccessEntriesFailure;
  busyId: string;
  refresh: () => Promise<void>;
  clearActionError: () => void;
  clearCreateError: () => void;
  create: (body: CreateAccessEntryBody) => Promise<AccessEntryIssued | undefined>;
  start: (entryId: string) => Promise<AccessEntryIssued | undefined>;
  stop: (entryId: string) => Promise<AccessEntry | undefined>;
  rotate: (entryId: string) => Promise<AccessEntryIssued | undefined>;
  revoke: (entryId: string) => Promise<boolean | undefined>;
};

export function useAccessEntries(): AccessEntriesState {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AccessEntriesFailure>('');
  const [actionError, setActionError] = useState<AccessEntriesActionFailure>(null);
  const [createError, setCreateError] = useState<AccessEntriesFailure>('');
  const [busyId, setBusyId] = useState('');
  const mounted = useRef(true);
  // Every locally applied mutation bumps the revision; every list GET takes a
  // request ticket. A GET applies only when it is still the latest request and
  // no mutation landed while it was in flight, so neither a stale response nor
  // an older in-flight GET can overwrite newer state.
  const revision = useRef(0);
  const requestTicket = useRef(0);
  const busy = useRef('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const snapshot = revision.current;
    const ticket = ++requestTicket.current;
    try {
      const next = await listAccessEntries();
      if (mounted.current && ticket === requestTicket.current && snapshot === revision.current) {
        setEntries(next);
        setError('');
      }
    } catch (cause) {
      console.error('access entries load failed', cause);
      if (mounted.current && ticket === requestTicket.current && snapshot === revision.current) {
        setError('load');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyEntry = useCallback((entry: AccessEntry) => {
    revision.current += 1;
    setEntries((current) => {
      const index = current.findIndex((item) => item.id === entry.id);
      if (index === -1) return [...current, entry];
      const next = [...current];
      next[index] = entry;
      return next;
    });
  }, []);

  const projectEntry = useCallback((entryId: string, patch: Partial<AccessEntry>) => {
    revision.current += 1;
    setEntries((current) => current.map((item) => (
      item.id === entryId ? { ...item, ...patch } : item
    )));
  }, []);

  const act = useCallback(async <T,>(
    entryId: string,
    action: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = entryId;
    setBusyId(entryId);
    setActionError(null);
    try {
      const result = await action();
      apply(result);
      void refresh();
      return result;
    } catch (cause) {
      console.error('access entry action failed', cause);
      if (mounted.current) setActionError({ id: entryId, reason: 'action' });
      return undefined;
    } finally {
      busy.current = '';
      if (mounted.current) setBusyId('');
    }
  }, [refresh]);

  const create = useCallback(async (body: CreateAccessEntryBody) => {
    if (busy.current) return undefined;
    busy.current = 'new';
    setBusyId('new');
    setCreateError('');
    try {
      const issued = await createAccessEntry(body);
      applyEntry(issued.entry);
      void refresh();
      return issued;
    } catch (cause) {
      console.error('access entry create failed', cause);
      if (mounted.current) setCreateError('create');
      return undefined;
    } finally {
      busy.current = '';
      if (mounted.current) setBusyId('');
    }
  }, [applyEntry, refresh]);

  const clearActionError = useCallback(() => setActionError(null), []);
  const clearCreateError = useCallback(() => setCreateError(''), []);

  return {
    entries,
    loading,
    error,
    actionError,
    createError,
    busyId,
    refresh,
    clearActionError,
    clearCreateError,
    create,
    start: useCallback((entryId: string) => act(
      entryId,
      () => startAccessEntry(entryId),
      (issued) => applyEntry(issued.entry),
    ), [act, applyEntry]),
    stop: useCallback((entryId: string) => act(
      entryId,
      () => stopAccessEntry(entryId),
      applyEntry,
    ), [act, applyEntry]),
    rotate: useCallback((entryId: string) => act(
      entryId,
      () => rotateAccessEntryBootstrap(entryId),
      (issued) => applyEntry(issued.entry),
    ), [act, applyEntry]),
    revoke: useCallback((entryId: string) => act(
      entryId,
      async () => {
        await revokeAccessEntry(entryId);
        return true;
      },
      () => projectEntry(entryId, { status: 'revoked' }),
    ), [act, projectEntry]),
  };
}

export type AccessEntryParticipantsState = {
  /** Null until the first read for this entry settles. */
  participants: AccessEntryParticipant[] | null;
  /** The last read or removal failed; the page shows a category message. */
  failed: boolean;
  /** Remove one visitor, then re-read the participant list. */
  remove: (participantId: string) => void;
};

/** Visitors of one running share entry: read on mount and after each removal. */
export function useAccessEntryParticipants(entryId: string): AccessEntryParticipantsState {
  const [participants, setParticipants] = useState<AccessEntryParticipant[] | null>(null);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    listAccessEntryParticipants(entryId)
      .then((rows) => { if (alive) setParticipants(rows); })
      .catch(() => {
        if (!alive) return;
        setParticipants([]);
        setFailed(true);
      });
    return () => { alive = false; };
  }, [entryId, tick]);
  const remove = useCallback((participantId: string) => {
    void revokeAccessEntryParticipant(entryId, participantId)
      .then(() => setTick((current) => current + 1))
      .catch(() => setFailed(true));
  }, [entryId]);
  return { participants, failed, remove };
}
