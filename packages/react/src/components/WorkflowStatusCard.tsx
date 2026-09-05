import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { ProgressBar, type ProgressBarTone } from './ProgressBar';

export type WorkflowStatusCardTone = ProgressBarTone;
export type WorkflowStatusCardLayout = 'default' | 'tile';
export type WorkflowStatusCardAppearance = 'default' | 'solid';

export type WorkflowStatusCardProgress = {
  /** Optional fill color independent from the card/status tone. */
  color?: string;
  indeterminate?: boolean;
  label?: string;
  max?: number;
  min?: number;
  percent: number;
  segments?: number;
  /** Optional semantic tone independent from the card/status tone. */
  tone?: ProgressBarTone;
  value?: number;
};

export type WorkflowStatusCardProps = {
  appearance?: WorkflowStatusCardAppearance;
  ariaLabel: string;
  busy?: boolean;
  children?: ReactNode;
  className?: string;
  dataXgcId: string;
  dataXgcRole: string;
  disabled?: boolean;
  layout?: WorkflowStatusCardLayout;
  metrics: { primary: ReactNode; secondary?: ReactNode };
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  pressed?: boolean;
  progress: WorkflowStatusCardProgress;
  runId?: string;
  running: boolean;
  status: string;
  statusLabel?: ReactNode;
  title: ReactNode;
  titleAttr?: string;
  tone: WorkflowStatusCardTone;
};

export function WorkflowStatusCard({
  appearance = 'default', ariaLabel, busy, children, className, dataXgcId, dataXgcRole, disabled,
  layout = 'default', metrics, onClick, pressed, progress, runId, running, status,
  statusLabel, title, titleAttr, tone,
}: WorkflowStatusCardProps) {
  const percent = Math.min(100, Math.max(0, progress.percent));
  const measured = progress.value !== undefined && !progress.indeterminate;
  const content = (
    <>
      <span className="xgc-workflow-status-card-heading">
        <strong>{title}</strong>
        {statusLabel !== undefined ? <em aria-live="polite">{statusLabel}</em> : null}
      </span>
      <span className="xgc-workflow-status-card-metrics">
        <span className="xgc-workflow-status-card-metric-primary">{metrics.primary}</span>
        {metrics.secondary !== undefined ? <span className="xgc-workflow-status-card-metric-secondary">{metrics.secondary}</span> : null}
      </span>
      <ProgressBar
        ariaHidden={!progress.label}
        className="xgc-workflow-status-card-progress"
        color={progress.color}
        indeterminate={progress.indeterminate}
        label={progress.label}
        max={progress.max}
        min={progress.min}
        percent={percent}
        segments={progress.segments}
        tone={progress.tone ?? tone}
        value={measured ? progress.value : undefined}
      />
      {children}
    </>
  );
  const commonProps = {
    'aria-busy': busy,
    'aria-label': ariaLabel,
    ...(pressed === undefined ? {} : { 'aria-pressed': pressed }),
    className: classNames('xgc-workflow-status-card', className),
    'data-xgc-appearance': appearance,
    'data-xgc-id': dataXgcId,
    'data-xgc-layout': layout,
    'data-xgc-progress': String(percent),
    'data-xgc-role': dataXgcRole,
    'data-xgc-run-id': runId,
    'data-xgc-running': running ? 'true' : 'false',
    'data-xgc-status': status,
    'data-xgc-tone': tone,
    title: titleAttr,
  } as const;

  return onClick
    ? <button {...commonProps} disabled={disabled} onClick={onClick} type="button">{content}</button>
    : <article {...commonProps}>{content}</article>;
}
