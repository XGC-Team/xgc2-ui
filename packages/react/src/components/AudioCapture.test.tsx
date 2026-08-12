import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioCaptureControl, AudioWaveform } from './AudioCapture';

describe('audio capture presentation', () => {
  it('caps waveform density and exposes an optional accessible label', () => {
    const { container } = render(<AudioWaveform active barCount={100} aria-label="Input level" levels={[0.1, 0.8]} />);
    expect(screen.getByRole('img', { name: 'Input level' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('img', { name: 'Input level' })).toHaveAttribute('data-has-signal', 'true');
    expect(container.querySelectorAll('.xgc-audio-waveform > span')).toHaveLength(64);
  });

  it('renders a quiet baseline without inventing input activity', () => {
    const { container, rerender } = render(<AudioWaveform active barCount={3} />);
    const bars = [...container.querySelectorAll<HTMLElement>('.xgc-audio-waveform > span')];
    expect(bars.every((bar) => bar.style.getPropertyValue('--xgc-wave-height') === '6%')).toBe(true);
    expect(container.querySelector('.xgc-audio-waveform')).not.toHaveAttribute('data-has-signal');

    rerender(<AudioWaveform active barCount={3} levels={[0, 0.5, 1]} />);
    expect([...container.querySelectorAll<HTMLElement>('.xgc-audio-waveform > span')].map(
      (bar) => bar.style.getPropertyValue('--xgc-wave-height'),
    )).toEqual(['6%', '53%', '100%']);
  });

  it('maps capture state to shared actions without owning recording behavior', () => {
    const onAction = vi.fn();
    const onCancel = vi.fn();
    render(
      <AudioCaptureControl
        state="recording"
        actionLabel="Stop"
        cancelLabel="Cancel"
        onAction={onAction}
        onCancel={onCancel}
        waveformLevels={[0.2, 0.4, 0.6]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
