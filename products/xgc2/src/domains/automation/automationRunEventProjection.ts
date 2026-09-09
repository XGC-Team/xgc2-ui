import type { ExecutionEvent } from '../execution/executionPublic';
import { isRunStatus,isRunStatusTerminal,type AutomationRunStatus } from '../../shared/executionStatusVocabulary';

type RevisionedRun = {
  id:string;
  status:AutomationRunStatus;
  revision:number;
  updatedAt:string;
  finishedAt?:string;
};

export type AutomationRunLifecycleEventApplication='applied'|'unobserved'|'unresolved';

/** Applies the complete lifecycle facts carried by one ordered SSE event. */
export function projectAutomationRunLifecycleEvent<T extends RevisionedRun>(
  run:T,
  event:ExecutionEvent,
):T|undefined {
  const runPayload=event.payload.run && typeof event.payload.run==='object' && !Array.isArray(event.payload.run)
    ? event.payload.run as Record<string,unknown> : undefined;
  const status=event.payload.status ?? runPayload?.status;
  const revision=event.payload.revision ?? runPayload?.revision;
  if (event.entityId!==run.id || !isRunStatus(status)
    || !Number.isSafeInteger(revision) || (revision as number)<1) return undefined;
  const exactRevision=revision as number;
  if (exactRevision<run.revision) return run;
  if (exactRevision===run.revision) return status===run.status ? run : undefined;
  return {
    ...run,status,revision:exactRevision,updatedAt:event.createdAt,
    ...(isRunStatusTerminal(status) ? { finishedAt:event.createdAt } : {}),
  };
}
