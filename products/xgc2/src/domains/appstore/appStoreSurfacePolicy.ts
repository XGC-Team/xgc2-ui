import type { ProductRouteSurfacePolicy } from '../../shared/productWebComposition';
import { isAgentEffective } from '../managedHost/managedHostPublic';

/** App Store surface policy owned by Product.AppStore. */
export const appStoreSurfacePolicy = {
  productFeatures: ['app-store'],
  targetAction: 'app store access',
  targetCapabilities: ['app-store'],
  remoteVisibility: 'capability',
  remoteManagedHostAdmission: (profile: unknown) => (
    isAgentEffective(profile) && profile.Surfaces.AppStore
  ),
} as const satisfies ProductRouteSurfacePolicy;
