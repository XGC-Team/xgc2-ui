import { createDeadlineTimer } from './eventCoalescer';

export type DomainNavigationRequest<T> = {
  destination: T;
  signal: AbortSignal;
  activate: () => void;
};

/** A route owns its selection; requesting a page alone never proves a source opened. */
export function createDomainNavigationRequest<T>() {
  type Consumer = (request: DomainNavigationRequest<T>) => Promise<boolean>;
  let consumer: Consumer | undefined;
  let pending: { request: DomainNavigationRequest<T>;finish: (opened: boolean) => void } | undefined;

  function consume(active: NonNullable<typeof pending>, handler: Consumer) {
    void Promise.resolve().then(() => handler(active.request)).then(
      (opened) => active.finish(opened),
      () => active.finish(false),
    );
  }

  return {
    open(destination: T, activate: () => void): Promise<boolean> {
      pending?.finish(false);
      return new Promise((resolve) => {
        const controller = new AbortController();
        // A failed lazy route must release its caller, and late reads must not navigate.
        const deadline = createDeadlineTimer(() => active.finish(false));
        let settled = false;
        let activated = false;
        const active = {
          request: { destination,signal: controller.signal,activate: () => {
            if (!controller.signal.aborted && !activated) {
              activated = true;
              activate();
            }
          } },
          finish(opened: boolean) {
            if (settled) return;
            settled = true;
            deadline.cancel();
            controller.abort();
            if (pending === active) pending = undefined;
            resolve(opened);
          },
        };
        pending = active;
        deadline.schedule(15_000);
        if (consumer) consume(active, consumer);
        else {
          try { active.request.activate(); } catch { active.finish(false); }
        }
      });
    },
    register(handler: Consumer) {
      consumer = handler;
      if (pending) consume(pending, handler);
      return () => {
        if (consumer !== handler) return;
        consumer = undefined;
        pending?.finish(false);
      };
    },
  };
}
