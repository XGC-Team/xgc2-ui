import type { PanelActionInvocation,PanelActionPortRuntime } from './types';
import { newestPanelInvocation } from './panelInvocationObservation';

/** One submitted command and an optional explicit cancel intent; not Run state. */
export function createPanelInvocationRequest(
  port: Pick<PanelActionPortRuntime,'invoke'|'control'>,
  inputs: Record<string,unknown>,
  reason: string,
  observed: () => PanelActionInvocation | undefined,
) {
  const result = Promise.resolve().then(() => port.invoke(inputs,reason));
  let requested = false;
  let cancelWork: Promise<void> | undefined;
  return {
    result,
    get cancelRequested() { return requested; },
    cancel(cancelReason: string): Promise<void> {
      requested = true;
      if (!cancelWork) {
        // A Stop while HTTP admission is outstanding waits for *this* receipt.
        // A different active/latest projection must never become its target.
        cancelWork = result.then(async (accepted) => {
          const target = newestPanelInvocation(accepted,observed())!;
          // A terminal join may still own work. Core stop-set resolves durable
          // descendants even when its exact anchor is already terminal.
          await port.control(target,'cancel',cancelReason);
        }).catch((cause: unknown) => {
          cancelWork = undefined;
          requested = false;
          throw cause;
        });
      }
      return cancelWork;
    },
  };
}

export type PanelInvocationRequest = ReturnType<typeof createPanelInvocationRequest>;
