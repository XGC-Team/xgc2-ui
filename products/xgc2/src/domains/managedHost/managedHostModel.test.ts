import { describe,expect,it } from 'vitest';
import {
  AGENT_EFFECTIVE_BOOLEAN_PATHS,
  isAgentEffective,
  managedHostEffectiveProfile,
  managedHostRequestsAllowed,
  managedHostSelectable,
} from './managedHostModel';
import { agentEffectiveFixture,managedHostFixture } from '../../test/managedHostTestFixture';

describe('ManagedHost AgentEffective contract', () => {
  it('locks the exact 54 uppercase bool leaves, including ROS2, and accepts all-false as present', () => {
    const allFalse = agentEffectiveFixture(false);

    expect(AGENT_EFFECTIVE_BOOLEAN_PATHS).toHaveLength(53);
    expect(new Set(AGENT_EFFECTIVE_BOOLEAN_PATHS)).toHaveProperty('size', 53);
    expect(AGENT_EFFECTIVE_BOOLEAN_PATHS).toContain('Robot.PX4Multirotor.Models.MocapRotor');
    expect(AGENT_EFFECTIVE_BOOLEAN_PATHS).toContain('Automation.Nodes.ROS2');
    expect(isAgentEffective(allFalse)).toBe(true);
    expect(managedHostEffectiveProfile(managedHostFixture({ effectiveProfile: allFalse }))).toBe(allFalse);
  });

  it('accepts the live ROS2 Agent profile leaf without weakening exact-tree validation', () => {
    const ros2Agent = agentEffectiveFixture(false);
    ros2Agent.Automation.Nodes.ROS2 = true;

    expect(isAgentEffective(ros2Agent)).toBe(true);
    expect(managedHostEffectiveProfile(managedHostFixture({ effectiveProfile: ros2Agent }))).toBe(ros2Agent);
  });

  it('fails closed for nil, sparse, malformed and extended profiles', () => {
    expect(isAgentEffective(null)).toBe(false);
    expect(isAgentEffective({ Surfaces: { Operations: true } })).toBe(false);
    expect(isAgentEffective({ ...agentEffectiveFixture(),Surfaces: { Operations: 'yes' } })).toBe(false);
    expect(isAgentEffective({ ...agentEffectiveFixture(),Unexpected: false })).toBe(false);
  });

  it('keeps Enrollment, Presence and Management connection as separate gates', () => {
    const ready = managedHostFixture();
    expect(managedHostSelectable(ready)).toBe(true);
    expect(managedHostRequestsAllowed(ready)).toBe(true);
    expect(managedHostRequestsAllowed({ ...ready,managementConnection: 'ready' })).toBe(true);
    expect(managedHostSelectable({ ...ready,managementConnection: 'unavailable' })).toBe(true);
    expect(managedHostRequestsAllowed({ ...ready,managementConnection: 'unavailable' })).toBe(false);
    expect(managedHostSelectable({ ...ready,connectivity: 'offline' })).toBe(false);
    expect(managedHostSelectable({ ...ready,enrollment: 'known' })).toBe(false);
    expect(managedHostSelectable({ ...ready,enrollment: 'revoked' })).toBe(false);
  });

  it('locks the exact lowerCamel ManagedHost registry payload', () => {
    const host = managedHostFixture();
    expect(Object.keys(host)).toEqual([
      'id',
      'displayName',
      'buildIdentity',
      'productId',
      'profileDigest',
      'providerRegistryDigest',
      'advertisedManagementEndpoint',
      'publicKeyFingerprint',
      'enrollment',
      'connectivity',
      'managementConnection',
      'effectiveProfile',
      'capabilityManifest',
    ]);
    expect(Object.keys(host.capabilityManifest)).toEqual([
      'host','middleware','execution','devices','network','security',
    ]);
    expect(Object.keys(host.capabilityManifest.execution)).toEqual([
      'canRunProcess',
      'canRunDocker',
      'canCopyFiles',
      'canInstallApt',
      'canInstallPip',
      'canRunRosdep',
      'canManageSystemd',
    ]);
    expect(host.productId).toBe('agent-dev');
    expect(host.profileDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(host.providerRegistryDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(host.publicKeyFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
