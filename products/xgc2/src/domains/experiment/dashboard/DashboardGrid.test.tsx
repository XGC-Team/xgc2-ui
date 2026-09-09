/**
 * @vitest-environment jsdom
 */
import { act,render } from '@testing-library/react';
import {
  WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
  WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
} from '@xgc2/ui-react';
import type React from 'react';
import { describe,expect,it,vi } from 'vitest';

import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { GridPos } from '../../../types/common';
import type { PanelInstance } from '../experimentModel';
import { DashboardGrid } from './DashboardGrid';
import { snapGridPos } from './dashboardModel';
import { panelSizeConstraints } from './panelLayoutConstraints';

const gridMock = vi.hoisted(() => ({
  props: null as null | {
    className: string;
    width: number;
    positionStrategy?: { type: string; calcStyle: (pos: { left: number; top: number; width: number; height: number }) => Record<string, unknown> };
    gridConfig: {
      cols: number;
      rowHeight: number;
      margin: [number, number];
      containerPadding: [number, number];
    };
    layout: Array<{ i: string; x: number; y: number; w: number; h: number;
      minW?: number; minH?: number; maxW?: number; maxH?: number }>;
    onDragStop: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
    onResizeStop: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
    dragConfig: { enabled: boolean; handle?: string; cancel?: string };
    resizeConfig: { enabled: boolean; handles: string[] };
  },
}));

vi.mock('./useDashboardSurfaceSize', () => ({
  useDashboardSurfaceSize: () => ({
    width: 900,
    height: 600,
    mounted: true,
    containerRef: { current: null },
  }),
}));

vi.mock('react-grid-layout', () => ({
  GridLayout: (props: {
    className: string;
    width: number;
    children: React.ReactNode;
    positionStrategy?: { type: string; calcStyle: (pos: { left: number; top: number; width: number; height: number }) => Record<string, unknown> };
    gridConfig: {
      cols: number;
      rowHeight: number;
      margin: [number, number];
      containerPadding: [number, number];
    };
    layout: Array<{ i: string; x: number; y: number; w: number; h: number;
      minW?: number; minH?: number; maxW?: number; maxH?: number }>;
    onDragStop: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
    onResizeStop: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
    dragConfig: { enabled: boolean; handle?: string; cancel?: string };
    resizeConfig: { enabled: boolean; handles: string[] };
  }) => {
    gridMock.props = props;
    return <div data-testid="grid-layout">{props.children}</div>;
  },
}));

