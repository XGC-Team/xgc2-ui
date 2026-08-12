import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { Button } from './Button';

export type AudioWaveformProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  barCount?: number;
  /** Normalized real input levels in the 0–1 range. Empty input renders a quiet baseline. */
  levels?: readonly number[];
};

export function AudioWaveform({
  active = false,
  'aria-label': ariaLabel,
  barCount = 24,
  className,
  levels = [],
  ...props
}: AudioWaveformProps) {
  const safeCount = Math.max(3, Math.min(64, Math.round(barCount)));
  const visibleLevels = resampleLevels(levels, safeCount);
  const peak = Math.max(0, ...visibleLevels);
  return (
    <div
      {...props}
      className={classNames('xgc-audio-waveform', className)}
      data-active={active || undefined}
      data-has-signal={active && peak > 0.01 || undefined}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {visibleLevels.map((level, index) => {
        const height = 6 + level * 94;
        const style = {
          '--xgc-wave-height': `${height}%`,
        } as CSSProperties;
        return <span key={index} style={style} />;
      })}
    </div>
  );
}

export type AudioCaptureState = 'idle' | 'connecting' | 'recording' | 'finalizing';

export type AudioCaptureControlProps = Omit<HTMLAttributes<HTMLDivElement>, 'onError'> & {
  actionLabel: ReactNode;
  cancelLabel?: ReactNode;
  error?: ReactNode;
  onAction: () => void;
  onCancel?: () => void;
  state: AudioCaptureState;
  waveformLevels?: readonly number[];
  waveformLabel?: string;
};

export function AudioCaptureControl({
  actionLabel,
  cancelLabel = 'Cancel',
  className,
  error,
  onAction,
  onCancel,
  state,
  waveformLevels,
  waveformLabel,
  ...props
}: AudioCaptureControlProps) {
  const active = state !== 'idle';
  return (
    <div {...props} className={classNames('xgc-audio-capture', className)} data-state={state}>
      <AudioWaveform active={state === 'recording'} aria-label={waveformLabel} levels={waveformLevels} />
      <div className="xgc-audio-capture-actions">
        <Button
          className="xgc-audio-capture-primary"
          tone={state === 'recording' ? 'danger' : 'primary'}
          appearance="solid"
          disabled={state === 'connecting' || state === 'finalizing'}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
        {active && onCancel ? (
          <Button appearance="ghost" onClick={onCancel}>{cancelLabel}</Button>
        ) : null}
      </div>
      {error ? <p className="xgc-audio-capture-error" role="alert">{error}</p> : null}
    </div>
  );
}

function resampleLevels(levels: readonly number[], count: number) {
  if (!levels.length) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * levels.length / count);
    const end = Math.max(start + 1, Math.ceil((index + 1) * levels.length / count));
    let peak = 0;
    for (let cursor = start; cursor < Math.min(end, levels.length); cursor += 1) {
      const sample = levels[cursor];
      if (typeof sample === 'number' && Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
    }
    return Math.min(1, peak);
  });
}
