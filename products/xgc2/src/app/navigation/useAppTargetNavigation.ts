import { useCallback,useEffect,useMemo } from 'react';
import { retargetAutomationHash } from '../../domains/automation/automationNavigation';
import { selectedExecutionTargetId } from '../../domains/execution/executionPublic';
import {
  isLocalManagedHost,
  LOCAL_MANAGED_HOST_ID,
  managedHostEffectiveProfile,
  managedHostRequestsAllowed,
  managedHostSelectable,
  useManagedHostRegistryStatus,
  useManagedHosts,
} from '../../domains/managedHost/managedHostPublic';
import {
  productRouteMap,
  resolveSurfacePolicy,
  useProductWebComposition,
} from '../../shared/productWebComposition';
import type { NavigationState } from '../navigationContext';
import { productSurfaceSupportedByCapabilities } from '../productSurfacePolicy';
import { isLocalCore,targetSurfaceAvailable } from '../targetCorePolicy';
import { useTargetCore } from '../useTargetCore';
import {
  firstVisibleManagedHostPage,
  managedHostSystemTabVisible,
  routeVisibleForManagedHost,
} from './managedHostNavigationPolicy';

export function useAppTargetNavigation(nav: NavigationState) {
  const {
    managedHostId,
    navigatePage,
    page,
    pageSection,
    setManagedHostId,
    setPageSection,
    setTargetCoreId,
    targetCoreId,
  } = nav;
  const composition = useProductWebComposition();
  const routes = useMemo(() => productRouteMap(composition),[composition]);
  const navCandidateRoutes = useMemo(
    () => [...composition.navigation.primary,...composition.navigation.operations]
      .map((item) => routes.get(item.id))
      .filter((route) => route !== undefined),
    [composition.navigation.operations,composition.navigation.primary,routes],
  );
  const { coreNodes } = useTargetCore();
  const localCore = coreNodes.find(isLocalCore);
  const localCoreId = localCore?.id ?? LOCAL_MANAGED_HOST_ID;
  const managedHosts = useManagedHosts();
  const managedHostRegistryStatus = useManagedHostRegistryStatus();
  const remoteManagedHostSelected = composition.agentLinkComputeTargets
    && !isLocalManagedHost(managedHostId);
  const selectedManagedHost = useMemo(
    () => managedHosts.find((host) => host.id === managedHostId),
    [managedHostId,managedHosts],
  );
  const selectedEffectiveProfile = managedHostEffectiveProfile(selectedManagedHost);

  const pageVisible = useCallback((candidatePage: typeof page) => {
    if (remoteManagedHostSelected) {
      return routeVisibleForManagedHost(
        resolveSurfacePolicy(composition,candidatePage),
        true,
        selectedEffectiveProfile,
      );
    }
    return targetSurfaceAvailable(resolveSurfacePolicy(composition, candidatePage), localCore);
  }, [composition,localCore,remoteManagedHostSelected,selectedEffectiveProfile]);

  const visiblePrimaryNavItems = useMemo(
    () => composition.navigation.primary.filter((item) => pageVisible(item.id)),
    [composition.navigation.primary,pageVisible],
  );
  const visibleOperationsNavItems = useMemo(
    () => composition.navigation.operations.filter((item) => pageVisible(item.id)),
    [composition.navigation.operations,pageVisible],
  );
  const maintenancePolicy = resolveSurfacePolicy(composition, 'maintenance');
  const visibleHostTabs = useMemo(
    () => (composition.navigation.sections.system ?? []).filter((tab) => {
      if (remoteManagedHostSelected) {
        return managedHostSystemTabVisible(tab.id, selectedEffectiveProfile);
      }
      if (tab.id !== 'maintenance') return true;
      const capabilities = localCore?.capabilities;
      if (!capabilities) return true;
      return maintenancePolicy
        ? productSurfaceSupportedByCapabilities(maintenancePolicy, capabilities)
        : false;
    }),
    [
      composition.navigation.sections.system,
      maintenancePolicy,
      remoteManagedHostSelected,
      selectedEffectiveProfile,
      localCore?.capabilities,
    ],
  );
  // Agent Terminal is Direct shell + loopback only — never Hosts catalog management.
  const visibleTerminalTabs = useMemo(
    () => (composition.navigation.sections.terminal ?? []).filter((tab) => {
      if (!remoteManagedHostSelected) return true;
      return tab.id !== 'hosts';
    }),
    [composition.navigation.sections.terminal, remoteManagedHostSelected],
  );

  const selectLocalTarget = useCallback(() => {
    replaceAutomationTargetLocation(LOCAL_MANAGED_HOST_ID);
    setManagedHostId(LOCAL_MANAGED_HOST_ID);
    setTargetCoreId(localCoreId);
  }, [localCoreId,setManagedHostId,setTargetCoreId]);

  const selectManagedHost = useCallback((hostId: string) => {
    const nextHost = managedHosts.find((host) => host.id === hostId);
    if (!managedHostSelectable(nextHost)) {
      selectLocalTarget();
      return;
    }
    const nextProfile = managedHostEffectiveProfile(nextHost);
    const firstPage = firstVisibleManagedHostPage(navCandidateRoutes,nextProfile);
    if (!firstPage) {
      selectLocalTarget();
      return;
    }
    replaceAutomationTargetLocation(hostId);
    setManagedHostId(hostId);
    // A target switch is an explicit request to enter that Agent's view.
    // Control-plane pages such as Robot assets are intentionally available for
    // every target, but retaining one of them made a successful Agent switch
    // visually indistinguishable from a no-op.
    const nextPage = firstPage;
    navigatePage(nextPage);
    if (nextPage === 'system') {
      const tabs = composition.navigation.sections.system ?? [];
      const currentTab = pageSection('system');
      if (!managedHostSystemTabVisible(currentTab, nextProfile)) {
        setPageSection(
          'system',
          tabs.find((tab) => managedHostSystemTabVisible(tab.id, nextProfile))?.id ?? '',
        );
      }
    }
  }, [
    composition,
    managedHosts,
    navCandidateRoutes,
    navigatePage,
    pageSection,
    selectLocalTarget,
    setManagedHostId,
    setPageSection,
  ]);

  const selectTargetCore = useCallback((_coreId: string) => {
    replaceAutomationTargetLocation(LOCAL_MANAGED_HOST_ID);
    setTargetCoreId(localCoreId);
    setManagedHostId(LOCAL_MANAGED_HOST_ID);
  }, [localCoreId,setManagedHostId,setTargetCoreId]);

  useEffect(() => {
    if (targetCoreId !== localCoreId) setTargetCoreId(localCoreId);
  }, [localCoreId,setTargetCoreId,targetCoreId]);

  useEffect(() => {
    if (!composition.agentLinkComputeTargets && !isLocalManagedHost(managedHostId)) {
      selectLocalTarget();
    }
  }, [composition.agentLinkComputeTargets,managedHostId,selectLocalTarget]);

  useEffect(() => {
    if (!remoteManagedHostSelected) {
      const currentPageVisible = [...visiblePrimaryNavItems,...visibleOperationsNavItems]
        .some((item) => item.id === page);
      if (!currentPageVisible) {
        navigatePage(visiblePrimaryNavItems[0]?.id
          ?? visibleOperationsNavItems[0]?.id
          ?? composition.navigation.defaultPage);
      }
      return;
    }
    if (managedHostRegistryStatus !== 'ready') return;
    if (!selectedManagedHost) {
      selectLocalTarget();
      return;
    }

    const currentPageVisible = [...visiblePrimaryNavItems,...visibleOperationsNavItems]
      .some((item) => item.id === page);
    if (currentPageVisible || !managedHostSelectable(selectedManagedHost)) return;
    const nextPage = firstVisibleManagedHostPage(navCandidateRoutes,selectedEffectiveProfile);
    if (!nextPage) {
      selectLocalTarget();
      return;
    }
    navigatePage(nextPage);
  }, [
    composition.navigation.defaultPage,
    managedHostRegistryStatus,
    navCandidateRoutes,
    navigatePage,
    page,
    remoteManagedHostSelected,
    selectLocalTarget,
    selectedEffectiveProfile,
    selectedManagedHost,
    visibleOperationsNavItems,
    visiblePrimaryNavItems,
  ]);

  const hostTab = pageSection('system');
  useEffect(() => {
    if (page !== 'system' || visibleHostTabs.some((tab) => tab.id === hostTab)) return;
    if (remoteManagedHostSelected
      && (managedHostRegistryStatus !== 'ready' || !managedHostSelectable(selectedManagedHost))) return;
    const nextTab = remoteManagedHostSelected ? visibleHostTabs[0]?.id : 'overview';
    if (nextTab) setPageSection('system', nextTab);
  }, [
    hostTab,
    managedHostRegistryStatus,
    page,
    remoteManagedHostSelected,
    selectedManagedHost,
    setPageSection,
    visibleHostTabs,
  ]);

  const terminalTab = pageSection('terminal');
  useEffect(() => {
    if (page !== 'terminal' || visibleTerminalTabs.some((tab) => tab.id === terminalTab)) return;
    const nextTab = visibleTerminalTabs[0]?.id ?? 'terminal';
    if (nextTab) setPageSection('terminal', nextTab);
  }, [page, setPageSection, terminalTab, visibleTerminalTabs]);

  return {
    coreNodes: localCore ? [localCore] : [],
    executionTargetId: selectedExecutionTargetId({
      managedHostId: composition.agentLinkComputeTargets ? managedHostId : LOCAL_MANAGED_HOST_ID,
      selectedTargetCore: localCore,
    }),
    executionTargetAvailable: !remoteManagedHostSelected
      || (managedHostRegistryStatus === 'ready' && managedHostRequestsAllowed(selectedManagedHost)),
    managedHosts,
    selectManagedHost,
    selectTargetCore,
    visibleHostTabs,
    visibleTerminalTabs,
    visibleOperationsNavItems,
    visiblePrimaryNavItems,
  };
}

function replaceAutomationTargetLocation(targetId: string) {
  const nextHash = retargetAutomationHash(window.location.hash,targetId);
  if (nextHash === window.location.hash) return;
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}
