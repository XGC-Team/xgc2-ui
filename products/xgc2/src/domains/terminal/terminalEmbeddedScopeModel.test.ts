import { describe,expect,it } from 'vitest';
import { retainTerminalTarget,terminalEmbeddedScope } from './terminalEmbeddedScopeModel';
import { terminalPersistenceScope } from './terminalPersistenceModel';

describe('embedded terminal scopes',() => {
  it('does not restore or overwrite global Terminal sessions',() => {
    expect(terminalEmbeddedScope('core','agent')).not.toBe(terminalPersistenceScope('core','agent'));
  });

  it('isolates workspaces even when they use the same Agent',() => {
    expect(terminalEmbeddedScope('core','agent','experiment-A'))
      .not.toBe(terminalEmbeddedScope('core','agent','experiment-B'));
    expect(terminalEmbeddedScope('core','agent','A:B')).not.toBe(terminalEmbeddedScope('core','agent','A%3AB'));
  });

  it('retains A and B without changing A when A is selected again',() => {
    const a = { persistenceScope: terminalEmbeddedScope('core-A','agent-A'),targetCoreId: 'core-A',managedHostId: 'agent-A' };
    const b = { persistenceScope: terminalEmbeddedScope('core-B','agent-B'),targetCoreId: 'core-B',managedHostId: 'agent-B' };
    const original = [a];
    const both = retainTerminalTarget(original,b);
    expect(original).toEqual([a]);
    expect(both).toEqual([a,b]);
    expect(both[0]).toBe(a);
    expect(retainTerminalTarget(both,{ ...a,agentLabel: 'Renamed' })).toBe(both);
  });
});
