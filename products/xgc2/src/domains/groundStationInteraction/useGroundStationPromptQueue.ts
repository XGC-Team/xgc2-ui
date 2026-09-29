import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AgentItem, PromptQueue, AgentTurnOptions } from '@xgc2/agent-runtime/state';
import type { AgentOptimisticMessage } from '@xgc2/agent-runtime/react';
import { createGroundStationNativeClient } from './groundStationAgentService';
import { nativePromptOutbox } from './nativePromptOutbox';
const emptyQueue: PromptQueue = { revision: 0, paused: false, items: [] };
const emptyMessages: readonly AgentItem[] = [];

export function useGroundStationPromptQueue(
  experimentId: string, draftId: string, queue: PromptQueue | undefined,
  options: AgentTurnOptions, prepare: () => Promise<string>, canonicalMessages: readonly AgentItem[] = emptyMessages,
) {
  const store = nativePromptOutbox(experimentId);
  const local = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [receipt, setReceipt] = useState<{ sessionId: string; queue: PromptQueue }>();
  const sessionId = draftId.startsWith('new:') ? '' : draftId;
  const candidates = [queue, local.receipts[sessionId], receipt?.sessionId === sessionId ? receipt.queue : undefined];
  const serverQueue = candidates.reduce<PromptQueue>((best, candidate) => candidate && candidate.revision >= best.revision ? candidate : best, emptyQueue);
  useEffect(() => { store.reconcile(sessionId, canonicalMessages, serverQueue); }, [store, sessionId, canonicalMessages, serverQueue]);
  const update = async (command: Parameters<ReturnType<typeof createGroundStationNativeClient>['updateNativePromptQueue']>[1]) => {
    if (!sessionId) throw new Error('No conversation is connected.');
    const result = await createGroundStationNativeClient(experimentId).updateNativePromptQueue(
      sessionId, { ...command, expectedRevision: serverQueue.revision }, crypto.randomUUID(),
    );
    setReceipt({ sessionId, queue: result });
  };
  const visibleLocal = useMemo(() => local.items.filter(p => p.draftId === draftId || p.sessionId === sessionId && Boolean(sessionId)),
    [local.items, draftId, sessionId]);
  const serverIds = useMemo(() => new Set(serverQueue.items.map(p => p.id)), [serverQueue]);
  const optimisticMessages = useMemo<AgentOptimisticMessage[]>(() => [
    ...serverQueue.items.map(p => ({ ...p, sessionId, turnId: p.id, status: 'queued' as const })),
    ...visibleLocal.filter(p => !p.turnId || !serverIds.has(p.turnId)).map(p => ({
      id: p.id, sessionId: p.sessionId || undefined, turnId: p.turnId, text: p.text, createdAt: p.createdAt,
      status: p.error ? 'failed' as const : p.accepted ? 'queued' as const : 'pending' as const, error: p.error,
    })),
  ], [serverQueue, sessionId, visibleLocal, serverIds]);
  return {
    enqueue: (text: string, prepareSubmission = prepare) => store.enqueue(text, draftId, options, prepareSubmission), paused: serverQueue.paused,
    storageError: local.storageError, optimisticMessages,
    items: [...serverQueue.items, ...visibleLocal.filter(p => !p.accepted && (!p.turnId || !serverIds.has(p.turnId)))
      .map(p => ({ ...p, local: true, sending: p.id === local.sending }))],
    edit: async (id: string, text: string) => { if (local.items.some(p => p.id === id)) { store.edit(id, text); return; } await update({ operation: 'edit', id, text }); },
    remove: async (id: string) => { if (local.items.some(p => p.id === id)) { store.remove(id); return; } await update({ operation: 'remove', id }); },
    reorder: async (order: string[]) => update({ operation: 'reorder', order }),
    pause: async (paused: boolean) => update({ operation: paused ? 'pause' : 'resume' }),
    retry: (id: string) => store.retry(id, prepare),
  };
}
