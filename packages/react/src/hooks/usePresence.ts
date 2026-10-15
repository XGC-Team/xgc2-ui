import { useEffect, useState, type RefObject } from 'react';

export type PresenceState = {
  /** Keep the overlay in the tree while true: open, or closing with motion. */
  mounted: boolean;
  /** True only during the closing exit window. */
  exiting: boolean;
};

/**
 * Owns the closing window of an overlay. Enter motion is pure CSS on mount;
 * this hook only keeps a closing surface mounted until its exit animations
 * finish (`getAnimations({ subtree: true })` on the surface the caller hands
 * in), with a safety timer so a cancelled animation can never leak the node.
 *
 * Reduced-motion operators and environments without matchMedia (test DOMs)
 * get the instant path: `mounted` tracks `open` exactly, preserving the
 * historical immediate-unmount behavior.
 */
export function usePresence(open: boolean, surfaceRef: RefObject<HTMLElement | null>): PresenceState {
  const motionAllowed = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [exiting, setExiting] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);

  // Adjust during render so the closing surface never unmounts in the commit
  // that flips open. Reopening inside the exit window cancels it.
  if (previousOpen !== open) {
    setPreviousOpen(open);
    setExiting(previousOpen && !open && motionAllowed);
  }

  useEffect(() => {
    if (!exiting) return undefined;
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setExiting(false);
    };
    const node = surfaceRef.current;
    const animations = node && typeof node.getAnimations === 'function'
      ? node.getAnimations({ subtree: true })
      : [];
    if (animations.length === 0) {
      finish();
      return undefined;
    }
    Promise.all(animations.map((animation) => animation.finished)).then(finish, finish);
    // A hidden tab or a removed node must not leak the overlay: this timer is
    // a leak guard, never the visual timing (that lives in CSS tokens).
    const guard = window.setTimeout(finish, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(guard);
    };
  }, [exiting, surfaceRef]);

  return { mounted: open || exiting, exiting };
}
