import { useEffect,useRef } from 'react';

export function useDelayedTask({ enabled,delayMs,task }: {
  enabled: boolean;
  delayMs: number;
  task: () => void | Promise<void>;
}) {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!enabled || !Number.isFinite(delayMs) || delayMs < 0) return undefined;
    const timer = window.setTimeout(() => void taskRef.current(),delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs,enabled]);
}
