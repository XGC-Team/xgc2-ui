import type { CSSProperties } from 'react';
import { classNames } from '../utils';

export type ProgressBarTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger';
export type ProgressBarSize = 'compact' | 'medium' | 'regular';
export type ProgressBarAppearance = 'soft' | 'inset';

export type ProgressBarProps = {
  /** Visual completion. Values outside 0–100 are clamped. */
  percent: number;
  /** Measured value used for accessible progress semantics and discrete segments. */
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
  tone?: ProgressBarTone;
  size?: ProgressBarSize;
  appearance?: ProgressBarAppearance;
  /** When greater than one, render equal-width steps instead of a continuous fill. */
  segments?: number;
  color?: string;
  trackColor?: string;
  className?: string;
  title?: string;
  ariaHidden?: boolean;
};

export function ProgressBar({
  percent,
  value,
  min = 0,
  max = 100,
  label,
  indeterminate = false,
  tone = 'accent',
  size = 'compact',
  appearance = 'soft',
  segments,
  color,
  trackColor,
  className,
  title,
  ariaHidden = false,
}: ProgressBarProps) {
  const boundedPercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const segmentCount = normalizeSegmentCount(segments);
  const filledSegments = segmentCount > 0
    ? filledSegmentCount({ segmentCount, value, max, percent: boundedPercent })
    : 0;
  const measured = value !== undefined && !indeterminate;
  const semantic = !ariaHidden && Boolean(label) && (measured || indeterminate);
  const mode = segmentCount > 0 ? 'segments' : 'continuous';

  return (
    <span
      className={classNames('xgc-progress', className)}
      data-xgc-tone={tone}
      data-xgc-size={size}
      data-xgc-appearance={appearance}
      data-xgc-mode={mode}
      data-xgc-progress-mode={indeterminate ? 'indeterminate' : measured ? 'measured' : 'decorative'}
      data-xgc-segments={segmentCount > 0 ? String(segmentCount) : undefined}
      role={semantic ? 'progressbar' : undefined}
      aria-label={semantic ? label : undefined}
      aria-valuemin={semantic && measured ? min : undefined}
      aria-valuemax={semantic && measured ? max : undefined}
      aria-valuenow={semantic && measured ? value : undefined}
      aria-hidden={ariaHidden || undefined}
      title={title}
      style={color || trackColor ? {
        ...(color ? { '--xgc-progress-fill': color } : {}),
        ...(trackColor ? { '--xgc-progress-track': trackColor } : {}),
      } as CSSProperties : undefined}
    >
      {segmentCount > 0 ? (
        Array.from({ length: segmentCount }, (_, index) => (
          <span
            aria-hidden="true"
            className="xgc-progress-segment"
            data-xgc-filled={index < filledSegments ? 'true' : 'false'}
            key={index}
          />
        ))
      ) : (
        <span
          className="xgc-progress-fill"
          style={{ '--xgc-progress-percent': `${boundedPercent}%` } as CSSProperties}
        />
      )}
    </span>
  );
}

function normalizeSegmentCount(segments: number | undefined) {
  if (segments === undefined || !Number.isFinite(segments)) return 0;
  const count = Math.trunc(segments);
  return count < 2 ? 0 : Math.min(24, count);
}

function filledSegmentCount({
  segmentCount,
  value,
  max,
  percent,
}: {
  segmentCount: number;
  value?: number;
  max: number;
  percent: number;
}) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const span = Number.isFinite(max) && max > 0 ? max : segmentCount;
    const ratio = Math.min(1, Math.max(0, value / span));
    return Math.min(segmentCount, Math.max(0, Math.round(ratio * segmentCount)));
  }
  return Math.min(segmentCount, Math.max(0, Math.round((percent / 100) * segmentCount)));
}
