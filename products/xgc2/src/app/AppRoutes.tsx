import { Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useState,type ReactNode } from 'react';
import {
  dismissProductWebBootstrapStatus,
  productWebBootstrapIsLoading,
} from './productWebBootstrap';
import {
  isLocalManagedHost,
  managedHostEffectiveProfile,
  managedHostRequestsAllowed,
  useManagedHostRegistryError,
  useManagedHostRegistryStatus,
  useManagedHosts,
  type ManagedHost,
} from '../domains/managedHost/managedHostPublic';
import {
  productRouteMap,
  useProductWebComposition,
  type ProductPermissionSurface,
  type ProductRouteSurfacePolicy,
} from '../shared/productWebComposition';
import { PermissionDisabledPage } from './PermissionDisabledPage';
import {
  managedHostSystemTabVisible,
  routeVisibleForManagedHost,
} from './navigation/managedHostNavigationPolicy';
import { useNavigation } from './navigationContext';
import { useTargetCore } from './useTargetCore';
import { WorkspaceBusyOverlay } from '../shared/WorkspaceBusyOverlay';
import {
  ParkedProductRoute,
} from './routeSurface';
import {
  currentParkedRouteSlot,
  resolveParkedRouteSlot,
  visibleParkedRouteKey,
} from './routeSurfaceModel';

export function AppRoutes() {
  const nav = useNavigation();
  const composition = useProductWebComposition();
  const routes = useMemo(() => productRouteMap(composition),[composition]);
  const route = requiredRoute(routes.get(nav.page) ?? routes.get(composition.navigation.defaultPage),composition.id);
  const activePage = route.page;
  const hasSections = (composition.navigation.sections[activePage] ?? []).length > 0
    || Boolean(route.sectionRoutes);
  const sectionId = hasSections ? nav.pageSection(activePage) : '';
  const selectedRoute = route.sectionRoutes?.[sectionId] ?? route;
  const managedHosts = useManagedHosts();
  const managedHostRegistryStatus = useManagedHostRegistryStatus();
  const managedHostRegistryError = useManagedHostRegistryError();
  const remoteManagedHostSelected = composition.agentLinkComputeTargets
    && !isLocalManagedHost(nav.managedHostId);
  const selectedManagedHost = remoteManagedHostSelected
    ? managedHosts.find((host) => host.id === nav.managedHostId)
    : undefined;
  const currentSlot = currentParkedRouteSlot(route, sectionId);
  const [visitedKeys,setVisitedKeys] = useState(() => new Set([currentSlot.key]));
  const [readyKeys,setReadyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [bootstrapLoading,setBootstrapLoading] = useState(productWebBootstrapIsLoading);
  const remoteDisabledReason = remoteManagedHostSelected
    ? managedHostRouteDisabledReason({
      activePage,
      sectionId,
      selectedHost: selectedManagedHost,
      surface: selectedRoute.surface ?? route.surface,
    })
    : '';

  useEffect(() => {
    if (remoteManagedHostSelected) return;
    setVisitedKeys((current) => {
      if (current.has(currentSlot.key)) return current;
      const next = new Set(current);
      next.add(currentSlot.key);
      return next;
    });
  }, [currentSlot.key,remoteManagedHostSelected]);

  const markReady = useCallback((key: string) => {
    setReadyKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);

  const releaseBootstrap = useCallback(() => {
    dismissProductWebBootstrapStatus();
    setBootstrapLoading(false);
  }, []);

  const revealedKey = visibleParkedRouteKey(currentSlot.key, readyKeys);
  useLayoutEffect(() => {
    if (!bootstrapLoading) return;
    if (revealedKey) releaseBootstrap();
  }, [bootstrapLoading,revealedKey,releaseBootstrap]);
  useLayoutEffect(() => {
    if (!bootstrapLoading) return;
    if (remoteManagedHostSelected && (managedHostRegistryStatus === 'error' || remoteDisabledReason)) {
      releaseBootstrap();
    }
  }, [
    bootstrapLoading,
    managedHostRegistryStatus,
    releaseBootstrap,
    remoteDisabledReason,
    remoteManagedHostSelected,
  ]);

  if (remoteManagedHostSelected && managedHostRegistryStatus === 'loading') {
    return bootstrapLoading ? null : <RemoteRegistryLoadingFallback />;
  }
  if (remoteManagedHostSelected && managedHostRegistryStatus === 'error') {
    return (
      <PermissionDisabledPage
        reason={`Agent registry is unavailable. Local Core pages remain available.${managedHostRegistryError ? ` ${managedHostRegistryError}` : ''}`}
      />
    );
  }
  if (remoteManagedHostSelected) {
    if (remoteDisabledReason) return <PermissionDisabledPage reason={remoteDisabledReason} />;
    const Route = selectedRoute.component;
    return (
      <Suspense fallback={bootstrapLoading ? null : <RemoteRegistryLoadingFallback />}>
        <ReleaseProductWebBootstrap enabled={bootstrapLoading} onRelease={releaseBootstrap} />
        <Route />
      </Suspense>
    );
  }

  const parkedSlots = [...visitedKeys]
    .concat(visitedKeys.has(currentSlot.key) ? [] : [currentSlot.key])
    .map((key) => resolveParkedRouteSlot(key, routes))
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));

  return (
    <>
      {parkedSlots.map((slot) => {
        const Route = slot.component;
        return (
          <ParkedProductRoute
            key={slot.key}
            slot={slot}
            revealed={slot.key === revealedKey}
            onReady={markReady}
          >
            <LocalRoutePermissionBoundary permissionSurface={slot.permissionSurface}>
              <Route />
            </LocalRoutePermissionBoundary>
          </ParkedProductRoute>
        );
      })}
      {!revealedKey && !bootstrapLoading ? <WorkspaceBusyOverlay id="workspace" /> : null}
    </>
  );
}

