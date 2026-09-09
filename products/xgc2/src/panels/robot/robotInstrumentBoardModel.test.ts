import { describe,expect,it } from 'vitest';
import {
  robotInstrumentBoardLayout,
  robotInstrumentSelectionContainsCenter,
  robotInstrumentSelectionRectangle,
  robotInstrumentToggleAllSelection,
  robotInstrumentScrollTarget,
  robotInstrumentWheelDelta,
  robotInstrumentWheelRows,
} from './robotInstrumentBoardModel';

describe('robotInstrumentBoardLayout', () => {
  it('fills the viewport with whole rows near the preferred instrument height', () => {
    const layout = robotInstrumentBoardLayout(698, 8);
    expect(layout.visibleRows).toBe(3);
    expect(layout.rowHeight).toBeCloseTo(227.333, 2);
    expect(layout.rowHeight * layout.visibleRows + 8 * (layout.visibleRows - 1)).toBeCloseTo(698, 5);
  });

  it('reserves selection halo padding without shrinking or partially clipping rows', () => {
    const layout = robotInstrumentBoardLayout(718, 8, 20);
    expect(layout.visibleRows).toBe(3);
    expect(layout.rowHeight).toBeCloseTo(227.333, 2);
    expect(layout.rowHeight * layout.visibleRows + 8 * (layout.visibleRows - 1) + 20).toBeCloseTo(718, 5);
  });

  it('keeps a short viewport as one usable row instead of crushing two instruments', () => {
    expect(robotInstrumentBoardLayout(300, 8)).toMatchObject({ visibleRows: 1,rowHeight: 300,scrollStep: 308 });
  });

  it('switches directly by a wheel-strength row count and clamps to complete pages', () => {
    expect(robotInstrumentScrollTarget(0, 1_240, 408, 208, 1)).toBe(208);
    expect(robotInstrumentScrollTarget(208, 1_240, 408, 208, 3)).toBe(832);
    expect(robotInstrumentScrollTarget(624, 1_240, 408, 208, -2)).toBe(208);
    expect(robotInstrumentScrollTarget(832, 1_240, 408, 208, 4)).toBe(832);
    expect(robotInstrumentWheelDelta(3, 1, 408)).toBe(120);
    expect(robotInstrumentWheelDelta(1, 2, 408)).toBe(408);
    expect(robotInstrumentWheelRows(0, 100)).toEqual({ rowDelta: 1,remainder: 0 });
    expect(robotInstrumentWheelRows(0, 310)).toEqual({ rowDelta: 3,remainder: 0 });
    expect(robotInstrumentWheelRows(18, 25)).toEqual({ rowDelta: 1,remainder: 3 });
  });

  it('clamps a marquee to the viewport and selects cards by their center', () => {
    const selection = robotInstrumentSelectionRectangle(
      { x: 280,y: 190 },{ x: 20,y: -10 },
      { left: 10,top: 10,right: 300,bottom: 200 },
    );
    expect(selection).toEqual({ left: 20,top: 10,right: 280,bottom: 190,width: 260,height: 180 });
    expect(robotInstrumentSelectionContainsCenter(selection, { left: 40,top: 40,right: 140,bottom: 140 })).toBe(true);
    expect(robotInstrumentSelectionContainsCenter(selection, { left: 280,top: 190,right: 300,bottom: 200 })).toBe(false);
  });

  it('middle-click selection toggles all visible robots without discarding hidden selections', () => {
    expect(robotInstrumentToggleAllSelection(['hidden','uav1'], ['uav1','uav2'])).toEqual(['hidden','uav1','uav2']);
    expect(robotInstrumentToggleAllSelection(['hidden','uav1','uav2'], ['uav1','uav2'])).toEqual(['hidden']);
    expect(robotInstrumentToggleAllSelection(['hidden'], [])).toEqual(['hidden']);
  });
});
