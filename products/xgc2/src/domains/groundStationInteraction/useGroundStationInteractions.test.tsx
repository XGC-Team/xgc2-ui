// @vitest-environment jsdom

import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { workflowRuntimeEvents } from '../../shared/workflowRuntimeProtocol';
import type { ExecutionEvent } from '../execution/executionPublic';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type {
  GroundStationDecisionInteraction,
  GroundStationInteraction,
  GroundStationMessageInteraction,
} from './groundStationInteractionTypes';
import { groundStationInteractionFromEvent } from './groundStationInteractionEvent';
import { useGroundStationInteractions } from './useGroundStationInteractions';
import {
  actOnGroundStationInteraction,
  listOpenGroundStationInteractions,
  listRecentGroundStationInteractions,
} from './groundStationInteractionService';

const executionMock = vi.hoisted(() => ({
  listeners: new Set<(event: ExecutionEvent) => void>(),
  snapshot: {
    targetId: 'local',
    processDefinitions: [],
    processInstances: [],
    jobs: [],
    events: [] as ExecutionEvent[],
    streamId: 'stream-1',
    lastOffset: 0,
    streamState: 'connected' as const,
    loading: false,
    error: '',
  },
}));

vi.mock('../execution/executionPublic', () => ({
  normalizeExecutionTargetId: (targetId?: string) => targetId?.trim() || 'local',
  executionTargetResourceId: (targetId?: string) => targetId?.startsWith('core:') ? 'local' : targetId?.trim() || 'local',
  useExecutionEventChannel: (targetId: string, listener: (event: ExecutionEvent) => void) => {
    executionMock.listeners.add(listener);
    return { ...executionMock.snapshot,targetId };
  },
}));

vi.mock('./groundStationInteractionService', () => ({
  listOpenGroundStationInteractions: vi.fn(),
  listRecentGroundStationInteractions: vi.fn(),
  actOnGroundStationInteraction: vi.fn(),
  isGroundStationInteractionCASConflict: (cause: unknown) => cause instanceof Error && cause.message.includes('409'),
}));

