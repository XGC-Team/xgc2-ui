import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders clickable ancestors and one semantic current page', () => {
    const onParent = vi.fn();
    render(
      <Breadcrumbs
        ariaLabel="Page hierarchy"
        items={[
          { id: 'automations', label: 'Automations', onClick: onParent },
          { id: 'mission', label: 'Mission workflow', current: true },
        ]}
        separator={<span data-testid="separator">/</span>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Automations' }));
    expect(onParent).toHaveBeenCalledOnce();
    expect(screen.getByText('Mission workflow')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('separator').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('supports link ancestors and stable instrumentation metadata', () => {
    render(
      <Breadcrumbs
        dataXgcId="topbar"
        dataXgcRole="product-breadcrumbs"
        items={[{ id: 'home', label: 'Home', href: '/home', dataXgcRole: 'home-link' }]}
      />,
    );
    expect(screen.getByRole('navigation')).toHaveAttribute('data-xgc-id', 'topbar');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('data-xgc-role', 'home-link');
  });
});
