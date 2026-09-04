import {
  useCallback,
  useMemo,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { classNames } from '../utils';
import {
  WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
  WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
} from './WorkspacePanel';

const EMPTY_WORKSPACE_BREAKPOINTS: readonly WorkspaceBreakpoint[] = [];
const DEFAULT_WORKSPACE_GAP = [0, 0] as const;
const DEFAULT_WORKSPACE_RESIZE_HANDLES: readonly WorkspaceResizeHandle[] = ['se', 'e', 's'];

export type WorkspaceLayoutPosition = {
  h: number;
  w: number;
  x: number;
  y: number;
};

export type WorkspaceLayoutConstraints = {
  maxH?: number;
  maxW?: number;
  minH?: number;
  minW?: number;
};

export type WorkspaceLayoutItem<Item> = WorkspaceLayoutPosition & WorkspaceLayoutConstraints & {
  id: string;
  item: Item;
};

export type WorkspaceBreakpoint = {
  columns: number;
  minWidth: number;
  name: string;
};

export type WorkspaceResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type ComposableWorkspaceAdapterProps<Item> = {
  activeBreakpoint?: WorkspaceBreakpoint;
  children: ReactNode;
  className: string;
  columns: number;
  dragCancelSelector: string;
  dragHandleSelector: string;
  editing: boolean;
  gap: readonly [number, number];
  items: readonly WorkspaceLayoutItem<Item>[];
  onLayoutCommit: (layout: readonly (WorkspaceLayoutPosition & { id: string })[]) => void;
  padding: readonly [number, number];
  resizeHandles: readonly WorkspaceResizeHandle[];
  rowHeight: number;
};

export type ComposableWorkspaceProps<Item> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  breakpoints?: readonly WorkspaceBreakpoint[];
  columns: number;
  containerRef?: Ref<HTMLDivElement>;
  editing?: boolean;
  empty?: ReactNode;
  gap?: readonly [number, number];
  grid?: 'editing' | 'always' | 'none';
  getConstraints?: (item: Item) => WorkspaceLayoutConstraints | undefined;
  getItemId: (item: Item) => string;
  getPosition: (item: Item) => WorkspaceLayoutPosition;
  itemClassName?: string;
  layoutClassName?: string;
  normalizeLayout?: (
    layout: readonly WorkspaceLayoutItem<Item>[],
    context: { activeBreakpoint?: WorkspaceBreakpoint; columns: number; width?: number },
  ) => readonly WorkspaceLayoutItem<Item>[];
  normalizeCommittedPosition?: (position: WorkspaceLayoutPosition, item: Item) => WorkspaceLayoutPosition;
  onLayoutCommit: (positions: Readonly<Record<string, WorkspaceLayoutPosition>>) => void;
  padding?: readonly [number, number];
  renderItem: (item: Item) => ReactNode;
  renderLayout: (props: ComposableWorkspaceAdapterProps<Item>) => ReactNode;
  resizeHandles?: readonly WorkspaceResizeHandle[];
  rowHeight: number;
  width?: number;
  items: readonly Item[];
};

/**
 * Grid-engine-neutral composition for spatial operator dashboards.
 *
 * Layout derivation is memoized deliberately because domain telemetry can
 * update far more often than panel geometry. A stable item/layout input now
 * keeps constraint normalization, map construction and child element creation
 * outside unrelated React renders.
 */
