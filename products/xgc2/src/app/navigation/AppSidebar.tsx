import {
  AppSidebar as SharedAppSidebar,
  SidebarNav,
  SidebarNavItem,
} from '@xgc2/ui-react';
import { useCallback,useEffect,useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { CoreNode } from '../../domains/core/coreModel';
import type { ManagedHost } from '../../domains/managedHost/managedHostPublic';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import {
  localizedProductText,
  preloadProductRoute,
  productPageLabel,
  useProductWebComposition,
} from '../../shared/productWebComposition';
import {
  navSectionsForPage,
  type NavPageSection,
  type Page,
} from './navConfig';
import { BrandMark } from './BrandMark';
import { TargetSelector } from './TargetSelector';

type NavigationItem = { id: Page; icon: LucideIcon };

export function AppSidebar({
  collapsed,
  page,
  language,
  primaryItems,
  operationsItems,
  coreNodes,
  selectedHostId,
  hosts,
  hostSections,
  terminalSections,
  activeSectionId,
  collapseLabel,
  mobileDismissLabel = 'Close navigation',
  mobileOpen = false,
  onCollapsedChange,
  onMobileOpenChange,
  onNavigate,
  onSelectSection,
  onSelectCore,
  onSelectHost,
}: {
  collapsed: boolean;
  page: Page;
  language: AppLanguage;
  primaryItems: readonly NavigationItem[];
  operationsItems: readonly NavigationItem[];
  coreNodes: CoreNode[];
  selectedHostId: string;
  hosts: ManagedHost[];
  /** Visible host/system sections (filtered by Agent profile / local capabilities). */
  hostSections: readonly NavPageSection[];
  /** Terminal sections (Agent omits Hosts management). */
  terminalSections: readonly NavPageSection[];
  /** Active secondary section id for the current page, when any. */
  activeSectionId: string;
  collapseLabel: string;
  mobileDismissLabel?: string;
  mobileOpen?: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onMobileOpenChange?: (open: boolean) => void;
  onNavigate: (page: Page) => void;
  onSelectSection: (page: Page, sectionId: string) => void;
  onSelectCore: (coreId: string) => void;
  onSelectHost: (hostId: string) => void;
}) {
  const composition = useProductWebComposition();
  const idlePreloadPageIds = useMemo(() => Array.from(new Set([
    ...operationsItems.map((item) => item.id),
    ...primaryItems.map((item) => item.id),
  ])).filter((candidate) => candidate !== page).join(','),[operationsItems,page,primaryItems]);
  const preloadRoute = useCallback((nextPage: Page,sectionId = '') => {
    const pending = preloadProductRoute(composition,nextPage,sectionId);
    if (pending) void pending.catch(() => undefined);
  },[composition]);

  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'function') return undefined;
    const pages = idlePreloadPageIds.split(',').filter(Boolean) as Page[];
    let cursor = 0;
    let idleHandle = 0;
    const preloadNext = () => {
      const nextPage = pages[cursor];
      cursor += 1;
      if (!nextPage) return;
      preloadRoute(nextPage);
      idleHandle = window.requestIdleCallback(preloadNext,{ timeout: 2_000 });
    };
    idleHandle = window.requestIdleCallback(preloadNext,{ timeout: 2_000 });
    return () => window.cancelIdleCallback(idleHandle);
  },[idlePreloadPageIds,preloadRoute]);

  return (
    <SharedAppSidebar
      brandLabel="XGC"
      brandMark={<BrandMark className="brand-glyph" />}
      className="sidebar"
      collapsed={collapsed}
      collapseLabel={collapseLabel}
      expandLabel={collapseLabel}
      mobileDismissLabel={mobileDismissLabel}
      mobileMode="drawer"
      mobileOpen={mobileOpen}
      footer={<TargetSelector
        collapsed={collapsed}
        coreNodes={coreNodes}
        selectedHostId={selectedHostId}
        hosts={hosts}
        onSelectCore={onSelectCore}
        onSelectHost={onSelectHost}
      />}
      footerProps={{ className: 'sidebar-bottom' }}
      onCollapsedChange={onCollapsedChange}
      onMobileOpenChange={onMobileOpenChange}
      toggleProps={{ 'data-xgc-role': 'sidebar-toggle', 'data-xgc-id': 'sidebar-toggle' }}
      data-xgc-role="app-sidebar"
      data-xgc-id="app-sidebar"
      data-xgc-collapsed={collapsed ? 'true' : undefined}
    >
      <SidebarNav className="nav">
        <div className="nav-block" data-xgc-role="nav-primary-block" data-xgc-id="nav-primary-block">
          <NavigationButtons
            items={primaryItems}
            page={page}
            language={language}
            collapsed={collapsed}
            role="primary-nav-item"
            hostSections={hostSections}
            terminalSections={terminalSections}
            activeSectionId={activeSectionId}
            onNavigate={onNavigate}
            onSelectSection={onSelectSection}
            onPreload={preloadRoute}
          />
        </div>
        <div className="nav-divider" role="separator" aria-hidden="true" />
        <div className="nav-block" data-xgc-role="nav-operations-block" data-xgc-id="nav-operations-block">
          <NavigationButtons
            items={operationsItems}
            page={page}
            language={language}
            collapsed={collapsed}
            role="ops-nav-item"
            kind="operations"
            hostSections={hostSections}
            terminalSections={terminalSections}
            activeSectionId={activeSectionId}
            onNavigate={onNavigate}
            onSelectSection={onSelectSection}
            onPreload={preloadRoute}
          />
        </div>
      </SidebarNav>
    </SharedAppSidebar>
  );
}

