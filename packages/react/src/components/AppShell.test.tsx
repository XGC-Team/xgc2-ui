import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell, AppSidebar, SidebarNav, SidebarNavItem, Topbar } from './AppShell';

describe('application shell', () => {
  it('composes sidebar, topbar, and content without owning routing', () => {
    render(
      <AppShell
        sidebar={(
          <AppSidebar brandLabel="XGC" brandMark="X">
            <SidebarNav aria-label="Primary">
              <SidebarNavItem label="Home" active onSelect={() => undefined} />
            </SidebarNav>
          </AppSidebar>
        )}
        topbar={<Topbar leading="Home" actions="Actions" />}
      >
        Page content
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
  });

  it('supports controlled sidebar collapse', () => {
    const onCollapsedChange = vi.fn();
    render(
      <AppSidebar collapsed={false} brandLabel="XGC" brandMark="X" onCollapsedChange={onCollapsedChange}>
        Navigation
      </AppSidebar>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('supports internal sidebar collapse for small standalone products', () => {
    render(<AppSidebar brandLabel="XGC" brandMark="X">Navigation</AppSidebar>);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false');
  });
});
