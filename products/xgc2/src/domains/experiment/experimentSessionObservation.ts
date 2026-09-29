import type { ExperimentSessionView } from './experimentWorkflowModel';

export type ExperimentSessionRefresh = {
  refresh:() => Promise<void>;
  cancel:() => void;
};

type ReadFlight = {
  controller:AbortController;
  promise:Promise<void>;
  resolve:() => void;
  reject:(cause:unknown) => void;
};

/**
 * One ordinary Session read in flight and at most one pending read. Requests
 * made during a read share the next read, which starts after their intents.
 * Each batch settles independently: continuous SSE invalidation must neither
 * hold earlier callers until the stream goes quiet nor freeze useful progress.
 * isLatest fences obsolete failures/retries; successful serial reads can still
 * publish intermediate truth. Stop and scope cleanup cancel both batches.
 */
export function createExperimentSessionRefresh(
  read:(signal:AbortSignal,isLatest:() => boolean) => Promise<unknown>,
):ExperimentSessionRefresh {
  let active:ReadFlight|undefined;
  let pending:ReadFlight|undefined;

  const run=async (current:ReadFlight) => {
    const isLatest=() => active===current && !pending && !current.controller.signal.aborted;
    try {
      await read(current.controller.signal,isLatest);
      current.resolve();
    } catch (cause) {
      if (isLatest()) current.reject(cause);
      else current.resolve();
    } finally {
      if (active===current) {
        active=pending;
        pending=undefined;
        if (active) void run(active);
      }
    }
  };

  return {
    refresh() {
      if (active) {
        pending ??= newReadFlight();
        return pending.promise;
      }
      const current=newReadFlight();
      active=current;
      void run(current);
      return current.promise;
    },
    cancel() {
      const canceled=[active,pending];
      active=undefined;
      pending=undefined;
      for (const current of canceled) {
        if (!current) continue;
        current.controller.abort();
        // An uncooperative transport must not hold Stop, scope cleanup, or
        // callers waiting on either superseded batch hostage.
        current.resolve();
      }
    },
  };
}

function newReadFlight():ReadFlight {
  let resolve!:() => void;
  let reject!:(cause:unknown) => void;
  const promise=new Promise<void>((onResolve,onReject) => {
    resolve=onResolve;
    reject=onReject;
  });
  return { controller:new AbortController(),promise,resolve,reject };
}

/**
 * Reuse only a completely unchanged authoritative response. Member state can
 * advance without the aggregate Session revision changing. Compare the entire
 * JSON payload, including optional fields not declared by the UI projection,
 * rather than treating any one revision as a complete snapshot version.
 */
export function retainExperimentSessionViews(
  previous:readonly ExperimentSessionView[],
  incoming:readonly ExperimentSessionView[],
):readonly ExperimentSessionView[] {
  return sameJSONValue(previous,incoming) ? previous : incoming;
}

function sameJSONValue(left:unknown,right:unknown):boolean {
  if (left===right) return true;
  if (!left || !right || typeof left!=='object' || typeof right!=='object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length===right.length
      && left.every((value,index) => sameJSONValue(value,right[index]));
  }
  const leftRecord=left as Record<string,unknown>;
  const rightRecord=right as Record<string,unknown>;
  const keys=Object.keys(leftRecord);
  return keys.length===Object.keys(rightRecord).length && keys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord,key)
      && sameJSONValue(leftRecord[key],rightRecord[key])
  ));
}
