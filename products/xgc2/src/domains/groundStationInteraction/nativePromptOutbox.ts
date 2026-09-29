import { agentPromptTurnId } from '@xgc2/agent-runtime';
import type { AgentItem, AgentTurnOptions, PromptQueue } from '@xgc2/agent-runtime/state';
import { createGroundStationNativeClient } from './groundStationAgentService';

export type LocalPrompt = {
  id: string; sessionId: string; draftId: string; text: string; options: AgentTurnOptions;
  createdAt?: string; turnId?: string; accepted?: boolean; error?: string;
};
type Snapshot = { items: LocalPrompt[]; sending: string; receipts: Record<string, PromptQueue>; storageError?: string };
type Completion = { promise: Promise<void>; resolve: () => void; reject: (cause: unknown) => void };
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const sameConversation = (a: LocalPrompt, b: LocalPrompt) => a.draftId === b.draftId || Boolean(a.sessionId && a.sessionId === b.sessionId);

/** One durable outbox per experiment. Accepted rows bridge only until the canonical receipt. */
export class AgentPromptOutbox {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private preparations = new Map<string, () => Promise<string>>();
  private completions = new Map<string, Completion>();
  private storageKey: string;

  constructor(private experimentId: string) {
    this.storageKey = `xgc.native-prompt-outbox.v1:${experimentId}`;
    let items: LocalPrompt[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (Array.isArray(value) && value.length <= 20) {
        items = value.filter((p): p is LocalPrompt => p && typeof p.id === 'string'
          && typeof p.text === 'string' && typeof p.sessionId === 'string' && typeof p.draftId === 'string'
          && p.options && typeof p.options === 'object').map(p => ({
          ...p,
          accepted: p.accepted === true && typeof p.turnId === 'string',
          error: p.accepted === true && typeof p.turnId === 'string' ? undefined
            : 'Submission was not confirmed. Retry to check the saved request.',
        }));
      }
    } catch { /* A missing outbox never fabricates a submitted message. */ }
    this.snapshot = { items, sending: '', receipts: {} };
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private write(items: LocalPrompt[], sending = this.snapshot.sending): void {
    let storageError: string | undefined;
    try { localStorage.setItem(this.storageKey, JSON.stringify(items)); }
    catch (cause) { storageError = messageOf(cause); }
    this.snapshot = { ...this.snapshot, items, sending, storageError };
    for (const listener of this.listeners) listener();
  }

  private completion(id: string): Promise<void> {
    const current = this.completions.get(id);
    if (current) return current.promise;
    let resolve!: () => void;
    let reject!: (cause: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Legacy fire-and-forget callers still see failure in the outbox. Consumers
    // awaiting this original promise receive the rejection normally.
    void promise.catch(() => undefined);
    this.completions.set(id, { promise, resolve, reject });
    return promise;
  }

  private settle(id: string, cause?: unknown): void {
    const completion = this.completions.get(id);
    this.completions.delete(id);
    if (cause === undefined) completion?.resolve();
    else completion?.reject(cause);
  }

  enqueue(text: string, draftId: string, options: AgentTurnOptions, prepare: () => Promise<string>): Promise<void> {
    if (!text.trim()) throw new Error('A message cannot be empty.');
    if (this.snapshot.items.length >= 20) throw new Error('Message queue is full.');
    const task: LocalPrompt = {
      id: crypto.randomUUID(), sessionId: draftId.startsWith('new:') ? '' : draftId,
      draftId, text, options: { ...options }, createdAt: new Date().toISOString(),
    };
    const completion = this.completion(task.id);
    this.preparations.set(task.id, prepare);
    // Publish synchronously, before connection preparation or the first network await.
    this.write([...this.snapshot.items, task]);
    this.pump();
    return completion;
  }

  edit(id: string, text: string): void {
    if (this.snapshot.sending === id || this.snapshot.items.some(p => p.id === id && p.accepted)) throw new Error('This message is being submitted.');
    this.write(this.snapshot.items.map(p => p.id === id ? { ...p, text } : p));
  }

  remove(id: string): void {
    if (this.snapshot.sending === id || this.snapshot.items.some(p => p.id === id && p.accepted)) throw new Error('This message is being submitted.');
    this.write(this.snapshot.items.filter(p => p.id !== id));
    this.preparations.delete(id);
    this.settle(id, new Error('Queued message removed.'));
    this.pump();
  }

  retry(id: string, prepare: () => Promise<string>): Promise<void> {
    const task = this.snapshot.items.find(p => p.id === id);
    if (!task) return Promise.reject(new Error('This queued message is no longer available.'));
    if (task.accepted) return Promise.resolve();
    const completion = this.completion(id);
    this.preparations.set(id, prepare);
    this.write(this.snapshot.items.map(p => p.id === id ? { ...p, error: undefined } : p));
    this.pump();
    return completion;
  }

  /** SSE may acknowledge before HTTP, or after an empty (already drained) HTTP queue. */
  reconcile(sessionId: string, canonical: readonly AgentItem[], queue?: PromptQueue): void {
    if (!sessionId) return;
    const admitted = new Set([
      ...canonical.filter(item => item.role === 'user').map(item => item.turnId),
      ...(queue?.items.map(item => item.id) ?? []),
    ]);
    const received = this.snapshot.items.filter(p => p.sessionId === sessionId && p.turnId && admitted.has(p.turnId));
    if (!received.length) return;
    const ids = new Set(received.map(p => p.id));
    for (const item of received) { this.settle(item.id); this.preparations.delete(item.id); }
    this.write(this.snapshot.items.filter(p => !ids.has(p.id)));
  }

  private pump(): void {
    if (this.snapshot.sending) return;
    const task = this.snapshot.items.find((p, index) => !p.accepted && !p.error
      && !this.snapshot.items.slice(0, index).some(earlier => !earlier.accepted && sameConversation(earlier, p)));
    if (!task) return;
    this.write(this.snapshot.items, task.id);
    void (async () => {
      try {
        let sessionId = task.sessionId;
        const prepare = this.preparations.get(task.id);
        if (!prepare) throw new Error('Open this conversation before retrying.');
        const prepared = await prepare();
        if (sessionId && prepared !== sessionId) throw new Error('Conversation changed before submission.');
        sessionId = prepared;
        if (!sessionId) throw new Error('No conversation is connected.');
        const turnId = task.turnId ?? await agentPromptTurnId(sessionId, task.id);
        this.write(this.snapshot.items.map(p => p.id === task.id ? { ...p, sessionId, turnId }
          : p.draftId === task.draftId && !p.sessionId ? { ...p, sessionId } : p));
        const result = await createGroundStationNativeClient(this.experimentId).updateNativePromptQueue(
          sessionId, { operation: 'enqueue', text: task.text, options: task.options }, task.id,
        );
        const previous = this.snapshot.receipts[sessionId];
        if (!previous || result.revision >= previous.revision) {
          this.snapshot = { ...this.snapshot, receipts: { ...this.snapshot.receipts, [sessionId]: result } };
        }
        // Keep a row when the server already drained it but the journal is still
        // in flight. A queued receipt itself can take over immediately.
        const queued = result.items.some(p => p.id === turnId);
        this.write(this.snapshot.items.flatMap(p => p.id !== task.id ? [p]
          : queued ? [] : [{ ...p, accepted: true, error: undefined }]));
        this.preparations.delete(task.id);
        this.settle(task.id);
      } catch (cause) {
        this.write(this.snapshot.items.map(p => p.id === task.id ? { ...p, error: messageOf(cause) } : p));
        this.settle(task.id, cause);
      } finally {
        this.write(this.snapshot.items, '');
        this.pump();
      }
    })();
  }
}

const stores = new Map<string, AgentPromptOutbox>();
export function nativePromptOutbox(experimentId: string): AgentPromptOutbox {
  let store = stores.get(experimentId);
  if (!store) { store = new AgentPromptOutbox(experimentId); stores.set(experimentId, store); }
  return store;
}
