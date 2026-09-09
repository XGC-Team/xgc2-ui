import { useEffect,useMemo,useRef } from 'react';
import type { AutomationRunDetail } from '../../automation/automationPublic';
import { runRelationChildrenToHydrate } from '../panelWorkflowRunTree';

/**
 * Event-driven nested child-run hydration from generic run relations.
 * Reloads only when `{ runId, runRevision, relationRevision }` changes.
 * Failed loads do not retry at the same revision. No timer or polling.
 */
export function useRunRelationChildHydration({
  rootRunIds,
  detailsById,
  loadRunDetail,
}: {
  rootRunIds:readonly string[];
  detailsById:Readonly<Record<string,AutomationRunDetail>>;
  loadRunDetail:(runId:string,expectedRevision?:number) => Promise<unknown>;
}) {
  const failedRef = useRef(new Map<string,{ runRevision:number;relationRevision:number }>());
  const inFlightRef = useRef(new Set<string>());
  const rootSignature=[...new Set(rootRunIds.map((runId) => runId.trim()).filter(Boolean))].sort().join('\n');
  const stableRootRunIds=useMemo(() => rootSignature ? rootSignature.split('\n') : [],[rootSignature]);
  const keys = runRelationChildrenToHydrate(detailsById,stableRootRunIds);
  const signature = keys.map((key) => (
    `${key.runId}:${key.runRevision}:${key.relationRevision}`
  )).join('\n');

  useEffect(() => {
    const hydrationKeys = runRelationChildrenToHydrate(detailsById,stableRootRunIds);
    const retainedRunIds = new Set([
      ...stableRootRunIds,
      ...hydrationKeys.map(({ runId }) => runId),
    ]);
    failedRef.current.forEach((_,runId) => {
      if (!retainedRunIds.has(runId)) failedRef.current.delete(runId);
    });
    hydrationKeys.forEach((key) => {
      const previous = failedRef.current.get(key.runId);
      if (previous
        && previous.runRevision === key.runRevision
        && previous.relationRevision === key.relationRevision) {
        return;
      }
      const flightKey = `${key.runId}:${key.runRevision}:${key.relationRevision}`;
      if (inFlightRef.current.has(flightKey)) return;
      inFlightRef.current.add(flightKey);
      void Promise.resolve(loadRunDetail(key.runId,key.runRevision)).then((detail) => {
        if (runDetailLoadFailed(detail)) failedRef.current.set(key.runId,{
          runRevision:key.runRevision,relationRevision:key.relationRevision,
        });
        else failedRef.current.delete(key.runId);
      },() => {
        failedRef.current.set(key.runId,{
          runRevision:key.runRevision,relationRevision:key.relationRevision,
        });
      }).finally(() => {
        inFlightRef.current.delete(flightKey);
      });
    });
  },[detailsById,loadRunDetail,rootSignature,signature,stableRootRunIds]);
}

function runDetailLoadFailed(detail:unknown) {
  return Boolean(detail && typeof detail==='object' && 'error' in detail
    && typeof detail.error==='string' && detail.error);
}
