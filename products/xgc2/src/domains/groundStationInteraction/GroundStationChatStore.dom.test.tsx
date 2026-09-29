// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyStream } from '@xgc2/agent-runtime/state';
import { GroundStationChatStore, groundStationChatReducer, useGroundStationChatStore } from './GroundStationChatStore';
import { emptyGroundStationComposerDraft } from './groundStationComposerDraft';

afterEach(cleanup);
describe('GroundStationChatStore layers', () => {
  it('borrows canonical and optimistic references while the reducer owns only local state', () => {
    const conversation = emptyStream('s', 'codex');
    const optimistic = [{ id: 'o', text: 'pending', status: 'pending' as const }];
    let current!: ReturnType<typeof useGroundStationChatStore>;
    function Read() { current = useGroundStationChatStore(); return null; }
    const view = render(<GroundStationChatStore canonicalMessages={conversation.items} optimisticMessages={optimistic} pendingDecisions={[]}><Read /></GroundStationChatStore>);
    expect(current.state.canonicalMessages).toBe(conversation.items);
    expect(current.state.optimisticMessages).toBe(optimistic);
    act(() => current.dispatch({ type: 'draft', key: 's', value: { ...emptyGroundStationComposerDraft(), text: 'draft' } }));
    expect(current.state.drafts.s?.text).toBe('draft');
    expect(current.state.canonicalMessages).toBe(conversation.items);
    const replacement = [...conversation.items];
    view.rerender(<GroundStationChatStore canonicalMessages={replacement} optimisticMessages={optimistic} pendingDecisions={[]}><Read /></GroundStationChatStore>);
    expect(current.state.canonicalMessages).toBe(replacement);
    expect(current.state.drafts.s?.text).toBe('draft');
    expect(conversation.items).toHaveLength(0);
  });
  it('keeps scrolling and disclosure state isolated by conversation', () => {
    const state = groundStationChatReducer({ drafts: {}, uiState: {} }, { type: 'ui', draftId: 's1', patch: { pinnedToBottom: false, expandedItems: { tool: true } } });
    const next = groundStationChatReducer(state, { type: 'ui', draftId: 's2', patch: { sendError: 'offline' } });
    expect(next.uiState.s1?.pinnedToBottom).toBe(false);
    expect(next.uiState.s1?.expandedItems.tool).toBe(true);
    expect(next.uiState.s2?.pinnedToBottom).toBe(true);
    expect(next.uiState.s2?.expandedItems).toEqual({});
  });
});
