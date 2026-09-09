import { describe,expect,it } from 'vitest';
import type { CoreNode } from '../domains/core/coreModel';
import type { ProductRouteSurfacePolicy } from '../shared/productWebComposition';
import { targetSurfaceAvailable,targetSurfaceDisabledReason } from './targetCorePolicy';

const managedSurface: ProductRouteSurfacePolicy = {
  productFeatures: ['managed-surface'],
  targetAction: 'managed surface access',
  targetCapabilities: ['surface.read','surface.manage'],
  remoteVisibility: 'capability',
  remoteManagedHostAdmission: () => false,
};

describe('targetCorePolicy', () => {
  it('keeps profile support ahead of action authority', () => {
    const target = core({ capabilities: ['surface.read'] });

    expect(targetSurfaceDisabledReason(managedSurface,target))
      .toBe('Remote Core profile does not enable product.managed-surface.');
    expect(targetSurfaceAvailable(managedSurface,target)).toBe(false);
  });

  it('uses contribution-owned action capability alternatives', () => {
    expect(targetSurfaceDisabledReason(managedSurface,core({
      capabilities: ['product.managed-surface'],
    }))).toContain('surface.read or surface.manage');
    expect(targetSurfaceAvailable(managedSurface,core({
      capabilities: ['product.managed-surface','surface.read'],
    }))).toBe(true);
    expect(targetSurfaceAvailable(managedSurface,core({
      capabilities: ['product.managed-surface','surface.manage'],
    }))).toBe(true);
  });

  it('fails closed when a composition route has no policy', () => {
    expect(targetSurfaceAvailable(undefined,core({ capabilities: [] }))).toBe(false);
  });
});

function core(overrides: Partial<CoreNode>): CoreNode {
  return {
    id: 'remote-core',
    name: 'Remote Core',
    profile: 'vehicle',
    baseUrl: 'http://remote:8787',
    status: 'online',
    capabilities: [],
    registeredAt: '',
    lastSeenAt: '',
    updatedAt: '',
    ...overrides,
  };
}
