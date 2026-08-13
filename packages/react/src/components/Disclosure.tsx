import type { DetailsHTMLAttributes, ReactNode, SyntheticEvent } from 'react';
import { classNames } from '../utils';

export type DisclosureProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, 'onToggle' | 'title'> & {
  leading?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  summary: ReactNode;
  trailing?: ReactNode;
};

export function Disclosure({
  children,
  className,
  leading,
  onOpenChange,
  summary,
  trailing,
  ...props
}: DisclosureProps) {
  return (
    <details
      {...props}
      className={classNames('xgc-disclosure', className)}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary className="xgc-disclosure-summary">
        {leading ? <span className="xgc-disclosure-leading" aria-hidden="true">{leading}</span> : null}
        <span className="xgc-disclosure-title">{summary}</span>
        {trailing ? <span className="xgc-disclosure-trailing">{trailing}</span> : null}
        <span className="xgc-disclosure-chevron" aria-hidden="true">›</span>
      </summary>
      <div className="xgc-disclosure-content">{children}</div>
    </details>
  );
}
