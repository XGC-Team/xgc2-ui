import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuoteChip } from './QuoteChip';

describe('QuoteChip', () => {
  it('is a markable cluster with a send leaf', () => {
    const onSend = vi.fn();
    render(<QuoteChip onSend={onSend} quote={{ page: 1, text: 'Fixture manuscript' }} />);
    const cluster = document.querySelector('[data-xgc-role="quote-chip"]');
    expect(cluster).toHaveAttribute('data-xgc-id', 'quote-chip');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('data-xgc-role', 'quote-chip-send');
    expect(send).toHaveAttribute('data-xgc-id', 'quote-chip:send');
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith({ page: 1, text: 'Fixture manuscript' });
  });
});
