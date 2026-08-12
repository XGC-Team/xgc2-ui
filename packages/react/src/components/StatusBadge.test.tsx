import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, StatusText } from './StatusBadge';

describe('StatusText', () => {
  it('maps known statuses to semantic tones', () => {
    render(<StatusText status="Running" />);
    const status = screen.getByText('Running');
    expect(status).toHaveAttribute('data-tone', 'success');
    expect(status).toHaveClass('xgc-status-text');
    expect(status.childElementCount).toBe(0);
  });

  it('keeps the former badge API as the same undecorated text primitive', () => {
    render(<StatusBadge status="custom" tone="danger" />);
    const status = screen.getByText('custom');
    expect(status).toHaveAttribute('data-tone', 'danger');
    expect(status).toHaveClass('xgc-status-text');
  });
});
