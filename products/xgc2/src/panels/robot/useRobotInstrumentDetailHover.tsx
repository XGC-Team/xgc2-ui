import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useProductRouteVisible } from '../../shared/routeReady';
import { useExperimentSurfaceVisible } from '../../domains/experiment/experimentPublic';
import { useDelayedTask } from '../../hooks/useDelayedTask';
import { placeInstrumentDetailNearPointer } from './robotInstrumentDetailPlacement';

export const ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS = 700;
export const ROBOT_INSTRUMENT_DETAIL_HIDE_DELAY_MS = 200;

export function useRobotInstrumentDetailHover({
  robotId,
  content,
}: {
  robotId: string;
  content: ReactNode;
}) {
  const routeVisible = useProductRouteVisible();
  const experimentVisible = useExperimentSurfaceVisible();
  const visible = routeVisible && experimentVisible;
  const pointer = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const suppressedTitles = useRef<Array<{ node: Element; title: string }>>([]);
  const [overCard, setOverCard] = useState(false);
  const [overOverlay, setOverOverlay] = useState(false);
  const [open, setOpen] = useState(false);
  const over = overCard || overOverlay;

  const restoreTitles = useCallback(() => {
    for (const { node, title } of suppressedTitles.current) {
      // A telemetry render may have supplied a newer title while hovered.
      if (node.isConnected && !node.hasAttribute('title')) node.setAttribute('title', title);
    }
    suppressedTitles.current = [];
  }, []);

  const suppressTitles = useCallback((root: HTMLElement) => {
    restoreTitles();
    root.querySelectorAll('[title]').forEach((node) => {
      const title = node.getAttribute('title');
      if (!title) return;
      suppressedTitles.current.push({ node, title });
      node.removeAttribute('title');
    });
  }, [restoreTitles]);

  useDelayedTask({
    enabled: visible && over && !open,
    delayMs: ROBOT_INSTRUMENT_DETAIL_SHOW_DELAY_MS,
    task: () => setOpen(true),
  });
  useDelayedTask({
    enabled: visible && !over && open,
    delayMs: ROBOT_INSTRUMENT_DETAIL_HIDE_DELAY_MS,
    task: () => setOpen(false),
  });

  useLayoutEffect(() => {
    if (visible) return;
    setOpen(false);
    setOverCard(false);
    setOverOverlay(false);
  }, [visible]);

  useLayoutEffect(() => {
    if (overCard || open) return;
    restoreTitles();
  }, [open, overCard, restoreTitles]);

  useLayoutEffect(() => restoreTitles, [restoreTitles]);

  const place = useCallback(() => {
    const node = tooltipRef.current;
    if (!node) return;
    const { left, top } = placeInstrumentDetailNearPointer({
      x: pointer.current.x,
      y: pointer.current.y,
      width: node.offsetWidth,
      height: node.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.visibility = 'visible';
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  const recordPointer = (event: ReactPointerEvent<HTMLElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY };
  };

  const portal = visible && open && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="xgc-tooltip robot-instrument-detail-overlay"
        data-xgc-portaled="true"
        data-xgc-role="robot-instrument-detail-overlay"
        data-xgc-id={robotId}
        role="tooltip"
        ref={tooltipRef}
        style={{ position: 'fixed', visibility: 'hidden' }}
        onPointerEnter={() => setOverOverlay(true)}
        onPointerLeave={() => setOverOverlay(false)}
      >
        {content}
      </div>,
      document.body,
    )
    : null;

  return {
    portal,
    pointerHandlers: {
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
        recordPointer(event);
        suppressTitles(event.currentTarget);
        setOverCard(true);
      },
      onPointerMove: recordPointer,
      onPointerLeave: () => setOverCard(false),
    },
  };
}
