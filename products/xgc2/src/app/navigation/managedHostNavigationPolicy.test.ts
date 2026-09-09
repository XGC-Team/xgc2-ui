import { describe,expect,it } from 'vitest';
import {
  isAgentEffective,
} from '../../domains/managedHost/managedHostPublic';
import { agentEffectiveFixture } from '../../test/managedHostTestFixture';
import type {
  Page,
  ProductRouteContribution,
  ProductRouteSurfacePolicy,
  RemoteManagedHostAdmission,
} from '../../shared/productWebComposition';
import {
  firstVisibleManagedHostPage,
  managedHostSystemTabVisible,
  routeVisibleForManagedHost,
} from './managedHostNavigationPolicy';

const denyRemote: RemoteManagedHostAdmission = () => false;
const admitOperations: RemoteManagedHostAdmission = (profile) => (
  isAgentEffective(profile) && profile.Surfaces.Operations
);
const admitSystem: RemoteManagedHostAdmission = (profile) => (
  isAgentEffective(profile) && profile.Surfaces.System
);

function surface(
  remoteManagedHostAdmission: RemoteManagedHostAdmission,
): ProductRouteSurfacePolicy {
  return {
    productFeatures: ['fixture'],
    targetAction: 'fixture access',
    targetCapabilities: ['fixture.read'],
    remoteVisibility: 'control-plane',
    remoteManagedHostAdmission,
  };
}

function route(
  page: Page,
  remoteManagedHostAdmission: RemoteManagedHostAdmission,
): ProductRouteContribution {
  return { page,component: () => null,surface: surface(remoteManagedHostAdmission) };
}

describe('managed host navigation policy', () => {
  it('keeps compiled routes available locally without executing remote admission', () => {
    const admission = () => { throw new Error('remote admission executed for a local route'); };

    expect(routeVisibleForManagedHost(surface(admission),false,undefined)).toBe(true);
    expect(routeVisibleForManagedHost(undefined,false,undefined)).toBe(true);
  });

  it('executes contribution-owned admission without interpreting the page literal', () => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.Operations = true;

    for (const page of ['home','settings','operations','appStore','containers'] as const) {
      expect(routeVisibleForManagedHost(route(page,admitOperations).surface,true,profile)).toBe(true);
      expect(routeVisibleForManagedHost(route(page,denyRemote).surface,true,profile)).toBe(false);
    }
  });

  it('fails closed for missing policy and malformed/all-disabled profiles', () => {
    expect(routeVisibleForManagedHost(undefined,true,agentEffectiveFixture(true))).toBe(false);
    expect(routeVisibleForManagedHost(surface(admitOperations),true,undefined)).toBe(false);
    expect(routeVisibleForManagedHost(
      surface(admitOperations),
      true,
      { Surfaces: { Operations: true } },
    )).toBe(false);
    expect(routeVisibleForManagedHost(
      surface(admitOperations),
      true,
      agentEffectiveFixture(false),
    )).toBe(false);
  });

  it('selects the first compiled route admitted by its own static surface', () => {
    const profile = agentEffectiveFixture(false);
    profile.Surfaces.System = true;
    profile.Surfaces.Operations = true;

    expect(firstVisibleManagedHostPage([
      route('home',denyRemote),
      route('settings',admitSystem),
      route('operations',admitOperations),
    ],profile)).toBe('settings');
    expect(firstVisibleManagedHostPage([
      route('home',denyRemote),
      route('operations',admitOperations),
    ],agentEffectiveFixture(false))).toBeUndefined();
  });

  it.each([
    ['Overview','overview'],
    ['HostLogs','overview'],
    ['Files','files'],
    ['Processes','processes'],
    ['Network','processes'],
    ['MaintenanceCleanup','maintenance'],
    ['SSHService','ssh'],
    ['Firewall','ssh'],
  ] as const)('maps System.%s to only the %s tab', (leaf,expectedTab) => {
    const profile = agentEffectiveFixture(false);
    profile.System[leaf] = true;
    for (const tab of ['overview','files','processes','host','maintenance','ssh']) {
      expect(managedHostSystemTabVisible(tab,profile)).toBe(tab === expectedTab || tab === 'host');
    }
  });

  it('rejects System tabs for nil/malformed profiles and unknown ids', () => {
    expect(managedHostSystemTabVisible('files',undefined)).toBe(false);
    expect(managedHostSystemTabVisible('files',{ System: { Files: true } })).toBe(false);
    expect(managedHostSystemTabVisible('unknown',agentEffectiveFixture(true))).toBe(false);
  });
});
