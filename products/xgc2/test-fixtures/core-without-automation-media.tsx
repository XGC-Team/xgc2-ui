import type { ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
import { auditTaskLogsContribution } from '../src/domains/audit/tasklogs/taskLogsProductContribution';
import { productOperationsContribution } from '../src/domains/execution/operationsProductContribution';
import { assembleProductWebComposition } from '../src/shared/productWebComposition';
import {
  coreAutomationMediaModulePrefixes,
  coreAutomationMediaOwner,
} from '../profiles/core-automation-media-owner';
import {
  coreUserFeatureDeniedSystemServiceOwners,
  coreUserFeatureEnabledOwners,
  coreUserFeatureModulePrefixes,
  createCoreUserFeatureComposition,
} from '../profiles/core-user-features';

export { ProductWebEntry } from '../src/app/ProductWebEntry';

/** Dedicated static Media=false Core root; it never imports the Media leaf owner. */
const baseComposition = createCoreUserFeatureComposition({
  id: 'core-without-automation-media',
  agentLinkComputeTargets: true,
});

export const productWebComposition = assembleProductWebComposition(
  baseComposition,
  productOperationsContribution,
  auditTaskLogsContribution,
);

export const productWebOwnerMetadata: ProductWebOwnerMetadata = {
  enabledOwners: [...coreUserFeatureEnabledOwners,'Product.Operations','Audit.TaskLogs'],
  deniedOwners: [
    coreAutomationMediaOwner,
    'Product.AppStore','Product.Docker',
    'Developer.MarkPrompt','Developer.ControlGallery',
    ...coreUserFeatureDeniedSystemServiceOwners,
  ],
  modulePrefixes: {
    ...coreUserFeatureModulePrefixes,
    ...coreAutomationMediaModulePrefixes,
  },
};
