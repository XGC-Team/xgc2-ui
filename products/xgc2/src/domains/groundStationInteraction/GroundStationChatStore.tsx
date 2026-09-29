/* eslint-disable react-refresh/only-export-components -- Context, reducer and selector form the domain store API. */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { AgentItem } from '@xgc2/agent-runtime/state';
import type { AgentOptimisticMessage, AgentTimelineState } from '@xgc2/agent-runtime/react';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import { GroundStationDraftPersistence, type GroundStationComposerDraft } from './groundStationComposerDraft';

export type GroundStationChatUIState = AgentTimelineState & { sendError?: string; draftStorageError?: string };
export type GroundStationChatLocalState = {
  drafts: Readonly<Record<string, GroundStationComposerDraft>>;
  uiState: Readonly<Record<string, GroundStationChatUIState>>;
};
export type GroundStationChatProjection = {
  /** Borrowed reference to conversation.state.items; never independently reduced. */
  canonicalMessages: readonly AgentItem[];
  /** Borrowed projection of the existing prompt queue/outbox. */
  optimisticMessages: readonly AgentOptimisticMessage[];
  pendingDecisions: readonly GroundStationDecisionInteraction[];
};
export type GroundStationChatState = GroundStationChatLocalState & GroundStationChatProjection;
export type GroundStationChatAction =
  | { type: 'draft'; key: string; value: GroundStationComposerDraft }
  | { type: 'ui'; draftId: string; patch: Partial<GroundStationChatUIState> };

export const EMPTY_GROUND_STATION_CHAT_UI: GroundStationChatUIState = { pinnedToBottom: true, expandedItems: {} };
export function groundStationChatReducer(state: GroundStationChatLocalState, action: GroundStationChatAction): GroundStationChatLocalState {
  if (action.type === 'draft') {
    if (state.drafts[action.key] === action.value) return state;
    return { ...state, drafts: { ...state.drafts, [action.key]: action.value } };
  }
  const current = state.uiState[action.draftId] ?? EMPTY_GROUND_STATION_CHAT_UI;
  if (Object.entries(action.patch).every(([key, value]) => current[key as keyof GroundStationChatUIState] === value)) return state;
  return { ...state, uiState: { ...state.uiState, [action.draftId]: { ...current, ...action.patch } } };
}

const GroundStationChatContext = createContext<{
  state: GroundStationChatState;
  dispatch: Dispatch<GroundStationChatAction>;
  getDraft: (key: string) => GroundStationComposerDraft | undefined;
  getDraftWriter: (key: string, draftId: string) => GroundStationDraftPersistence;
} | undefined>(undefined);

/** Only local UI/drafts use a reducer; canonical/native journals keep their one owner. */
export function GroundStationChatStore({ canonicalMessages, optimisticMessages, pendingDecisions, children }: GroundStationChatProjection & { children: ReactNode }) {
  const [local, reduce] = useReducer(groundStationChatReducer, { drafts: {}, uiState: {} });
  // Async acknowledgements must see the last input event, even before React has
  // committed a batched render. This ref follows the same local reducer actions;
  // canonical/native data is never copied into it.
  const currentLocal = useRef(local);
  const dispatch = useCallback<Dispatch<GroundStationChatAction>>(action => {
    currentLocal.current = groundStationChatReducer(currentLocal.current, action);
    reduce(action);
  }, []);
  const getDraft = useCallback((key: string) => currentLocal.current.drafts[key], []);
  // IO buffers only. One writer per key lets an old send completion cancel the
  // actual pending timer after a new-conversation draft is promoted to a session.
  const writers = useRef(new Map<string, GroundStationDraftPersistence>());
  const getDraftWriter = useCallback((key: string, draftId: string) => {
    let writer = writers.current.get(key);
    if (!writer) {
      let storage: Storage | undefined;
      try { storage = typeof window === 'undefined' ? undefined : window.localStorage; } catch { /* Report on flush. */ }
      writer = new GroundStationDraftPersistence(storage, key, message => {
        dispatch({ type: 'ui', draftId, patch: { draftStorageError: message || undefined } });
      });
      writers.current.set(key, writer);
    }
    return writer;
  }, [dispatch]);
  useEffect(() => {
    const buffers = writers.current;
    const flush = () => { for (const writer of buffers.values()) writer.flush(); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, []);
  const state = useMemo(() => ({ ...local, canonicalMessages, optimisticMessages, pendingDecisions }),
    [local, canonicalMessages, optimisticMessages, pendingDecisions]);
  const value = useMemo(() => ({ state, dispatch, getDraft, getDraftWriter }), [state, dispatch, getDraft, getDraftWriter]);
  return <GroundStationChatContext.Provider value={value}>{children}</GroundStationChatContext.Provider>;
}

export function useGroundStationChatStore() {
  const value = useContext(GroundStationChatContext);
  if (!value) throw new Error('Ground station chat requires GroundStationChatStore.');
  return value;
}
