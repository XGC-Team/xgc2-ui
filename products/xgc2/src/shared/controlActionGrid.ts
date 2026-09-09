import type { CSSProperties } from 'react';
import {
  CONTROL_ACTION_GRID_DENSITY_COLUMNS,
  squareControlGridColumns,
  squareControlGridRows,
} from './dashboardGeometry';

type ControlActionGridStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Inline CSS variables for `.xgc-control-action-grid`.
 *
 * Density columns fix tile size for a given panel width; place columns/rows
 * only decide how many cells the current item set occupies.
 */
export function controlActionGridStyle({
  itemCount,
  maxColumns = CONTROL_ACTION_GRID_DENSITY_COLUMNS,
}: {
  itemCount: number;
  maxColumns?: number;
}): ControlActionGridStyle {
  const count = Math.max(1, Math.trunc(itemCount) || 1);
  const density = Math.max(1, Math.trunc(maxColumns) || 1);
  const columns = squareControlGridColumns(count, density);
  const narrowColumns = Math.min(columns, 2);
  return {
    '--control-density-cols': density,
    '--control-cols': columns,
    '--control-rows': squareControlGridRows(count, density),
    // Narrow breakpoints: hosts that previously shipped per-panel vars keep working.
    '--control-narrow-cols': narrowColumns,
    '--control-narrow-rows': squareControlGridRows(count, narrowColumns),
    '--control-stacked-rows': count,
  };
}
