import { useCallback,useLayoutEffect,useRef,useState } from 'react';

export type DashboardSurfaceSize = {
  width: number;
  height: number;
  mounted: boolean;
  containerRef: { current: HTMLDivElement | null };
};

/**
 * Experiment dashboard size authority. ResizeObserver readings coalesce to one
 * rAF so react-grid-layout width tracks the interpolating workspace, including
 * sidebar width transitions. The grid stays unmounted until both width and
 * height are nonzero so GCS cannot first paint against a guessed viewport
 * height and then snap instruments. Does not dispatch window resize and does
 * not write measured size back onto the observed node.
 */
export function useDashboardSurfaceSize(): DashboardSurfaceSize {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0, mounted: false });

  const commit = useCallback((node: HTMLElement) => {
    const width = node.clientWidth;
    const height = node.clientHeight;
    const mounted = width > 0 && height > 0;
    setSize((current) => {
      if (current.mounted === mounted && current.width === width && current.height === height) return current;
      return { width, height, mounted };
    });
  }, []);

  const schedule = useCallback((node: HTMLElement) => {
    if (frame.current) return;
    frame.current = node.ownerDocument.defaultView?.requestAnimationFrame(() => {
      frame.current = 0;
      commit(node);
    }) ?? 0;
  }, [commit]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    commit(node);
    const view = node.ownerDocument.defaultView;
    const observer = typeof view?.ResizeObserver === 'function'
      ? new view.ResizeObserver(() => schedule(node))
      : null;
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      if (frame.current && view) view.cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [commit, schedule]);

  return { ...size, containerRef };
}
