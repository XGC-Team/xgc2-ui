import { AppShell,useMediaQuery,XGC_MEDIA_QUERIES } from '@xgc2/ui-react';
import { Suspense,useCallback,useState,type ReactNode } from 'react';
import {
  GroundStationInteractionHost,
  GroundStationLocalNotificationHost,
  GroundStationInteractionProvider,
  GroundStationNotificationCenter,
  GroundStationNativeAgentProvider,
  type GroundStationContextDestination,
  type GroundStationContextInteraction,
  type GroundStationInteraction,
} from '../domains/groundStationInteraction/groundStationInteractionPublic';
import { openExperimentSourceLocation } from '../domains/experiment/experimentPublic';
import {
  productPageLabel,
  useProductWebComposition,
} from '../shared/productWebComposition';
import { openGroundStationContext,openGroundStationInteractionOrigin } from './groundStationContextNavigation';
import { AppSidebar } from './navigation/AppSidebar';
import { AppTopbar } from './navigation/AppTopbar';
import type { Page } from './navigation/navConfig';
import { useNavigationText } from './navigation/navigationMessages';
import {
  useAppBreadcrumbNavigation,
  useExperimentHashResourceId,
} from './navigation/useAppBreadcrumbNavigation';
import { useAppTargetNavigation } from './navigation/useAppTargetNavigation';
import { useNavigation } from './navigationContext';

