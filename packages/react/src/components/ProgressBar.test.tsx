// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('owns measured progress semantics, visual tokens, and clamping', () => {
    const { container } = render(
      <ProgressBar percent={125} value={12} min={0} max={20} label="Upload progress" tone="success" size="regular" />,
    );

    const progress = screen.getByRole('progressbar', { name: 'Upload progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '12');
    expect(progress).toHaveAttribute('aria-valuemax', '20');
    expect(progress).toHaveAttribute('data-xgc-tone', 'success');
    expect(progress).toHaveAttribute('data-xgc-size', 'regular');
    expect(container.querySelector('.xgc-progress-fill')).toHaveStyle({ '--xgc-progress-percent': '100%' });
  });

  it('does not expose false numeric semantics for indeterminate or decorative bars', () => {
    const { rerender } = render(<ProgressBar percent={45} label="Starting" indeterminate />);
    expect(screen.getByRole('progressbar', { name: 'Starting' })).not.toHaveAttribute('aria-valuenow');

    rerender(<ProgressBar percent={45} ariaHidden />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(document.querySelector('.xgc-progress')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders bounded equal-width steps for discrete progress', () => {
    const { container } = render(
      <ProgressBar percent={50} value={1} max={4} segments={4} label="Service readiness" />,
    );
    const segments = container.querySelectorAll('.xgc-progress-segment');
    expect(segments).toHaveLength(4);
    expect(segments[0]).toHaveAttribute('data-xgc-filled', 'true');
    expect(segments[1]).toHaveAttribute('data-xgc-filled', 'false');
    expect(container.querySelector('.xgc-progress-fill')).toBeNull();
  });
});
