import type { HomePageContribution,ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
import { createHomePageAdapter } from '../src/app/home/createHomePageAdapter';
import { recordingOpenFolderActionContribution } from '../src/app/home/RecordingOpenFolderActionContribution';
import { HomeRoute } from '../src/domains/home/HomeRoute';
import { createRecordingLibraryCardContribution } from '../src/domains/home/RecordingLibraryCardContribution';
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

/** Dedicated static Media=false Core root; it never imports the Media leaf owner. */
const baseComposition = createCoreUserFeatureComposition({
  id: 'core-without-automation-media',
  agentLinkComputeTargets: true,
  home,
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
