import type { HTMLAttributes } from 'react';
import { classNames } from '../utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneByStatus: Record<string, StatusTone> = {
  accepted: 'info',
  active: 'success',
  approved: 'success',
  blocked: 'warning',
  canceled: 'danger',
  created: 'warning',
  dead: 'danger',
  enabled: 'success',
  error: 'danger',
  exited: 'danger',
  failed: 'danger',
  info: 'info',
  interrupted: 'danger',
  lost: 'danger',
  paused: 'warning',
  pending: 'warning',
  queued: 'warning',
  rejected: 'danger',
  restarting: 'warning',
  running: 'success',
  starting: 'warning',
  succeeded: 'success',
  waiting: 'warning',
  warning: 'warning',
};

export type StatusTextProps = HTMLAttributes<HTMLSpanElement> & {
  status: string;
  tone?: StatusTone;
};

export function StatusText({ children, className, status, tone, ...props }: StatusTextProps) {
  const normalizedStatus = status.trim().toLowerCase();
  return (
    <span
      {...props}
      className={classNames('xgc-status-text', className)}
      data-status={normalizedStatus}
      data-tone={tone ?? toneByStatus[normalizedStatus] ?? 'neutral'}
    >
      {children ?? status}
    </span>
  );
}
