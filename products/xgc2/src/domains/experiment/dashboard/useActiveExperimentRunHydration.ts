import { useEffect,useRef } from 'react';
import type { AutomationRunDetail } from '../../automation/automationPublic';
import type { RunDetailDemand } from './panelRunDetailDemand';

export function useActiveExperimentRunHydration({
  runs,
  targetId,
  detailsById,
  loadRunDetail,
}: {
  runs:readonly RunDetailDemand[];
  targetId:string;
  detailsById:Readonly<Record<string,AutomationRunDetail>>;
  loadRunDetail:(runId:string,expectedRevision?:number) => Promise<unknown>;
}) {
  const failedRef = useRef(new Map<string,number>());
  const inFlightRef = useRef(new Set<string>());
  const keys = activeExperimentRunsToHydrate(runs,targetId,detailsById);
  const signature = keys.map((key) => `${key.id}:${key.revision}`).join('\n');

  useEffect(() => {
    const hydrationKeys = activeExperimentRunsToHydrate(runs,targetId,detailsById);
    const retainedRunIds = new Set(runs.filter((run) => run.targetId === targetId).map((run) => run.id));
    failedRef.current.forEach((_,runId) => {
      if (!retainedRunIds.has(runId)) failedRef.current.delete(runId);
    });
    hydrationKeys.forEach((key) => {
      if (failedRef.current.get(key.id) === key.revision) return;
      const flightKey = `${key.id}:${key.revision}`;
      if (inFlightRef.current.has(flightKey)) return;
      inFlightRef.current.add(flightKey);
      void Promise.resolve(loadRunDetail(key.id,key.revision)).then((detail) => {
        if (runDetailLoadFailed(detail)) failedRef.current.set(key.id,key.revision);
        else failedRef.current.delete(key.id);
      },() => {
        failedRef.current.set(key.id,key.revision);
      }).finally(() => {
        inFlightRef.current.delete(flightKey);
      });
    });
  },[detailsById,loadRunDetail,runs,signature,targetId]);
}

function runDetailLoadFailed(detail:unknown) {
  return Boolean(detail && typeof detail==='object' && 'error' in detail
    && typeof detail.error==='string' && detail.error);
}

function activeExperimentRunsToHydrate(
  runs:readonly RunDetailDemand[],
  targetId:string,
  detailsById:Readonly<Record<string,AutomationRunDetail>>,
) {
  return runs.flatMap((run) => {
    if (run.targetId !== targetId) return [];
    const detail = detailsById[run.id];
    if (detail?.loading || (detail?.run?.revision === run.revision && detail.relations)) return [];
    return [{ id:run.id,revision:run.revision }];
  });
}
