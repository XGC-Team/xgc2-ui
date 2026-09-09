import { describe,expect,it } from 'vitest';
import { visibleParkedRouteKey } from './routeSurfaceModel';

describe('visibleParkedRouteKey', () => {
  it('reveals the current slot once it is ready', () => {
    expect(visibleParkedRouteKey('experiment', new Set(['home','experiment']))).toBe('experiment');
  });

  it('does not keep a previous slot while the current slot is still loading', () => {
    expect(visibleParkedRouteKey('experiment', new Set(['home']))).toBeNull();
  });

  it('does not paint the current slot before it is ready', () => {
    expect(visibleParkedRouteKey('experiment', new Set())).toBeNull();
  });
});
