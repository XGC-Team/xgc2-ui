import { externalVisualizationThemeDefaults } from '../../theme';

export const LICHTBLICK_LAYOUT_MODES = [
  '3d',
  '3d-camera-ar',
  'camera-ar-3d',
  '3d-above-camera-ar',
  'camera-ar-above-3d',
  '3d-above-camera-ar-plot',
] as const;

export type LichtblickLayoutMode = typeof LICHTBLICK_LAYOUT_MODES[number];

export const LICHTBLICK_DEFAULT_LAYOUT_MODE = '3d-above-camera-ar' as const;

/** Operator-facing layout cards for the panel options drawer. */
export const LICHTBLICK_LAYOUT_MODE_OPTIONS = [
  {
    value: '3d' as const,
    label: '3D only',
    description: 'Full-panel 3D scene',
    arrangement: 'single' as const,
    panes: [{ kind: '3d' as const,label: '3D' }],
  },
  {
    value: '3d-camera-ar' as const,
    label: '3D · Augmented',
    description: '3D left, augmented view right',
    arrangement: 'row' as const,
    panes: [{ kind: '3d' as const,label: '3D' },{ kind: 'camera' as const,label: 'AR' }],
  },
  {
    value: 'camera-ar-3d' as const,
    label: 'Augmented · 3D',
    description: 'Augmented view left, 3D right',
    arrangement: 'row' as const,
    panes: [{ kind: 'camera' as const,label: 'AR' },{ kind: '3d' as const,label: '3D' }],
  },
  {
    value: '3d-above-camera-ar' as const,
    label: '3D / Augmented',
    description: '3D top, augmented view bottom',
    arrangement: 'column' as const,
    panes: [{ kind: '3d' as const,label: '3D' },{ kind: 'camera' as const,label: 'AR' }],
  },
  {
    value: 'camera-ar-above-3d' as const,
    label: 'Augmented / 3D',
    description: 'Augmented view top, 3D bottom',
    arrangement: 'column' as const,
    panes: [{ kind: 'camera' as const,label: 'AR' },{ kind: '3d' as const,label: '3D' }],
  },
  {
    value: '3d-above-camera-ar-plot' as const,
    label: '3D / AR · Plot',
    description: '3D top, augmented view and Plot bottom',
    arrangement: 'column-split' as const,
    panes: [
      { kind: '3d' as const,label: '3D' },
      { kind: 'camera' as const,label: 'AR' },
      { kind: 'plot' as const,label: 'Plot' },
    ],
  },
] as const;

export function lichtblickLayoutModeLabel(mode: string): string {
  return LICHTBLICK_LAYOUT_MODE_OPTIONS.find((option) => option.value === mode)?.label
    ?? mode;
}

export function lichtblickLayoutModeOption(mode: string) {
  return LICHTBLICK_LAYOUT_MODE_OPTIONS.find((option) => option.value === mode);
}

export function lichtblickLayoutPresentation(mode: string) {
  const option = lichtblickLayoutModeOption(mode)
    ?? LICHTBLICK_LAYOUT_MODE_OPTIONS[0];
  return {
    mode: option.value,
    arrangement: option.arrangement,
    firstPane: option.panes[0]?.kind ?? '3d',
    secondPane: option.panes[1]?.kind ?? '',
    thirdPane: option.panes[2]?.kind ?? '',
  } as const;
}

export const LICHTBLICK_LAYOUT_DEFAULTS = {
  layoutMode: LICHTBLICK_DEFAULT_LAYOUT_MODE,
  gridVisible: true,
  // Neutral grey grid (not brand blue); size/divisions 3× the previous 10 m / 10.
  gridColor: externalVisualizationThemeDefaults.gridColor,
  gridSize: 30,
  gridDivisions: 30,
  gridLineWidth: 1,
  axesVisible: false,
  axesScale: 1,
  // Visible on the default dark 3D canvas; pure black labels look like "no robots".
  markerColor: externalVisualizationThemeDefaults.markerColor,
  plotPaths: [] as string[],
} as const;

export const LICHTBLICK_PLOT_PATH_PATTERN = /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\])?)+$/;
export const LICHTBLICK_MAXIMUM_PLOT_PATHS = 16;

export type LichtblickLayoutOptions = {
  layoutMode: LichtblickLayoutMode;
  gridVisible: boolean;
  gridColor: string;
  gridSize: number;
  gridDivisions: number;
  gridLineWidth: number;
  axesVisible: boolean;
  axesScale: number;
  markerColor: string;
  plotPaths: string[];
};

