import { composeAutomationNodeWeb } from '../src/domains/automation/nodes/automationNodeWebComposition';
import { callGraphAutomationNodeContributions } from '../src/domains/automation/nodes/callGraph/callGraphAutomationNodeContributions';
import { coreFlowAutomationNodeContributions } from '../src/domains/automation/nodes/coreFlow/coreFlowAutomationNodeContributions';
import { groundStationAutomationNodeContributions } from '../src/domains/automation/nodes/groundStation/groundStationAutomationNodeContributions';
import { manualTriggersAutomationNodeContributions } from '../src/domains/automation/nodes/manualTriggers/manualTriggersAutomationNodeContributions';
import { mediaCaptureSnapshotContribution } from '../src/domains/automation/nodes/media/mediaCaptureSnapshotContribution';
import { processAutomationNodeContributions } from '../src/domains/automation/nodes/process/processAutomationNodeContributions';

export {
  coreAutomationCallGraphModulePrefixes,
  coreAutomationCallGraphOwner,
} from './core-automation-callgraph-owner';
export {
  coreAutomationCoreFlowModulePrefixes,
  coreAutomationCoreFlowOwner,
} from './core-automation-coreflow-owner';
export {
  coreAutomationGroundStationModulePrefixes,
  coreAutomationGroundStationOwner,
} from './core-automation-groundstation-owner';
export {
  coreAutomationManualTriggersModulePrefixes,
  coreAutomationManualTriggersOwner,
} from './core-automation-manualtriggers-owner';
export {
  coreAutomationMediaModulePrefixes,
  coreAutomationMediaOwner,
} from './core-automation-media-owner';
export {
  coreAutomationProcessModulePrefixes,
  coreAutomationProcessOwner,
} from './core-automation-process-owner';

/** Static Automation node composition selected by the full Core reference products. */
export const coreAutomationNodeComposition = composeAutomationNodeWeb(
  ...coreFlowAutomationNodeContributions,
  ...manualTriggersAutomationNodeContributions,
  ...callGraphAutomationNodeContributions,
  ...processAutomationNodeContributions,
  ...groundStationAutomationNodeContributions,
  mediaCaptureSnapshotContribution,
);
