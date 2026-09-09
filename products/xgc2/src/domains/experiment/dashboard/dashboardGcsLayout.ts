import type { LayoutItem } from 'react-grid-layout';
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_MAX_ROWS,
  DASHBOARD_ROW_HEIGHT,
  dashboardPanelWidthPx,
  dashboardRowsExactForHeightPx,
} from '../../../shared/dashboardGeometry';

/**
 * Matches the shared `--size-header-page` contract so the pre-measurement JS
 * fallback stays aligned with the topbar.
 */
export const GCS_SHELL_CHROME_HEIGHT_PX = 36;

/**
 * What a plugin's `layout.sizePolicy` means to the GCS wall layout, flattened so
 * this module never has to know about plugin manifests or panel instances.
 */
export type GcsPanelSizePolicy = {
  verticalFixed: boolean;
  /** Rendered height in px the panel wants at a given rendered width in px. */
  preferredHeightPx?: (widthPx: number) => number;
};

export type GcsLayoutMetrics = {
  containerWidthPx: number;
  rowHeightPx: number;
  gapPx: number;
};

/**
 * Row height that fills `availableHeightPx` across `maxRow` rows.
 *
 * Uses real division (not floor) so the last row lands on the container edge
 * instead of leaving a `(height % maxRow)` strip at the bottom. react-grid-layout
 * accepts fractional row heights and rounds per-item edges consistently.
 */
export function gcsRowHeightPx(availableHeightPx: number, maxRow: number): number {
  const rows = Math.max(1, maxRow);
  if (!Number.isFinite(availableHeightPx) || availableHeightPx <= 0) {
    return DASHBOARD_ROW_HEIGHT;
  }
  return Math.max(24, availableHeightPx / rows);
}

/**
 * GCS wall height is the measured dashboard shell only.
 * Guessing `viewport - chrome` before mount is taller than the real workspace
 * (it skips the dashboard tab strip), so instruments first stretch then snap.
 */
export function gcsAvailableHeightPx(containerHeightPx: number, _viewportHeightPx?: number): number {
  if (Number.isFinite(containerHeightPx) && containerHeightPx > 0) return containerHeightPx;
  return 0;
}

/**
 * GCS mode pins the dashboard to the viewport, so a panel whose content has a
 * fixed aspect (a square button cluster) must be allowed to say how tall it is
 * and hand the rows it does not need to a neighbour that can use them.
 *
 * v1 boundary, on purpose: redistribution happens only inside a column band —
 * the panels that share one x/width span, stacked top to bottom. There is no
 * global solver, so a fixed panel with no expanding neighbour in its own band
 * simply leaves the tail of that band blank rather than pushing other columns
 * around.
 */
export function normalizeGcsLayout(
  layout: LayoutItem[],
  policyFor?: (panelId: string) => GcsPanelSizePolicy | undefined,
  metrics?: GcsLayoutMetrics,
): LayoutItem[] {
  if (layout.length === 0) return layout;
  const shifted = shiftToOrigin(layout);
  if (!policyFor || !metrics || metrics.containerWidthPx <= 0) return shifted;
  return applySizePolicies(shifted, policyFor, metrics);
}

function shiftToOrigin(layout: LayoutItem[]): LayoutItem[] {
  const minX = Math.min(...layout.map((item) => item.x));
  const minY = Math.min(...layout.map((item) => item.y));
  return layout.map((item) => ({
    ...item,
    x: clamp(item.x - minX, 0, DASHBOARD_COLUMNS - item.w),
    y: Math.max(0, item.y - minY),
  }));
}

function applySizePolicies(
  layout: LayoutItem[],
  policyFor: (panelId: string) => GcsPanelSizePolicy | undefined,
  metrics: GcsLayoutMetrics,
): LayoutItem[] {
  const bands = new Map<string,LayoutItem[]>();
  for (const item of layout) {
    const band = `${item.x}:${item.w}`;
    bands.set(band, [...(bands.get(band) ?? []),item]);
  }
  const reflowed = new Map<string,LayoutItem>();
  for (const items of bands.values()) {
    // Bands without a fixed panel keep the geometry the author saved.
    if (!items.some((item) => isPinned(policyFor(item.i)))) continue;
    for (const item of reflowBand(items, policyFor, metrics)) reflowed.set(item.i, item);
  }
  return reflowed.size === 0 ? layout : layout.map((item) => reflowed.get(item.i) ?? item);
}

function reflowBand(
  items: LayoutItem[],
  policyFor: (panelId: string) => GcsPanelSizePolicy | undefined,
  metrics: GcsLayoutMetrics,
): LayoutItem[] {
  const ordered = [...items].sort((left, right) => left.y - right.y || left.i.localeCompare(right.i));
  const heights = ordered.map((item) => {
    const policy = policyFor(item.i);
    if (!isPinned(policy)) return item.h;
    const widthPx = dashboardPanelWidthPx(item.w, metrics.containerWidthPx, metrics.gapPx);
    const preferredPx = policy.preferredHeightPx?.(widthPx) ?? 0;
    // Exact fractional rows: ceil left a dead strip under every control panel.
    return clamp(
      dashboardRowsExactForHeightPx(preferredPx, metrics.rowHeightPx, metrics.gapPx),
      minRows(item),
      maxRows(item),
    );
  });
  const expanding = ordered
    .map((item, index) => ({ item,index }))
    .filter(({ item }) => !isPinned(policyFor(item.i)));
  const surplus = total(ordered.map((item) => item.h)) - total(heights);
  if (surplus !== 0 && expanding.length > 0) {
    const share = Math.trunc(surplus / expanding.length);
    expanding.forEach(({ index },position) => {
      const extra = position === expanding.length - 1
        ? surplus - share * (expanding.length - 1)
        : share;
      heights[index] = clamp(heights[index]! + extra, minRows(ordered[index]!), maxRows(ordered[index]!));
    });
  }
  let y = ordered[0]!.y;
  return ordered.map((item, index) => {
    const next = { ...item,y,h: heights[index]! };
    y += heights[index]!;
    return next;
  });
}

function isPinned(policy: GcsPanelSizePolicy | undefined): policy is GcsPanelSizePolicy {
  return Boolean(policy?.verticalFixed && policy.preferredHeightPx);
}

function minRows(item: LayoutItem) {
  return Math.max(1, item.minH ?? 1);
}

function maxRows(item: LayoutItem) {
  return Math.max(minRows(item), item.maxH ?? DASHBOARD_MAX_ROWS);
}

function total(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
