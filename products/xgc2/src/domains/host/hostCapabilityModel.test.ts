import { describe,expect,it } from 'vitest';
import { agentEffectiveFixture,managedHostFixture } from '../../test/managedHostTestFixture';
import {
  DISABLED_HOST_SYSTEM_PROFILE,
  hostTabContentAvailable,
  LOCAL_HOST_SYSTEM_PROFILE,
  managementConnectionAllowsRequests,
  normalizeManagementConnection,
  normalizeSystemProfile,
  resolveHostSystemContext,
} from './hostCapabilityModel';

describe('hostCapabilityModel', () => {
  it('projects local Core static composition without reading an Agent DTO', () => {
    const context = resolveHostSystemContext({ managedHostId: 'local' });
    expect(context.isRemote).toBe(false);
    expect(context.systemProfile).toEqual(LOCAL_HOST_SYSTEM_PROFILE);
    expect(context.managementConnection).toBe('ready');
    expect(context.requestsAllowed).toBe(true);
  });

  it('fails closed when the remote Agent or effective profile is missing', () => {
    const missing = resolveHostSystemContext({ managedHostId: 'agent-x' });
    expect(missing.systemProfile).toEqual(DISABLED_HOST_SYSTEM_PROFILE);
    expect(missing.managementConnection).toBe('unavailable');
    expect(missing.requestsAllowed).toBe(false);

    const sparse = resolveHostSystemContext({
      managedHostId: 'agent-x',
      host: managedHostFixture({ effectiveProfile: null }),
    });
    expect(sparse.systemProfile).toEqual(DISABLED_HOST_SYSTEM_PROFILE);
  });

  it('reads membership from typed EffectiveProfile and gates requests on all three states', () => {
    const profile = agentEffectiveFixture(false);
    profile.System.Files = true;
    const host = managedHostFixture({ effectiveProfile: profile });
    const ready = resolveHostSystemContext({ managedHostId: host.id,host });
    expect(ready.systemProfile.Files).toBe(true);
    expect(ready.requestsAllowed).toBe(true);

    expect(resolveHostSystemContext({
      managedHostId: host.id,
      host: { ...host,connectivity: 'offline' },
    }).requestsAllowed).toBe(false);
    expect(resolveHostSystemContext({
      managedHostId: host.id,
      host: { ...host,enrollment: 'known' },
    }).requestsAllowed).toBe(false);
    expect(resolveHostSystemContext({
      managedHostId: host.id,
      host: { ...host,managementConnection: 'connecting' },
    }).requestsAllowed).toBe(false);
  });

  it('rejects sparse System objects instead of inventing membership', () => {
    expect(normalizeSystemProfile({ Overview: true })).toEqual(DISABLED_HOST_SYSTEM_PROFILE);
  });

  it('maps eight uppercase membership leaves onto System content areas', () => {
    const profile = {
      ...DISABLED_HOST_SYSTEM_PROFILE,
      Overview: true,
      HostLogs: true,
      Files: true,
      Network: true,
      MaintenanceCleanup: true,
      Firewall: true,
    };
    expect(hostTabContentAvailable('overview', profile)).toBe(true);
    expect(hostTabContentAvailable('files', profile)).toBe(true);
    expect(hostTabContentAvailable('processes', profile)).toBe(true);
    expect(hostTabContentAvailable('host', profile)).toBe(true);
    expect(hostTabContentAvailable('maintenance', profile)).toBe(true);
    expect(hostTabContentAvailable('ssh', profile)).toBe(true);

    const empty = { ...DISABLED_HOST_SYSTEM_PROFILE };
    for (const tab of ['overview','files','processes','maintenance','ssh'] as const) {
      expect(hostTabContentAvailable(tab, empty)).toBe(false);
    }
    expect(hostTabContentAvailable('host', empty)).toBe(true);
  });

  it('allows management requests only for idle/ready connection cache states', () => {
    expect(managementConnectionAllowsRequests('idle')).toBe(true);
    expect(managementConnectionAllowsRequests('ready')).toBe(true);
    expect(managementConnectionAllowsRequests('connecting')).toBe(false);
    expect(managementConnectionAllowsRequests('unavailable')).toBe(false);
    expect(normalizeManagementConnection('bogus')).toBe('unavailable');
  });
});
