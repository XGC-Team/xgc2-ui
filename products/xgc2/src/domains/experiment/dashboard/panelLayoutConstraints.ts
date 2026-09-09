import type { PanelLayoutPolicy } from '../../../panels/types';
import { DASHBOARD_COLUMNS,DASHBOARD_MAX_ROWS } from '../../../shared/dashboardGeometry';
import type { GridPos } from '../../../types/common';

/**
 * Size bounds a panel is held to, resolved once from the plugin manifest.
 *
 * The grid, the create/snap path, and pre-commit validation all read the same
 * resolved bounds. They used to hard-code their own: react-grid-layout refused
 * to drag a panel below 3 columns while snapGridPos happily created it at 2, so
 * a freshly added panel could not be resized back to the width it opened with.
 */
export const DEFAULT_PANEL_MIN_W = 3;
export const DEFAULT_PANEL_MIN_H = 2;

/**
 * maxW/maxH are absent unless the plugin declared them.
 *
 * They used to default to the whole grid (30x16), which reads as harmless but
 * is not: those defaults were enforced in four places — the render clamp, the
 * react-grid-layout item, the commit clamp, and pre-commit validation — so a
 * saved experiment whose panel was taller than sixteen rows was silently
 * rewritten the first time it was opened. A bound nobody declared must not
 * rewrite a layout somebody did.
 */
export type PanelSizeConstraints = {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
  aspectRatio?: number;
};

export function panelSizeConstraints(layout?: PanelLayoutPolicy): PanelSizeConstraints {
  const minW = bound(layout?.minSize?.w, DEFAULT_PANEL_MIN_W, 1, DASHBOARD_COLUMNS);
  const minH = bound(layout?.minSize?.h, DEFAULT_PANEL_MIN_H, 1, DASHBOARD_MAX_ROWS);
  return {
    minW,
    minH,
    ...(declaredBound(layout?.maxSize?.w, minW, DASHBOARD_COLUMNS, 'maxW')),
    ...(declaredBound(layout?.maxSize?.h, minH, DASHBOARD_MAX_ROWS, 'maxH')),
    aspectRatio: layout?.aspectRatio && layout.aspectRatio > 0 ? layout.aspectRatio : undefined,
  };
}

/**
 * Width wins for aspect-locked panels: a drag on the corner handle moves both
 * edges, and deriving height from width is the only rule that gives the same
 * answer whichever edge the pointer actually moved.
 */
export function clampPanelSize(gridPos: GridPos, constraints: PanelSizeConstraints): GridPos {
  const w = clampGridValue(gridPos.w, constraints.minW, constraints.maxW);
  const h = constraints.aspectRatio
    ? clampGridValue(w / constraints.aspectRatio, constraints.minH, constraints.maxH)
    : clampGridValue(gridPos.h, constraints.minH, constraints.maxH);
  return {
    x: clampGridValue(gridPos.x, 0, Math.max(0, DASHBOARD_COLUMNS - w)),
    y: Number.isFinite(gridPos.y) ? Math.max(0, Math.round(gridPos.y)) : 0,
    w,
    h,
  };
}

/** Height the aspect ratio asks for at this width, already inside the bounds. */
export function aspectRatioRows(w: number, constraints: PanelSizeConstraints) {
  if (!constraints.aspectRatio) return undefined;
  return clampGridValue(w / constraints.aspectRatio, constraints.minH, constraints.maxH);
}

/** An undefined max is no ceiling at all, not a ceiling of Infinity rounded. */
export function clampGridValue(value: number, min: number, max?: number) {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.max(min, Math.round(value));
  return max === undefined ? rounded : Math.min(max, rounded);
}

function bound(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return Math.min(max, Math.max(min, fallback));
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * A declared max, or nothing. The key is omitted rather than set to undefined
 * so a spread of the result cannot reintroduce the key on an object that
 * already carries one.
 */
function declaredBound(value: number | undefined, min: number, max: number, key: 'maxW' | 'maxH') {
  if (value === undefined || !Number.isFinite(value)) return {};
  return { [key]: Math.min(max, Math.max(min, Math.round(value))) };
}
