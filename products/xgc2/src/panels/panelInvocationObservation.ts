import type { PanelActionInvocation } from './types';

/** Revisions order facts about one Run, never facts about different invocations. */
export function newestPanelInvocation(
  accepted: PanelActionInvocation | undefined,
  ...observations: readonly (PanelActionInvocation | undefined)[]
): PanelActionInvocation | undefined {
  if (!accepted) return undefined;
  let newest = accepted;
  for (const observation of observations) {
    if (observation?.id === accepted.id && observation.revision > newest.revision) newest = observation;
  }
  return { id:newest.id,status:newest.status,revision:newest.revision };
}