function ReleaseProductWebBootstrap({
  enabled,
  onRelease,
}: {
  enabled: boolean;
  onRelease: () => void;
}) {
  useLayoutEffect(() => {
    if (enabled) onRelease();
  }, [enabled,onRelease]);
  return null;
}

function LocalRoutePermissionBoundary({
  children,
  permissionSurface,
}: {
  children: ReactNode;
  permissionSurface: ProductPermissionSurface;
}) {
  const { disabledReason } = useTargetCore(permissionSurface);
  return disabledReason ? <PermissionDisabledPage reason={disabledReason} /> : children;
}

function managedHostRouteDisabledReason({
  activePage,
  sectionId,
  selectedHost,
  surface,
}: {
  activePage: ProductPermissionSurface;
  sectionId: string;
  selectedHost: ManagedHost | undefined;
  surface: ProductRouteSurfacePolicy;
}): string {
  if (!selectedHost) return 'The selected Agent is no longer registered on this Core.';
  const label = selectedHost.displayName || selectedHost.id;
  if (selectedHost.enrollment !== 'enrolled') {
    return `${label} enrollment is ${selectedHost.enrollment}; management pages require an enrolled Agent.`;
  }
  if (selectedHost.connectivity !== 'ready') {
    return `${label} is offline; management pages require ready Presence connectivity.`;
  }
  const effectiveProfile = managedHostEffectiveProfile(selectedHost);
  if (!effectiveProfile) return `${label} has no complete Agent effective profile.`;
  if (!routeVisibleForManagedHost(surface,true,effectiveProfile)) {
    return `${label} profile does not enable the ${activePage} page.`;
  }
  if (activePage === 'system' && !managedHostSystemTabVisible(sectionId, effectiveProfile)) {
    return `${label} profile does not enable the ${sectionId || 'selected'} System tab.`;
  }
  if (!managedHostRequestsAllowed(selectedHost)) {
    return `${label} management connection is ${selectedHost.managementConnection}; requests are disabled.`;
  }
  return '';
}

function requiredRoute<T>(route: T | undefined,compositionId: string): T {
  if (!route) throw new Error(`Product Web composition ${compositionId} has no default route.`);
  return route;
}

function RemoteRegistryLoadingFallback() {
  return <WorkspaceBusyOverlay id="registry" />;
}
