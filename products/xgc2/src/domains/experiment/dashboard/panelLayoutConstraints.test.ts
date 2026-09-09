import { describe,expect,it } from 'vitest';
import { DASHBOARD_COLUMNS,DASHBOARD_MAX_ROWS } from '../../../shared/dashboardGeometry';
import {
  DEFAULT_PANEL_MIN_H,
  DEFAULT_PANEL_MIN_W,
  aspectRatioRows,
  clampPanelSize,
  panelSizeConstraints,
} from './panelLayoutConstraints';

describe('panelSizeConstraints', () => {
  // A minimum protects the plugin from being rendered into a frame it cannot
  // use; a maximum only exists because a plugin said so. Inventing one would
  // rewrite footprints an operator already saved.
  it('supplies the grid floor but no ceiling for a manifest that declares no layout', () => {
    expect(panelSizeConstraints()).toEqual({
      minW: DEFAULT_PANEL_MIN_W,
      minH: DEFAULT_PANEL_MIN_H,
      aspectRatio: undefined,
    });
  });

  it('reads declared bounds and never lets a maximum fall below its minimum', () => {
    expect(panelSizeConstraints({ minSize: { w: 6,h: 4 },maxSize: { w: 12,h: 9 } }))
      .toMatchObject({ minW: 6,minH: 4,maxW: 12,maxH: 9 });
    expect(panelSizeConstraints({ minSize: { w: 10,h: 6 },maxSize: { w: 4,h: 2 } }))
      .toMatchObject({ minW: 10,minH: 6,maxW: 10,maxH: 6 });
    expect(panelSizeConstraints({ minSize: { w: 99,h: 99 } }))
      .toMatchObject({ minW: DASHBOARD_COLUMNS,minH: DASHBOARD_MAX_ROWS });
    expect(panelSizeConstraints({ aspectRatio: 0 }).aspectRatio).toBeUndefined();
    expect(panelSizeConstraints({ aspectRatio: 2 }).aspectRatio).toBe(2);
  });
});

describe('clampPanelSize', () => {
  it('leaves an oversized panel alone when its plugin declared no maximum', () => {
    const constraints = panelSizeConstraints({ minSize: { w: 6,h: 4 } });
    expect(clampPanelSize({ x: 0,y: 0,w: 40,h: 40 }, constraints)).toMatchObject({ w: 40,h: 40 });
  });

  it('pulls a size back inside the declared bounds', () => {
    const constraints = panelSizeConstraints({ minSize: { w: 6,h: 4 },maxSize: { w: 12,h: 9 } });
    expect(clampPanelSize({ x: 0,y: 0,w: 2,h: 1 }, constraints)).toEqual({ x: 0,y: 0,w: 6,h: 4 });
    expect(clampPanelSize({ x: 0,y: 0,w: 20,h: 14 }, constraints)).toEqual({ x: 0,y: 0,w: 12,h: 9 });
  });

  it('keeps the panel on the grid after the width was clamped', () => {
    const constraints = panelSizeConstraints({ minSize: { w: 8,h: 2 } });
    expect(clampPanelSize({ x: 29,y: 3,w: 2,h: 4 }, constraints))
      .toEqual({ x: DASHBOARD_COLUMNS - 8,y: 3,w: 8,h: 4 });
  });

  it('derives height from width for aspect-locked panels whichever edge moved', () => {
    const constraints = panelSizeConstraints({ minSize: { w: 4,h: 2 },aspectRatio: 2 });
    expect(clampPanelSize({ x: 0,y: 0,w: 10,h: 2 }, constraints)).toMatchObject({ w: 10,h: 5 });
    expect(clampPanelSize({ x: 0,y: 0,w: 10,h: 15 }, constraints)).toMatchObject({ w: 10,h: 5 });
    // The ratio never wins against the bounds.
    expect(clampPanelSize({ x: 0,y: 0,w: 4,h: 9 }, constraints)).toMatchObject({ w: 4,h: 2 });
    expect(aspectRatioRows(10, constraints)).toBe(5);
    expect(aspectRatioRows(10, panelSizeConstraints())).toBeUndefined();
  });

  it('treats non-finite coordinates as the smallest legal panel', () => {
    const constraints = panelSizeConstraints();
    expect(clampPanelSize({ x: Number.NaN,y: Number.NaN,w: Number.NaN,h: Number.NaN }, constraints))
      .toEqual({ x: 0,y: 0,w: DEFAULT_PANEL_MIN_W,h: DEFAULT_PANEL_MIN_H });
  });
});
