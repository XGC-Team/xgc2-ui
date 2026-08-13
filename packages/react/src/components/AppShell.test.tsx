import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell, AppSidebar, ResponsiveSplit, SidebarNav, SidebarNavItem, Topbar } from './AppShell';

describe('application shell', () => {
  it('composes sidebar, topbar, and content without owning routing', () => {
    render(
      <AppShell
        overlays={<div data-testid="overlay">Overlay</div>}
        sidebar={(
          <AppSidebar brandLabel="XGC" brandMark="X">
            <SidebarNav aria-label="Primary">
              <SidebarNavItem label="Home" active onSelect={() => undefined} />
            </SidebarNav>
          </AppSidebar>
        )}
        topbar={<Topbar title="Home" actions="Actions" />}
      >
        Page content
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
    expect(screen.getByTestId('overlay')).toHaveTextContent('Overlay');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
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

  it('forwards shell affordance props and allows navigation-only topbars', () => {
    const onFocus = vi.fn();
    render(
      <>
        <AppSidebar
          brandLabel="XGC"
          brandMark="X"
          toggleProps={{ 'data-testid': 'shell-toggle' }}
        >
          <SidebarNavItem buttonProps={{ onFocus }} className="product-route" label="Operations" />
        </AppSidebar>
        <Topbar navigation={<nav aria-label="Breadcrumbs">Home / Operations</nav>} />
      </>,
    );
    expect(screen.getByTestId('shell-toggle')).toHaveClass('xgc-sidebar-toggle');
    fireEvent.focus(screen.getByRole('button', { name: 'Operations' }));
    expect(onFocus).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Operations' })).toHaveClass('product-route');
    expect(screen.getByRole('navigation', { name: 'Breadcrumbs' })).toBeInTheDocument();
  });

  it('declares document-flow mobile behavior and reusable split panes', () => {
    const { container } = render(
      <AppShell mobileBreakpoint="compact" mobileLayout="document">
        <ResponsiveSplit primary={<section>Packages</section>} secondary={<section>Client setup</section>} />
      </AppShell>,
    );
    expect(container.querySelector('.xgc-app-shell')).toHaveAttribute('data-mobile-layout', 'document');
    expect(container.querySelector('.xgc-app-shell')).toHaveAttribute('data-mobile-breakpoint', 'compact');
    expect(container.querySelectorAll('.xgc-responsive-split-pane')).toHaveLength(2);
  });

  it('owns mobile drawer navigation and its dismissal backdrop', () => {
    const onMobileOpenChange = vi.fn();
    render(
      <AppSidebar
        brandLabel="XGC"
        brandMark="X"
        mobileMode="drawer"
        mobileOpen
        onMobileOpenChange={onMobileOpenChange}
      >Navigation</AppSidebar>,
    );
    expect(screen.getByRole('complementary')).toHaveAttribute('data-mobile-open', 'true');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close navigation' })[1]!);
    expect(onMobileOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets a drawer sidebar leave the mobile shell as a single content column', () => {
    const { container } = render(
      <AppShell
        mobileLayout="document"
        sidebar={<AppSidebar brandLabel="XGC" brandMark="X" mobileMode="drawer">Navigation</AppSidebar>}
      >
        Page content
      </AppShell>,
    );

    expect(container.querySelector('.xgc-app-shell')).toHaveAttribute('data-mobile-breakpoint', 'mobile');
    expect(container.querySelector('.xgc-app-sidebar')).toHaveAttribute('data-mobile-mode', 'drawer');
  });
});
