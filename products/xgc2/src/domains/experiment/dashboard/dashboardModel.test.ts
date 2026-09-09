// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';

import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { PanelInstance } from '../experimentModel';
import {
  createPanelInstance,
  layoutPanelsWithInsertedPanel,
  snapGridPos,
} from './dashboardModel';
import { panelSizeConstraints } from './panelLayoutConstraints';

describe('snapGridPos', () => {
  it('clamps to the grid floor a plugin without a layout block inherits', () => {
    expect(snapGridPos({ x: 0,y: 0,w: 1,h: 1 }, [])).toEqual({ x: 0,y: 0,w: 3,h: 2 });
    // The floor and the origin still apply; the size a plugin never capped does
    // not get capped on its behalf.
    expect(snapGridPos({ x: 40,y: -3,w: 99,h: 99 }, [])).toEqual({ x: 0,y: 0,w: 99,h: 99 });
  });

  it('clamps to the bounds the plugin declared instead of the grid default', () => {
    const constraints = panelSizeConstraints(getPanelPlugin('robot-instruments-grid')?.layout);
    expect(snapGridPos({ x: 0,y: 0,w: 1,h: 1 }, [], constraints)).toEqual({ x: 0,y: 0,w: 6,h: 4 });
  });

  it('drops the panel below anything it would land on', () => {
    const occupied = [panel('taken', { x: 0,y: 0,w: 10,h: 4 })];
    expect(snapGridPos({ x: 0,y: 0,w: 6,h: 3 }, occupied)).toMatchObject({ y: 4 });
  });
});

describe('createPanelInstance', () => {
  it('uses the manifest defaults on the dashboard where the panel is created', () => {
    const plugin = getPanelPlugin('robot-instruments-grid')!;
    const created = createPanelInstance(plugin, [], 'operations');
    expect(created).toMatchObject({
      title: plugin.defaultPanel?.title,
      gridPos: plugin.defaultPanel?.gridPos,
      portBindings: [
        { portId:'robots',kind:'data',projection:'experiment.robots.v1' },
        { portId:'robot-assets',kind:'data',projection:'robot.assets.v1' },
        { portId:'robot-runtime',kind:'data',projection:'experiment.runtime.v1' },
        expect.objectContaining({
          portId:'panel-workflow',kind:'workflow',workflowInstanceId:'panel-robot-instruments-grid',
        }),
      ],
      options: {
        ...plugin.defaultOptions,
        ...plugin.defaultPanel?.options,
        dashboard: 'operations',
        gridColumns: 30,
      },
    });
  });

  it('opens a panel no smaller than its own manifest allows', () => {
    const plugin = getPanelPlugin('robot-instruments-grid')!;
    const created = createPanelInstance(plugin, [], 'gcs', { x: 0,y: 0,w: 2,h: 1 });
    expect(created.gridPos).toMatchObject({ w: 6,h: 4 });
  });
});

describe('layoutPanelsWithInsertedPanel', () => {
  it('holds a dragged panel to its declared bounds and pushes the rest out of the way', () => {
    const dragged = panel('instruments', { x: 0,y: 0,w: 2,h: 1 });
    const other = panel('other', { x: 0,y: 0,w: 8,h: 4 });
    const layout = layoutPanelsWithInsertedPanel(
      dragged,
      { x: 0,y: 0,w: 2,h: 1 },
      [dragged,other],
      panelSizeConstraints(getPanelPlugin('robot-instruments-grid')?.layout),
    );

    expect(layout.get('instruments')).toEqual({ x: 0,y: 0,w: 6,h: 4 });
    expect(layout.get('other')).toMatchObject({ y: 4 });
  });
});

function panel(id: string, gridPos: PanelInstance['gridPos']): PanelInstance {
  return {
    id,
    pluginId: 'robot-instruments-grid',
    title: id,
    gridPos,
    query: {},
    options: { dashboard: 'gcs' },
    fieldConfig: {},
    portBindings: [],
  };
}
