import type { LayoutItem } from 'react-grid-layout';
import { describe,expect,it } from 'vitest';
import {
  GCS_SHELL_CHROME_HEIGHT_PX,
  gcsAvailableHeightPx,
  gcsRowHeightPx,
  normalizeGcsLayout,
  type GcsPanelSizePolicy,
} from './dashboardGcsLayout';

const metrics = { containerWidthPx: 1200,rowHeightPx: 100,gapPx: 0 };

function item(i: string, x: number, y: number, w: number, h: number, extra: Partial<LayoutItem> = {}): LayoutItem {
  return { i,x,y,w,h,minH: 1,maxH: 16,...extra };
}

/** Wants exactly three rows at this metric (300px / 100px rows, no gap). */
const threeRows: GcsPanelSizePolicy = { verticalFixed: true,preferredHeightPx: () => 300 };
const expanding: GcsPanelSizePolicy = { verticalFixed: false };

describe('normalizeGcsLayout', () => {
  it('pulls the saved layout back to the origin', () => {
    const layout = normalizeGcsLayout([item('a', 4, 6, 8, 5),item('b', 12, 6, 6, 5)]);
    expect(layout).toEqual([
      expect.objectContaining({ i: 'a',x: 0,y: 0 }),
      expect.objectContaining({ i: 'b',x: 8,y: 0 }),
    ]);
  });

  it('leaves the layout alone when no panel pins its height', () => {
    const base = [item('a', 0, 0, 8, 5),item('b', 0, 5, 8, 7)];
    expect(normalizeGcsLayout(base, () => expanding, metrics)).toEqual(base);
  });

  it('pins a fixed panel to the rows its content asks for at the rendered width', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 9)],
      () => threeRows,
      metrics,
    );
    expect(layout[0]).toMatchObject({ i: 'control',y: 0,h: 3 });
  });

  it('uses exact fractional rows so control panels do not pad with empty ceil space', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 9)],
      () => ({ verticalFixed: true,preferredHeightPx: () => 250 }),
      metrics,
    );
    // 250px / 100px row → 2.5, not ceil(2.5)=3 which left a blank band under tiles.
    expect(layout[0]?.h).toBeCloseTo(2.5, 5);
  });

  it('hands the rows a fixed panel gave up to an expanding neighbour in the same column band', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 9),item('instruments', 0, 9, 8, 6)],
      (id) => id === 'control' ? threeRows : expanding,
      metrics,
    );
    const control = layout.find((entry) => entry.i === 'control')!;
    const instruments = layout.find((entry) => entry.i === 'instruments')!;
    expect(control).toMatchObject({ y: 0,h: 3 });
    // The band still ends where it did: 9 + 6 rows in, 3 + 12 rows out.
    expect(instruments).toMatchObject({ y: 3,h: 12 });
    expect(instruments.y + instruments.h).toBe(15);
  });

  it('takes rows back from the expanding neighbour when the fixed panel needs more', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 2),item('instruments', 0, 2, 8, 10)],
      (id) => id === 'control' ? threeRows : expanding,
      metrics,
    );
    expect(layout.find((entry) => entry.i === 'control')).toMatchObject({ y: 0,h: 3 });
    expect(layout.find((entry) => entry.i === 'instruments')).toMatchObject({ y: 3,h: 9 });
  });

  it('splits the surplus across several expanding neighbours', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 9),item('one', 0, 9, 8, 2),item('two', 0, 11, 8, 2)],
      (id) => id === 'control' ? threeRows : expanding,
      metrics,
    );
    expect(layout.find((entry) => entry.i === 'one')).toMatchObject({ h: 5 });
    expect(layout.find((entry) => entry.i === 'two')).toMatchObject({ h: 5 });
  });

  it('leaves the tail of the band blank when no expanding neighbour can use the rows', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 9),item('other-column', 8, 0, 8, 9)],
      (id) => id === 'control' ? threeRows : expanding,
      metrics,
    );
    expect(layout.find((entry) => entry.i === 'control')).toMatchObject({ h: 3 });
    // v1 boundary: the neighbouring column band is not re-solved.
    expect(layout.find((entry) => entry.i === 'other-column')).toMatchObject({ y: 0,h: 9 });
  });

  it('never drives a neighbour below the minimum its plugin declared', () => {
    const layout = normalizeGcsLayout(
      [item('control', 0, 0, 8, 2),item('instruments', 0, 2, 8, 5, { minH: 4 })],
      (id) => id === 'control' ? { verticalFixed: true,preferredHeightPx: () => 900 } : expanding,
      metrics,
    );
    expect(layout.find((entry) => entry.i === 'control')).toMatchObject({ h: 9 });
    expect(layout.find((entry) => entry.i === 'instruments')).toMatchObject({ h: 4 });
  });

  it('skips the size policies before the container has been measured', () => {
    const base = [item('control', 0, 0, 8, 9)];
    expect(normalizeGcsLayout(base, () => threeRows, { ...metrics,containerWidthPx: 0 })).toEqual(base);
    expect(normalizeGcsLayout([])).toEqual([]);
  });
});

describe('gcsRowHeightPx', () => {
  it('divides the available height evenly so maxRow rows fill the container', () => {
    expect(gcsRowHeightPx(1000, 15) * 15).toBeCloseTo(1000, 10);
    expect(gcsRowHeightPx(732, 12)).toBe(61);
  });

  it('does not leave a floor remainder strip the way Math.floor did', () => {
    const height = 1000;
    const rows = 15;
    const floored = Math.floor(height / rows) * rows;
    const filled = gcsRowHeightPx(height, rows) * rows;
    expect(floored).toBeLessThan(height);
    expect(filled).toBeCloseTo(height, 10);
  });

  it('uses only the measured shell height so the first GCS paint cannot oversize instruments', () => {
    expect(gcsAvailableHeightPx(640, 800)).toBe(640);
    expect(gcsAvailableHeightPx(0, 800)).toBe(0);
    expect(GCS_SHELL_CHROME_HEIGHT_PX).toBe(36);
  });
});
