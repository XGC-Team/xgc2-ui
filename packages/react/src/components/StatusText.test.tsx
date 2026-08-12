import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusText } from './StatusText';

describe('StatusText', () => {
  it('maps known statuses to semantic tones', () => {
    render(<StatusText status="Running" />);
    const status = screen.getByText('Running');
    expect(status).toHaveAttribute('data-tone', 'success');
    expect(status).toHaveClass('xgc-status-text');
    expect(status.childElementCount).toBe(0);
  });

  it('allows an explicit semantic tone for domain-specific states', () => {
    render(<StatusText status="custom" tone="danger" />);
    expect(screen.getByText('custom')).toHaveAttribute('data-tone', 'danger');
  });
});
