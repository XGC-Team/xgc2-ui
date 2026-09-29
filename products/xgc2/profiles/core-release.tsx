import type { ProductWebOwnerMetadata } from '../src/shared/productWebComposition';
import { auditTaskLogsContribution } from '../src/domains/audit/tasklogs/taskLogsProductContribution';
import { productOperationsContribution } from '../src/domains/execution/operationsProductContribution';
import { assembleProductWebComposition } from '../src/shared/productWebComposition';
import {
  coreAutomationCallGraphModulePrefixes,
  coreAutomationCallGraphOwner,
  coreAutomationCoreFlowModulePrefixes,
  coreAutomationCoreFlowOwner,
  coreAutomationGroundStationModulePrefixes,
  coreAutomationGroundStationOwner,
  coreAutomationManualTriggersModulePrefixes,
  coreAutomationManualTriggersOwner,
  coreAutomationMediaModulePrefixes,
  coreAutomationMediaOwner,
  coreAutomationNodeComposition,
  coreAutomationProcessModulePrefixes,
  coreAutomationProcessOwner,
} from './core-automation-nodes';
import {
  coreRobotUnitreeB2ModulePrefixes,
  coreRobotUnitreeB2Owner,
} from './core-robot-kinds';
import {
  coreUserFeatureDeniedSystemServiceOwners,
  coreUserFeatureEnabledOwners,
  coreUserFeatureModulePrefixes,
  createCoreUserFeatureComposition,
} from './core-user-features';

export { ProductWebEntry } from './core-robot-kinds';

const baseComposition = createCoreUserFeatureComposition({
  id: 'core-release-reference',
  agentLinkComputeTargets: true,
  automationNodeComposition: coreAutomationNodeComposition,
});

export const productWebComposition = assembleProductWebComposition(
  baseComposition,
  productOperationsContribution,
  auditTaskLogsContribution,
);

/** Build-only metadata consumed by the Rollup module-absence gate. */
export const productWebOwnerMetadata: ProductWebOwnerMetadata = {
  enabledOwners: [
    ...coreUserFeatureEnabledOwners,
    coreAutomationCoreFlowOwner,
    coreAutomationManualTriggersOwner,
    coreAutomationCallGraphOwner,
    coreAutomationProcessOwner,
    coreAutomationGroundStationOwner,
    coreAutomationMediaOwner,
    coreRobotUnitreeB2Owner,
    'Product.Operations','Audit.TaskLogs',
  ],
  deniedOwners: [
    'Product.AppStore','Product.Docker',
    'Developer.MarkPrompt','Developer.ControlGallery',
    ...coreUserFeatureDeniedSystemServiceOwners,
  ],
  modulePrefixes: {
    ...coreUserFeatureModulePrefixes,
    ...coreAutomationCoreFlowModulePrefixes,
    ...coreAutomationManualTriggersModulePrefixes,
    ...coreAutomationCallGraphModulePrefixes,
    ...coreAutomationProcessModulePrefixes,
    ...coreAutomationGroundStationModulePrefixes,
    ...coreAutomationMediaModulePrefixes,
    ...coreRobotUnitreeB2ModulePrefixes,
  },
};
