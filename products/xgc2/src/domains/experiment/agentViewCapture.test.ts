// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { captureErrorCode,PanelCaptureError,WORLD_CAMERA_PLUGIN_ID,resolveExperimentPanelCapture } from './agentViewCapture';

function panel(id: string, inner = '') {
  const node = document.createElement('section');
  node.dataset.xgcRole = 'experiment-panel';
  node.dataset.xgcId = id;
  node.innerHTML = inner;
  document.body.append(node);
  return node;
}

describe('explicit experiment view selection', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 320, height: 180, right: 320, bottom: 180, toJSON: () => ({}) });
  });
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

  it('returns the full camera panel, including controls, when panel was requested', () => {
    const element = panel('world-camera', '<button>Retry</button><video data-xgc-role="camera-video-stream"></video>');
    expect(resolveExperimentPanelCapture('world-camera', 'panel', document, WORLD_CAMERA_PLUGIN_ID)).toEqual({ kind: 'element', element });
  });
  it('can capture a stopped camera error panel but cannot read it as a camera frame', () => {
    panel('world-camera', '<p>Connecting</p>');
    expect(resolveExperimentPanelCapture('world-camera', 'panel').kind).toBe('element');
    expect(() => resolveExperimentPanelCapture('world-camera', 'camera', document, WORLD_CAMERA_PLUGIN_ID)).toThrowError(/camera_frame_unavailable/);
  });
  it.each(['display:none', 'visibility:hidden', 'opacity:0'])('rejects CSS-hidden panels (%s)', (style) => {
    panel('hidden').style.cssText = style;
    expect(() => resolveExperimentPanelCapture('hidden', 'panel')).toThrowError(/panel_not_visible/);
  });
  it('skips a hidden ancestor and selects the visible copy', () => {
    const hidden = document.createElement('div'); hidden.hidden = true; document.body.append(hidden);
    hidden.append(panel('instruments', 'hidden'));
    const visible = panel('instruments', 'visible');
    expect(resolveExperimentPanelCapture('instruments', 'panel')).toEqual({ kind: 'element', element: visible });
  });
  it('rejects detached nodes and panels with no layout box', () => {
    const detached = panel('detached'); detached.remove();
    expect(() => resolveExperimentPanelCapture('detached', 'panel')).toThrowError(/panel_not_visible/);
    const empty = panel('empty'); vi.spyOn(empty, 'getBoundingClientRect').mockReturnValue(new DOMRect());
    expect(() => resolveExperimentPanelCapture('empty', 'panel')).toThrowError(/panel_not_visible/);
  });
  it('rejects iframe panels explicitly', () => {
    panel('viz', '<iframe data-xgc-role="lichtblick-frame"></iframe>');
    expect(() => resolveExperimentPanelCapture('viz', 'panel')).toThrowError(/panel_view_unsupported/);
  });
  it('does not accept paused residual video frames', () => {
    const video = panel('world-camera', '<video data-xgc-role="camera-video-stream"></video>').querySelector('video')!;
    Object.defineProperties(video, { readyState: { value: 4 }, videoWidth: { value: 640 }, videoHeight: { value: 360 } });
    expect(video.paused).toBe(true);
    expect(() => resolveExperimentPanelCapture('world-camera', 'camera', document, WORLD_CAMERA_PLUGIN_ID)).toThrowError(/camera_frame_unavailable/);
  });
  it('does not guess a camera from an unrelated panel', () => {
    panel('instruments');
    expect(() => resolveExperimentPanelCapture('instruments', 'camera', document, 'robot-instruments-grid')).toThrowError(/camera_view_unsupported/);
  });
  it('reports rendering errors separately from visibility', () => {
    expect(captureErrorCode(new Error('tainted canvas'))).toBe('panel_capture_failed');
    expect(captureErrorCode(new PanelCaptureError('panel_not_visible'))).toBe('panel_not_visible');
  });
});
