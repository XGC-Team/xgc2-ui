import type { ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
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
 * False Audit.TaskLogs fixture: Operations (and Audit page) present, TaskLogs absent.
 */
const base = createCoreUserFeatureComposition({
  id: 'core-operations-without-tasklogs',
  agentLinkComputeTargets: true,
});

export const productWebComposition = assembleProductWebComposition(
  base,
  productOperationsContribution,
);

export const productWebOwnerMetadata: ProductWebOwnerMetadata = {
  enabledOwners: [
    ...coreUserFeatureEnabledOwners,
    'Product.Operations',
  ],
  deniedOwners: [
    'Audit.TaskLogs',
    'Product.AppStore','Product.Docker',
    'Developer.MarkPrompt','Developer.ControlGallery',
    ...coreUserFeatureDeniedSystemServiceOwners,
  ],
  modulePrefixes: coreUserFeatureModulePrefixes,
};
