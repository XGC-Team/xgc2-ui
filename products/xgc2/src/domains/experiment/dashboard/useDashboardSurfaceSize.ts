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
 * sidebar width transitions. The first mount needs a measurable viewport.
 * Hidden tabs retain their last layout and panel state until measurable again.
 * Does not dispatch window resize or write size back onto the observed node.
 */
export function useDashboardSurfaceSize(): DashboardSurfaceSize {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const pendingSize = useRef({ width: 0,height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0, mounted: false });

  const commit = useCallback((width: number,height: number) => {
    if (width <= 0 || height <= 0) return;
    setSize((current) => {
      if (current.width === width && current.height === height) return current;
      return { width, height, mounted: true };
    });
  }, []);

  const schedule = useCallback((node: HTMLElement) => {
    if (frame.current) return;
    frame.current = node.ownerDocument.defaultView?.requestAnimationFrame(() => {
      frame.current = 0;
      commit(pendingSize.current.width,pendingSize.current.height);
    }) ?? 0;
  }, [commit]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    commit(node.clientWidth,node.clientHeight);
    const view = node.ownerDocument.defaultView;
    const observer = typeof view?.ResizeObserver === 'function'
      ? new view.ResizeObserver((entries) => {
        const entry=entries.find((item) => item.target===node);
        if (!entry) return;
        // The dashboard shell has no padding/border. Use the size the browser
        // already measured instead of forcing another layout in the next rAF.
        pendingSize.current={ width:Math.round(entry.contentRect.width),height:Math.round(entry.contentRect.height) };
        schedule(node);
      })
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
