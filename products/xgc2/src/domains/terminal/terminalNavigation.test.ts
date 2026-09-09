import { describe, expect, it } from 'vitest';
import { resolveTerminalTab, terminalTabIds } from './terminalNavigation';

describe('terminalNavigation', () => {
  it('keeps Terminal, Hosts, and User scripts as the only tabs', () => {
    expect(terminalTabIds).toEqual(['terminal', 'hosts', 'usernode']);
  });

  it('resolves the User scripts tab by usernode id', () => {
    expect(resolveTerminalTab('usernode')).toBe('usernode');
  });

  it('does not treat leftover commands section as User scripts', () => {
    expect(resolveTerminalTab('commands')).toBe('terminal');
    expect(resolveTerminalTab('quick-commands')).toBe('terminal');
    expect(resolveTerminalTab(undefined)).toBe('terminal');
  });
});
