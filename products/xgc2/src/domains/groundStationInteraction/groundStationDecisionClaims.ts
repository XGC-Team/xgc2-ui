import { useEffect,useSyncExternalStore } from 'react';

// A mounted feature dialog may present a run's decisions inline. The generic
// fallback resumes as soon as that surface unmounts; decisions remain durable.
const claims = new Map<string,number>();
const listeners = new Set<() => void>();
let revision = 0;
const subscribe = (listener:() => void) => { listeners.add(listener);return () => { listeners.delete(listener); }; };
function changed() { revision++;listeners.forEach((listener) => listener()); }
const key = (targetId:string,runId:string) => JSON.stringify([targetId,runId]);

export function useGroundStationDecisionPresentation(targetId:string,runId:string|undefined) {
  useEffect(() => {
    if (!runId) return;
    const id = key(targetId,runId);
    claims.set(id,(claims.get(id) ?? 0) + 1);changed();
    return () => {
      const count = (claims.get(id) ?? 1) - 1;
      if (count) claims.set(id,count);else claims.delete(id);
      changed();
    };
  },[targetId,runId]);
}
export function useGroundStationDecisionPresented(targetId:string) {
  useSyncExternalStore(subscribe,() => revision,() => 0);
  return (runId:string|undefined) => Boolean(runId && claims.has(key(targetId,runId)));
}
