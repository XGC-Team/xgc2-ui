import { useCallback, useEffect, useRef, useState } from 'react';
import { TextPromptDialog, type TextPromptDialogRequest } from '../components/TextPromptDialog';

type PendingPrompt = {
  request: TextPromptDialogRequest;
  resolve: (value: string | null) => void;
};

export function useTextPromptDialog() {
  const [active, setActive] = useState<PendingPrompt | null>(null);
  const activeRef = useRef<PendingPrompt | null>(null);
  const queueRef = useRef<PendingPrompt[]>([]);

  const prompt = useCallback((request: TextPromptDialogRequest) => new Promise<string | null>((resolve) => {
    const pending = { request, resolve };
    if (activeRef.current) queueRef.current.push(pending);
    else {
      activeRef.current = pending;
      setActive(pending);
    }
  }), []);

  const settle = useCallback((value: string | null) => {
    const current = activeRef.current;
    if (!current) return;
    current.resolve(value);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => () => {
    activeRef.current?.resolve(null);
    queueRef.current.forEach((pending) => pending.resolve(null));
    activeRef.current = null;
    queueRef.current = [];
  }, []);

  return {
    dialog: active ? (
      <TextPromptDialog
        onCancel={() => settle(null)}
        onSubmit={settle}
        request={active.request}
      />
    ) : null,
    prompt,
  };
}
