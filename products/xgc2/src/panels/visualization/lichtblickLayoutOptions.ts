import { externalVisualizationThemeDefaults } from '../../theme';
import { validSceneNamespace } from './lichtblickSceneBridge';

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

export const LICHTBLICK_WORLD_BOUNDARY_MODES = ['off','ground','walls'] as const;

export type LichtblickWorldBoundaryMode = typeof LICHTBLICK_WORLD_BOUNDARY_MODES[number];

export const LICHTBLICK_LABEL_OPTION_KEYS = [
  'markerColor','markerBackgroundVisible','markerBackgroundColor','labelScaleInvariant','labelFontSizeMeters','labelFontSizePixels',
  'markerOpacity','uavLabelOffset','scoutLabelOffset','mecanumLabelOffset',
] as const;

export const LICHTBLICK_SCENE_OPTION_KEYS = [...LICHTBLICK_LABEL_OPTION_KEYS,'uavHeightProjection','sceneNamespace'] as const;

/** Presentation fields the options editor owns. Workflow inputs are a one-way derive of these. */
export const LICHTBLICK_PRESENTATION_OPTION_KEYS = [
  'layoutMode','sceneNamespace',
  'gridVisible','gridColor','gridSize','gridDivisions','gridLineWidth',
  'axesVisible','axesScale','scoutModelScale','px4ModelScale','mecanumModelScale',
  'worldBoundaryMode','predictionLineWidth','predictionAxisScale',
  'uavPalette','scoutPalette','mecanumPalette','plotPaths',
  'uavHeightProjection',
  ...LICHTBLICK_LABEL_OPTION_KEYS,
] as const;

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
  sceneNamespace: '',
  layoutMode: LICHTBLICK_DEFAULT_LAYOUT_MODE,
  gridVisible: true,
  // Neutral grey grid (not brand blue); size/divisions 3× the previous 10 m / 10.
  gridColor: externalVisualizationThemeDefaults.gridColor,
  gridSize: 30,
  gridDivisions: 30,
  gridLineWidth: 1,
  axesVisible: true,
  axesScale: 1,
  // Viewer-only 3D display factors per robot kind. Gazebo, collisions, camera
  // AR projection, and TF keep true dimensions; the Image pane never scales.
  // FS150 multirotors default to 2×: they are tiny against an open field.
  scoutModelScale: 1,
  px4ModelScale: 2,
  mecanumModelScale: 1,
  worldBoundaryMode: 'walls' as LichtblickWorldBoundaryMode,
  predictionLineWidth: 0.01,
  predictionAxisScale: 0.15,
  // Overhead identity text. Default OS13 amber, no plate (markerBackgroundVisible).
  markerColor: externalVisualizationThemeDefaults.markerColor,
  markerBackgroundVisible: false,
  markerBackgroundColor: externalVisualizationThemeDefaults.markerBackgroundColor,
  labelScaleInvariant: false,
  labelFontSizeMeters: 0.24,
  labelFontSizePixels: 16,
  markerOpacity: 1,
  uavLabelOffset: 0.55,
  scoutLabelOffset: 0.65,
  mecanumLabelOffset: 0.32,
  uavHeightProjection: true,
  uavPalette: ["#f2003c", "#ff7043", "#ab47bc", "#ec407a", "#7e57c2", "#ef5350", "#ffa726", "#d4e157"] as string[],
  scoutPalette: ["#cbab01", "#8bc34a", "#ffca28", "#66bb6a", "#c0ca33", "#26a69a", "#d4a373", "#a1887f"] as string[],
  mecanumPalette: ["#288f8c", "#29b6f6", "#5c6bc0", "#26c6da", "#42a5f5", "#7e57c2", "#80cbc4", "#90caf9"] as string[],
  plotPaths: [] as string[],
} as const;

export const LICHTBLICK_PLOT_PATH_PATTERN = /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\])?)+$/;
export const LICHTBLICK_MAXIMUM_PLOT_PATHS = 16;

export type LichtblickLayoutOptions = {
  sceneNamespace: string;
  layoutMode: LichtblickLayoutMode;
  gridVisible: boolean;
  gridColor: string;
  gridSize: number;
  gridDivisions: number;
  gridLineWidth: number;
  axesVisible: boolean;
  axesScale: number;
  scoutModelScale: number;
  px4ModelScale: number;
  mecanumModelScale: number;
  worldBoundaryMode: LichtblickWorldBoundaryMode;
  predictionLineWidth: number;
  predictionAxisScale: number;
  markerColor: string;
  markerBackgroundVisible: boolean;
  markerBackgroundColor: string;
  labelScaleInvariant: boolean;
  labelFontSizeMeters: number;
  labelFontSizePixels: number;
  markerOpacity: number;
  uavLabelOffset: number;
  scoutLabelOffset: number;
  mecanumLabelOffset: number;
  uavHeightProjection: boolean;
  uavPalette: string[];
  scoutPalette: string[];
  mecanumPalette: string[];
  plotPaths: string[];
};

