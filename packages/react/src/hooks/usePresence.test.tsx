import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { usePresence } from './usePresence';

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function renderPresence(open: boolean) {
  return renderHook(
    ({ isOpen }) => {
      const ref = useRef<HTMLElement | null>(null);
      return usePresence(isOpen, ref);
    },
    { initialProps: { isOpen: open } },
  );
}

describe('usePresence', () => {
  it('tracks open exactly when matchMedia is unavailable (test DOM)', () => {
    // jsdom exposes no matchMedia: the instant path preserves historical
    // immediate-unmount behavior for the whole component suite.
    const { result, rerender } = renderPresence(true);
    expect(result.current).toEqual({ mounted: true, exiting: false });
    rerender({ isOpen: false });
    expect(result.current).toEqual({ mounted: false, exiting: false });
  });

  it('tracks open exactly for reduced-motion operators', () => {
    stubMatchMedia(true);
    const { result, rerender } = renderPresence(true);
    rerender({ isOpen: false });
    expect(result.current).toEqual({ mounted: false, exiting: false });
    vi.restoreAllMocks();
    delete (window as Partial<Window>).matchMedia;
  });

  it('keeps a closing surface mounted until its exit animations finish', async () => {
    stubMatchMedia(false);
    let resolveAnimation!: () => void;
    const animation = { finished: new Promise<void>((resolve) => { resolveAnimation = resolve; }) };
    const node = document.createElement('div');
    node.getAnimations = vi.fn().mockReturnValue([animation]);
    const { result, rerender } = renderHook(
      ({ isOpen }) => {
        const ref = useRef<HTMLElement | null>(node);
        return usePresence(isOpen, ref);
      },
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });
    expect(result.current).toEqual({ mounted: true, exiting: true });
    await act(async () => {
      resolveAnimation();
      await animation.finished;
    });
    expect(result.current).toEqual({ mounted: false, exiting: false });
    delete (window as Partial<Window>).matchMedia;
  });

  it('never waits on infinite descendant animations (spinner inside the surface)', async () => {
    stubMatchMedia(false);
    let resolveExit!: () => void;
    const exitAnimation = {
      finished: new Promise<void>((resolve) => { resolveExit = resolve; }),
      effect: { getComputedTiming: () => ({ iterations: 1 }) },
    };
    const spinner = {
      finished: new Promise<void>(() => undefined),
      effect: { getComputedTiming: () => ({ iterations: Infinity }) },
    };
    const node = document.createElement('div');
    node.getAnimations = vi.fn().mockReturnValue([exitAnimation, spinner]);
    const { result, rerender } = renderHook(
      ({ isOpen }) => {
        const ref = useRef<HTMLElement | null>(node);
        return usePresence(isOpen, ref);
      },
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });
    expect(result.current).toEqual({ mounted: true, exiting: true });
    await act(async () => {
      resolveExit();
      await exitAnimation.finished;
    });
    expect(result.current).toEqual({ mounted: false, exiting: false });
    delete (window as Partial<Window>).matchMedia;
  });

  it('ends the exit window immediately when only infinite animations are running', async () => {
    stubMatchMedia(false);
    const spinner = {
      finished: new Promise<void>(() => undefined),
      effect: { getComputedTiming: () => ({ iterations: Infinity }) },
    };
    const node = document.createElement('div');
    node.getAnimations = vi.fn().mockReturnValue([spinner]);
    const { result, rerender } = renderHook(
      ({ isOpen }) => {
        const ref = useRef<HTMLElement | null>(node);
        return usePresence(isOpen, ref);
      },
      { initialProps: { isOpen: true } },
    );
    await act(async () => {
      rerender({ isOpen: false });
    });
    expect(result.current).toEqual({ mounted: false, exiting: false });
    delete (window as Partial<Window>).matchMedia;
  });

  it('reopening inside the exit window cancels the exit', async () => {
    stubMatchMedia(false);
    const node = document.createElement('div');
    node.getAnimations = vi.fn().mockReturnValue([{ finished: new Promise<void>(() => undefined) }]);
    const { result, rerender } = renderHook(
      ({ isOpen }) => {
        const ref = useRef<HTMLElement | null>(node);
        return usePresence(isOpen, ref);
      },
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });
    expect(result.current.exiting).toBe(true);
    rerender({ isOpen: true });
    expect(result.current).toEqual({ mounted: true, exiting: false });
    delete (window as Partial<Window>).matchMedia;
  });
});