describe('useGroundStationInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionMock.listeners.clear();
    executionMock.snapshot.events = [];
    executionMock.snapshot.streamId = 'stream-1';
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([]);
    vi.mocked(listRecentGroundStationInteractions).mockResolvedValue([]);
  });

  it('selects only transient toasts and persistent panel activity from the inventory', async () => {
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([
      interaction(),
      interaction({ id: 'decision-panel',kind: 'decision',presentation: 'panel',responseMode: 'decision',payload: { decision: {} } }),
      interaction({ id: 'status-old',kind: 'status',presentation: 'panel',payload: { status: { statusKey: 'mission',state: 'starting',progress: 0.1 } } }),
      interaction({ id: 'status-new',kind: 'status',presentation: 'panel',payload: { status: { statusKey: 'mission',state: 'tracking',progress: 0.5 } },updatedAt: '2026-07-15T09:01:00Z' }),
      interaction({ id: 'context-1',kind: 'context',presentation: 'panel',payload: { context: { kind: 'robot',id: 'uav-1' } } }),
    ]);

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.toasts.map((item) => item.id)).toEqual(['interaction-1']);
    expect(view.result.current.chatDecisions.map((item) => item.id)).toEqual(['decision-panel']);
    expect(view.result.current.statusCards).toHaveLength(1);
    expect(view.result.current.statusCards[0].payload.status.state).toBe('tracking');
    expect(view.result.current.contextOffers.map((item) => item.id)).toEqual(['context-1']);
  });

  it('uses revision-monotonic live snapshots, ignores other targets, and retains terminal panel feedback', async () => {
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    const pending = decisionInteraction({ id: 'decision-live' });

    emit(event(pending, 10));
    expect(view.result.current.chatDecisions.map((item) => item.id)).toEqual(['decision-live']);

    emit(event(interaction({
      ...pending,revision: 2,status: 'resolved',updatedAt: '2026-07-15T09:02:00Z',resolvedAt: '2026-07-15T09:02:00Z',
      response: { action: 'approved',actor: 'operator',at: '2026-07-15T09:02:00Z' },
    }), 11, 'ground-station.interaction-resolved'));
    expect(view.result.current.chatDecisions[0]).toMatchObject({ id: 'decision-live',revision: 2,status: 'resolved' });

    emit(event(pending, 12));
    emit(event(interaction({ id: 'remote',targetScope: 'agent-a' }), 13));
    expect(view.result.current.chatDecisions[0]).toMatchObject({ revision: 2,status: 'resolved' });
    expect(view.result.current.toasts).toEqual([]);
  });

  it('ignores retired recording events while retaining later normal decisions and their revisions', async () => {
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    const pending = decisionInteraction({ id: 'normal-decision' });
    const retired = event(pending, 10);
    retired.entityId = 'retired-recording';
    retired.payload = {
      ...pending,id: retired.entityId,
      payload: { decision: { ...pending.payload.decision,action: { kind: 'screen-recording',op: 'start' } } },
    };
    emit(retired);
    emit(event(pending, 11));
    emit(event(interaction({
      ...pending,revision: 2,status: 'resolved',updatedAt: '2026-07-15T09:02:00Z',resolvedAt: '2026-07-15T09:02:00Z',
      response: { action: 'approved',actor: 'operator',at: '2026-07-15T09:02:00Z' },
    }), 12, 'ground-station.interaction-resolved'));
    emit({ ...retired,offset: 13,seq: 13 });

    expect(view.result.current.inventory).toHaveLength(1);
    expect(view.result.current.chatDecisions).toMatchObject([{ id: 'normal-decision',revision: 2,status: 'resolved' }]);
    expect(actOnGroundStationInteraction).not.toHaveBeenCalled();
  });

  it('retains recent terminal chat decisions beside current requests', async () => {
    const openPanel = decisionInteraction({ id: 'decision-panel' });
    const resolvedPanel = decisionInteraction({
      id: 'decision-resolved',
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:02:00Z',
      response: { action: 'approved',actor: 'operator-a',at: '2026-07-15T09:02:00Z' },
    });
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([openPanel]);
    vi.mocked(listRecentGroundStationInteractions).mockResolvedValue([resolvedPanel,openPanel]);

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.chatDecisions.map((item) => item.id)).toEqual(['decision-panel','decision-resolved']);
    expect(view.result.current.chatDecisions[1].response).toMatchObject({ action: 'approved',actor: 'operator-a' });
  });

  it('keeps an open decision created between the open and recent inventory reads', async () => {
    const createdBetweenReads = decisionInteraction({ id: 'decision-between-reads' });
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([]);
    vi.mocked(listRecentGroundStationInteractions).mockResolvedValue([createdBetweenReads]);

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.chatDecisions.map((item) => item.id)).toEqual(['decision-between-reads']);
  });

  it('exposes current pending decisions while history is pending and retains them when history fails', async () => {
    const pending = decisionInteraction({ id: 'decision-history-partial' });
    let rejectHistory!: (cause: Error) => void;
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([pending]);
    vi.mocked(listRecentGroundStationInteractions).mockReturnValueOnce(new Promise((_, reject) => { rejectHistory = reject; }));
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.chatDecisions).toEqual([pending]));
    expect(view.result.current.loading).toBe(true);
    await act(async () => { rejectHistory(new Error('history transport unavailable')); });
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.chatDecisions).toEqual([pending]);
    expect(view.result.current.inventoryError).toBe('');
  });

  it('keeps already observed terminal history when a later history refresh fails', async () => {
    const terminal = decisionInteraction({ id: 'known-terminal',status: 'resolved',revision: 2,
      response: { action: 'approved',actor: 'operator',at: '2026-07-15T09:03:00Z' } });
    vi.mocked(listRecentGroundStationInteractions).mockResolvedValueOnce([terminal]);
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.chatDecisions).toEqual([terminal]);
    const pending = decisionInteraction({ id: 'new-pending' });
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValueOnce([pending]);
    vi.mocked(listRecentGroundStationInteractions).mockRejectedValueOnce(new Error('history unavailable'));
    executionMock.snapshot.streamId = 'stream-reconnected';
    view.rerender();
    await waitFor(() => expect(view.result.current.chatDecisions.find((item) => item.id === 'new-pending')).toBeDefined());
    expect(view.result.current.inventoryError).toBe('');
    expect(view.result.current.inventory.map((item) => item.id).sort()).toEqual(['known-terminal','new-pending']);
    expect(view.result.current.chatDecisions.find((item) => item.id === 'known-terminal')?.response).toEqual(terminal.response);
  });

  it('does not treat partial history as a successful CAS reconciliation', async () => {
    const decision = decisionInteraction({ id: 'decision-cas-partial' });
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValueOnce([decision]).mockResolvedValueOnce([]);
    vi.mocked(listRecentGroundStationInteractions).mockResolvedValueOnce([decision]).mockRejectedValueOnce(new Error('history unavailable'));
    vi.mocked(actOnGroundStationInteraction).mockRejectedValueOnce(new Error('409 revision conflict'));
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => {
      await expect(view.result.current.respond(decision, 'approved')).rejects.toThrow('Recent activity is unavailable');
    });
    expect(view.result.current.inventoryError).toBe('');
    expect(actOnGroundStationInteraction).toHaveBeenCalledTimes(1);
    expect(view.result.current.chatDecisions.some((item) => item.status === 'resolved')).toBe(false);
  });

  it('does not apply an old history failure after switching Core targets with the same local resource scope', async () => {
    let rejectHistory!: (cause: Error) => void;
    vi.mocked(listOpenGroundStationInteractions).mockImplementation(async (targetId) => [decisionInteraction({ id: `${targetId}-pending` })]);
    vi.mocked(listRecentGroundStationInteractions).mockReturnValueOnce(new Promise((_, reject) => { rejectHistory = reject; }));
    const view = renderHook(({ targetId }) => useGroundStationInteractions(targetId), { initialProps: { targetId: 'core:a' } });
    await waitFor(() => expect(view.result.current.inventory[0]?.id).toBe('core:a-pending'));
    view.rerender({ targetId: 'core:b' });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    view.rerender({ targetId: 'core:a' });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => { rejectHistory(new Error('old Core history failed')); });
    expect(view.result.current.inventoryError).toBe('');
    expect(view.result.current.inventory.map((item) => item.id)).toEqual(['core:a-pending']);
  });

  it('keeps a terminal stream revision that arrives between the independently applied snapshots', async () => {
    const pending = decisionInteraction({ id: 'decision-stream-race' });
    const recent = deferred<GroundStationInteraction[]>();
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([pending]);
    vi.mocked(listRecentGroundStationInteractions).mockReturnValueOnce(recent.promise);
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.chatDecisions).toEqual([pending]));
    const terminal = decisionInteraction({ ...pending,status: 'resolved',revision: 2,
      response: { action: 'approved',actor: 'operator-b',at: '2026-07-15T09:03:00Z' } });
    emit(event(terminal, 10, 'ground-station.interaction-resolved'));
    await act(async () => { recent.resolve([pending]); });
    expect(view.result.current.chatDecisions).toEqual([terminal]);
  });

  it('posts typed responses, merges the returned snapshot, and persists explicit dismissals', async () => {
    const decision = decisionInteraction({ id: 'decision-1' });
    const toast = messageInteraction();
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([decision,toast]);
    vi.mocked(actOnGroundStationInteraction).mockImplementation(async (_target, _id, input) => ({
      interaction: interaction({
        ...(input.action === 'dismissed' ? toast : decision),
        revision: 2,
        status: 'resolved',
        response: { action: input.action,actor: 'operator',at: '2026-07-15T09:03:00Z' },
      }),
    }));

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.chatDecisions).toHaveLength(1));
    await act(() => view.result.current.respond(decision, 'approved', { reason: 'Checks complete' }));
    expect(actOnGroundStationInteraction).toHaveBeenCalledWith('local', 'decision-1', expect.objectContaining({
      action: 'approved',expectedRevision: 1,reason: 'Checks complete',requestId: expect.any(String),idempotencyKey: expect.any(String),
    }));
    expect(view.result.current.chatDecisions[0]).toMatchObject({ status: 'resolved',response: { action: 'approved' } });

    await act(() => view.result.current.dismiss(toast));
    expect(actOnGroundStationInteraction).toHaveBeenLastCalledWith('local', 'interaction-1', expect.objectContaining({ action: 'dismissed' }));
    expect(view.result.current.toasts).toEqual([]);
  });

  it('returns a competing terminal response from recent inventory after a CAS conflict', async () => {
    const decision = decisionInteraction({ id: 'decision-cas' });
    const resolved = decisionInteraction({
      ...decision,status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:04:00Z',
      response: { action: 'approved',actor: 'operator-b',at: '2026-07-15T09:04:00Z' },
    });
    vi.mocked(listOpenGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValueOnce([]);
    vi.mocked(listRecentGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValueOnce([resolved]);
    vi.mocked(actOnGroundStationInteraction).mockRejectedValue(new Error('409 revision conflict'));

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.chatDecisions).toHaveLength(1));
    let response: GroundStationDecisionInteraction | undefined;
    await act(async () => {
      response = await view.result.current.respond(decision, 'approved');
    });
    expect(response).toMatchObject({
      status: 'resolved',response: { actor: 'operator-b' },
    });
    expect(view.result.current.chatDecisions[0]).toMatchObject({
      status: 'resolved',response: { actor: 'operator-b' },
    });
  });

  it('reconciles with the server when the local expiry deadline fires', async () => {
    const decision = decisionInteraction({
      id: 'decision-timeout',
      expiresAt: '2099-07-15T09:05:00Z',
    });
    const expired = decisionInteraction({
      ...decision,status: 'expired',revision: 2,updatedAt: '2099-07-15T09:05:00Z',
    });
    vi.mocked(listOpenGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValueOnce([]);
    vi.mocked(listRecentGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValueOnce([expired]);
    const expiryController = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(expiryController.signal);

    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.chatDecisions).toHaveLength(1));
    act(() => expiryController.abort());

    await waitFor(() => expect(listRecentGroundStationInteractions).toHaveBeenCalledTimes(2));
    expect(view.result.current.chatDecisions[0]).toMatchObject({ status: 'expired',revision: 2 });
    timeout.mockRestore();
  });

  it('isolates state and inventory when the selected target changes', async () => {
    vi.mocked(listOpenGroundStationInteractions).mockImplementation(async (targetId) => [
      interaction({ id: `${targetId}-toast`,targetScope: targetId }),
    ]);
    const view = renderHook(({ targetId }) => useGroundStationInteractions(targetId), { initialProps: { targetId: 'local' } });
    await waitFor(() => expect(view.result.current.toasts[0]?.id).toBe('local-toast'));

    view.rerender({ targetId: 'agent-a' });
    await waitFor(() => expect(view.result.current.toasts[0]?.id).toBe('agent-a-toast'));
    expect(view.result.current.toasts).toHaveLength(1);
  });

  it('does not merge an old target action after an A to B to A navigation', async () => {
    const decision = decisionInteraction({ id: 'decision-old-a' });
    vi.mocked(listOpenGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValue([]);
    vi.mocked(listRecentGroundStationInteractions)
      .mockResolvedValueOnce([decision])
      .mockResolvedValue([]);
    const pending = deferred<Awaited<ReturnType<typeof actOnGroundStationInteraction>>>();
    vi.mocked(actOnGroundStationInteraction).mockReturnValue(pending.promise);
    const view = renderHook(
      ({ targetId }) => useGroundStationInteractions(targetId),
      { initialProps: { targetId: 'local' } },
    );
    await waitFor(() => expect(view.result.current.chatDecisions).toHaveLength(1));

    let response!: Promise<GroundStationDecisionInteraction>;
    act(() => { response = view.result.current.respond(decision, 'approved'); });
    view.rerender({ targetId: 'agent-a' });
    expect(view.result.current.chatDecisions).toEqual([]);
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    view.rerender({ targetId: 'local' });
    expect(view.result.current.chatDecisions).toEqual([]);
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    pending.resolve({
      interaction: decisionInteraction({
        ...decision,
        revision: 2,
        status: 'resolved',
        updatedAt: '2026-07-15T09:05:00Z',
        response: { action: 'approved',actor: 'operator',at: '2026-07-15T09:05:00Z' },
      }),
    });
    await act(async () => { await response; });
    expect(view.result.current.chatDecisions).toEqual([]);
  });

  it('caps retained interaction snapshots and filters expired inventory', async () => {
    vi.mocked(listOpenGroundStationInteractions).mockResolvedValue([
      ...Array.from({ length: 270 }, (_, index) => interaction({
        id: `toast-${String(index).padStart(3, '0')}`,
        createdAt: `2026-07-15T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
        updatedAt: `2026-07-15T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
      })),
      interaction({ id: 'expired',expiresAt: '2020-01-01T00:00:00Z' }),
    ]);
    const view = renderHook(() => useGroundStationInteractions('local'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(view.result.current.toasts).toHaveLength(256);
    expect(view.result.current.toasts.some((item) => item.id === 'expired')).toBe(false);
  });
});

describe('groundStationInteractionFromEvent', () => {
  it('accepts only complete matching interaction snapshots', () => {
    const snapshot = interaction();
    expect(groundStationInteractionFromEvent(event(snapshot, 1), 'local')).toEqual(snapshot);
    expect(groundStationInteractionFromEvent(event(snapshot, 1, workflowRuntimeEvents.runRunning), 'local')).toBeUndefined();
    expect(groundStationInteractionFromEvent(event(snapshot, 1), 'agent-a')).toBeUndefined();
  });
});

function emit(value: ExecutionEvent) {
  act(() => executionMock.listeners.forEach((listener) => listener(value)));
}

function event(
  snapshot: GroundStationInteraction,
  offset: number,
  type = 'ground-station.interaction-requested',
): ExecutionEvent {
  return {
    offset,
    entityType: 'ground-station-interaction',
    entityId: snapshot.id,
    seq: offset,
    type,
    level: 'info',
    payload: snapshot as unknown as Record<string,unknown>,
    commandId: `command-${offset}`,
    createdAt: snapshot.updatedAt,
  };
}

function interaction(patch: Record<string,unknown> = {}): GroundStationInteraction {
  const value = decodeGroundStationInteraction({
    schemaVersion: 1,
    id: 'interaction-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'message',
    presentation: 'toast',
    responseMode: 'none',
    severity: 'info',
    title: 'Ready',
    message: 'Ground station ready.',
    payload: { message: {} },
    origin: { type: 'automation',ref: 'mission' },
    audience: { scope: 'all' },
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: '2026-07-15T09:00:00Z',
    ...patch,
  });
  if (!value) throw new Error('invalid test interaction');
  return value;
}

function decisionInteraction(
  patch: Record<string,unknown> = {},
): GroundStationDecisionInteraction {
  const value = interaction({
    kind: 'decision',
    presentation: 'panel',
    responseMode: 'decision',
    payload: { decision: {} },
    ...patch,
  });
  if (value.kind !== 'decision') throw new Error('invalid test decision');
  return value;
}

function messageInteraction(
  patch: Record<string,unknown> = {},
): GroundStationMessageInteraction {
  const value = interaction(patch);
  if (value.kind !== 'message') throw new Error('invalid test message');
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise,resolve };
}
