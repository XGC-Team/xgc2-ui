import { useMemo } from 'react';
import { usePanelPrivateState,type PanelPrivateStateScope } from '../../../shared/panelPrivateState';
import type { PanelInstance } from '../experimentModel';

export type RobotInstrumentStateScope = PanelPrivateStateScope;

export type RobotInstrumentViewMode = 'list' | 'single' | 'double' | 'workflow';

export type RobotInstrumentPagedViewMode = Exclude<RobotInstrumentViewMode, 'workflow'>;

export type RobotInstrumentPageSizes = Record<RobotInstrumentPagedViewMode, number>;

export const robotInstrumentViewModes: Array<{ id: RobotInstrumentViewMode; label: string }> = [
  { id: 'list', label: 'List' },
  { id: 'single', label: '1 col' },
  { id: 'double', label: '2 col' },
  { id: 'workflow', label: 'Workflow' },
];

export const robotInstrumentPagedViewModes: Array<{ id: RobotInstrumentPagedViewMode; label: string }> = [
  { id: 'list', label: 'List' },
  { id: 'single', label: '1 col' },
  { id: 'double', label: '2 col' },
];

/** Allowed max-instruments-per-page choices for list / single / double views. */
export const robotInstrumentPageSizeChoices = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24] as const;

export const defaultRobotInstrumentPageSizes: RobotInstrumentPageSizes = {
  list: 12,
  single: 12,
  double: 12,
};

export function isRobotInstrumentPanel(panel: PanelInstance) {
  return panel.pluginId === 'robot-instruments-grid';
}

/**
 * Panel-state keys under the per-instance scope. Two instruments panels on one
 * dashboard each keep their own view and paging; the store keys them apart.
 */
export const ROBOT_INSTRUMENT_VIEW_STATE_KEY = 'instrument.view';
export const ROBOT_INSTRUMENT_PAGE_SIZES_STATE_KEY = 'instrument.page-sizes';

export function normalizeRobotInstrumentViewMode(value: unknown): RobotInstrumentViewMode {
  return value === 'single' || value === 'double' || value === 'list' || value === 'workflow' ? value : 'double';
}

/**
 * The frame header owns the switcher and the panel body owns the board, but both
 * are one instrument panel: they name the same panel-state slot instead of
 * mirroring a module-level value through window events.
 */
export function useRobotInstrumentViewMode(scope: RobotInstrumentStateScope) {
  const [stored,setViewMode] = usePanelPrivateState<RobotInstrumentViewMode>(
    scope,
    ROBOT_INSTRUMENT_VIEW_STATE_KEY,
    'double',
  );
  return [normalizeRobotInstrumentViewMode(stored),setViewMode] as const;
}

export function useRobotInstrumentPageSizes(scope: RobotInstrumentStateScope) {
  const [stored,setPageSizes] = usePanelPrivateState<RobotInstrumentPageSizes>(
    scope,
    ROBOT_INSTRUMENT_PAGE_SIZES_STATE_KEY,
    defaultRobotInstrumentPageSizes,
  );
  const pageSizes = useMemo(() => normalizeRobotInstrumentPageSizes(stored), [stored]);
  return [pageSizes,setPageSizes] as const;
}

export function normalizeRobotInstrumentPageSize(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  if ((robotInstrumentPageSizeChoices as readonly number[]).includes(parsed)) return parsed;
  // Clamp an operator-edited value to the nearest supported layout choice.
  return robotInstrumentPageSizeChoices.reduce((best, choice) => (
    Math.abs(choice - parsed) < Math.abs(best - parsed) ? choice : best
  ), fallback);
}

export function normalizeRobotInstrumentPageSizes(value: unknown): RobotInstrumentPageSizes {
  const stored = value && typeof value === 'object' ? value as Partial<RobotInstrumentPageSizes> : {};
  return {
    list: normalizeRobotInstrumentPageSize(stored.list, defaultRobotInstrumentPageSizes.list),
    single: normalizeRobotInstrumentPageSize(stored.single, defaultRobotInstrumentPageSizes.single),
    double: normalizeRobotInstrumentPageSize(stored.double, defaultRobotInstrumentPageSizes.double),
  };
}

export function robotInstrumentPageSizeForView(
  pageSizes: RobotInstrumentPageSizes,
  viewMode: RobotInstrumentViewMode,
): number | undefined {
  if (viewMode === 'workflow') return undefined;
  return pageSizes[viewMode];
}

export function robotInstrumentPageSlice<T>(
  items: readonly T[],
  pageSize: number | undefined,
  pageIndex: number,
): { items: T[]; pageIndex: number; pageCount: number; pageSize: number } {
  const size = pageSize && pageSize > 0 ? pageSize : Math.max(items.length, 1);
  const pageCount = Math.max(1, Math.ceil(items.length / size) || 1);
  const safePage = Math.max(0, Math.min(pageIndex, pageCount - 1));
  const start = safePage * size;
  return {
    items: items.slice(start, start + size) as T[],
    pageIndex: safePage,
    pageCount,
    pageSize: size,
  };
}
