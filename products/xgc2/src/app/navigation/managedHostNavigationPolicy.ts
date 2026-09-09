import { isAgentEffective } from '../../domains/managedHost/managedHostPublic';
import type {
  ProductRouteContribution,
  ProductRouteSurfacePolicy,
} from '../../shared/productWebComposition';

/** Execute only the static admission carried by the compiled route owner. */
export function routeVisibleForManagedHost(
  surface: ProductRouteSurfacePolicy | undefined,
  remoteSelected: boolean,
  effectiveProfile: unknown,
): boolean {
  if (!remoteSelected) return true;
  return surface?.remoteManagedHostAdmission(effectiveProfile) === true;
}

export function firstVisibleManagedHostPage(
  candidates: readonly Pick<ProductRouteContribution,'page' | 'surface'>[],
  effectiveProfile: unknown,
): ProductRouteContribution['page'] | undefined {
  return candidates.find((route) => (
    routeVisibleForManagedHost(route.surface,true,effectiveProfile)
  ))?.page;
}

/** Fixed projection of the eight System membership leaves onto System Web tabs. */
export function managedHostSystemTabVisible(
  tabID: string,
  effectiveProfile: unknown,
): boolean {
  if (!isAgentEffective(effectiveProfile)) return false;
  const system = effectiveProfile.System;
  switch (tabID) {
  case 'overview': return system.Overview || system.HostLogs;
  case 'files': return system.Files;
  case 'processes': return system.Processes || system.Network;
  case 'host': return true;
  case 'maintenance': return system.MaintenanceCleanup;
  case 'ssh': return system.SSHService || system.Firewall;
  default: return false;
  }
}
