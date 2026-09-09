import type { CoreNode } from '../domains/core/corePublic';
import type { ProductRouteSurfacePolicy } from '../shared/productWebComposition';
import { isLocalCore, targetPermissionReason } from '../shared/utils/controlPlane';
import { missingProductSurfaceCapability } from './productSurfacePolicy';

export { isLocalCore };

export function targetSurfaceDisabledReason(
  policy: ProductRouteSurfacePolicy,
  core: CoreNode | undefined,
) {
  const missingProductCapability = core
    ? missingProductSurfaceCapability(policy, core.capabilities)
    : undefined;
  if (core && missingProductCapability) {
    return `${core.name} profile does not enable ${missingProductCapability}.`;
  }
  return targetPermissionReason(core, [...policy.targetCapabilities], policy.targetAction);
}

export function targetSurfaceAvailable(
  policy: ProductRouteSurfacePolicy | undefined,
  core: CoreNode | undefined,
) {
  if (!policy) return false;
  return targetSurfaceDisabledReason(policy, core) === '';
}
