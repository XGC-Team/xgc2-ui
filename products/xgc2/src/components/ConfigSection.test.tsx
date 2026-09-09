// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { ConfigSection } from './ConfigSection';

describe('ConfigSection', () => {
  it('renders a collapsible section expanded by default', () => {
    const { container } = render(
      <ConfigSection title="Safety" dataXgcRole="station-safety-settings" dataXgcId="safety">
        <p>Confirm high-risk commands</p>
      </ConfigSection>,
    );

    const section = container.querySelector('[data-xgc-role="station-safety-settings"]');
    expect(section).toHaveAttribute('data-xgc-expanded', 'true');
    expect(section).toHaveAttribute('data-xgc-id', 'safety');
    expect(screen.getByRole('button', { name: 'Safety' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Confirm high-risk commands')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="config-section-body"]')).toBeInTheDocument();
  });

  it('collapses and expands through the section toggle', () => {
    render(
      <ConfigSection title="Appearance" dataXgcRole="station-skin-settings">
        <p>Theme controls</p>
      </ConfigSection>,
    );

    const toggle = screen.getByRole('button', { name: 'Appearance' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Theme controls')).not.toBeInTheDocument();
    expect(toggle.closest('[data-xgc-role="station-skin-settings"]')).toHaveAttribute('data-xgc-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Theme controls')).toBeInTheDocument();
  });

  it('supports controlled open state and onOpenChange callbacks', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ConfigSection title="Safety" open={false} onOpenChange={onOpenChange}>
        <p>Hidden while closed</p>
      </ConfigSection>,
    );

    expect(screen.queryByText('Hidden while closed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Safety' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <ConfigSection title="Safety" open onOpenChange={onOpenChange}>
        <p>Hidden while closed</p>
      </ConfigSection>,
    );
    expect(screen.getByText('Hidden while closed')).toBeInTheDocument();
  });

  it('honors defaultOpen when uncontrolled', () => {
    render(
      <ConfigSection title="Safety" defaultOpen={false}>
        <p>Starts collapsed</p>
      </ConfigSection>,
    );
    expect(screen.queryByText('Starts collapsed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Safety' }));
    expect(screen.getByText('Starts collapsed')).toBeInTheDocument();
  });
});
