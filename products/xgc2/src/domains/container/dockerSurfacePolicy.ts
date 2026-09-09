import type { ProductRouteSurfacePolicy } from '../../shared/productWebComposition';

/** Docker/Containers surface policy owned by Product.Docker. */
export const dockerSurfacePolicy = {
  productFeatures: ['containers'],
  targetAction: 'container management',
  targetCapabilities: ['containers.read','containers.manage'],
  remoteVisibility: 'local-only',
  remoteManagedHostAdmission: () => false,
} as const satisfies ProductRouteSurfacePolicy;
