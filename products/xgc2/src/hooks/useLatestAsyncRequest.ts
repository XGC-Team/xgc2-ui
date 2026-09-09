import { useCallback,useEffect,useRef } from 'react';

/**
 * Creates request tickets that remain current only for the latest request in
 * the current semantic identity. Changing identity or unmounting invalidates
 * every outstanding ticket synchronously.
 */
export function useLatestAsyncRequest(identity: string) {
  const requestRef = useRef({ identity,generation: 0,mounted: true });
  if (requestRef.current.identity !== identity) {
    requestRef.current.identity = identity;
    requestRef.current.generation += 1;
  }

  useEffect(() => {
    const request = requestRef.current;
    request.mounted = true;
    return () => {
      request.mounted = false;
      request.generation += 1;
    };
  }, []);

  return useCallback(() => {
    const requestIdentity = identity;
    const generation = requestRef.current.generation + 1;
    requestRef.current.generation = generation;
    return () => {
      const current = requestRef.current;
      return current.mounted
        && current.identity === requestIdentity
        && current.generation === generation;
    };
  }, [identity]);
}
