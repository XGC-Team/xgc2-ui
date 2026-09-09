import { describe,expect,it } from 'vitest';
import { WORKSPACE_PANEL_HEADER_HEIGHT_PX } from '@xgc2/ui-react';
import {
  CAMERA_STREAM_ASPECT_RATIO,
  cameraStreamPanelDefaultRows,
  cameraStreamPanelHeightPx,
  DASHBOARD_COLUMNS,
  DASHBOARD_GAP,
  DASHBOARD_ROW_HEIGHT,
  dashboardPanelWidthPx,
  dashboardRowsForHeightPx,
  dashboardRowsForSquareControlGrid,
  squareControlGridHeightPx,
} from './dashboardGeometry';

describe('dashboardRowsForSquareControlGrid', () => {
  it('sizes PX4 6-action 4-up defaults near two square rows', () => {
    const h = dashboardRowsForSquareControlGrid({ panelWidthCols: 8,itemCount: 6 });
    expect(h).toBeGreaterThanOrEqual(4);
    expect(h).toBeLessThanOrEqual(7);
  });

  it('sizes ROS 5-service 4-up defaults near two square rows', () => {
    const h = dashboardRowsForSquareControlGrid({ panelWidthCols: 10,itemCount: 5 });
    expect(h).toBeGreaterThanOrEqual(5);
    expect(h).toBeLessThanOrEqual(7);
  });

  it('grows with wider panels because square tiles grow with column width', () => {
    const narrow = dashboardRowsForSquareControlGrid({ panelWidthCols: 6,itemCount: 4 });
    const wide = dashboardRowsForSquareControlGrid({ panelWidthCols: 16,itemCount: 4 });
    expect(wide).toBeGreaterThanOrEqual(narrow);
  });
});

describe('dashboard geometry conversions', () => {
  it('spans the container exactly when a panel takes every column', () => {
    expect(dashboardPanelWidthPx(DASHBOARD_COLUMNS, 1440)).toBeCloseTo(1440, 6);
    // One column loses the gap that separates it from the next one.
    expect(dashboardPanelWidthPx(1, 1440)).toBeCloseTo((1440 + DASHBOARD_GAP) / DASHBOARD_COLUMNS - DASHBOARD_GAP, 6);
    expect(dashboardPanelWidthPx(4, 1440, 0)).toBeCloseTo(4 * 1440 / DASHBOARD_COLUMNS, 6);
  });

  it('converts rendered height back into whole grid rows', () => {
    const pitch = DASHBOARD_ROW_HEIGHT + DASHBOARD_GAP;
    expect(dashboardRowsForHeightPx(DASHBOARD_ROW_HEIGHT)).toBe(1);
    expect(dashboardRowsForHeightPx(pitch * 3 - DASHBOARD_GAP)).toBe(3);
    expect(dashboardRowsForHeightPx(pitch * 3 - DASHBOARD_GAP + 1)).toBe(4);
    expect(dashboardRowsForHeightPx(0)).toBe(1);
    expect(dashboardRowsForHeightPx(Number.NaN)).toBe(1);
    // GCS mode measures against its own stretched row height and zero gap.
    expect(dashboardRowsForHeightPx(300, 100, 0)).toBe(3);
  });

  it('keeps the row estimate and the px estimate telling the same story', () => {
    const panelWidthPx = dashboardPanelWidthPx(8, 1440);
    expect(dashboardRowsForHeightPx(squareControlGridHeightPx({ panelWidthPx,itemCount: 6 })))
      .toBe(dashboardRowsForSquareControlGrid({ panelWidthCols: 8,itemCount: 6 }));
  });

  it('never squeezes tiles below the readable floor on a narrow panel', () => {
    const cramped = squareControlGridHeightPx({ panelWidthPx: 10,itemCount: 6 });
    const roomy = squareControlGridHeightPx({ panelWidthPx: 600,itemCount: 6 });
    expect(cramped).toBeGreaterThan(0);
    expect(roomy).toBeGreaterThan(cramped);
  });

  it('sizes tiles by density so one Formation action matches ROS/PX4 tile edge at same width', () => {
    // Height scales with rows, but the per-tile contribution is the same density.
    const one = squareControlGridHeightPx({ panelWidthPx: 400,itemCount: 1,maxColumns: 4,headerPx: 0,paddingPx: 6,gapPx: 6 });
    const six = squareControlGridHeightPx({ panelWidthPx: 400,itemCount: 6,maxColumns: 4,headerPx: 0,paddingPx: 6,gapPx: 6 });
    // 1 row vs 2 rows of equal tiles: six ≈ 2 * one - gap - pad (same pad both sides).
    const tile = (400 - 12 - 3 * 6) / 4;
    expect(one).toBeCloseTo(12 + tile, 5);
    expect(six).toBeCloseTo(12 + 2 * tile + 6, 5);
  });
});

describe('cameraStreamPanelDefaultRows', () => {
  it('sizes a stream camera to header plus 16:9, not a spare empty band', () => {
    const widthPx = dashboardPanelWidthPx(7, 1440);
    expect(cameraStreamPanelHeightPx(widthPx)).toBeCloseTo(
      WORKSPACE_PANEL_HEADER_HEIGHT_PX + widthPx / CAMERA_STREAM_ASPECT_RATIO, 6,
    );
    const rows = cameraStreamPanelDefaultRows({ panelWidthCols: 7 });
    expect(rows).toBe(dashboardRowsForHeightPx(cameraStreamPanelHeightPx(widthPx)));
    expect(rows).toBeLessThan(7);
    expect(rows).toBeGreaterThanOrEqual(2);
  });
});
