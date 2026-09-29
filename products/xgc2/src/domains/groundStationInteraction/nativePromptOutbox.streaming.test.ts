// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentItem, PromptQueue } from '@xgc2/agent-runtime/state';
import { AgentPromptOutbox } from './nativePromptOutbox';
const api = vi.hoisted(() => ({ updateNativePromptQueue: vi.fn() }));
vi.mock('./groundStationAgentService', () => ({ createGroundStationNativeClient: () => api }));
vi.mock('@xgc2/agent-runtime', () => ({ agentPromptTurnId: async (_session: string, id: string) => `t_${id.replaceAll('-', '').slice(0, 32)}` }));
const empty: PromptQueue = { revision: 1, paused: false, items: [] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const prepare = async () => 's';
function user(turnId: string): AgentItem {
  return { key: JSON.stringify([turnId, 'user']), id: 'user', turnId, role: 'user', text: 'text', title: '', status: 'submitted', truncated: false };
}
beforeEach(() => { localStorage.clear(); api.updateNativePromptQueue.mockReset(); });
afterEach(() => vi.restoreAllMocks());
describe('existing outbox streaming lifecycle', () => {
  it('publishes before preparation, retains the receipt gap, and reconciles without a second send', async () => {
    const ready = deferred<string>();
    const response = deferred<PromptQueue>();
    api.updateNativePromptQueue.mockReturnValue(response.promise);
    const store = new AgentPromptOutbox('exp');
    const completion = store.enqueue('text', 'new:exp', {}, () => ready.promise);
    expect(store.getSnapshot().items[0]?.text).toBe('text');
    expect(api.updateNativePromptQueue).not.toHaveBeenCalled();
    ready.resolve('s');
    await vi.waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1));
    const task = store.getSnapshot().items[0]!;
    response.resolve(empty);
    await completion;
    expect(store.getSnapshot().items[0]?.accepted).toBe(true);
    store.reconcile('s', [user(task.turnId!)]);
    expect(store.getSnapshot().items).toHaveLength(0);
    expect(api.updateNativePromptQueue).toHaveBeenCalledTimes(1);
  });
  it('uses the same idempotency key for failure and retry', async () => {
    api.updateNativePromptQueue.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty);
    const store = new AgentPromptOutbox('exp');
    await expect(store.enqueue('text', 's', {}, prepare)).rejects.toThrow('offline');
    const task = store.getSnapshot().items[0]!;
    expect(task.error).toBe('offline');
    await store.retry(task.id, prepare);
    expect(api.updateNativePromptQueue.mock.calls.map(call => call[2])).toEqual([task.id, task.id]);
    expect(store.getSnapshot().items[0]?.error).toBeUndefined();
  });
  it('accepts a canonical SSE receipt arriving before the HTTP response', async () => {
    const response = deferred<PromptQueue>();
    api.updateNativePromptQueue.mockReturnValue(response.promise);
    const store = new AgentPromptOutbox('exp');
    const completion = store.enqueue('text', 's', {}, prepare);
    await vi.waitFor(() => expect(api.updateNativePromptQueue).toHaveBeenCalled());
    const task = store.getSnapshot().items[0]!;
    store.reconcile('s', [user(task.turnId!)]);
    await completion;
    expect(store.getSnapshot().items).toHaveLength(0);
    response.resolve(empty);
    await vi.waitFor(() => expect(store.getSnapshot().sending).toBe(''));
    expect(store.getSnapshot().items).toHaveLength(0);
  });
  it('lets the canonical queue receipt replace the local row', async () => {
    api.updateNativePromptQueue.mockImplementation(async (_session, command, id) => ({ ...empty,
      items: [{ id: `t_${id.replaceAll('-', '').slice(0, 32)}`, text: command.text, options: {}, requestOptions: {}, createdAt: new Date().toISOString() }] }));
    const store = new AgentPromptOutbox('exp');
    await store.enqueue('text', 's', {}, prepare);
    expect(store.getSnapshot().items).toHaveLength(0);
    expect(store.getSnapshot().receipts.s?.items).toHaveLength(1);
  });
  it('restores unconfirmed tasks as explicit failures and never resends on refresh', async () => {
    localStorage.setItem('xgc.native-prompt-outbox.v1:exp', JSON.stringify([{ id: 'request', sessionId: 's', draftId: 's', text: 'text', options: {} }]));
    const store = new AgentPromptOutbox('exp');
    expect(store.getSnapshot().items[0]?.error).toContain('not confirmed');
    expect(api.updateNativePromptQueue).not.toHaveBeenCalled();
  });
  it('preserves two identical texts as distinct requests', async () => {
    api.updateNativePromptQueue.mockResolvedValue(empty);
    const store = new AgentPromptOutbox('exp');
    await store.enqueue('text', 's', {}, prepare);
    await store.enqueue('text', 's', {}, prepare);
    expect(new Set(store.getSnapshot().items.map(item => item.id)).size).toBe(2);
    const first = store.getSnapshot().items[0]!;
    store.reconcile('s', [user(first.turnId!)]);
    expect(store.getSnapshot().items).toHaveLength(1);
  });
});
