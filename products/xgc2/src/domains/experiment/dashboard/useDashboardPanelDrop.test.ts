/**
 * @vitest-environment jsdom
 */
import type { DragEvent } from 'react';
import { describe,expect,it } from 'vitest';
import {
  dashboardPanelDropEffect,
  gridPosFromDashboardDrop,
  readDashboardPanelDropIntent,
} from './useDashboardPanelDrop';

describe('dashboard panel drop parsing', () => {
  it('distinguishes move and plugin payloads without accepting unknown data', () => {
    expect(dashboardPanelDropEffect(['application/x-xgc-panel-id'])).toBe('move');
    expect(dashboardPanelDropEffect(['application/x-xgc-panel-plugin'])).toBe('copy');
    expect(dashboardPanelDropEffect(['text/plain'])).toBeNull();
    expect(readDashboardPanelDropIntent(dataTransfer({ 'application/x-xgc-panel-id': 'panel-a' })))
      .toEqual({ kind: 'move-panel',panelId: 'panel-a' });
    expect(readDashboardPanelDropIntent(dataTransfer({ 'application/x-xgc-panel-plugin': 'robot-instruments-grid' })))
      .toMatchObject({ kind: 'add-plugin',plugin: { id: 'robot-instruments-grid' } });
    expect(readDashboardPanelDropIntent(dataTransfer({ 'application/x-xgc-panel-plugin': 'missing-plugin' })))
      .toBeNull();
  });

  it('uses dashboard grid pitches and scroll position for placement', () => {
    expect(gridPosFromDashboardDrop(dropEvent({ x: 45.9,y: 46.9 }))).toEqual({ x: 0,y: 0,w: 6,h: 4 });
    expect(gridPosFromDashboardDrop(dropEvent({ x: 46,y: 47 }))).toEqual({ x: 1,y: 1,w: 6,h: 4 });
    expect(gridPosFromDashboardDrop(dropEvent({ x: 0,y: 10,scrollTop: 37 })).y).toBe(1);
  });
});

function dataTransfer(values: Record<string,string>) {
  return { getData: (type: string) => values[type] ?? '' };
}

function dropEvent({ x,y,scrollTop = 0 }: { x: number; y: number; scrollTop?: number }) {
  const target = document.createElement('div');
  Object.defineProperty(target, 'scrollTop', { value: scrollTop,configurable: true });
  target.getBoundingClientRect = () => ({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 1472,
    bottom: 750,
    width: 1372,
    height: 700,
    toJSON: () => ({}),
  });
  return {
    clientX: 100 + x,
    clientY: 50 + y,
    currentTarget: target,
  } as unknown as DragEvent<HTMLDivElement>;
}
