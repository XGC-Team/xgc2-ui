import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('uses native disclosure semantics and exposes open changes', () => {
    const onOpenChange = vi.fn();
    render(<Disclosure summary="Technical details" onOpenChange={onOpenChange}>Payload</Disclosure>);
    const details = screen.getByText('Technical details').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByText('Payload')).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
