import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConfirmationDialog,
  type ConfirmationDialogRequest,
} from '../components/ConfirmationDialog';

type PendingConfirmation = {
  request: ConfirmationDialogRequest;
  resolve: (confirmed: boolean) => void;
};

export function useConfirmationDialog() {
  const [active, setActive] = useState<PendingConfirmation | null>(null);
  const activeRef = useRef<PendingConfirmation | null>(null);
  const queueRef = useRef<PendingConfirmation[]>([]);

  const confirm = useCallback((request: ConfirmationDialogRequest) => new Promise<boolean>((resolve) => {
    const pending = { request, resolve };
    if (activeRef.current) {
      queueRef.current.push(pending);
      return;
    }
    activeRef.current = pending;
    setActive(pending);
  }), []);

  const settle = useCallback((confirmed: boolean) => {
    const current = activeRef.current;
    if (!current) return;
    current.resolve(confirmed);
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => () => {
    activeRef.current?.resolve(false);
    queueRef.current.forEach((pending) => pending.resolve(false));
    activeRef.current = null;
    queueRef.current = [];
  }, []);

  return {
    confirm,
    dialog: active ? (
      <ConfirmationDialog
        onCancel={() => settle(false)}
        onConfirm={() => settle(true)}
        request={active.request}
      />
    ) : null,
  };
}
