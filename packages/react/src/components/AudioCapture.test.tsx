import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioCaptureControl, AudioWaveform } from './AudioCapture';

describe('audio capture presentation', () => {
  it('caps waveform density and exposes an optional accessible label', () => {
    const { container } = render(<AudioWaveform active barCount={100} aria-label="Input level" />);
    expect(screen.getByRole('img', { name: 'Input level' })).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('.xgc-audio-waveform > span')).toHaveLength(64);
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
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
