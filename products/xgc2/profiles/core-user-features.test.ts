import { describe,expect,it } from 'vitest';
import {
  ProductWebEntry as coreDevProductWebEntry,
  productWebComposition as coreDevComposition,
  productWebOwnerMetadata as coreDevOwnerMetadata,
} from './core-dev';
import {
  ProductWebEntry as coreReleaseProductWebEntry,
  productWebComposition as coreReleaseComposition,
  productWebOwnerMetadata as coreReleaseOwnerMetadata,
} from './core-release';
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
  coreRobotAssetKindComposition,
  coreRobotUnitreeB2Admission,
  coreRobotUnitreeB2ModulePrefixes,
  coreRobotUnitreeB2Owner,
  ProductWebEntry as coreRobotKindsProductWebEntry,
} from './core-robot-kinds';
import { UNITREE_B2_ADMISSION } from '../src/domains/robot/kinds/unitree-b2/capabilities';
import {
  coreUserFeatureDeniedSystemServiceOwners,
  coreUserFeatureEnabledOwners,
  createCoreUserFeatureComposition,
} from './core-user-features';
import { callGraphAutomationNodeContributions } from '../src/domains/automation/nodes/callGraph/callGraphAutomationNodeContributions';
import { coreFlowAutomationNodeContributions } from '../src/domains/automation/nodes/coreFlow/coreFlowAutomationNodeContributions';
import { groundStationAutomationNodeContributions } from '../src/domains/automation/nodes/groundStation/groundStationAutomationNodeContributions';
import { manualTriggersAutomationNodeContributions } from '../src/domains/automation/nodes/manualTriggers/manualTriggersAutomationNodeContributions';
import { mediaCaptureSnapshotContribution } from '../src/domains/automation/nodes/media/mediaCaptureSnapshotContribution';
import { processAutomationNodeContributions } from '../src/domains/automation/nodes/process/processAutomationNodeContributions';
import { productWebOwnerMetadata as mediaFalseOwnerMetadata } from '../test-fixtures/core-without-automation-media';
import {
  builtInRobotAssetKindContributions,
  robotAssetKindContributionByCatalogId,
} from '../src/domains/robot/robotAssetPublic';
import { unitreeB2RobotAssetKindContribution } from '../src/domains/robot/kinds/unitree-b2';

function homeCardIds(composition: typeof coreDevComposition) {
  return composition.home?.cards.map((card) => card.id) ?? [];
}

function hasHomeRoute(composition: typeof coreDevComposition) {
  return composition.routes.some((route) => route.page === 'home');
}

function hasHomeNav(composition: typeof coreDevComposition) {
  return composition.navigation.primary.some((item) => item.id === 'home');
}

