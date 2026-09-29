import { useEffect } from 'react';
import {
  fulfillExperimentAgentViewJob,
  pollExperimentAgentViewJob,
  waitForExperimentAgentViewRetry,
} from './experimentAgentViewService';
import { captureErrorCode,captureExperimentPanel,type ExperimentPanelCapture } from './agentViewCapture';

/** Idle re-check while no Agent delegation is live; stays inside Core's 8 s capture window. */
const DELEGATION_RECHECK_MS = 5_000;

export function useExperimentAgentViewCapture(experimentId?: string) {
  useEffect(() => {
    if (!experimentId) return;
    const abort = new AbortController();
    let stopped = false;
    const loop = async () => {
      while (!stopped && !abort.signal.aborted) {
        try {
          const { job,delegated } = await pollExperimentAgentViewJob(experimentId, { signal: abort.signal });
          if (stopped) continue;
          if (!job) {
            // Without a live delegation nothing can request a view, so do not hold a connection.
            if (!delegated) await waitForExperimentAgentViewRetry(DELEGATION_RECHECK_MS);
            continue;
          }
          let shot:ExperimentPanelCapture;
          try {
            shot = await captureExperimentPanel(job.panelId, job.view, job.pluginId, { signal: abort.signal });
          } catch (error) {
            if (stopped || abort.signal.aborted) return;
            await fulfillExperimentAgentViewJob(experimentId, job.id, { code: captureErrorCode(error) });
            await waitForExperimentAgentViewRetry(750);
            continue;
          }
          if (stopped || abort.signal.aborted) return;
          await fulfillExperimentAgentViewJob(experimentId, job.id, shot);
        } catch {
          if (stopped || abort.signal.aborted) return;
          await waitForExperimentAgentViewRetry(750);
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [experimentId]);
}