export function lichtblickLayoutOptions(options: Record<string,unknown>): LichtblickLayoutOptions {
  return {
    sceneNamespace: validSceneNamespace(options.sceneNamespace) ? options.sceneNamespace : '',
    layoutMode: validLayoutMode(options.layoutMode)
      ? options.layoutMode
      : LICHTBLICK_LAYOUT_DEFAULTS.layoutMode,
    gridVisible: typeof options.gridVisible === 'boolean' ? options.gridVisible : LICHTBLICK_LAYOUT_DEFAULTS.gridVisible,
    gridColor: validColor(options.gridColor) ? options.gridColor.toLowerCase() : LICHTBLICK_LAYOUT_DEFAULTS.gridColor,
    gridSize: boundedNumber(options.gridSize, 0.1, 100000, LICHTBLICK_LAYOUT_DEFAULTS.gridSize),
    gridDivisions: boundedInteger(options.gridDivisions, 1, 10000, LICHTBLICK_LAYOUT_DEFAULTS.gridDivisions),
    gridLineWidth: boundedNumber(options.gridLineWidth, 0.1, 100, LICHTBLICK_LAYOUT_DEFAULTS.gridLineWidth),
    axesVisible: true,
    axesScale: boundedNumber(options.axesScale, 0.01, 100000, LICHTBLICK_LAYOUT_DEFAULTS.axesScale),
    scoutModelScale: boundedNumber(options.scoutModelScale, 0.1, 20, LICHTBLICK_LAYOUT_DEFAULTS.scoutModelScale),
    px4ModelScale: boundedNumber(options.px4ModelScale, 0.1, 20, LICHTBLICK_LAYOUT_DEFAULTS.px4ModelScale),
    mecanumModelScale: boundedNumber(options.mecanumModelScale, 0.1, 20, LICHTBLICK_LAYOUT_DEFAULTS.mecanumModelScale),
    worldBoundaryMode: validWorldBoundaryMode(options.worldBoundaryMode)
      ? options.worldBoundaryMode
      // Legacy boolean panel option: explicitly hidden stays hidden; a visible
      // ground-only fence migrates to the current default (walls).
      : options.worldBoundaryVisible === false
        ? 'off'
        : LICHTBLICK_LAYOUT_DEFAULTS.worldBoundaryMode,
    predictionLineWidth: boundedNumber(options.predictionLineWidth, 0.001, 1, LICHTBLICK_LAYOUT_DEFAULTS.predictionLineWidth),
    predictionAxisScale: boundedNumber(options.predictionAxisScale, 0.01, 10, LICHTBLICK_LAYOUT_DEFAULTS.predictionAxisScale),
    markerColor: validColor(options.markerColor)
      ? options.markerColor.toLowerCase()
      : LICHTBLICK_LAYOUT_DEFAULTS.markerColor,
    markerBackgroundVisible: typeof options.markerBackgroundVisible === 'boolean'
      ? options.markerBackgroundVisible
      : LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundVisible,
    markerBackgroundColor: validColor(options.markerBackgroundColor)
      ? options.markerBackgroundColor.toLowerCase()
      : LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundColor,
    labelScaleInvariant: typeof options.labelScaleInvariant === 'boolean' ? options.labelScaleInvariant : LICHTBLICK_LAYOUT_DEFAULTS.labelScaleInvariant,
    labelFontSizeMeters: boundedNumber(options.labelFontSizeMeters, 0.01, 10, LICHTBLICK_LAYOUT_DEFAULTS.labelFontSizeMeters),
    labelFontSizePixels: boundedNumber(options.labelFontSizePixels, 1, 256, LICHTBLICK_LAYOUT_DEFAULTS.labelFontSizePixels),
    markerOpacity: boundedNumber(options.markerOpacity, 0, 1, LICHTBLICK_LAYOUT_DEFAULTS.markerOpacity),
    uavLabelOffset: boundedNumber(options.uavLabelOffset, -10, 10, LICHTBLICK_LAYOUT_DEFAULTS.uavLabelOffset),
    scoutLabelOffset: boundedNumber(options.scoutLabelOffset, -10, 10, LICHTBLICK_LAYOUT_DEFAULTS.scoutLabelOffset),
    mecanumLabelOffset: boundedNumber(options.mecanumLabelOffset, -10, 10, LICHTBLICK_LAYOUT_DEFAULTS.mecanumLabelOffset),
    uavHeightProjection: typeof options.uavHeightProjection === 'boolean' ? options.uavHeightProjection : LICHTBLICK_LAYOUT_DEFAULTS.uavHeightProjection,
    uavPalette: validPalette(options.uavPalette) ? options.uavPalette.map((color) => color.toLowerCase()) : [...LICHTBLICK_LAYOUT_DEFAULTS.uavPalette],
    scoutPalette: validPalette(options.scoutPalette) ? options.scoutPalette.map((color) => color.toLowerCase()) : [...LICHTBLICK_LAYOUT_DEFAULTS.scoutPalette],
    mecanumPalette: validPalette(options.mecanumPalette) ? options.mecanumPalette.map((color) => color.toLowerCase()) : [...LICHTBLICK_LAYOUT_DEFAULTS.mecanumPalette],
    plotPaths: canonicalPlotPaths(options.plotPaths),
  };
}

