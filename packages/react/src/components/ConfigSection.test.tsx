// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfigSection } from './ConfigSection';

describe('ConfigSection', () => {
  it('supports uncontrolled disclosure with an associated region', () => {
    render(<ConfigSection defaultOpen={false} title="Safety"><span>Fields</span></ConfigSection>);
    const toggle = screen.getByRole('button', { name: 'Safety' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Safety' })).toHaveTextContent('Fields');
  });

  it('delegates controlled state changes', () => {
    const onOpenChange = vi.fn();
    render(<ConfigSection onOpenChange={onOpenChange} open title="Appearance">Fields</ConfigSection>);
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
