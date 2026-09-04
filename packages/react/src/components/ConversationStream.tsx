import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { classNames } from '../utils';
import { Button } from './Button';
import type { ConversationDensity } from './Conversation';
import './ConversationStream.css';

const TAIL_THRESHOLD_PX = 48;

export type ConversationStreamHandle = {
  isFollowing: () => boolean;
  scrollToLatest: (behavior?: ScrollBehavior) => void;
};

export type ConversationStreamProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  busy?: boolean;
  children: ReactNode;
  density?: ConversationDensity;
  followLabel?: ReactNode;
  label: string;
  onFollowingChange?: (following: boolean) => void;
};

/**
 * Streaming-safe conversation viewport.
 *
 * Incremental token/tool output follows the tail only while the operator stays
 * there. Scrolling upward suspends follow mode instead of fighting the user's
 * reading position. `ResizeObserver` reacts to content growth without polling.
 */
export const ConversationStream = forwardRef<ConversationStreamHandle, ConversationStreamProps>(function ConversationStream({
  busy = false,
  children,
  className,
  density = 'default',
  followLabel = 'Jump to latest',
  label,
  onFollowingChange,
  onScroll,
  ...props
}, ref) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowingState] = useState(true);

  const setFollowing = (next: boolean) => {
    if (followingRef.current === next) return;
    followingRef.current = next;
    setFollowingState(next);
    onFollowingChange?.(next);
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setFollowing(true);
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
  };

  const syncFollowingFromScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setFollowing(distance <= TAIL_THRESHOLD_PX);
  };

  useImperativeHandle(ref, () => ({
    isFollowing: () => followingRef.current,
    scrollToLatest,
  }));

  useLayoutEffect(() => {
    scrollToLatest('auto');
    // Initial mount is the only unconditional jump. Subsequent growth follows
    // the operator-owned tail state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return undefined;
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (!followingRef.current) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (followingRef.current) scrollToLatest('auto');
      });
    });
    observer.observe(content);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // ResizeObserver is not available in every test/embedded environment. This
  // keeps ordinary React child replacement following the same tail contract.
  useEffect(() => {
    if (followingRef.current) queueMicrotask(() => {
      if (followingRef.current) scrollToLatest('auto');
    });
  }, [children]);

  return (
    <div className={classNames('xgc-conversation-stream-shell', className)}>
      <div
        {...props}
        aria-busy={busy || undefined}
        aria-label={label}
        aria-live="polite"
        aria-relevant="additions text"
        className="xgc-conversation-stream"
        data-density={density}
        onScroll={(event) => {
          syncFollowingFromScroll();
          onScroll?.(event);
        }}
        ref={viewportRef}
        role="log"
      >
        <div className="xgc-conversation-stream-content" ref={contentRef}>
          {children}
        </div>
      </div>
      {!following ? (
        <Button
          appearance="default"
          className="xgc-conversation-stream-follow"
          onClick={() => scrollToLatest('smooth')}
          uiSize="compact"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2v9m-4-3 4 4 4-4" /></svg>
          {followLabel}
        </Button>
      ) : null}
    </div>
  );
});
