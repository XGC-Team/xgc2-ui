import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('maps known statuses to semantic tones', () => {
    render(<StatusBadge status="Running" />);
    expect(screen.getByText('Running')).toHaveAttribute('data-tone', 'success');
  });

  it('allows a caller to override the inferred tone', () => {
    render(<StatusBadge status="custom" tone="danger" />);
    expect(screen.getByText('custom')).toHaveAttribute('data-tone', 'danger');
  });
});
