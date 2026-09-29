// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { ACTIVE_ATTENTION_MS,IDLE_ATTENTION_MS,useAgentConversationAttention } from './useAgentConversationAttention';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock('./groundStationAgentService', () => ({
  readGroundStationNativeAttention: mocks.read,
  createGroundStationNativeClient: vi.fn(),
}));

const inventory = (sessions: unknown[]) => ({ data: { sessions, revision: 'revision-a' } });
const liveSession = { sessionId: 'session-a', context: { kind: 'experiment', id: 'experiment-a' }, lastSeq: 3, pending: [] };

describe('useAgentConversationAttention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.read.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls slowly while no native conversation is live', async () => {
    mocks.read.mockResolvedValue(inventory([]));
    const view = renderHook(() => useAgentConversationAttention('local', []));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ACTIVE_ATTENTION_MS);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(IDLE_ATTENTION_MS - ACTIVE_ATTENTION_MS);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('polls quickly while a conversation is live, including after a failed read', async () => {
    mocks.read.mockResolvedValueOnce(inventory([liveSession])).mockRejectedValueOnce(new Error('companion restarting'));
    mocks.read.mockResolvedValue(inventory([liveSession]));
    const view = renderHook(() => useAgentConversationAttention('local', []));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ACTIVE_ATTENTION_MS);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(ACTIVE_ATTENTION_MS);
    expect(mocks.read).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('does not poll away from the local target', async () => {
    const view = renderHook(() => useAgentConversationAttention('remote-core', []));
    const first = view.result.current.items;
    await vi.advanceTimersByTimeAsync(IDLE_ATTENTION_MS * 2);
    expect(mocks.read).not.toHaveBeenCalled();
    view.rerender();
    expect(view.result.current.items).toBe(first);
  });

  it('keeps the same pending list across an unchanged poll', async () => {
    const pending = { id: 'request-a', kind: 'permission', title: 'Run the test', submitted: false };
    mocks.read.mockImplementation(async () => inventory([{ ...liveSession, pending: [{ ...pending }] }]));
    const view = renderHook(() => useAgentConversationAttention('local', []));
    await act(() => vi.advanceTimersByTimeAsync(0));
    const first = view.result.current.items;
    expect(first).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(ACTIVE_ATTENTION_MS));
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(view.result.current.items).toBe(first);
    view.unmount();
  });

  it('publishes a new pending list when a request changes', async () => {
    const pending = { id: 'request-a', kind: 'permission', title: 'Run the test', submitted: false };
    mocks.read
      .mockResolvedValueOnce(inventory([{ ...liveSession, pending: [pending] }]))
      .mockResolvedValue(inventory([{ ...liveSession, pending: [{ ...pending, submitted: true }] }]));
    const view = renderHook(() => useAgentConversationAttention('local', []));
    await act(() => vi.advanceTimersByTimeAsync(0));
    const first = view.result.current.items;
    await act(() => vi.advanceTimersByTimeAsync(ACTIVE_ATTENTION_MS));
    expect(view.result.current.items).not.toBe(first);
    expect(view.result.current.items[0]?.submitted).toBe(true);
    view.unmount();
  });
});