export function AppFrame({ children }: { children: ReactNode }) {
  const nav = useNavigation();
  const t = useNavigationText();
  const composition = useProductWebComposition();
  const targetNavigation = useAppTargetNavigation(nav);
  const { selectTargetCore } = targetNavigation;
  const { navigatePage: navigateToPage } = nav;
  const breadcrumbs = useAppBreadcrumbNavigation(nav.page, nav.navigatePage);
  const experimentHashResourceId = useExperimentHashResourceId();
  const mobile = useMediaQuery(XGC_MEDIA_QUERIES.mobile);
  const [mobileNavigationOpen,setMobileNavigationOpen] = useState(false);
  const [notificationCenterOpen,setNotificationCenterOpen] = useState(false);
  const DevMarkPromptDock = composition.developer.markPrompt;
  const openInteractionContext = useCallback((
    context: GroundStationContextDestination,
    interaction: GroundStationContextInteraction,
  ) => {
    return openGroundStationContext(context, interaction, nav.navigatePage, targetNavigation.executionTargetId);
  }, [nav.navigatePage,targetNavigation.executionTargetId]);
  const openInteractionSource = useCallback((interaction: GroundStationInteraction) => (
    openGroundStationInteractionOrigin(interaction, nav.navigatePage, targetNavigation.executionTargetId)
  ), [nav.navigatePage,targetNavigation.executionTargetId]);
  const openNativeSource = useCallback((experimentId: string) => openExperimentSourceLocation({
    targetId: 'local',resourceId: experimentId,preferActivity: true,
  }, () => {
    selectTargetCore('local');
    navigateToPage('experiment');
  }), [navigateToPage,selectTargetCore]);

  const activeSectionId = nav.pageSection(nav.page);
  const selectPageSection = useCallback((page: Page, sectionId: string) => {
    setMobileNavigationOpen(false);
    nav.navigatePage(page);
    nav.setPageSection(page, sectionId);
  }, [nav]);
  const navigatePage = useCallback((page: Page) => {
    setMobileNavigationOpen(false);
    if (page === nav.page && page === 'automations') breadcrumbs.showAutomationList();
    else if (page === nav.page && page === 'experiment') breadcrumbs.showExperimentList();
    else if (page === nav.page && page === 'robotAssets') breadcrumbs.showRobotList();
    else nav.navigatePage(page);
  },[breadcrumbs,nav]);
  const returnCatalogToList = useCallback(() => {
    if (nav.page === 'automations') breadcrumbs.showAutomationList();
    else if (nav.page === 'experiment') breadcrumbs.showExperimentList();
    else if (nav.page === 'robotAssets') breadcrumbs.showRobotList();
  }, [breadcrumbs,nav.page]);
  const catalogTitleReturnsToList = nav.page === 'automations'
    || nav.page === 'experiment'
    || nav.page === 'robotAssets';
  const experimentDashboard = nav.page === 'experiment'
    && (breadcrumbs.experiment.view === 'detail' || Boolean(experimentHashResourceId));
  const catalogResourceName = nav.page === 'automations' && breadcrumbs.automation.view === 'detail'
    ? breadcrumbs.automation.name
    : nav.page === 'experiment' && breadcrumbs.experiment.view === 'detail'
      ? breadcrumbs.experiment.name
      : undefined;

  const shell = (
    <AppShell
      className="app-shell"
      contentClassName="xgc-workspace-content"
      contentPadding="none"
      height="parent"
      mobileLayout="document"
      data-xgc-mode={
        nav.gcsMode && experimentDashboard ? 'ground-station' : undefined
      }
      data-xgc-role="app-shell"
      data-xgc-id={nav.page}
      sidebar={<AppSidebar
        collapsed={nav.sidebarCollapsed}
        page={nav.page}
        language={nav.language}
        primaryItems={targetNavigation.visiblePrimaryNavItems}
        operationsItems={targetNavigation.visibleOperationsNavItems}
        coreNodes={targetNavigation.coreNodes}
        selectedHostId={nav.managedHostId}
        hosts={targetNavigation.managedHosts}
        hostSections={targetNavigation.visibleHostTabs}
        terminalSections={targetNavigation.visibleTerminalTabs}
        activeSectionId={activeSectionId}
        collapseLabel={t(nav.sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation')}
        mobileDismissLabel={nav.language === 'zh-CN' ? '关闭导航' : 'Close navigation'}
        mobileOpen={mobileNavigationOpen}
        onCollapsedChange={nav.setSidebarCollapsed}
        onMobileOpenChange={setMobileNavigationOpen}
        onNavigate={navigatePage}
        onSelectSection={selectPageSection}
        onSelectCore={targetNavigation.selectTargetCore}
        onSelectHost={targetNavigation.selectManagedHost}
      />}
      topbar={<AppTopbar
        notifications={<GroundStationNotificationCenter targetId={targetNavigation.executionTargetId}
          open={notificationCenterOpen} onOpenChange={setNotificationCenterOpen} onOpenNativeSource={openNativeSource} />}
        mobileNavigationOpen={mobileNavigationOpen}
        onOpenMobileNavigation={mobile ? () => setMobileNavigationOpen(true) : undefined}
        onCatalogTitleClick={catalogTitleReturnsToList ? returnCatalogToList : undefined}
        catalogResourceName={catalogResourceName}
        experimentDetail={experimentDashboard}
      />}
      workspaceClassName="workspace"
      overlays={<>
        {targetNavigation.executionTargetAvailable ? (
          <GroundStationInteractionHost
            targetId={targetNavigation.executionTargetId}
            showDecisionDialog={experimentDashboard}
          />
        ) : <GroundStationLocalNotificationHost notificationCenterOpen={notificationCenterOpen}
          onViewNotifications={() => setNotificationCenterOpen(true)} />}
        {DevMarkPromptDock && (
          <Suspense fallback={null}>
            <DevMarkPromptDock
              page={productPageLabel(composition, nav.page, nav.language)}
              pageId={nav.page}
              pageSection={activeSectionId}
              executionTargetId={targetNavigation.executionTargetId}
              targetCoreId={nav.targetCoreId}
              managedHostId={nav.managedHostId}
            />
          </Suspense>
        )}
      </>}
    >
      {children}
    </AppShell>
  );

  return (
    <GroundStationNativeAgentProvider executionTargetId={targetNavigation.executionTargetId}>
      {targetNavigation.executionTargetAvailable ? <GroundStationInteractionProvider targetId={targetNavigation.executionTargetId}
        onOpenContext={openInteractionContext} onOpenSource={openInteractionSource}
        notificationCenterOpen={notificationCenterOpen} onNotificationCenterOpenChange={setNotificationCenterOpen}>
        {shell}
      </GroundStationInteractionProvider> : shell}
    </GroundStationNativeAgentProvider>
  );
}
