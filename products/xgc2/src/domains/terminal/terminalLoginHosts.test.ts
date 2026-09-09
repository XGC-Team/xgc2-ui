import { describe,expect,it } from 'vitest';
import { createEmptyTerminalHost } from './terminalCatalogModel';
import {
  buildTerminalLoginHosts,
  directShellTerminalHost,
  hostNeedsConnectPassword,
  isTerminalDirectShellHostId,
  TERMINAL_DIRECT_SHELL_HOST_ID,
  terminalLoginIdentity,
} from './terminalLoginHosts';
import { TERMINAL_ROBOT_HOST_ID_PREFIX } from './terminalRobotHosts';

describe('terminalLoginHosts', () => {
  it('maps managed host selection to Core vs Agent identity', () => {
    expect(terminalLoginIdentity(undefined)).toBe('core');
    expect(terminalLoginIdentity('local')).toBe('core');
    expect(terminalLoginIdentity('agent-a')).toBe('agent');
  });

  it('builds Core targets as Direct shell + Hosts + robots', () => {
    const hosts = buildTerminalLoginHosts({
      identity: 'core',
      customHosts: [
        { ...createEmptyTerminalHost(),id: 'host-loop',name: 'Manual loopback',address: '127.0.0.1' },
        { ...createEmptyTerminalHost(),id: 'host-lab',name: 'Lab PC',address: '10.0.0.5' },
      ],
      robotHosts: [{
        ...createEmptyTerminalHost(),
        id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`,
        name: 'UAV 01',
        group: 'PX4 Multirotor',
      }],
    });
    expect(hosts.map((host) => host.id)).toEqual([
      TERMINAL_DIRECT_SHELL_HOST_ID,
      'host-loop',
      'host-lab',
      `${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`,
    ]);
    expect(isTerminalDirectShellHostId(hosts[0]!.id)).toBe(true);
  });

  it('builds Agent targets as Direct shell only', () => {
    const hosts = buildTerminalLoginHosts({
      identity: 'agent',
      agentLabel: 'edge-1',
      customHosts: [
        { ...createEmptyTerminalHost(),id: 'host-lab',name: 'Lab PC' },
      ],
      robotHosts: [{
        ...createEmptyTerminalHost(),
        id: `${TERMINAL_ROBOT_HOST_ID_PREFIX}px4-1`,
        name: 'UAV 01',
      }],
    });
    expect(hosts.map((host) => host.id)).toEqual([
      TERMINAL_DIRECT_SHELL_HOST_ID,
    ]);
    expect(hosts[0]!.name).toContain('edge-1');
  });

  it('never prompts for Direct shell password', () => {
    expect(hostNeedsConnectPassword(directShellTerminalHost())).toBe(false);
    expect(hostNeedsConnectPassword({
      ...createEmptyTerminalHost(),
      address: '127.0.0.1',
      authMode: 'password',
    })).toBe(true);
    expect(hostNeedsConnectPassword({
      ...createEmptyTerminalHost(),
      address: '127.0.0.1',
      authMode: 'password',
      hasPassword: true,
    })).toBe(false);
  });
});
