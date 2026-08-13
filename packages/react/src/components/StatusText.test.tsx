import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusText } from './StatusText';

describe('StatusText', () => {
  it.each([
    ['Connected', 'neutral'],
    ['Created', 'neutral'],
    ['Disconnected', 'danger'],
    ['Succeeded', 'neutral'],
    ['Failed', 'danger'],
    ['Cancelled', 'neutral'],
    ['Running', 'info'],
    ['Pending', 'info'],
    ['Queued', 'info'],
    ['Waiting', 'info'],
    ['Starting', 'info'],
    ['Restarting', 'info'],
    ['Stopping', 'info'],
    ['Blocked', 'warning'],
    ['Degraded', 'warning'],
    ['Paused', 'warning'],
    ['Stale', 'warning'],
    ['Unavailable', 'warning'],
  ])('maps %s to a quiet text tone (%s)', (value, tone) => {
    render(<StatusText status={value} />);
    const status = screen.getByText(value);
    expect(status).toHaveAttribute('data-tone', tone);
    expect(status).toHaveClass('xgc-status-text');
    expect(status.childElementCount).toBe(0);
  });

  it('allows an explicit semantic tone for domain-specific states', () => {
    render(<StatusText status="custom" tone="danger" />);
    expect(screen.getByText('custom')).toHaveAttribute('data-tone', 'danger');
  });

  it('keeps localized wording while exposing the stable domain state', () => {
    render(<StatusText status="running" role="status">执行中</StatusText>);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('执行中');
    expect(status).toHaveAttribute('data-status', 'running');
  });
});
