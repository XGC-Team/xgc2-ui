import { useEffect,useRef } from 'react';

/** Runs one task at a time; task rejection is reported through onError and does not stop the schedule. */
export function usePolling({
  enabled,
  intervalMs,
  pollKey = '',
  immediate = true,
  task,
  onError,
}: {
  enabled: boolean;
  intervalMs: number;
  pollKey?: string;
  immediate?: boolean;
  task: () => Promise<void>;
  onError?: (cause: unknown) => void;
}) {
  const taskRef = useRef(task);
  const onErrorRef = useRef(onError);
  taskRef.current = task;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      const currentTask = taskRef.current;
      const currentOnError = onErrorRef.current;
      try {
        await currentTask();
      } catch (cause) {
        currentOnError?.(cause);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, intervalMs);
        }
      }
    };

    if (immediate) void tick();
    else timer = window.setTimeout(tick,intervalMs);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled,immediate,intervalMs,pollKey]);
}
