import type { ProductRouteSurfacePolicy } from '../shared/productWebComposition';

export type { ProductPermissionSurface as ProductSurface } from '../shared/productWebComposition';

export function productSurfaceCapabilities(policy: ProductRouteSurfacePolicy) {
  return policy.productFeatures.map((feature) => `product.${feature}`);
}

export function missingProductSurfaceCapability(
  policy: ProductRouteSurfacePolicy,
  capabilities: readonly string[] | undefined,
) {
  return productSurfaceCapabilities(policy).find((capability) => !capabilities?.includes(capability));
}

export function productSurfaceSupportedByCapabilities(
  policy: ProductRouteSurfacePolicy,
  capabilities: readonly string[] | undefined,
) {
  return missingProductSurfaceCapability(policy, capabilities) === undefined;
}
