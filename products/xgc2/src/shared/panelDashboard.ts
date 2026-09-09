/**
 * Single owner of the dashboard a panel belongs to.
 *
 * The same authored `options.dashboard` keys three unrelated things: which
 * dashboard renders the panel, the panel-state publication reference, and the
 * browser-local per-instance state. Each used to derive it for itself, and the
 * derivations disagreed — one trimmed the authored value, the others took it
 * verbatim — so a panel authored with a stray space rendered on one dashboard
 * while remembering its state under another, and a panel authored with an empty
 * string vanished from every dashboard instead of landing on the default.
 */
export const DEFAULT_DASHBOARD_ID = 'gcs';

/** Trims, and treats a blank or missing value as the default dashboard. */
export function panelDashboardId(panel: { options?: Record<string,unknown> }) {
  const value = panel.options?.dashboard;
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_DASHBOARD_ID;
}
