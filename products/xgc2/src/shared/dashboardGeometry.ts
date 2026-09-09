import { WORKSPACE_PANEL_HEADER_HEIGHT_PX } from '@xgc2/ui-react';

/**
 * Single owner of the dashboard grid geometry.
 *
 * The layout engine (domains/experiment/dashboard) and the panel manifests both
 * size themselves against these numbers. They used to live in two modules — one
 * per layer — and the panel copy carried a comment asking whoever edited it to
 * keep the numbers aligned by hand. Keeping them here means there is nothing
 * left to align: shared/ is importable from both sides without either layer
 * reaching into the other.
 */
export const DASHBOARD_COLUMNS = 30;
export const DASHBOARD_ROW_HEIGHT = 39;
export const DASHBOARD_GAP = 8;
export const DASHBOARD_MARGIN: [number, number] = [DASHBOARD_GAP, DASHBOARD_GAP];
export const DASHBOARD_ROW_PITCH = DASHBOARD_ROW_HEIGHT + DASHBOARD_GAP;
/**
 * GCS wall keeps zero RGL gutters. Seams are drawn as trailing-edge borders on
 * every PanelFrame (see PanelFrame.css) so full-bleed panels like Lichtblick
 * cannot erase the line when sub-pixel gaps collapse.
 */
export const GCS_DASHBOARD_SEAM_PX = 0;
export const GCS_DASHBOARD_MARGIN: [number, number] = [GCS_DASHBOARD_SEAM_PX, GCS_DASHBOARD_SEAM_PX];

/** Rows a panel may never exceed, so one panel cannot bury the whole dashboard. */
export const DASHBOARD_MAX_ROWS = 16;

/** Centre-to-centre distance between two grid columns at this container width. */
export function dashboardColumnPitch(containerWidth: number, gapPx: number = DASHBOARD_GAP) {
  return (containerWidth + gapPx) / DASHBOARD_COLUMNS;
}

/** Rendered width of a panel spanning `columns` grid columns. */
export function dashboardPanelWidthPx(
  columns: number,
  containerWidth: number,
  gapPx: number = DASHBOARD_GAP,
) {
  return Math.max(0, columns * dashboardColumnPitch(containerWidth, gapPx) - gapPx);
}

/** Grid rows that cover `contentPx` of rendered content at this row height. */
export function dashboardRowsForHeightPx(
  contentPx: number,
  rowHeightPx: number = DASHBOARD_ROW_HEIGHT,
  gapPx: number = DASHBOARD_GAP,
) {
  const pitch = rowHeightPx + gapPx;
  if (!Number.isFinite(contentPx) || pitch <= 0) return 1;
  return Math.max(1, Math.ceil((contentPx + gapPx) / pitch));
}

/**
 * Exact (non-ceiled) row span for a preferred content height.
 *
 * GCS uses fractional row heights; ceil-ing a control panel from 2.1 rows to 3
 * left a blank band under every fixed control tile. Default gridPos.h still uses
 * the ceiled helper so edit-mode integers stay whole.
 */
export function dashboardRowsExactForHeightPx(
  contentPx: number,
  rowHeightPx: number = DASHBOARD_ROW_HEIGHT,
  gapPx: number = DASHBOARD_GAP,
) {
  const pitch = rowHeightPx + gapPx;
  if (!Number.isFinite(contentPx) || pitch <= 0) return 1;
  return Math.max(1, (contentPx + gapPx) / pitch);
}

/** Width:height of a camera stream tile. Grid rows follow this, not a spare band. */
export const CAMERA_STREAM_ASPECT_RATIO = 16 / 9;

/**
 * Rendered height of a stream camera panel: header chrome plus a 16:9 stage.
 * Overlay record/viewer controls sit on the frame and do not add rows.
 */
export function cameraStreamPanelHeightPx(
  panelWidthPx: number,
  headerPx: number = WORKSPACE_PANEL_HEADER_HEIGHT_PX,
) {
  return headerPx + Math.max(0, panelWidthPx) / CAMERA_STREAM_ASPECT_RATIO;
}

/**
 * Default gridPos.h for a stream camera so new / library / fixture layouts
 * match the 16:9 stage instead of reserving empty rows under it.
 */