export function ComposableWorkspace<Item>({
  breakpoints = EMPTY_WORKSPACE_BREAKPOINTS,
  className,
  columns,
  containerRef,
  editing = false,
  empty,
  gap = DEFAULT_WORKSPACE_GAP,
  grid = 'none',
  getConstraints,
  getItemId,
  getPosition,
  itemClassName,
  items,
  layoutClassName,
  normalizeLayout,
  normalizeCommittedPosition,
  onLayoutCommit,
  padding = gap,
  renderItem,
  renderLayout,
  resizeHandles = DEFAULT_WORKSPACE_RESIZE_HANDLES,
  rowHeight,
  style,
  width,
  ...props
}: ComposableWorkspaceProps<Item>) {
  const activeBreakpoint = useMemo(
    () => resolveWorkspaceBreakpoint(width, breakpoints),
    [breakpoints, width],
  );
  const effectiveColumns = Math.max(1, Math.trunc(activeBreakpoint?.columns ?? columns));
  const availableWidth = width !== undefined && Number.isFinite(width)
    ? Math.max(0, width - gap[0] * Math.max(0, effectiveColumns - 1) - padding[0] * 2)
    : undefined;
  const columnPitch = availableWidth !== undefined
    ? `${availableWidth / effectiveColumns + gap[0]}px`
    : `${100 / effectiveColumns}%`;

  const constrainedItems = useMemo(() => items.map((item) => {
    const id = getItemId(item);
    const constraints = getConstraints?.(item) ?? {};
    return {
      id,
      item,
      ...clampWorkspacePosition(getPosition(item), constraints, effectiveColumns),
      ...constraints,
    };
  }), [effectiveColumns, getConstraints, getItemId, getPosition, items]);

  const layout = useMemo(() => (
    normalizeLayout?.(constrainedItems, {
      activeBreakpoint,
      columns: effectiveColumns,
      width,
    }) ?? constrainedItems
  ).map((entry) => ({
    ...entry,
    ...clampWorkspacePosition(entry, entry, effectiveColumns),
  })), [activeBreakpoint, constrainedItems, effectiveColumns, normalizeLayout, width]);

  const constraintsById = useMemo(
    () => new Map(layout.map((entry) => [entry.id, entry])),
    [layout],
  );

  const commit = useCallback((nextLayout: readonly (WorkspaceLayoutPosition & { id: string })[]) => {
    const positions: Record<string, WorkspaceLayoutPosition> = {};
    for (const entry of nextLayout) {
      const workspaceItem: WorkspaceLayoutItem<Item> | undefined = constraintsById.get(entry.id);
      if (!workspaceItem) continue;
      const constrained = clampWorkspacePosition(entry, workspaceItem, effectiveColumns);
      const normalized = normalizeCommittedPosition?.(constrained, workspaceItem.item) ?? constrained;
      positions[entry.id] = clampWorkspacePosition(normalized, workspaceItem, effectiveColumns);
    }
    onLayoutCommit(positions);
  }, [constraintsById, effectiveColumns, normalizeCommittedPosition, onLayoutCommit]);

  const renderedItems = useMemo(() => layout.map((entry) => (
    <div
      className={classNames('xgc-composable-workspace-item', itemClassName)}
      data-xgc-workspace-item={entry.id}
      key={entry.id}
    >
      {renderItem(entry.item)}
    </div>
  )), [itemClassName, layout, renderItem]);

  const workspaceStyle = useMemo(() => ({
    '--xgc-workspace-columns': effectiveColumns,
    '--xgc-workspace-column-pitch': columnPitch,
    '--xgc-workspace-gap-x': `${gap[0]}px`,
    '--xgc-workspace-gap-y': `${gap[1]}px`,
    '--xgc-workspace-origin-x': `${padding[0]}px`,
    '--xgc-workspace-origin-y': `${padding[1]}px`,
    '--xgc-workspace-row-height': `${rowHeight}px`,
    ...style,
  } as CSSProperties), [columnPitch, effectiveColumns, gap, padding, rowHeight, style]);

  return (
    <div
      {...props}
      ref={containerRef}
      className={classNames('xgc-composable-workspace', className)}
      data-breakpoint={activeBreakpoint?.name}
      data-editing={editing || undefined}
      data-grid={grid}
      style={workspaceStyle}
    >
      {layout.length === 0 && empty ? (
        <div className="xgc-composable-workspace-empty">{empty}</div>
      ) : renderLayout({
        activeBreakpoint,
        children: renderedItems,
        className: classNames('xgc-composable-workspace-layout', layoutClassName),
        columns: effectiveColumns,
        dragCancelSelector: WORKSPACE_PANEL_DRAG_CANCEL_SELECTOR,
        dragHandleSelector: WORKSPACE_PANEL_DRAG_HANDLE_SELECTOR,
        editing,
        gap,
        items: layout,
        onLayoutCommit: commit,
        padding,
        resizeHandles,
        rowHeight,
      })}
    </div>
  );
}

export function resolveWorkspaceBreakpoint(
  width: number | undefined,
  breakpoints: readonly WorkspaceBreakpoint[],
) {
  if (width === undefined || !Number.isFinite(width)) return undefined;
  return [...breakpoints]
    .sort((left, right) => right.minWidth - left.minWidth)
    .find((breakpoint) => width >= breakpoint.minWidth);
}

export function clampWorkspacePosition(
  position: WorkspaceLayoutPosition,
  constraints: WorkspaceLayoutConstraints = {},
  columns?: number,
): WorkspaceLayoutPosition {
  const columnLimit = columns === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.trunc(columns));
  const minW = Math.min(positiveOr(constraints.minW, 1), columnLimit);
  const minH = positiveOr(constraints.minH, 1);
  const maxW = Math.min(positiveOr(constraints.maxW, Number.POSITIVE_INFINITY), columnLimit);
  const maxH = positiveOr(constraints.maxH, Number.POSITIVE_INFINITY);
  const w = clamp(positiveOr(position.w, minW), minW, Math.max(minW, maxW));
  const h = clamp(positiveOr(position.h, minH), minH, Math.max(minH, maxH));
  const x = Math.max(0, finiteOr(position.x, 0));
  return {
    h,
    w,
    x: columns === undefined ? x : Math.min(x, Math.max(0, columnLimit - w)),
    y: Math.max(0, finiteOr(position.y, 0)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteOr(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}
