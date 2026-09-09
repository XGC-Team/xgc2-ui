import { isLocalManagedHost } from '../managedHost/managedHostPublic';
import type { TerminalHost } from './terminalModel';
import { isTerminalRobotHostId, mergeTerminalLoginHosts } from './terminalRobotHosts';

/** Stable id for process-local Direct shell (no sshd). */
export const TERMINAL_DIRECT_SHELL_HOST_ID = 'default-direct-shell';

/** Login identity is the currently selected Core (local) or Agent host. */
export type TerminalLoginIdentity = 'core' | 'agent';

export function terminalLoginIdentity(managedHostId?: string): TerminalLoginIdentity {
  return isLocalManagedHost(managedHostId) ? 'core' : 'agent';
}

export function isTerminalDirectShellHostId(id: string): boolean {
  return id === TERMINAL_DIRECT_SHELL_HOST_ID;
}

/** Virtual Direct shell row — never persisted; backend opens a local PTY. */
export function directShellTerminalHost(labelPrefix = ''): TerminalHost {
  const prefix = labelPrefix.trim();
  return {
    id: TERMINAL_DIRECT_SHELL_HOST_ID,
    name: prefix ? `${prefix} · Direct shell` : 'Direct shell',
    group: 'Local',
    address: 'local',
    port: 0,
    user: '',
    authMode: 'local-shell',
    password: '',
    privateKey: '',
    passphrase: '',
    rememberPassword: false,
    hasPassword: false,
    hostKey: '',
    description: 'Process-local interactive shell (no SSH daemon).',
  };
}

/**
 * Build the Targets rail from the currently selected identity's local data.
 *
 * - Core: Direct shell + Core Host catalog (free-form, including any manual 127.0.0.1) + robots.
 * - Agent: Direct shell only (never Core robots/Hosts; no synthetic loopback).
 */
export function buildTerminalLoginHosts({
  identity,
  customHosts,
  robotHosts,
  agentLabel,
}: {
  identity: TerminalLoginIdentity;
  customHosts: readonly TerminalHost[];
  robotHosts: readonly TerminalHost[];
  /** Optional Agent display name for Local group labels. */
  agentLabel?: string;
}): TerminalHost[] {
  if (identity === 'agent') {
    const label = agentLabel?.trim() || 'Agent';
    return [directShellTerminalHost(label)];
  }

  const direct = directShellTerminalHost();
  // Virtual Direct shell and Robot rows are never part of the free-form catalog.
  const cleanedCustom = customHosts.filter((host) => (
    !isTerminalDirectShellHostId(host.id)
    && !isTerminalRobotHostId(host.id)
  ));
  const merged = mergeTerminalLoginHosts(robotHosts, cleanedCustom);
  return [direct, ...merged];
}

/** Connect never prompts for Direct shell (no password secret). */
export function hostNeedsConnectPassword(host: TerminalHost): boolean {
  if (isTerminalDirectShellHostId(host.id) || host.authMode === 'local-shell') {
    return false;
  }
  if (host.password?.trim()) return false;
  if (host.hasPassword) return false;
  return true;
}
