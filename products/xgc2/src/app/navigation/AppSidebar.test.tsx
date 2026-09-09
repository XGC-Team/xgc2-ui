// @vitest-environment jsdom

import { fireEvent,render,screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe,expect,it,vi } from 'vitest';
import { productWebComposition } from '../../../profiles/core-dev';
import { ProductWebCompositionProvider } from '../../shared/productWebComposition';
import { AppSidebar } from './AppSidebar';

const { primary,operations,sections } = productWebComposition.navigation;
const hostSections = sections.system ?? [];
const terminalSections = sections.terminal ?? [];
const auditSections = sections.audit ?? [];
const enLabel = (label: { 'en-US': string }) => label['en-US'];

function renderWithComposition(
  ui: ReactElement,
  composition = productWebComposition,
) {
  return render(
    <ProductWebCompositionProvider composition={composition}>
      {ui}
    </ProductWebCompositionProvider>,
  );
}

describe('AppSidebar page sections', () => {
  it('draws audit categories under the Audit logs parent instead of a topbar strip', () => {
    const onSelectSection = vi.fn();
    const { container } = renderWithComposition(
      <AppSidebar
        collapsed={false}
        page="audit"
        language="en-US"
        primaryItems={primary.filter((item) => item.id === 'experiment')}
        operationsItems={operations.filter((item) => item.id === 'audit')}
        coreNodes={[]}
        selectedHostId="local"
        hosts={[]}
        hostSections={hostSections}
        terminalSections={terminalSections}
        activeSectionId="system"
        collapseLabel="Collapse navigation"
        onCollapsedChange={vi.fn()}
        onNavigate={vi.fn()}
        onSelectSection={onSelectSection}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    const group = container.querySelector('[data-xgc-role="nav-page-group"][data-xgc-id="audit"]');
    expect(group).toHaveAttribute('data-xgc-expanded', 'true');
    expect(container.querySelector('[data-xgc-role="nav-page-sections"][data-xgc-id="audit"]')).toBeInTheDocument();
    expect(auditSections.map((section) => section.id)).toContain('system');

    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="audit"]')).toHaveClass('nav-item');
    expect(container.querySelector('[data-xgc-role="nav-page-section"][data-xgc-id="system"]')).toHaveClass('nav-section-item');
    const systemLogsLabel = enLabel(auditSections.find((section) => section.id === 'system')!.label);
    const loginLogsLabel = enLabel(auditSections.find((section) => section.id === 'login')!.label);
    expect(screen.getByRole('button', { name: systemLogsLabel })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: systemLogsLabel })).toHaveAttribute('data-xgc-role', 'nav-page-section');
    expect(screen.getByRole('button', { name: systemLogsLabel })).toHaveAttribute('data-xgc-id', 'system');

    fireEvent.click(screen.getByRole('button', { name: loginLogsLabel }));
    expect(onSelectSection).toHaveBeenCalledWith('audit', 'login');
  });

  it('hides drawer sections when the sidebar is collapsed', () => {
    const { container } = renderWithComposition(
      <AppSidebar
        collapsed
        page="system"
        language="en-US"
        primaryItems={[]}
        operationsItems={operations.filter((item) => item.id === 'system')}
        coreNodes={[]}
        selectedHostId="local"
        hosts={[]}
        hostSections={hostSections}
        terminalSections={terminalSections}
        activeSectionId="files"
        collapseLabel="Expand navigation"
        onCollapsedChange={vi.fn()}
        onNavigate={vi.fn()}
        onSelectSection={vi.fn()}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-xgc-role="nav-page-sections"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ops-nav-item"][data-xgc-id="system"]')).toHaveAttribute('data-xgc-current', 'true');
  });

  it('keeps the Automations | Operations separator in the rail', () => {
    const { container } = renderWithComposition(
      <AppSidebar
        collapsed={false}
        page="experiment"
        language="en-US"
        primaryItems={primary.filter((item) => item.id === 'experiment')}
        operationsItems={operations.filter((item) => item.id === 'audit')}
        coreNodes={[]}
        selectedHostId="local"
        hosts={[]}
        hostSections={hostSections}
        terminalSections={terminalSections}
        activeSectionId=""
        collapseLabel="Collapse navigation"
        onCollapsedChange={vi.fn()}
        onNavigate={vi.fn()}
        onSelectSection={vi.fn()}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
    );

    const divider = container.querySelector('.nav-divider');
    expect(divider).toBeInTheDocument();
    expect(divider).toHaveAttribute('role', 'separator');
    expect(container.querySelector('[data-xgc-role="nav-primary-block"]')).toBeInTheDocument();
    expect(container.querySelector('[data-xgc-role="nav-operations-block"]')).toBeInTheDocument();
  });

  it('preloads a lazy page before navigation on pointer or keyboard intent', () => {
    const preload = vi.fn(async () => undefined);
    const composition = {
      ...productWebComposition,
      routes: productWebComposition.routes.map((route) => (
        route.page === 'experiment' ? { ...route,preload } : route
      )),
    };
    renderWithComposition(
      <AppSidebar
        collapsed={false}
        page="system"
        language="en-US"
        primaryItems={primary.filter((item) => item.id === 'experiment')}
        operationsItems={[]}
        coreNodes={[]}
        selectedHostId="local"
        hosts={[]}
        hostSections={hostSections}
        terminalSections={terminalSections}
        activeSectionId="overview"
        collapseLabel="Collapse navigation"
        onCollapsedChange={vi.fn()}
        onNavigate={vi.fn()}
        onSelectSection={vi.fn()}
        onSelectCore={vi.fn()}
        onSelectHost={vi.fn()}
      />,
      composition,
    );

    const button = screen.getByRole('button', { name: 'Experiments' });
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);

    expect(preload).toHaveBeenCalledTimes(2);
  });
});
