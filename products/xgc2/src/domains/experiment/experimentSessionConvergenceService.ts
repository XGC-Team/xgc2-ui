import type { ExperimentSessionView } from './experimentWorkflowModel';
import { waitForTransportRetry } from '../../api/http';
import {
  experimentSessionIsRunning,
} from './experimentWorkflowService';

const STOP_SESSION_CONVERGENCE_INTERVAL_MS=1_000;
const STOP_SESSION_CONVERGENCE_TIMEOUT_MS=180_000;

/**
 * Bounded reconciliation owned only by one accepted Experiment Stop.
 * Generic Session refresh remains event-driven and single-shot.
 */
export async function convergeStoppedExperimentSession({
  experimentResourceId,
  signal,
  readSessions,
}: {
  experimentResourceId:string;
  signal:AbortSignal;
  readSessions:() => Promise<readonly ExperimentSessionView[]|undefined>;
}) {
  const startedAt=Date.now();
  while (!signal.aborted) {
    const sessions=await readSessions();
    if (signal.aborted) return;
    if (sessions && !experimentSessionIsRunning(sessions,experimentResourceId)) return;
    const remainingMs=STOP_SESSION_CONVERGENCE_TIMEOUT_MS-(Date.now()-startedAt);
    if (remainingMs<=0) {
      throw new Error(
        `Experiment Session ${experimentResourceId} remained active after Stop for `
        + `${STOP_SESSION_CONVERGENCE_TIMEOUT_MS} ms.`,
      );
    }
    await abortableDelay(
      Math.min(STOP_SESSION_CONVERGENCE_INTERVAL_MS,remainingMs),signal,
    );
  }
}

function abortableDelay(delayMs:number,signal:AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  let onAbort:() => void=() => undefined;
  const aborted=new Promise<void>((resolve) => { onAbort=() => resolve(); });
  signal.addEventListener('abort',onAbort,{ once:true });
  return Promise.race([waitForTransportRetry(delayMs),aborted])
    .finally(() => signal.removeEventListener('abort',onAbort));
}
