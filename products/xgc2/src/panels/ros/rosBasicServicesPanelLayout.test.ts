// @vitest-environment jsdom

import { describe,expect,it } from 'vitest';
import { dashboardRowsForSquareControlGrid } from '../../shared/dashboardGeometry';
import { rosBasicServicesPanelPlugin } from './manifest';
import {
  moveRosBasicServiceInOrder,
  ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW,
  rosBasicServicesControlGridStyle,
  rosBasicServicesLayoutDefaultOptions,
  rosBasicServicesLayoutOptions,
} from './rosBasicServicesPanelLayout';
import { rosBasicServices } from './rosBasicServicesPanelModel';

describe('rosBasicServicesPanelLayout', () => {
  it('defaults to every service in catalog order at four across', () => {
    const layout = rosBasicServicesLayoutOptions({});
    expect(layout.buttonsPerRow).toBe(ROS_BASIC_SERVICES_DEFAULT_BUTTONS_PER_ROW);
    expect(layout.order).toEqual(['roscore','gzserver','vrpn','adapters','rviz','gzclient']);
    expect(layout.shown).toEqual(layout.order);
    expect(layout.hidden).toEqual([]);
    expect(rosBasicServicesLayoutDefaultOptions()).toEqual({
      layoutButtonsPerRow: 4,
      layoutServiceOrder: ['roscore','gzserver','vrpn','adapters','rviz','gzclient'],
      layoutHiddenServices: [],
    });
    // Fresh arrays per call: the manifest spreads these into saved panel documents.
    expect(rosBasicServicesLayoutDefaultOptions().layoutServiceOrder)
      .not.toBe(rosBasicServicesLayoutDefaultOptions().layoutServiceOrder);
  });

  it('repairs partial, duplicated, and unknown authoring instead of dropping tiles', () => {
    const layout = rosBasicServicesLayoutOptions({
      layoutButtonsPerRow: 99,
      layoutServiceOrder: ['vrpn','vrpn','px4','gzserver'],
      layoutHiddenServices: ['gzserver','px4'],
    });
    expect(layout.buttonsPerRow).toBe(rosBasicServices.length);
    // Services provisioned after the panel was authored append in catalog order.
    expect(layout.order).toEqual(['vrpn','gzserver','roscore','adapters','rviz','gzclient']);
    expect(layout.shown).toEqual(['vrpn','roscore','adapters','rviz','gzclient']);
    expect(layout.hidden).toEqual(['gzserver']);
  });

  it('refuses to resolve an empty grid when every service is hidden', () => {
    const layout = rosBasicServicesLayoutOptions({
      layoutHiddenServices: ['roscore','gzserver','vrpn','adapters','rviz','gzclient'],
    });
    expect(layout.hidden).toEqual([]);
    expect(layout.shown).toHaveLength(rosBasicServices.length);
  });

  it('moves a service within the order and clamps at the ends', () => {
    const order = ['roscore','rviz','gzserver'] as const;
    expect(moveRosBasicServiceInOrder(order, 'gzserver', -1)).toEqual(['roscore','gzserver','rviz']);
    expect(moveRosBasicServiceInOrder(order, 'roscore', -1)).toEqual(['roscore','rviz','gzserver']);
    expect(moveRosBasicServiceInOrder(order, 'gzserver', 1)).toEqual(['roscore','rviz','gzserver']);
  });

  it('never asks for more columns than tiles and gives each clamp its own wrap', () => {
    expect(rosBasicServicesControlGridStyle(2, 4)).toMatchObject({
      '--control-density-cols': 4,
      '--control-cols': 2,
      '--control-rows': 1,
      '--control-narrow-cols': 2,
      '--control-narrow-rows': 1,
      '--control-stacked-rows': 2,
    });
    expect(rosBasicServicesControlGridStyle(5, 2)).toMatchObject({
      '--control-density-cols': 2,
      '--control-cols': 2,
      '--control-rows': 3,
      '--control-narrow-cols': 2,
      '--control-narrow-rows': 3,
      '--control-stacked-rows': 5,
    });
    // Single-column authoring must survive the narrow clamp instead of being widened to 2.
    expect(rosBasicServicesControlGridStyle(5, 1)).toMatchObject({
      '--control-density-cols': 1,
      '--control-cols': 1,
      '--control-rows': 5,
      '--control-narrow-cols': 1,
      '--control-narrow-rows': 5,
    });
  });

  it('sizes the default panel height from the same wrap the runtime grid uses', () => {
    const defaults = rosBasicServicesLayoutDefaultOptions();
    expect(rosBasicServicesPanelPlugin.defaultPanel?.gridPos?.h).toBe(dashboardRowsForSquareControlGrid({
      panelWidthCols: rosBasicServicesPanelPlugin.defaultPanel!.gridPos!.w,
      itemCount: (defaults.layoutServiceOrder as string[]).length,
      maxColumns: defaults.layoutButtonsPerRow as number,
    }));
  });
});