export function cameraStreamPanelDefaultRows({
  panelWidthCols,
  assumedDashboardWidthPx = 1440,
}: {
  panelWidthCols: number;
  assumedDashboardWidthPx?: number;
}) {
  return Math.max(2, dashboardRowsForHeightPx(cameraStreamPanelHeightPx(
    dashboardPanelWidthPx(panelWidthCols, assumedDashboardWidthPx),
  )));
}

/**
 * Single owner of the wrap arithmetic so the runtime CSS grid and the default
 * gridPos.h below cannot disagree about how many rows an authored buttons-per-row
 * actually produces. Never asks for more columns than there are tiles, so a
 * 4-up authoring of 2 services stays one row instead of reserving dead columns.
 */
export function squareControlGridRows(itemCount: number, columns: number): number {
  const items = Math.max(1, Math.trunc(itemCount));
  return Math.ceil(items / squareControlGridColumns(items, columns));
}

export function squareControlGridColumns(itemCount: number, columns: number): number {
  const items = Math.max(1, Math.trunc(itemCount));
  return Math.max(1, Math.min(Math.trunc(columns) || 1, items));
}

/**
 * Default column density for control-action tiles (ROS / PX4 / Formation).
 * Tile edge is derived from this density and panel width — not from how many
 * actions happen to be visible — so same-width panels on one dashboard share
 * one button size even when one panel only has a single action.
 */
export const CONTROL_ACTION_GRID_DENSITY_COLUMNS = 4;

/**
 * Rendered height of a square control-tile grid at a given panel width.
 *
 * This is the px-in/px-out core that a manifest can hand to
 * `layout.preferredHeightForWidth`: the panel is as tall as its button cluster
 * needs, whatever the dashboard decides the panel's width is.
 *
 * Tile edge is **width-driven only** (density columns), never
 * `min(width/cols, height/rows)`. That fill-parent min() is what made three
 * same-duty panels disagree on button size when their frames differed in height.
 */
export function squareControlGridHeightPx({
  panelWidthPx,
  itemCount,
  maxColumns = CONTROL_ACTION_GRID_DENSITY_COLUMNS,
  headerPx = WORKSPACE_PANEL_HEADER_HEIGHT_PX,
  paddingPx = 6,
  gapPx = 6,
}: {
  panelWidthPx: number;
  itemCount: number;
  maxColumns?: number;
  headerPx?: number;
  paddingPx?: number;
  gapPx?: number;
}): number {
  const densityCols = Math.max(1, Math.trunc(maxColumns) || 1);
  const rows = squareControlGridRows(itemCount, densityCols);
  const tile = Math.max(
    40,
    (panelWidthPx - 2 * paddingPx - (densityCols - 1) * gapPx) / densityCols,
  );
  return headerPx + 2 * paddingPx + rows * tile + (rows - 1) * gapPx;
}

/**
 * Dashboard row count that fits a fixed square control-tile grid.
 *
 * Used for default gridPos.h so new PX4/ROS control panels open near the
 * button-cluster footprint (4-up squares) without manual height tuning.
 * `maxColumns` is the authored buttons-per-row for panels that expose it.
 * Runtime CSS still caps tiles with min(width/cols, height/rows) when the
 * saved frame differs from this estimate.
 */
export function dashboardRowsForSquareControlGrid({
  panelWidthCols,
  itemCount,
  maxColumns = 4,
  assumedDashboardWidthPx = 1440,
  headerPx = WORKSPACE_PANEL_HEADER_HEIGHT_PX,
  paddingPx = 6,
  gapPx = 6,
}: {
  panelWidthCols: number;
  itemCount: number;
  maxColumns?: number;
  assumedDashboardWidthPx?: number;
  headerPx?: number;
  paddingPx?: number;
  gapPx?: number;
}): number {
  const contentPx = squareControlGridHeightPx({
    panelWidthPx: dashboardPanelWidthPx(panelWidthCols, assumedDashboardWidthPx),
    itemCount,
    maxColumns,
    headerPx,
    paddingPx,
    gapPx,
  });
  return Math.max(2, dashboardRowsForHeightPx(contentPx));
}
