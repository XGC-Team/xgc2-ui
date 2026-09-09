import { describe,expect,it } from 'vitest';
import { dashboardFluidPositionStrategy } from './dashboardGridPosition';

describe('dashboardFluidPositionStrategy', () => {
  it('keeps the same left/width fraction when the measured container width changes', () => {
    const wide = dashboardFluidPositionStrategy(1000).calcStyle({
      left: 200, top: 12, width: 400, height: 80,
    });
    const narrow = dashboardFluidPositionStrategy(800).calcStyle({
      left: 160, top: 12, width: 320, height: 80,
    });
    expect(wide.left).toBe('20%');
    expect(wide.width).toBe('40%');
    expect(narrow.left).toBe(wide.left);
    expect(narrow.width).toBe(wide.width);
    expect(wide.top).toBe('12px');
    expect(wide.height).toBe('80px');
    expect(wide.position).toBe('absolute');
  });

  it('still yields the live-container fraction when JS width is stale', () => {
    const stale = dashboardFluidPositionStrategy(1000).calcStyle({
      left: 200, top: 0, width: 400, height: 50,
    });
    expect(stale.left).toBe('20%');
    expect(stale.width).toBe('40%');
  });
});
