import { useCallback,useLayoutEffect,useRef } from 'react';

/**
 * One function identity for the component's lifetime that always runs the
 * latest committed implementation. For event handlers and commands only: it
 * must not be called during render, and an effect must not use its identity
 * as the signal that inputs changed.
 */
export function useStableCallback<A extends unknown[],R>(implementation:(...args:A) => R):(...args:A) => R {
  const latest = useRef(implementation);
  useLayoutEffect(() => {
    latest.current = implementation;
  });
  return useCallback((...args:A) => latest.current(...args),[]);
}