describe('createCoreUserFeatureComposition factory', () => {
  it('omits Home route/nav/home and defaults to experiment when home is not provided', () => {
    const composition = createCoreUserFeatureComposition({
      id: 'factory-without-home',
      agentLinkComputeTargets: true,
    });

    expect(composition.id).toBe('factory-without-home');
    expect(composition.home).toBeUndefined();
    expect(hasHomeRoute(composition)).toBe(false);
    expect(hasHomeNav(composition)).toBe(false);
    expect(composition.navigation.defaultPage).toBe('experiment');
    expect(composition.routes[0]?.page).toBe('experiment');
  });

  it('contributes Tools settings only when Mark Prompt is composed', () => {
    expect(coreDevComposition.settings.sections.map((section) => section.id))
      .toEqual(['appearance','field-tooltips','tools','native-providers']);
    expect(coreReleaseComposition.settings.sections.map((section) => section.id))
      .toEqual(['appearance','field-tooltips','native-providers']);
    expect(createCoreUserFeatureComposition({
      id: 'factory-without-mark-prompt',
      agentLinkComputeTargets: true,
    }).settings.sections.map((section) => section.id)).toEqual(['appearance','field-tooltips','native-providers']);
  });

  it('core-dev and core-release include Home route/nav and both card owners', () => {
    for (const composition of [coreDevComposition,coreReleaseComposition]) {
      expect(composition.home).toBeDefined();
      expect(hasHomeRoute(composition)).toBe(true);
      expect(hasHomeNav(composition)).toBe(true);
      expect(composition.navigation.defaultPage).toBe('home');
      expect(composition.routes[0]?.page).toBe('home');
      expect(homeCardIds(composition)).toEqual(['recording-library']);
      expect(composition.home?.cards.map((card) => card.owner)).toEqual([
        'Home.RecordingLibrary',
      ]);
    }
  });

  it('keeps static Automation leaf identities and owner metadata aligned across true roots', () => {
    expect(coreAutomationNodeComposition.contributions).toEqual([
      ...coreFlowAutomationNodeContributions,
      ...manualTriggersAutomationNodeContributions,
      ...callGraphAutomationNodeContributions,
      ...processAutomationNodeContributions,
      ...groundStationAutomationNodeContributions,
      mediaCaptureSnapshotContribution,
    ]);

    const automationOwners = [
      [coreAutomationCoreFlowOwner, coreAutomationCoreFlowModulePrefixes[coreAutomationCoreFlowOwner]],
      [coreAutomationManualTriggersOwner, coreAutomationManualTriggersModulePrefixes[coreAutomationManualTriggersOwner]],
      [coreAutomationCallGraphOwner, coreAutomationCallGraphModulePrefixes[coreAutomationCallGraphOwner]],
      [coreAutomationProcessOwner, coreAutomationProcessModulePrefixes[coreAutomationProcessOwner]],
      [coreAutomationGroundStationOwner, coreAutomationGroundStationModulePrefixes[coreAutomationGroundStationOwner]],
      [coreAutomationMediaOwner, coreAutomationMediaModulePrefixes[coreAutomationMediaOwner]],
    ] as const;

    for (const metadata of [coreDevOwnerMetadata,coreReleaseOwnerMetadata]) {
      for (const [owner, prefixes] of automationOwners) {
        expect(metadata.enabledOwners).toContain(owner);
        expect(metadata.deniedOwners).not.toContain(owner);
        expect(metadata.modulePrefixes).toHaveProperty(owner, prefixes);
      }
    }

    expect(mediaFalseOwnerMetadata.enabledOwners).not.toContain(coreAutomationMediaOwner);
    expect(mediaFalseOwnerMetadata.deniedOwners).toContain(coreAutomationMediaOwner);
    expect(mediaFalseOwnerMetadata.modulePrefixes[coreAutomationMediaOwner]).toEqual(
      coreAutomationMediaModulePrefixes[coreAutomationMediaOwner],
    );
  });

  it('keeps Unitree B2 leaf composition and owner metadata on real Core roots only', () => {
    expect(coreRobotAssetKindComposition.contributions).toEqual([
      ...builtInRobotAssetKindContributions,
      unitreeB2RobotAssetKindContribution,
    ]);
    expect(robotAssetKindContributionByCatalogId(coreRobotAssetKindComposition,'unitreeB2'))
      .toBe(unitreeB2RobotAssetKindContribution);

    // Capabilities entrypoint is a real Core-root contract, matched to composition.
    expect(coreRobotUnitreeB2Admission).toBe(UNITREE_B2_ADMISSION);
    expect(coreRobotUnitreeB2Admission).toBe(unitreeB2RobotAssetKindContribution.admission);
    expect(
      robotAssetKindContributionByCatalogId(coreRobotAssetKindComposition,'unitreeB2')?.admission,
    ).toBe(coreRobotUnitreeB2Admission);

    for (const metadata of [coreDevOwnerMetadata,coreReleaseOwnerMetadata]) {
      expect(metadata.enabledOwners).toContain(coreRobotUnitreeB2Owner);
      expect(metadata.deniedOwners).not.toContain(coreRobotUnitreeB2Owner);
      expect(metadata.modulePrefixes[coreRobotUnitreeB2Owner]).toEqual(
        coreRobotUnitreeB2ModulePrefixes[coreRobotUnitreeB2Owner],
      );
      expect(metadata.modulePrefixes[coreRobotUnitreeB2Owner]).toEqual([
        'src/domains/robot/kinds/unitree-b2/',
      ]);
    }

    // Generic factory owners and leaf-free false fixtures must not claim B2.
    expect(coreUserFeatureEnabledOwners).not.toContain(coreRobotUnitreeB2Owner);
    expect(mediaFalseOwnerMetadata.enabledOwners).not.toContain(coreRobotUnitreeB2Owner);
  });

  it('exports ProductWebEntry ABI that wraps Core robot-kind composition', () => {
    expect(typeof coreRobotKindsProductWebEntry).toBe('function');
    expect(coreDevProductWebEntry).toBe(coreRobotKindsProductWebEntry);
    expect(coreReleaseProductWebEntry).toBe(coreRobotKindsProductWebEntry);
    expect(coreDevProductWebEntry.length).toBe(1);
  });

  it('closes System host logs and sshd/firewall while keeping Terminal RemoteSSH', () => {
    for (const owner of coreUserFeatureDeniedSystemServiceOwners) {
      expect(coreUserFeatureEnabledOwners).not.toContain(owner);
      expect(coreDevOwnerMetadata.deniedOwners).toContain(owner);
      expect(coreReleaseOwnerMetadata.deniedOwners).toContain(owner);
    }
    expect(coreUserFeatureEnabledOwners).toContain('Terminal.RemoteSSH');
    expect(coreUserFeatureDeniedSystemServiceOwners).toContain('System.HostLogs');
    expect(coreDevComposition.navigation.sections.system?.map((s) => s.id)).toEqual([
      'overview',
      'files',
      'processes',
      'host',
      'maintenance',
    ]);
    expect(coreReleaseComposition.navigation.sections.system?.map((s) => s.id)).toEqual([
      'overview',
      'files',
      'processes',
      'host',
      'maintenance',
    ]);
  });
});
