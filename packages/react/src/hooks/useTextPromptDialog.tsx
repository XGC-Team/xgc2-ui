import { useCallback, useEffect, useRef, useState } from 'react';
import { TextPromptDialog, type TextPromptDialogRequest } from '../components/TextPromptDialog';

type PendingPrompt = {
  id: number;
  request: TextPromptDialogRequest;
  resolve: (value: string | null) => void;
  settled: boolean;
};

export function useTextPromptDialog() {
  const [active, setActive] = useState<PendingPrompt | null>(null);
  const activeRef = useRef<PendingPrompt | null>(null);
  const queueRef = useRef<PendingPrompt[]>([]);
  const nextIdRef = useRef(1);
  const mountedRef = useRef(true);

  const prompt = useCallback((request: TextPromptDialogRequest) => new Promise<string | null>((resolve) => {
    if (!mountedRef.current) {
      resolve(null);
      return;
    }
    const pending = { id: nextIdRef.current++, request, resolve, settled: false };
    if (activeRef.current) queueRef.current.push(pending);
    else {
      activeRef.current = pending;
      setActive(pending);
    }
  }), []);

  const settle = useCallback((id: number, value: string | null) => {
    const current = activeRef.current;
    if (!current || current.id !== id || current.settled) return;
    current.settled = true;
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
    current.resolve(value);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const pendingPrompts = activeRef.current
        ? [activeRef.current, ...queueRef.current]
        : [...queueRef.current];
      activeRef.current = null;
      queueRef.current = [];
      for (const pending of pendingPrompts) {
        if (pending.settled) continue;
        pending.settled = true;
        pending.resolve(null);
      }
    };
  }, []);

  return {
    dialog: active ? (
      <TextPromptDialog
        onCancel={() => settle(active.id, null)}
        onSubmit={(value) => settle(active.id, value)}
        request={active.request}
      />
    ) : null,
    prompt,
  };
}
