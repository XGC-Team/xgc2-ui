import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useGroundStationChatStore } from './GroundStationChatStore';
import {
  emptyGroundStationComposerDraft, groundStationComposerDraftKey,
  readGroundStationComposerDraft, type GroundStationComposerDraft,
} from './groundStationComposerDraft';

function browserStorage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}
function hasContent(value: GroundStationComposerDraft) {
  return Boolean(value.text || value.attachments.length || value.context.length);
}

export function useGroundStationComposerDraft(experimentId: string, draftId: string) {
  const { state, dispatch, getDraft, getDraftWriter } = useGroundStationChatStore();
  const session = useMemo(() => {
    const key = groundStationComposerDraftKey(experimentId, draftId);
    return { key, draftId, initial: readGroundStationComposerDraft(browserStorage(), key), destination: undefined as { key: string; draftId: string } | undefined };
  }, [experimentId, draftId]);
  const stored = state.drafts[session.key];
  const snapshot = stored ?? session.initial;
  useLayoutEffect(() => {
    if (!getDraft(session.key)) dispatch({ type: 'draft', key: session.key, value: session.initial });
  }, [dispatch, getDraft, session]);
  useEffect(() => {
    const writer = getDraftWriter(session.key, session.draftId);
    return () => { writer.flush(); };
  }, [getDraftWriter, session]);
  const setText = useCallback((text: string) => {
    const current = getDraft(session.key) ?? session.initial;
    if (current.text === text) return;
    const value = { ...current, text, updatedAt: Date.now() };
    dispatch({ type: 'draft', key: session.key, value });
    getDraftWriter(session.key, session.draftId).schedule(value);
  }, [dispatch, getDraft, getDraftWriter, session]);
  const clearIfUnchanged = useCallback((sent: GroundStationComposerDraft) => {
    const destination = session.destination ?? session;
    if (getDraft(destination.key) !== sent) return false;
    getDraftWriter(destination.key, destination.draftId).clear();
    dispatch({ type: 'draft', key: destination.key, value: emptyGroundStationComposerDraft() });
    return true;
  }, [dispatch, getDraft, getDraftWriter, session]);
  const promoteTo = useCallback((connectedDraftId: string) => {
    if (!session.draftId.startsWith('new:') || connectedDraftId === session.draftId) return;
    const key = groundStationComposerDraftKey(experimentId, connectedDraftId);
    const existing = getDraft(key) ?? readGroundStationComposerDraft(browserStorage(), key);
    // Never overwrite text already typed in the newly selected conversation.
    if (hasContent(existing)) return;
    const value = getDraft(session.key) ?? session.initial;
    const writer = getDraftWriter(key, connectedDraftId);
    writer.schedule(value);
    // Write the destination before removing the source; an unavailable storage
    // backend must not turn promotion into silent draft loss.
    if (!writer.flush()) return;
    session.destination = { key, draftId: connectedDraftId };
    dispatch({ type: 'draft', key, value });
    getDraftWriter(session.key, session.draftId).clear();
    dispatch({ type: 'draft', key: session.key, value: emptyGroundStationComposerDraft() });
  }, [dispatch, experimentId, getDraft, getDraftWriter, session]);
  const flush = useCallback(() => getDraftWriter(session.key, session.draftId).flush(), [getDraftWriter, session]);
  return { text: snapshot.text, snapshot, setText, clearIfUnchanged, promoteTo, flush };
}