export function lichtblickLayoutOptions(options: Record<string,unknown>): LichtblickLayoutOptions {
  return {
    layoutMode: validLayoutMode(options.layoutMode)
      ? options.layoutMode
      : LICHTBLICK_LAYOUT_DEFAULTS.layoutMode,
    gridVisible: typeof options.gridVisible === 'boolean' ? options.gridVisible : LICHTBLICK_LAYOUT_DEFAULTS.gridVisible,
    gridColor: validColor(options.gridColor) ? options.gridColor.toLowerCase() : LICHTBLICK_LAYOUT_DEFAULTS.gridColor,
    gridSize: boundedNumber(options.gridSize, 0.1, 100000, LICHTBLICK_LAYOUT_DEFAULTS.gridSize),
    gridDivisions: boundedInteger(options.gridDivisions, 1, 10000, LICHTBLICK_LAYOUT_DEFAULTS.gridDivisions),
    gridLineWidth: boundedNumber(options.gridLineWidth, 0.1, 100, LICHTBLICK_LAYOUT_DEFAULTS.gridLineWidth),
    axesVisible: typeof options.axesVisible === 'boolean' ? options.axesVisible : LICHTBLICK_LAYOUT_DEFAULTS.axesVisible,
    axesScale: boundedNumber(options.axesScale, 0.01, 100000, LICHTBLICK_LAYOUT_DEFAULTS.axesScale),
    markerColor: validColor(options.markerColor) ? options.markerColor.toLowerCase() : '',
    plotPaths: canonicalPlotPaths(options.plotPaths),
  };
}

export function validateLichtblickLayoutOptions(options: Record<string,unknown>) {
  if (options.layoutMode !== undefined && !validLayoutMode(options.layoutMode)) {
    return 'Initial layout must be 3D only or one of the supported 3D, camera, and Plot arrangements.';
  }
  if (options.gridVisible !== undefined && typeof options.gridVisible !== 'boolean') return 'Grid visibility must be boolean.';
  if (options.gridColor !== undefined && !validColor(options.gridColor)) return 'Grid color must use six-digit hexadecimal RGB notation.';
  if (options.gridSize !== undefined && !inRange(options.gridSize, 0.1, 100000)) return 'Grid size must be between 0.1 and 100000.';
  if (options.gridDivisions !== undefined && (!Number.isInteger(options.gridDivisions) || !inRange(options.gridDivisions, 1, 10000))) {
    return 'Grid divisions must be an integer between 1 and 10000.';
  }
  if (options.gridLineWidth !== undefined && !inRange(options.gridLineWidth, 0.1, 100)) return 'Grid line width must be between 0.1 and 100.';
  if (options.axesVisible !== undefined && typeof options.axesVisible !== 'boolean') return 'World axis visibility must be boolean.';
  if (options.axesScale !== undefined && !inRange(options.axesScale, 0.01, 100000)) return 'World axis size must be between 0.01 and 100000.';
  if (!validColor(options.markerColor)) return 'Marker color is required and must use six-digit hexadecimal RGB notation.';
  if (options.plotPaths !== undefined) {
    const paths = canonicalPlotPaths(options.plotPaths);
    if (!Array.isArray(options.plotPaths) || paths.length !== options.plotPaths.length) {
      return 'Plot series must be message paths such as /topic.field.';
    }
    if (paths.length > LICHTBLICK_MAXIMUM_PLOT_PATHS) return 'Plot series is limited to 16 message paths.';
    if (new Set(paths).size !== paths.length) return 'Plot series must not repeat a message path.';
    if (paths.some((path) => !LICHTBLICK_PLOT_PATH_PATTERN.test(path))) {
      return 'Plot series must be message paths such as /topic.field.';
    }
  }
  return '';
}

export function canonicalPlotPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function plotPathsFromText(value: string): string[] {
  return canonicalPlotPaths(value.split(/\r?\n/u));
}

function validLayoutMode(value: unknown): value is LichtblickLayoutOptions['layoutMode'] {
  return LICHTBLICK_LAYOUT_MODES.includes(value as LichtblickLayoutOptions['layoutMode']);
}

function validColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return inRange(value, minimum, maximum) ? value : fallback;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  return Number.isInteger(value) && inRange(value, minimum, maximum) ? value : fallback;
}
