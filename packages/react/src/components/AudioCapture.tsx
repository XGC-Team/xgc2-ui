import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { classNames } from '../utils';
import { Button } from './Button';

export type AudioWaveformProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  barCount?: number;
  intensity?: number;
};

export function AudioWaveform({
  active = false,
  'aria-label': ariaLabel,
  barCount = 24,
  className,
  intensity = 1,
  ...props
}: AudioWaveformProps) {
  const safeCount = Math.max(3, Math.min(64, Math.round(barCount)));
  const safeIntensity = Math.max(0, Math.min(1, intensity));
  return (
    <div
      {...props}
      className={classNames('xgc-audio-waveform', className)}
      data-active={active || undefined}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {Array.from({ length: safeCount }, (_, index) => {
        const phase = ((index * 7) % 13) / 12;
        const height = 22 + phase * 68 * safeIntensity;
        const style = {
          '--xgc-wave-delay': `${-((index % 8) * 73)}ms`,
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
  waveformLabel,
  ...props
}: AudioCaptureControlProps) {
  const active = state !== 'idle';
  return (
    <div {...props} className={classNames('xgc-audio-capture', className)} data-state={state}>
      <AudioWaveform active={state === 'recording'} aria-label={waveformLabel} />
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
