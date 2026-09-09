import { describe,expect,it } from 'vitest';
import { DEFAULT_DASHBOARD_ID,panelDashboardId } from './panelDashboard';

describe('panelDashboardId', () => {
  it('reads the authored dashboard', () => {
    expect(panelDashboardId({ options: { dashboard: 'operations' } })).toBe('operations');
  });

  // The rendering filter and the panel-state keys used to derive this
  // separately and disagree, so a panel could render on one dashboard while
  // remembering its state under another.
  it('resolves every non-value to the default instead of a second dashboard', () => {
    expect(panelDashboardId({ options: { dashboard: '  gcs  ' } })).toBe(DEFAULT_DASHBOARD_ID);
    expect(panelDashboardId({ options: { dashboard: '  operations  ' } })).toBe('operations');
    expect(panelDashboardId({ options: { dashboard: '' } })).toBe(DEFAULT_DASHBOARD_ID);
    expect(panelDashboardId({ options: { dashboard: '   ' } })).toBe(DEFAULT_DASHBOARD_ID);
    expect(panelDashboardId({ options: { dashboard: 7 } })).toBe(DEFAULT_DASHBOARD_ID);
    expect(panelDashboardId({ options: {} })).toBe(DEFAULT_DASHBOARD_ID);
    expect(panelDashboardId({})).toBe(DEFAULT_DASHBOARD_ID);
  });
});
