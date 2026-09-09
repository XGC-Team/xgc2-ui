import type { HomePageContribution,ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
import { createHomePageAdapter } from '../src/app/home/createHomePageAdapter';
import { recordingOpenFolderActionContribution } from '../src/app/home/RecordingOpenFolderActionContribution';
import { productOperationsContribution } from '../src/domains/execution/operationsProductContribution';
import { HomeRoute } from '../src/domains/home/HomeRoute';
import { createRecordingLibraryCardContribution } from '../src/domains/home/RecordingLibraryCardContribution';
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

const HomePage = createHomePageAdapter(HomeRoute);

const home: HomePageContribution = {
  route: {
    page: 'home',
    component: HomePage,
    surface: {
      productFeatures: ['home'],
      targetAction: 'Core access',
      targetCapabilities: ['core.view'],
      remoteVisibility: 'capability',
      remoteManagedHostAdmission: () => false,
    },
  },
  cards: [
    createRecordingLibraryCardContribution([recordingOpenFolderActionContribution]),
  ],
};

/**
 * False Audit.TaskLogs fixture: Operations (and Audit page) present, TaskLogs absent.
 */
const base = createCoreUserFeatureComposition({
  id: 'core-operations-without-tasklogs',
  agentLinkComputeTargets: true,
  home,
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
