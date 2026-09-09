import { describe,expect,it } from 'vitest';
import type { CoreNode } from '../core/corePublic';
import { executionTargetKeyForCore,selectedExecutionTargetId } from './executionTarget';

describe('executionTarget', () => {
  it('uses an explicit remote-Core key instead of pretending a Core ID is an Agent target', () => {
    expect(selectedExecutionTargetId({ selectedTargetCore: core({ id: 'edge/core' }) })).toBe('core:edge/core');
    expect(executionTargetKeyForCore('edge/core')).toBe('core:edge/core');
  });

  it('keeps local Core and local managed-host selections on the local target', () => {
    expect(selectedExecutionTargetId({ selectedTargetCore: core({ profile: 'ground',metadata: { local: true } }) })).toBe('local');
    expect(selectedExecutionTargetId({ managedHostId: 'local',selectedTargetCore: core({ id: 'remote' }) })).toBe('core:remote');
  });

  it('gives an explicitly selected managed Agent precedence over the Core selection', () => {
    expect(selectedExecutionTargetId({ managedHostId: 'agent/a',selectedTargetCore: core({ id: 'remote' }) })).toBe('agent/a');
  });
});

function core(overrides: Partial<CoreNode> = {}): CoreNode {
  return {
    id: 'remote-core',name: 'Remote Core',profile: 'vehicle',baseUrl: 'http://remote:8787',status: 'online',
    capabilities: [],registeredAt: '',lastSeenAt: '',updatedAt: '',...overrides,
  };
}
