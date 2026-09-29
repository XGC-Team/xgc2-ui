import { describe,expect,it } from 'vitest';
import {
  LICHTBLICK_DEFAULT_LAYOUT_MODE,
  LICHTBLICK_LAYOUT_DEFAULTS,
  LICHTBLICK_LAYOUT_MODE_OPTIONS,
  LICHTBLICK_LAYOUT_MODES,
  lichtblickLayoutModeLabel,
  lichtblickLayoutOptions,
  lichtblickLayoutPresentation,
  lichtblickPanelOptionsNeedRewrite,
  persistLichtblickPanelOptions,
  validateLichtblickLayoutOptions,
} from './lichtblickLayoutOptions';

describe('lichtblickLayoutOptions', () => {
  it('applies launch defaults including the AR11 text color', () => {
    expect(lichtblickLayoutOptions({ dashboard: 'gcs' })).toEqual(LICHTBLICK_LAYOUT_DEFAULTS);
    expect(validateLichtblickLayoutOptions({ dashboard: 'gcs' })).toBe('');
    expect(validateLichtblickLayoutOptions({ markerColor: '' })).toBe('');
    expect(validateLichtblickLayoutOptions({ markerBackgroundColor: '' })).toBe('');
    expect(LICHTBLICK_LAYOUT_DEFAULTS.markerColor).toBe('#00a2ff');
    expect(LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundColor).toBe('#000000');
    expect(LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundVisible).toBe(false);
    expect(LICHTBLICK_LAYOUT_DEFAULTS.predictionLineWidth).toBe(0.01);
    expect(LICHTBLICK_LAYOUT_DEFAULTS.predictionAxisScale).toBe(0.15);
  });

  it('persists Scout history colors without requiring an authored text color', () => {
    const scoutPalette = [...LICHTBLICK_LAYOUT_DEFAULTS.scoutPalette];
    scoutPalette[0] = '#123456';
    const saved = persistLichtblickPanelOptions({ dashboard: 'gcs' }, { scoutPalette });
    expect(saved.markerColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerColor);
    expect(saved.scoutPalette).toEqual(scoutPalette);
    expect(validateLichtblickLayoutOptions(saved)).toBe('');
    expect(persistLichtblickPanelOptions({ markerColor: '' }).markerColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerColor);
    expect(persistLichtblickPanelOptions({}, { markerColor: '' }).markerColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerColor);
    expect(persistLichtblickPanelOptions({ markerBackgroundColor: '' }).markerBackgroundColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundColor);
    expect(persistLichtblickPanelOptions({}, { markerBackgroundColor: '' }).markerBackgroundColor).toBe(LICHTBLICK_LAYOUT_DEFAULTS.markerBackgroundColor);
    expect(persistLichtblickPanelOptions({ markerBackgroundVisible: false }).markerBackgroundVisible).toBe(false);
  });

  it('preserves valid typed layout options and canonicalizes color', () => {
    expect(lichtblickLayoutOptions({
      layoutMode: '3d-camera-ar',gridVisible: true,gridColor: '#A1B2C3',gridSize: 25.5,gridDivisions: 40,gridLineWidth: 2,
      axesVisible: true,axesScale: 2.5,predictionLineWidth: 0.03,predictionAxisScale: 0.25,
      markerColor: '#DDEEFF',markerBackgroundVisible: false,markerBackgroundColor: '#112233',
    })).toEqual({
      ...LICHTBLICK_LAYOUT_DEFAULTS,
      layoutMode: '3d-camera-ar',gridVisible: true,gridColor: '#a1b2c3',gridSize: 25.5,gridDivisions: 40,gridLineWidth: 2,
      axesVisible: true,axesScale: 2.5,predictionLineWidth: 0.03,predictionAxisScale: 0.25,
      markerColor: '#ddeeff',markerBackgroundVisible: false,markerBackgroundColor: '#112233',plotPaths:[],
    });
  });

  it('does not project retired camera topic overrides into persisted panel options', () => {
    const projected = lichtblickLayoutOptions({
      ...LICHTBLICK_LAYOUT_DEFAULTS,
      cameraImageTopic:'/usb_cam/video',
      cameraInfoTopic:'/usb_cam/camera_info',
    });
    expect(projected).toEqual(LICHTBLICK_LAYOUT_DEFAULTS);
    expect(projected).not.toHaveProperty('cameraImageTopic');
    expect(projected).not.toHaveProperty('cameraInfoTopic');
  });

  it('defaults missing layoutMode to a vertical 3D-over-augmented stack', () => {
    expect(LICHTBLICK_DEFAULT_LAYOUT_MODE).toBe('3d-above-camera-ar');
    expect(LICHTBLICK_LAYOUT_DEFAULTS.layoutMode).toBe(LICHTBLICK_DEFAULT_LAYOUT_MODE);
    const fallback = lichtblickLayoutOptions({ dashboard: 'gcs' });
    expect(fallback.layoutMode).toBe(LICHTBLICK_DEFAULT_LAYOUT_MODE);
    const option = LICHTBLICK_LAYOUT_MODE_OPTIONS.find((entry) => entry.value === fallback.layoutMode);
    expect(option?.arrangement).toBe('column');
    expect(option?.panes.map((pane) => pane.kind)).toEqual(['3d','camera']);
  });

  it('projects the provisioning-facing pane contract without inventing viewer configuration', () => {
    expect(lichtblickLayoutPresentation(LICHTBLICK_DEFAULT_LAYOUT_MODE)).toEqual({
      mode: '3d-above-camera-ar',arrangement: 'column',firstPane: '3d',secondPane: 'camera',thirdPane: '',
    });
    expect(lichtblickLayoutPresentation('camera-ar-above-3d')).toEqual({
      mode: 'camera-ar-above-3d',arrangement: 'column',firstPane: 'camera',secondPane: '3d',thirdPane: '',
    });
    expect(lichtblickLayoutPresentation('3d-above-camera-ar-plot')).toEqual({
      mode: '3d-above-camera-ar-plot',arrangement: 'column-split',firstPane: '3d',secondPane: 'camera',thirdPane: 'plot',
    });
    expect(lichtblickLayoutPresentation('not-a-layout')).toEqual({
      mode: '3d',arrangement: 'single',firstPane: '3d',secondPane: '',thirdPane: '',
    });
  });

  it('preserves an operator-saved layoutMode and does not migrate it', () => {
    expect(lichtblickLayoutOptions({ layoutMode: '3d-camera-ar' }).layoutMode).toBe('3d-camera-ar');
    expect(lichtblickLayoutOptions({ layoutMode: 'camera-ar-3d' }).layoutMode).toBe('camera-ar-3d');
    expect(lichtblickLayoutOptions({ layoutMode: 'camera-ar-above-3d' }).layoutMode).toBe('camera-ar-above-3d');
    expect(lichtblickLayoutOptions({ layoutMode: '3d' }).layoutMode).toBe('3d');
  });

  it('exposes card metadata for every layout mode used by the options editor', () => {
    expect(LICHTBLICK_LAYOUT_MODE_OPTIONS.map((option) => option.value)).toEqual([...LICHTBLICK_LAYOUT_MODES]);
    expect(LICHTBLICK_LAYOUT_MODE_OPTIONS.every((option) => option.panes.length >= 1)).toBe(true);
    expect(lichtblickLayoutModeLabel('3d-above-camera-ar')).toBe('3D / Augmented');
  });

  it('accepts pure 3D, two-pane arrangements, and the Plot split', () => {
    expect(LICHTBLICK_LAYOUT_MODES).toEqual([
      '3d',
      '3d-camera-ar',
      'camera-ar-3d',
      '3d-above-camera-ar',
      'camera-ar-above-3d',
      '3d-above-camera-ar-plot',
    ]);
    for (const layoutMode of LICHTBLICK_LAYOUT_MODES) {
      expect(validateLichtblickLayoutOptions({
        ...LICHTBLICK_LAYOUT_DEFAULTS,
        layoutMode,
      })).toBe('');
    }
  });

  it('rejects values which cannot enter a protected workflow Run', () => {
    expect(lichtblickLayoutOptions({ uavHeightProjection:false }).uavHeightProjection).toBe(false);
    expect(lichtblickLayoutOptions({}).uavHeightProjection).toBe(true);
    expect(validateLichtblickLayoutOptions({ ...LICHTBLICK_LAYOUT_DEFAULTS,uavHeightProjection:'false' })).toContain('must be boolean');
    expect(validateLichtblickLayoutOptions({ gridColor: 'blue' })).toContain('hexadecimal');
    expect(validateLichtblickLayoutOptions({ gridDivisions: 1.5 })).toContain('integer');
    expect(validateLichtblickLayoutOptions({ gridSize: 0 })).toContain('between');
    expect(validateLichtblickLayoutOptions({ axesScale: 0 })).toContain('World axis size');
    expect(validateLichtblickLayoutOptions({ worldBoundaryMode: 'ceiling' })).toContain('World fence display');
    expect(validateLichtblickLayoutOptions({ predictionLineWidth: 0 })).toContain('Prediction line width');
    expect(validateLichtblickLayoutOptions({ predictionAxisScale: 0 })).toContain('Prediction axis size');
    expect(validateLichtblickLayoutOptions({ layoutMode: 'camera' })).toContain('Initial layout');
    expect(validateLichtblickLayoutOptions({ markerColor: 'black' })).toContain('Text color');
    expect(validateLichtblickLayoutOptions({ markerBackgroundColor: 'black' })).toContain('Background color');
    expect(validateLichtblickLayoutOptions({ markerBackgroundVisible: 'true' })).toContain('Show background');
    expect(validateLichtblickLayoutOptions(LICHTBLICK_LAYOUT_DEFAULTS)).toBe('');
  });

  it('ignores a retired history window and always projects world axes on', () => {
    expect(lichtblickLayoutOptions({ historyWindowSec:10,axesVisible:false })).toEqual(LICHTBLICK_LAYOUT_DEFAULTS);
    expect(lichtblickLayoutOptions({}).axesVisible).toBe(true);
    expect(validateLichtblickLayoutOptions({ ...LICHTBLICK_LAYOUT_DEFAULTS,historyWindowSec:0 })).toBe('');
    expect(validateLichtblickLayoutOptions({ ...LICHTBLICK_LAYOUT_DEFAULTS,uavPalette:[] })).toContain('palettes');
  });

  it('strips the retired history window when persisting panel options', () => {
    expect(persistLichtblickPanelOptions({
      ...LICHTBLICK_LAYOUT_DEFAULTS,
      historyWindowSec:60,
      axesVisible:false,
    })).toEqual({ ...LICHTBLICK_LAYOUT_DEFAULTS,axesVisible:true });
    expect(lichtblickPanelOptionsNeedRewrite({ ...LICHTBLICK_LAYOUT_DEFAULTS,historyWindowSec:60 })).toBe(true);
    expect(lichtblickPanelOptionsNeedRewrite({ ...LICHTBLICK_LAYOUT_DEFAULTS,axesVisible:false })).toBe(true);
    expect(lichtblickPanelOptionsNeedRewrite(LICHTBLICK_LAYOUT_DEFAULTS)).toBe(false);
  });

  it('migrates the retired fence switch into the tri-state display mode', () => {
    expect(lichtblickLayoutOptions({}).worldBoundaryMode).toBe('walls');
    expect(lichtblickLayoutOptions({ worldBoundaryVisible:true }).worldBoundaryMode).toBe('walls');
    expect(lichtblickLayoutOptions({ worldBoundaryVisible:false }).worldBoundaryMode).toBe('off');
    expect(lichtblickLayoutOptions({ worldBoundaryMode:'ground' }).worldBoundaryMode).toBe('ground');
    expect(persistLichtblickPanelOptions({ worldBoundaryVisible:false }))
      .toEqual({ ...LICHTBLICK_LAYOUT_DEFAULTS,worldBoundaryMode:'off' });
    expect(persistLichtblickPanelOptions({ ...LICHTBLICK_LAYOUT_DEFAULTS,worldBoundaryVisible:false }))
      .toEqual(LICHTBLICK_LAYOUT_DEFAULTS);
    expect(lichtblickPanelOptionsNeedRewrite({ ...LICHTBLICK_LAYOUT_DEFAULTS,worldBoundaryVisible:true })).toBe(true);
    expect(lichtblickPanelOptionsNeedRewrite(LICHTBLICK_LAYOUT_DEFAULTS)).toBe(false);
  });

  it('validates label units, finite values and zero opacity or offsets', () => {
    const options = { ...LICHTBLICK_LAYOUT_DEFAULTS,labelScaleInvariant:true,labelFontSizeMeters:0.4,labelFontSizePixels:28,markerOpacity:0,uavLabelOffset:0,mecanumLabelOffset:-0.4 };
    expect(lichtblickLayoutOptions(options)).toEqual(options);
    expect(validateLichtblickLayoutOptions(options)).toBe('');
    for (const patch of [{ labelFontSizeMeters:0 },{ labelFontSizePixels:0.24 },{ markerOpacity:1.01 },{ uavLabelOffset:NaN },{ scoutLabelOffset:Infinity },{ mecanumLabelOffset:-11 },{ labelScaleInvariant:'true' }]) {
      expect(validateLichtblickLayoutOptions({ ...options,...patch })).not.toBe('');
    }
  });
});
