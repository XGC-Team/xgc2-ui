import { describe,expect,it } from 'vitest';
import { productSurfaceSupportedByCapabilities } from '../src/app/productSurfacePolicy';
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

describe('createCoreUserFeatureComposition factory', () => {
  it('admits the venue catalog with the robot-assets capability Core already advertises', () => {
    const coreCapabilities = ['product.robot-assets','robot.read'];
    for (const composition of [coreDevComposition,coreReleaseComposition]) {
      const route = composition.routes.find((item) => item.page === 'venueAssets');
      expect(route).toBeDefined();
      expect(productSurfaceSupportedByCapabilities(route!.surface, coreCapabilities)).toBe(true);
      expect(composition.navigation.primary.map((item) => item.id)).toEqual([
        'experiment','robotAssets','venueAssets','automations','sharing',
      ]);
    }
  });

  it('admits sharing with the existing settings capability advertised by Core', () => {
    // /api/cores advertises product.settings + access.manage; product.sharing
    // does not exist. Check the actual navigation filter, not route existence.
    const coreCapabilities = ['product.settings','access.manage'];
    for (const composition of [coreDevComposition,coreReleaseComposition]) {
      const route = composition.routes.find((item) => item.page === 'sharing');
      expect(route).toBeDefined();
      expect(route!.surface.targetCapabilities).toEqual(['access.manage']);
      expect(productSurfaceSupportedByCapabilities(route!.surface, coreCapabilities)).toBe(true);
      expect(productSurfaceSupportedByCapabilities(route!.surface, ['access.manage'])).toBe(false);
      expect(route!.surface.remoteManagedHostAdmission({})).toBe(false);
      expect(composition.navigation.primary.some((item) => item.id === 'sharing')).toBe(true);
    }
  });

  it('defaults to Experiment as the landing route', () => {
    const composition = createCoreUserFeatureComposition({
      id: 'factory-default-landing',
      agentLinkComputeTargets: true,
    });

    expect(composition.id).toBe('factory-default-landing');
    expect(composition.navigation.defaultPage).toBe('experiment');
    expect(composition.routes[0]?.page).toBe('experiment');
  });

  it('contributes Tools settings only when Mark Prompt is composed', () => {
    expect(coreDevComposition.settings.sections.map((section) => section.id))
      .toEqual(['device-sign-in','appearance','time','field-tooltips','tools','agent-providers']);
    expect(coreReleaseComposition.settings.sections.map((section) => section.id))
      .toEqual(['device-sign-in','appearance','time','field-tooltips','agent-providers']);
    expect(createCoreUserFeatureComposition({
      id: 'factory-without-mark-prompt',
      agentLinkComputeTargets: true,
    }).settings.sections.map((section) => section.id)).toEqual(['device-sign-in','appearance','time','field-tooltips','agent-providers']);
  });

  it('core-dev and core-release land on Experiment with no Home route or nav item', () => {
    for (const composition of [coreDevComposition,coreReleaseComposition]) {
      expect(composition.navigation.defaultPage).toBe('experiment');
      expect(composition.routes[0]?.page).toBe('experiment');
      expect(composition.routes.map((route) => route.page as string)).not.toContain('home');
      expect(composition.navigation.primary.map((item) => item.id as string)).not.toContain('home');
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