describe('DashboardGrid', () => {
  it('keeps an empty dashboard inside the shared editable grid surface', () => {
    gridMock.props = null;
    const { container } = render(
      <DashboardGrid panels={[]} editing empty={<p>No panels</p>} onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    expect(gridMock.props).toBeNull();
    expect(container.querySelector('.xgc-composable-workspace')).toHaveAttribute('data-grid', 'editing');
    expect(container.querySelector('.xgc-composable-workspace-empty')).toHaveTextContent('No panels');
  });

  it('positions tiles with container-relative width so the HUD follows sidebar motion', () => {
    render(
      <DashboardGrid panels={[panel('panel-a')]} editing={false} gcsMode onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );
    const strategy = gridMock.props?.positionStrategy;
    expect(strategy?.type).toBe('absolute');
    expect(strategy?.calcStyle({ left: 180, top: 4, width: 450, height: 40 })).toEqual({
      position: 'absolute',
      top: '4px',
      height: '40px',
      left: '20%',
      width: '50%',
    });
  });

  it('measures the container before mounting the animated grid', () => {
    const { container } = render(
      <DashboardGrid panels={[panel('panel-a')]} editing={false} onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    expect(gridMock.props?.className).toContain('xgc-composable-workspace-layout');
    expect(gridMock.props?.className).toContain('dashboard-layout');
    expect(gridMock.props?.gridConfig).toEqual({
      cols: 30,
      rowHeight: 39,
      margin: [8, 8],
      containerPadding: [8, 8],
    });
    const shell = container.querySelector<HTMLElement>('.dashboard-layout-shell');
    expect(shell).not.toHaveAttribute('data-xgc-editing');
    expect(shell?.style.getPropertyValue('--xgc-workspace-gap-x')).toBe('8px');
    expect(shell?.style.getPropertyValue('--xgc-workspace-gap-y')).toBe('8px');
    expect(shell?.style.getPropertyValue('--xgc-workspace-row-height')).toBe('39px');
    expect(gridMock.props?.dragConfig).toEqual({
      enabled: false,
      handle: WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
      cancel: WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
    });
    expect(gridMock.props?.resizeConfig.enabled).toBe(false);
    expect(gridMock.props?.resizeConfig.handles).toEqual(['se', 'e', 's']);
  });

  it('arms tile layout motion when GCS mode changes', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const tree = (gcsMode: boolean) => (
        <DashboardGrid panels={[panel('panel-a')]} editing={false} gcsMode={gcsMode} onLayoutCommit={vi.fn()}>
          {(item) => <div>{item.title}</div>}
        </DashboardGrid>
      );
      const { container,rerender } = render(tree(false));
      expect(container.querySelector('.dashboard-layout-shell')).not.toHaveAttribute('data-xgc-layout-motion');
      rerender(tree(true));
      expect(container.querySelector('.dashboard-layout-shell')).toHaveAttribute('data-xgc-layout-motion', 'true');
      act(() => { vi.advanceTimersByTime(200); });
      expect(container.querySelector('.dashboard-layout-shell')).not.toHaveAttribute('data-xgc-layout-motion');
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('does not dispatch a synthetic window resize when GCS mode toggles', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const { rerender } = render(
      <DashboardGrid panels={[panel('panel-a')]} editing={false} gcsMode onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );
    dispatch.mockClear();
    rerender(
      <DashboardGrid panels={[panel('panel-a')]} editing={false} gcsMode={false} onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );
    expect(dispatch.mock.calls.some((call) => call[0] instanceof Event && call[0].type === 'resize')).toBe(false);
    dispatch.mockRestore();
  });

  it('keeps GCS gutters at zero so PanelFrame trailing borders form single seams', () => {
    render(
      <DashboardGrid panels={[panel('panel-a')]} editing={false} gcsMode onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    expect(gridMock.props?.gridConfig.margin).toEqual([0, 0]);
    expect(gridMock.props?.gridConfig.containerPadding).toEqual([0, 0]);
  });

  it('exposes edit state on the owned layout shell', () => {
    const { container } = render(
      <DashboardGrid panels={[panel('panel-a')]} editing onLayoutCommit={vi.fn()}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    expect(container.querySelector('.dashboard-layout-shell')).toHaveAttribute('data-xgc-editing', 'true');
    expect(gridMock.props?.dragConfig).toEqual({
      enabled: true,
      handle: WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
      cancel: WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
    });
    expect(gridMock.props?.resizeConfig.enabled).toBe(true);
  });

  it('commits layout only from drag and resize stop callbacks', () => {
    const onLayoutCommit = vi.fn();

    render(
      <DashboardGrid panels={[panel('panel-a')]} editing gcsMode={false} onLayoutCommit={onLayoutCommit}>
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    expect(onLayoutCommit).not.toHaveBeenCalled();
    expect(gridMock.props).not.toBeNull();

    gridMock.props?.onDragStop([{ i: 'panel-a', x: 2, y: 3, w: 4, h: 5 }]);
    expect(onLayoutCommit).toHaveBeenCalledWith({ 'panel-a': { x: 2, y: 3, w: 4, h: 5 } });

    gridMock.props?.onResizeStop([{ i: 'panel-a', x: 1, y: 0, w: 6, h: 7 }]);
    expect(onLayoutCommit).toHaveBeenLastCalledWith({ 'panel-a': { x: 1, y: 0, w: 6, h: 7 } });
  });

  it('carries each plugin\u2019s declared size bounds into its own grid item', () => {
    render(
      <DashboardGrid
        panels={[
          panel('audit'),
          panel('instruments', { x: 0, y: 4, w: 8, h: 6 }, 'robot-instruments-grid'),
        ]}
        editing
        onLayoutCommit={vi.fn()}
      >
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    const audit = gridMock.props?.layout.find((entry) => entry.i === 'audit');
    const instruments = gridMock.props?.layout.find((entry) => entry.i === 'instruments');
    // No layout block: the grid default floor, not a per-plugin one.
    expect(audit).toMatchObject({ minW: 3, minH: 2 });
    expect(instruments).toMatchObject({ minW: 6, minH: 4 });
    // Neither plugin declares a maximum, so the grid item carries none: a
    // ceiling invented here would shrink a saved panel on its first drag.
    for (const item of [audit, instruments]) {
      expect(item).not.toHaveProperty('maxW');
      expect(item).not.toHaveProperty('maxH');
    }
  });

  it('commits a resize clamped to the plugin bounds instead of the raw handle position', () => {
    const onLayoutCommit = vi.fn();
    render(
      <DashboardGrid
        panels={[panel('instruments', { x: 0, y: 0, w: 8, h: 6 }, 'robot-instruments-grid')]}
        editing
        onLayoutCommit={onLayoutCommit}
      >
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    gridMock.props?.onResizeStop([{ i: 'instruments', x: 0, y: 0, w: 2, h: 1 }]);
    expect(onLayoutCommit).toHaveBeenCalledWith({ instruments: { x: 0, y: 0, w: 6, h: 4 } });

    // The floor is enforced on commit; an undeclared plugin ceiling is not
    // invented. The workspace's finite 30-column boundary is still real, so a
    // layout-engine overshoot cannot persist outside the canvas.
    gridMock.props?.onResizeStop([{ i: 'instruments', x: 28, y: 0, w: 40, h: 40 }]);
    expect(onLayoutCommit).toHaveBeenLastCalledWith({ instruments: { x: 0, y: 0, w: 30, h: 40 } });
  });

  it('pins a fixed-height plugin in GCS mode and gives its spare rows to the column neighbour', () => {
    render(
      <DashboardGrid
        panels={[
          panel('instruments', { x: 0, y: 0, w: 8, h: 6 }, 'robot-instruments-grid'),
          panel('control', { x: 0, y: 6, w: 8, h: 9 }, 'px4-rotor-control-panel'),
        ]}
        editing={false}
        gcsMode
        onLayoutCommit={vi.fn()}
      >
        {(item) => <div>{item.title}</div>}
      </DashboardGrid>,
    );

    const items = gridMock.props?.layout ?? [];
    const instruments = items.find((entry) => entry.i === 'instruments')!;
    const control = items.find((entry) => entry.i === 'control')!;
    // The button cluster only needs the rows its square tiles occupy at 8 columns.
    expect(control.h).toBeLessThan(9);
    expect(instruments.h).toBeGreaterThan(6);
    expect(instruments.y).toBe(0);
    expect(control.y).toBe(instruments.h);
    // The column still ends where the author left it: no gap, no overflow.
    expect(control.y + control.h).toBe(15);
  });

  it('keeps an authored stream-camera gridPos in GCS instead of shrinking it at render', () => {
    render(
      <DashboardGrid
        panels={[
          panel('stream', { x: 23, y: 0, w: 7, h: 7 }, 'gazebo-world-camera'),
          panel('chat', { x: 23, y: 7, w: 7, h: 4 }, 'ground-station-activity'),
        ]}
        editing={false}
        gcsMode
        onLayoutCommit={vi.fn()}
      >
        {(item) => <div data-xgc-role={item.pluginId} data-xgc-id={item.id}>{item.title}</div>}
      </DashboardGrid>,
    );

    const items = gridMock.props?.layout ?? [];
    const stream = items.find((entry) => entry.i === 'stream')!;
    const chat = items.find((entry) => entry.i === 'chat')!;
    // GCS may shift the band to the origin; it must not rewrite authored heights.
    expect(stream).toMatchObject({ w: 7,h: 7 });
    expect(chat).toMatchObject({ w: 7,h: 4 });
    expect(chat.y).toBe(stream.y + stream.h);
    expect(stream.x).toBe(chat.x);
  });

  it('opens a panel at the same floor the grid refuses to drag below', () => {
    for (const pluginId of ['automation-workflow-audit', 'robot-instruments-grid', 'px4-rotor-control-panel']) {
      const view = render(
        <DashboardGrid panels={[panel('sized', { x: 0, y: 0, w: 1, h: 1 }, pluginId)]} editing onLayoutCommit={vi.fn()}>
          {(item) => <div>{item.title}</div>}
        </DashboardGrid>,
      );
      const item = gridMock.props?.layout.find((entry) => entry.i === 'sized');
      const snapped = snapGridPos(
        { x: 0, y: 0, w: 1, h: 1 },
        [],
        panelSizeConstraints(getPanelPlugin(pluginId)?.layout),
      );
      expect({ w: snapped.w, h: snapped.h }).toEqual({ w: item?.minW, h: item?.minH });
      expect({ w: item?.w, h: item?.h }).toEqual({ w: snapped.w, h: snapped.h });
      view.unmount();
    }
  });
});

function panel(
  id: string,
  gridPos: GridPos = { x: 0, y: 0, w: 4, h: 3 },
  pluginId = 'automation-workflow-audit',
): PanelInstance {
  return {
    id,
    pluginId,
    title: id,
    gridPos,
    query: {},
    options: { gridColumns: 30 },
    fieldConfig: {},
    portBindings: [],
  };
}
