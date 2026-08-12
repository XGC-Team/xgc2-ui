import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, Notice } from './Feedback';

describe('feedback primitives', () => {
  it('derives accessible notice semantics and owns dismissal', () => {
    const onDismiss = vi.fn();
    render(<Notice tone="danger" heading="Publish failed" onDismiss={onDismiss}>Package signature is invalid.</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Package signature is invalid.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders quiet empty states without decorative status markers', () => {
    const { container } = render(<EmptyState appearance="plain" title="No logs" description="Run a task to collect logs." />);
    expect(screen.getByText('No logs')).toBeInTheDocument();
    expect(container.querySelector('[class*="dot"], [class*="badge"], [class*="pill"]')).toBeNull();
  });
});
