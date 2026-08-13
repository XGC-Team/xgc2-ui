import type { HTMLAttributes } from 'react';
import { classNames } from '../utils';

export type NoticeRegionProps = HTMLAttributes<HTMLDivElement> & {
  placement?: 'bottom-end' | 'top-center' | 'top-end';
};

/** Viewport-safe stack for notices; Notice children continue to own alert/status semantics. */
export function NoticeRegion({
  'aria-label': ariaLabel = 'Notifications',
  className,
  placement = 'top-end',
  ...props
}: NoticeRegionProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={classNames('xgc-notice-region', className)}
      data-placement={placement}
      role="region"
    />
  );
}
