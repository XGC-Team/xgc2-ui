import { describe,expect,it } from 'vitest';
import {
  LICHTBLICK_DEFAULT_LAYOUT_MODE,
  LICHTBLICK_LAYOUT_DEFAULTS,
  LICHTBLICK_LAYOUT_MODE_OPTIONS,
  LICHTBLICK_LAYOUT_MODES,
  lichtblickLayoutModeLabel,
  lichtblickLayoutOptions,
  lichtblickLayoutPresentation,
  validateLichtblickLayoutOptions,
} from './lichtblickLayoutOptions';

describe('lichtblickLayoutOptions', () => {
  it('applies launch defaults while refusing to invent a required marker color', () => {
    expect(lichtblickLayoutOptions({ dashboard: 'gcs' })).toEqual({
      ...LICHTBLICK_LAYOUT_DEFAULTS,
      markerColor: '',
    });
    expect(validateLichtblickLayoutOptions({ dashboard: 'gcs' })).toContain('Marker color is required');
  });

  it('preserves valid typed layout options and canonicalizes color', () => {
    expect(lichtblickLayoutOptions({
      layoutMode: '3d-camera-ar',gridVisible: true,gridColor: '#A1B2C3',gridSize: 25.5,gridDivisions: 40,gridLineWidth: 2,
      axesVisible: true,axesScale: 2.5,markerColor: '#DDEEFF',
    })).toEqual({
      layoutMode: '3d-camera-ar',gridVisible: true,gridColor: '#a1b2c3',gridSize: 25.5,gridDivisions: 40,gridLineWidth: 2,
      axesVisible: true,axesScale: 2.5,markerColor: '#ddeeff',plotPaths:[],
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
    expect(validateLichtblickLayoutOptions({ gridColor: 'blue' })).toContain('hexadecimal');
    expect(validateLichtblickLayoutOptions({ gridDivisions: 1.5 })).toContain('integer');
    expect(validateLichtblickLayoutOptions({ gridSize: 0 })).toContain('between');
    expect(validateLichtblickLayoutOptions({ axesScale: 0 })).toContain('World axis size');
    expect(validateLichtblickLayoutOptions({ layoutMode: 'camera' })).toContain('Initial layout');
    expect(validateLichtblickLayoutOptions({ markerColor: 'black' })).toContain('Marker color');
    expect(validateLichtblickLayoutOptions(LICHTBLICK_LAYOUT_DEFAULTS)).toBe('');
  });
});
