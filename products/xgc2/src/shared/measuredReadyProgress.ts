/** V10 historical emerald for measured-complete progress fills. Family token. */
export const MEASURED_READY_PROGRESS_FILL = 'var(--color-progress-measured)';

/** Shared ProgressBar / WorkflowStatusCard complete fill. Do not use tone:success alone. */
export const measuredReadyProgress = {
  color: MEASURED_READY_PROGRESS_FILL,
  tone: 'success' as const,
};

/** Last-run workflow node failure. Do not use Kill/E-stop solid surfaces. */
export const MEASURED_FAILED_PROGRESS_FILL = 'var(--color-progress-failed)';

export const measuredFailedProgress = {
  color: MEASURED_FAILED_PROGRESS_FILL,
  tone: 'danger' as const,
};

/** Occupancy census on an Experiment Action tile. Domain may source it from owned Processes or work-node occupancy. */
export type WorkflowTileOccupancy = {
  ready: number;
  total: number;
  state?: 'starting' | 'running' | 'degraded';
};

/**
 * Shared Experiment tile progress. Every Experiment button is a workflow:
 * wait nodes keep a resident graph green; a finite graph returns idle gray
 * after success/stop; a node failure keeps a measured red fill until the next
 * invoke. Kill/E-stop solid surfaces still override the fill in shared CSS.
 */
export function workflowTileProgress({
  active,busy = false,failed,occupancy,
}:{
  active: boolean;
  busy?: boolean;
  failed: boolean;
  occupancy?: WorkflowTileOccupancy;
}) {
  const censusTotal = (active || failed) && occupancy && occupancy.total > 0 ? occupancy.total : 0;
  const total = censusTotal > 0 ? censusTotal : (active || failed) ? 1 : 0;
  const readyCount = censusTotal > 0 ? Math.max(0, occupancy?.ready ?? 0) : (failed ? 1 : 0);
  const complete = !busy && active && occupancy?.state === 'running' && occupancy.total > 0;
  const percent = complete ? 100
    : failed && total > 0 ? Math.round((100 * Math.max(readyCount,1)) / total)
    : failed ? 100
    : total > 0 ? Math.round((100 * readyCount) / total) : 0;
  return {
    percent,
    ...(total > 0 ? { value:failed ? Math.max(readyCount,1) : readyCount,max:Math.max(1,total) } : {}),
    ...(complete && !failed ? measuredReadyProgress : {}),
    ...(failed ? measuredFailedProgress : {}),
  };
}
