import { request } from './http';

export type ExperimentAgentViewJob = {
  id: string;
  panelId: string;
  pluginId: string;
  view: 'panel' | 'camera';
};

export type ExperimentAgentViewPoll = {
  job: ExperimentAgentViewJob | null;
  /** False means no Agent delegation is live, so nothing can request a view. */
  delegated: boolean;
};

export async function pollExperimentAgentViewJob(
  experimentId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ExperimentAgentViewPoll> {
  const result = await request<{ job?: ExperimentAgentViewJob | null; delegated?: boolean }>(
    `/experiments/${encodeURIComponent(experimentId)}/agent-view-jobs?waitMs=8000&whileDelegated=1`,
    { signal: options?.signal },
    { timeoutMs: options?.timeoutMs ?? 12_000 },
  );
  // A Core without the field still holds the request, which is the delegated behavior.
  return { job: result?.job ?? null, delegated: result?.delegated !== false };
}

export async function fulfillExperimentAgentViewJob(
  experimentId: string,
  jobId: string,
  body: { jpegBase64: string; width: number; height: number; kind: string } | { code: string },
) {
  await request(
    `/experiments/${encodeURIComponent(experimentId)}/agent-view-jobs/${encodeURIComponent(jobId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
