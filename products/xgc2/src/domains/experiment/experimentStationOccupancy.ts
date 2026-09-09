export const OTHER_EXPERIMENT_RUNNING_REASON = 'Another Experiment is already running.';

/** Station occupancy fence for every Experiment except the one that already owns the Run. */
export function otherExperimentRunDisabledReason(
  visibleExperimentId: string,
  runningExperimentIds: ReadonlySet<string>,
  occupancyResolved: boolean,
): string {
  if (!visibleExperimentId || !occupancyResolved) return '';
  for (const id of runningExperimentIds) {
    if (id && id !== visibleExperimentId) return OTHER_EXPERIMENT_RUNNING_REASON;
  }
  return '';
}
