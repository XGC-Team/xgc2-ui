import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../utils';
import { useOverlayStack } from './OverlayStack';

let keyboardIntent = false;
let listenersBound = false;

function bindIntentListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' || event.key.startsWith('Arrow')) keyboardIntent = true;
  }, true);
  const clear = () => { keyboardIntent = false; };
  window.addEventListener('pointerdown', clear, true);
  window.addEventListener('mousedown', clear, true);
}

export type TooltipProps = {
  children: ReactNode;
  className?: string;
  content?: ReactNode;
  delayMs?: number;
  enabled?: boolean;
  hideDelayMs?: number;
  portalTarget?: Element | DocumentFragment;
};

export function Tooltip({
  children,
  className,
  content,
  delayMs = 200,
  enabled = true,
  hideDelayMs = 100,
  portalTarget,
}: TooltipProps) {
  bindIntentListeners();
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });
  const active = enabled && content !== undefined && content !== null && content !== false
    && (typeof content !== 'string' || Boolean(content.trim()));

  const clearTimers = useCallback(() => {
    if (showTimer.current !== undefined) clearTimeout(showTimer.current);
    if (hideTimer.current !== undefined) clearTimeout(hideTimer.current);
    showTimer.current = undefined;
    hideTimer.current = undefined;
  }, []);
  const dismiss = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);
  const overlay = useOverlayStack({ close: dismiss, open, rootRef: tooltipRef });
  const scheduleShow = useCallback(() => {
    if (!active) return;
    if (hideTimer.current !== undefined) clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => setOpen(true), Math.max(0, delayMs));
  }, [active, delayMs]);
  const scheduleHide = useCallback(() => {
    if (showTimer.current !== undefined) clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), Math.max(0, hideDelayMs));
  }, [hideDelayMs]);

  useEffect(() => clearTimers, [clearTimers]);
  useLayoutEffect(() => {
    if (!open || !active) return undefined;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const width = Math.max(tooltip.offsetWidth, tooltip.getBoundingClientRect().width, 160);
      const height = Math.max(tooltip.offsetHeight, tooltip.getBoundingClientRect().height, 24);
      const viewportPad = 8;
      const gap = 6;
      const above = trigger.top >= height + gap + viewportPad;
      const top = above ? trigger.top - height - gap : trigger.bottom + gap;
      const centered = trigger.left + Math.max(trigger.width, 1) / 2 - width / 2;
      setStyle({
        left: Math.min(Math.max(viewportPad, centered), Math.max(viewportPad, window.innerWidth - width - viewportPad)),
        position: 'fixed',
        top: Math.max(viewportPad, top),
        visibility: 'visible',
      });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    const dismissOnScroll = () => setOpen(false);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', dismissOnScroll, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', dismissOnScroll, true);
    };
  }, [active, open]);

  if (!active) return <>{children}</>;
  const focus = (event: FocusEvent<HTMLSpanElement>) => {
    if (keyboardIntent && triggerRef.current?.contains(event.target)) scheduleShow();
  };
  const blur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.relatedTarget || !triggerRef.current?.contains(event.relatedTarget as Node)) scheduleHide();
  };

  return (
    <>
      <span
        className={classNames('xgc-tooltip-trigger', className)}
        data-xgc-role="tooltip-trigger"
        data-xgc-tooltip-trigger="true"
        onBlurCapture={blur}
        onFocusCapture={focus}
        onKeyDown={(event) => {
          if (open) overlay.closeTopOverlay(event);
        }}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onPointerEnter={scheduleShow}
        onPointerLeave={scheduleHide}
        ref={triggerRef}
      >{children}</span>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          className="xgc-tooltip"
          data-xgc-portaled="true"
          data-xgc-role="tooltip"
          id={id}
          ref={tooltipRef}
          role="tooltip"
          style={style}
        >
          {content}
        </div>,
        portalTarget ?? document.body,
      ) : null}
    </>
  );
}