function NavigationButtons({
  items,
  page,
  language,
  collapsed,
  role,
  kind,
  hostSections,
  terminalSections,
  activeSectionId,
  onNavigate,
  onSelectSection,
  onPreload,
}: {
  items: readonly NavigationItem[];
  page: Page;
  language: AppLanguage;
  collapsed: boolean;
  role: 'primary-nav-item' | 'ops-nav-item';
  kind?: 'operations';
  hostSections: readonly NavPageSection[];
  terminalSections: readonly NavPageSection[];
  activeSectionId: string;
  onNavigate: (page: Page) => void;
  onSelectSection: (page: Page, sectionId: string) => void;
  onPreload: (page: Page, sectionId?: string) => void;
}) {
  const composition = useProductWebComposition();
  return items.map((item) => {
    const Icon = item.icon;
    const pageLabel = productPageLabel(composition, item.id, language);
    const sections = navSectionsForPage(composition, item.id, hostSections, terminalSections);
    const expanded = !collapsed && page === item.id && sections.length > 0;
    return (
      <div
        key={item.id}
        className="nav-group"
        data-xgc-role="nav-page-group"
        data-xgc-id={item.id}
        data-xgc-expanded={expanded ? 'true' : undefined}
      >
        <SidebarNavItem
          active={page === item.id}
          className="nav-item"
          icon={<Icon size={17} />}
          label={pageLabel}
          onSelect={() => onNavigate(item.id)}
          buttonProps={{
            'aria-expanded': sections.length > 0 ? expanded : undefined,
            onFocus: () => onPreload(item.id),
            onPointerDown: () => onPreload(item.id),
            onPointerEnter: () => onPreload(item.id),
          }}
          dataAttributes={{
            'data-xgc-kind': kind,
            'data-xgc-role': role,
            'data-xgc-id': item.id,
            'data-xgc-current': page === item.id ? 'true' : undefined,
          }}
        />
        {expanded && (
          <div className="nav-section" data-xgc-role="nav-page-sections" data-xgc-id={item.id} role="group" aria-label={pageLabel}>
            {sections.map((section) => {
              const SectionIcon = section.icon;
              const label = localizedProductText(section.label, language);
              const current = page === item.id && activeSectionId === section.id;
              return (
                <SidebarNavItem
                  key={section.id}
                  active={current}
                  className="nav-section-item"
                  depth={1}
                  size="compact"
                  icon={<SectionIcon size={15} />}
                  label={label}
                  onSelect={() => onSelectSection(item.id, section.id)}
                  buttonProps={{
                    onFocus: () => onPreload(item.id,section.id),
                    onPointerDown: () => onPreload(item.id,section.id),
                    onPointerEnter: () => onPreload(item.id,section.id),
                  }}
                  dataAttributes={{
                    'data-xgc-role': 'nav-page-section',
                    'data-xgc-id': section.id,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  });
}