export function validateLichtblickLayoutOptions(options: Record<string,unknown>) {
  if (options.sceneNamespace!==undefined && options.sceneNamespace!=='' && !validSceneNamespace(options.sceneNamespace)) return 'Scene namespace must be an absolute ROS namespace, or blank for no scene.';
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
  for (const [key, label] of [['scoutModelScale','Scout'],['px4ModelScale','PX4'],['mecanumModelScale','Mecanum']] as const) {
    if (options[key] !== undefined && !inRange(options[key], 0.1, 20)) return `${label} model scale must be between 0.1 and 20.`;
  }
  if (options.worldBoundaryMode !== undefined && !validWorldBoundaryMode(options.worldBoundaryMode)) {
    return 'World fence display must be off, ground, or walls.';
  }
  if (options.predictionLineWidth !== undefined && !inRange(options.predictionLineWidth, 0.001, 1)) {
    return 'Prediction line width must be between 0.001 and 1.';
  }
  if (options.predictionAxisScale !== undefined && !inRange(options.predictionAxisScale, 0.01, 10)) {
    return 'Prediction axis size must be between 0.01 and 10.';
  }
  if (options.markerColor !== undefined && options.markerColor !== '' && !validColor(options.markerColor)) {
    return 'Text color must use six-digit hexadecimal RGB notation.';
  }
  if (options.markerBackgroundVisible !== undefined && typeof options.markerBackgroundVisible !== 'boolean') {
    return 'Show background must be boolean.';
  }
  if (options.markerBackgroundColor !== undefined && options.markerBackgroundColor !== '' && !validColor(options.markerBackgroundColor)) {
    return 'Background color must use six-digit hexadecimal RGB notation.';
  }
  if (options.labelScaleInvariant !== undefined && typeof options.labelScaleInvariant !== 'boolean') return 'Fixed screen size must be boolean.';
  if (options.labelFontSizeMeters !== undefined && !inRange(options.labelFontSizeMeters, 0.01, 10)) return 'Font size in meters must be between 0.01 and 10.';
  if (options.labelFontSizePixels !== undefined && !inRange(options.labelFontSizePixels, 1, 256)) return 'Font size in pixels must be between 1 and 256.';
  if (options.markerOpacity !== undefined && !inRange(options.markerOpacity, 0, 1)) return 'Text opacity must be between 0 and 1.';
  if (options.uavLabelOffset !== undefined && !inRange(options.uavLabelOffset, -10, 10)) return 'UAV vertical offset must be between -10 and 10.';
  if (options.scoutLabelOffset !== undefined && !inRange(options.scoutLabelOffset, -10, 10)) return 'Scout vertical offset must be between -10 and 10.';
  if (options.mecanumLabelOffset !== undefined && !inRange(options.mecanumLabelOffset, -10, 10)) return 'Mecanum vertical offset must be between -10 and 10.';
  if (options.uavHeightProjection !== undefined && typeof options.uavHeightProjection !== 'boolean') return 'UAV height projection must be boolean.';
  for (const key of ['uavPalette','scoutPalette','mecanumPalette']) {
    if (options[key] !== undefined && !validPalette(options[key])) return 'History palettes require 1 to 32 hexadecimal RGB colors.';
  }
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

/** Panel-options persist shape: presentation only, world axes always on, retired history window stripped. */
export function persistLichtblickPanelOptions(
  options: Record<string,unknown>,
  patch: Record<string,unknown> = {},
): Record<string,unknown> {
  const layout = lichtblickLayoutOptions({ ...options,...patch });
  const next: Record<string,unknown> = {
    ...(typeof options.dashboard === 'string' ? { dashboard:options.dashboard } : {}),
    ...(typeof options.gridColumns === 'number' ? { gridColumns:options.gridColumns } : {}),
    ...layout,
    ...patch,
    axesVisible: true,
    markerColor: layout.markerColor,
    markerBackgroundVisible: layout.markerBackgroundVisible,
    markerBackgroundColor: layout.markerBackgroundColor,
  };
  delete next.historyWindowSec;
  delete next.worldBoundaryVisible;
  if (Object.hasOwn(patch,'sceneNamespace') && !validSceneNamespace(patch.sceneNamespace)) {
    next.sceneNamespace = '';
  }
  return next;
}

export function lichtblickPanelOptionsNeedRewrite(options: Record<string,unknown>): boolean {
  return Object.hasOwn(options,'historyWindowSec') || Object.hasOwn(options,'worldBoundaryVisible') || options.axesVisible === false;
}

function validLayoutMode(value: unknown): value is LichtblickLayoutOptions['layoutMode'] {
  return LICHTBLICK_LAYOUT_MODES.includes(value as LichtblickLayoutOptions['layoutMode']);
}

function validWorldBoundaryMode(value: unknown): value is LichtblickWorldBoundaryMode {
  return LICHTBLICK_WORLD_BOUNDARY_MODES.includes(value as LichtblickWorldBoundaryMode);
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

function validPalette(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 32 && value.every(validColor);
}
