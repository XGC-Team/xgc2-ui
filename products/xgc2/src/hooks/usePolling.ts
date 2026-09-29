import { useEffect,useRef } from 'react';

/** Runs one task at a time, including across effect restarts. Obsolete schedules
 * cannot report errors or queue more work. Tasks still own cancellation and
 * fencing their result writes; disabling polling does not abort an active task. */
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
  // A task can outlive the effect that started it. Keep its slot until it
  // settles, with at most one refresh owed to the latest enabled schedule.
  const flightRef = useRef<{ running: boolean; pending: (() => Promise<void>) | undefined }>({
    running: false,pending: undefined,
  });
  taskRef.current = task;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;

    const flight = flightRef.current;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      timer = undefined;
      if (cancelled) return;
      if (flight.running) {
        flight.pending = tick;
        return;
      }
      flight.running = true;
      const currentTask = taskRef.current;
      const currentOnError = onErrorRef.current;
      try {
        await currentTask();
      } catch (cause) {
        if (!cancelled) currentOnError?.(cause);
      } finally {
        flight.running = false;
        const pending = flight.pending;
        flight.pending = undefined;
        if (pending) void pending();
        else if (!cancelled) timer = window.setTimeout(tick, intervalMs);
      }
    };

    if (immediate) void tick();
    else timer = window.setTimeout(tick,intervalMs);

    return () => {
      cancelled = true;
      if (flight.pending === tick) flight.pending = undefined;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled,immediate,intervalMs,pollKey]);
}
