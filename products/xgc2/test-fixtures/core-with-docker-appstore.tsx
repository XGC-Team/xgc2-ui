import type { ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
import { productAppStoreContribution } from '../src/domains/appstore/appStoreProductContribution';
import { auditTaskLogsContribution } from '../src/domains/audit/tasklogs/taskLogsProductContribution';
import { productDockerContribution } from '../src/domains/container/dockerProductContribution';
import { productOperationsContribution } from '../src/domains/execution/operationsProductContribution';
import {
  assembleProductWebComposition,
} from '../src/shared/productWebComposition';
import {
  coreUserFeatureDeniedSystemServiceOwners,
  coreUserFeatureEnabledOwners,
  coreUserFeatureModulePrefixes,
  createCoreUserFeatureComposition,
} from '../profiles/core-user-features';

export { ProductWebEntry } from '../src/app/ProductWebEntry';

/**
 * Positive Core Web composition root for tests/build proof only.
 * Statically enables Product.Docker and Product.AppStore together
 * (AppStore-only is not a supported composition).
 */
const base = createCoreUserFeatureComposition({
  id: 'core-with-docker-appstore',
  agentLinkComputeTargets: true,
});

export const productWebComposition = assembleProductWebComposition(
  base,
  productOperationsContribution,
  auditTaskLogsContribution,
  productDockerContribution,
  productAppStoreContribution,
);

/** Build-only metadata consumed by the Rollup module-absence gate. */
export const productWebOwnerMetadata: ProductWebOwnerMetadata = {
  enabledOwners: [
    ...coreUserFeatureEnabledOwners,
    'Product.Operations',
    'Audit.TaskLogs',
    'Product.Docker',
    'Product.AppStore',
  ],
  deniedOwners: [
    'Developer.MarkPrompt','Developer.ControlGallery',
    ...coreUserFeatureDeniedSystemServiceOwners,
  ],
  modulePrefixes: coreUserFeatureModulePrefixes,
};
