import type { HTMLAttributes } from 'react';
import { classNames } from '../utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneByStatus: Record<string, StatusTone> = {
  accepted: 'neutral',
  active: 'neutral',
  approved: 'neutral',
  available: 'neutral',
  blocked: 'warning',
  canceled: 'neutral',
  cancelled: 'neutral',
  checking: 'info',
  cleared: 'neutral',
  clearing: 'info',
  complete: 'neutral',
  completed: 'neutral',
  compensated: 'neutral',
  compensating: 'info',
  configured: 'neutral',
  connected: 'neutral',
  created: 'neutral',
  dead: 'danger',
  dead_letter: 'danger',
  degraded: 'warning',
  disconnected: 'danger',
  disabled: 'warning',
  enabled: 'neutral',
  error: 'danger',
  exited: 'danger',
  failed: 'danger',
  failing: 'danger',
  failure: 'danger',
  healthy: 'neutral',
  idle: 'neutral',
  info: 'info',
  interrupted: 'danger',
  live: 'neutral',
  loading: 'info',
  lost: 'danger',
  mounted: 'neutral',
  missing: 'danger',
  offline: 'danger',
  online: 'neutral',
  passing: 'neutral',
  paused: 'warning',
  pending: 'info',
  queued: 'info',
  ready: 'neutral',
  rejected: 'danger',
  restarting: 'info',
  running: 'info',
  saving: 'info',
  starting: 'info',
  stale: 'warning',
  stopped: 'neutral',
  stopping: 'info',
  succeeded: 'neutral',
  success: 'neutral',
  testing: 'info',
  unavailable: 'warning',
  unhealthy: 'danger',
  unconfigured: 'warning',
  unmounted: 'warning',
  unknown: 'neutral',
  waiting: 'info',
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
