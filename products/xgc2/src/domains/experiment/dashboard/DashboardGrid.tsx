import { useLayoutEffect,useMemo,useState,type ReactNode } from 'react';
import {
  ComposableWorkspace,
  WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
  WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
  type ComposableWorkspaceAdapterProps,
} from '@xgc2/ui-react';
import { GridLayout,type Layout,type LayoutItem } from 'react-grid-layout';
import { DashboardPanelContent } from './DashboardPanelContent';
import { dashboardFluidPositionStrategy } from './dashboardGridPosition';
import { useDashboardSurfaceSize } from './useDashboardSurfaceSize';
import { useDelayedTask } from '../../../hooks/useDelayedTask';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_GAP,
  DASHBOARD_MARGIN,
  DASHBOARD_ROW_HEIGHT,
  GCS_DASHBOARD_MARGIN,
  GCS_DASHBOARD_SEAM_PX,
} from '../../../shared/dashboardGeometry';
import type { GridPos } from '../../../types/common';
import type { PanelInstance } from '../experimentModel';
import {
  gcsAvailableHeightPx,
  gcsRowHeightPx,
  normalizeGcsLayout,
  type GcsPanelSizePolicy,
} from './dashboardGcsLayout';
import { clampPanelSize,panelSizeConstraints,type PanelSizeConstraints } from './panelLayoutConstraints';

/** Sidebar `--duration-fast` is 160ms; keep the tile flag slightly longer so it does not drop mid-ease. */
const GCS_LAYOUT_MOTION_MS = 200;

