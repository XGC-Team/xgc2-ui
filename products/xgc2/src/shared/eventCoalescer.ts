export type EventCoalescer = {
  schedule: () => void;
  cancel: () => void;
};

export type DeadlineTimer = {
  schedule: (delayMs: number) => void;
  cancel: () => void;
};

// Coalesces bursty invalidation events into one trailing refresh. This is not
// polling: every execution is caused by at least one upstream event.
export function createEventCoalescer(delayMs: number, task: () => void): EventCoalescer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        task();
      }, delayMs);
    },
    cancel() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

// Maintains one reschedulable deadline. Consumers can react to local expiry
// boundaries without introducing fixed-interval polling in domain stores.
export function createDeadlineTimer(task: () => void): DeadlineTimer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    schedule(delayMs) {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        task();
      }, Math.max(0, delayMs));
    },
    cancel,
  };
}
