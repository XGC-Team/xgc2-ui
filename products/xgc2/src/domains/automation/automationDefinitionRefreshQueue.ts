type DefinitionRead<T> = (signal?:AbortSignal) => Promise<T | undefined>;

/** An invalidation during a read requires one subsequent read, not a competing
 * request that discards a successful initial snapshot before it is published. */
export function createAutomationDefinitionRefreshQueue<T>(read:DefinitionRead<T>):DefinitionRead<T> {
  let inFlight:Promise<T | undefined> | undefined;
  let queued:Promise<T | undefined> | undefined;

  function refresh(signal?:AbortSignal):Promise<T | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined);
    if (inFlight) {
      // A caller-owned cancellation must not cancel an unrelated invalidation.
      if (signal) return inFlight.then(() => refresh(signal),() => refresh(signal));
      if (!queued) {
        const readAfterInvalidation = () => {
          queued = undefined;
          return refresh();
        };
        queued = inFlight.then(readAfterInvalidation,readAfterInvalidation);
      }
      return queued;
    }
    const reading = read(signal);
    inFlight = reading;
    const release = () => { if (inFlight === reading) inFlight = undefined; };
    void reading.then(release,release);
    return reading;
  }
  return refresh;
}