export function DashboardGrid({
  panels,
  editing,
  gcsMode,
  children,
  empty,
  onLayoutCommit,
}: {
  panels: PanelInstance[];
  editing: boolean;
  gcsMode?: boolean;
  children: (panel: PanelInstance) => ReactNode;
  empty?: ReactNode;
  onLayoutCommit: (positions: Record<string, GridPos>) => void;
}) {
  const { width, height: containerHeight, mounted, containerRef } = useDashboardSurfaceSize();
  const requestedGcsMode = Boolean(gcsMode);
  const [renderedGcsMode, setRenderedGcsMode] = useState(requestedGcsMode);
  const [layoutMotion, setLayoutMotion] = useState(false);
  useLayoutEffect(() => {
    if (renderedGcsMode === requestedGcsMode) return;
    setLayoutMotion(true);
    const frame = window.requestAnimationFrame(() => setRenderedGcsMode(requestedGcsMode));
    return () => window.cancelAnimationFrame(frame);
  }, [renderedGcsMode, requestedGcsMode]);
  useDelayedTask({
    enabled: layoutMotion && renderedGcsMode === requestedGcsMode,
    delayMs: GCS_LAYOUT_MOTION_MS,
    task: () => setLayoutMotion(false),
  });
  const constraints = useMemo(() => new Map<string, PanelSizeConstraints>(panels.map((panel) => [
    panel.id,
    panelSizeConstraints(getPanelPlugin(panel.pluginId)?.layout),
  ])), [panels]);
  const sizePolicies = useMemo(() => new Map<string, GcsPanelSizePolicy>(panels.map((panel) => {
    const layout = getPanelPlugin(panel.pluginId)?.layout;
    const preferred = layout?.preferredHeightForWidth;
    return [panel.id, {
      verticalFixed: layout?.sizePolicy?.vertical === 'fixed',
      preferredHeightPx: preferred ? (widthPx: number) => preferred(widthPx, panel) : undefined,
    }];
  })), [panels]);
  // The grid enforces the plugin's own bounds per item rather than one hard-coded
  // floor for every panel, so a panel can never be dragged into a size its own
  // manifest rejects.
  const baseLayout: LayoutItem[] = useMemo(() => panels.map((panel) => {
    const bounds = constraints.get(panel.id) ?? panelSizeConstraints();
    const gridPos = clampPanelSize(panel.gridPos, bounds);
    return {
      i: panel.id,
      ...gridPos,
      minW: bounds.minW,
      minH: bounds.minH,
      // An undeclared maximum stays off the item: react-grid-layout treats a
      // present maxW/maxH as a hard resize ceiling, and one invented here would
      // shrink a saved panel the moment it is dragged.
      ...(bounds.maxW === undefined ? {} : { maxW: bounds.maxW }),
      ...(bounds.maxH === undefined ? {} : { maxH: bounds.maxH }),
    };
  }), [constraints, panels]);
  const availableHeight = renderedGcsMode ? gcsAvailableHeightPx(containerHeight) : 0;
  const baseRowHeight = renderedGcsMode
    ? gcsRowHeightPx(availableHeight, maxRowOf(baseLayout))
    : DASHBOARD_ROW_HEIGHT;
  // GCS: zero gutters; gray seams are CSS trailing borders on each PanelFrame.
  const gapPx = renderedGcsMode ? GCS_DASHBOARD_SEAM_PX : DASHBOARD_GAP;
  const margin: [number, number] = renderedGcsMode ? GCS_DASHBOARD_MARGIN : DASHBOARD_MARGIN;
  const layout = useMemo(() => renderedGcsMode
    ? normalizeGcsLayout(baseLayout, (panelId) => sizePolicies.get(panelId), {
      containerWidthPx: width,
      rowHeightPx: baseRowHeight,
      gapPx,
    })
    : baseLayout, [baseLayout, baseRowHeight, gapPx, renderedGcsMode, sizePolicies, width]);
  const rowHeight = renderedGcsMode ? gcsRowHeightPx(availableHeight, maxRowOf(layout)) : DASHBOARD_ROW_HEIGHT;

  return (
    <ComposableWorkspace
      columns={DASHBOARD_COLUMNS}
      containerRef={containerRef}
      editing={editing}
      empty={empty}
      gap={margin}
      grid="editing"
      getConstraints={(panel) => constraints.get(panel.id)}
      getItemId={(panel) => panel.id}
      getPosition={(panel) => layout.find((entry) => entry.i === panel.id) ?? panel.gridPos}
      itemClassName="dashboard-layout-item"
      items={panels}
      layoutClassName="dashboard-layout"
      normalizeCommittedPosition={(position, panel) => clampPanelSize(
        position,
        constraints.get(panel.id) ?? panelSizeConstraints(),
      )}
      onLayoutCommit={onLayoutCommit}
      padding={margin}
      className="dashboard-layout-shell"
      data-xgc-editing={editing ? 'true' : undefined}
      data-xgc-layout-motion={layoutMotion ? 'true' : undefined}
      renderItem={(panel) => <DashboardPanelContent panel={panel} renderPanel={children} />}
      renderLayout={(adapter) => mounted ? <ReactGridLayoutAdapter {...adapter} width={width} /> : null}
      rowHeight={rowHeight}
      width={width}
    />
  );
}

function ReactGridLayoutAdapter<Item>({
  children,
  className,
  columns,
  editing,
  gap,
  items,
  onLayoutCommit,
  padding,
  resizeHandles,
  rowHeight,
  width,
}: ComposableWorkspaceAdapterProps<Item> & { width: number }) {
  const layout: LayoutItem[] = items.map(({ id,item: _item,...entry }) => ({ i: id,...entry }));
  const commit = (nextLayout: Layout) => onLayoutCommit(nextLayout.map(({ i,x,y,w,h }) => ({ id: i,x,y,w,h })));
  return (
    <GridLayout
      className={className}
      width={width}
      positionStrategy={dashboardFluidPositionStrategy(width)}
      gridConfig={{
        cols: columns,
        rowHeight,
        margin: [gap[0],gap[1]],
        containerPadding: [padding[0],padding[1]],
      }}
      layout={layout}
      // WorkspacePanel owns the complete header drag surface and marks its
      // controls as interactive exclusions. Keep the grid bound to that shared
      // contract so panels remain easy to move without swallowing button clicks.
      dragConfig={{
        enabled: editing,
        handle: WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
        cancel: WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
      }}
      resizeConfig={{ enabled: editing,handles: [...resizeHandles] }}
      onDragStop={commit}
      onResizeStop={commit}
    >
      {children}
    </GridLayout>
  );
}

function maxRowOf(layout: LayoutItem[]) {
  return Math.max(1, ...layout.map((item) => item.y + item.h));
}
