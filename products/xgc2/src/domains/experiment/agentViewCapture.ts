export class PanelCaptureError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PanelCaptureError';
  }
}

export type ExperimentViewKind = 'panel' | 'camera';
export type ExperimentPanelCaptureTarget =
  | { kind: 'video'; video: HTMLVideoElement; panel: HTMLElement }
  | { kind: 'element'; element: HTMLElement };

export type ExperimentPanelCapture = {
  jpegBase64: string;
  width: number;
  height: number;
  kind: 'camera-frame' | 'panel';
};

const PREVIEW_EDGE = 1280;
const FRESH_FRAME_TIMEOUT_MS = 2000;
export const WORLD_CAMERA_PLUGIN_ID = 'gazebo-world-camera';

export function resolveExperimentPanelCapture(
  panelId: string,
  view: ExperimentViewKind,
  root: ParentNode = document,
  pluginId?: string,
): ExperimentPanelCaptureTarget {
  if (view !== 'panel' && view !== 'camera') throw new PanelCaptureError('invalid_view_kind');
  const panels = [...root.querySelectorAll<HTMLElement>(
    `[data-xgc-role="experiment-panel"][data-xgc-id="${cssEscape(panelId)}"]`,
  )];
  const panel = panels.find(isPanelVisible);
  if (!panel) throw new PanelCaptureError('panel_not_visible');
  if (view === 'panel') {
    if (panel.querySelector('iframe')) throw new PanelCaptureError('panel_view_unsupported');
    return { kind: 'element', element: panel };
  }
  if (pluginId !== WORLD_CAMERA_PLUGIN_ID) throw new PanelCaptureError('camera_view_unsupported');
  const video = panel.querySelector<HTMLVideoElement>('[data-xgc-role="camera-video-stream"]');
  if (!video || !isLiveVideo(video)) throw new PanelCaptureError('camera_frame_unavailable');
  return { kind: 'video', video, panel };
}

function isPanelVisible(panel: HTMLElement) {
  if (!panel.isConnected || panel.ownerDocument.visibilityState === 'hidden' || panel.closest('[hidden]')) return false;
  const rect = panel.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let node: HTMLElement | null = panel; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number.parseFloat(style.opacity) === 0) return false;
  }
  return true;
}

function isLiveVideo(video: HTMLVideoElement) {
  if (video.paused || video.ended || video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) return false;
  const stream = video.srcObject;
  return stream instanceof MediaStream && stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled && !track.muted);
}

export async function captureExperimentPanel(
  panelId: string,
  view: ExperimentViewKind,
  pluginId?: string,
  options: { root?: ParentNode; signal?: AbortSignal } = {},
): Promise<ExperimentPanelCapture> {
  const { root = document, signal } = options;
  signal?.throwIfAborted();
  const target = resolveExperimentPanelCapture(panelId, view, root, pluginId);
  let canvas: HTMLCanvasElement;
  if (target.kind === 'video') {
    await waitForAdvancingFrames(target.video, signal);
    if (!isPanelVisible(target.panel) || !isLiveVideo(target.video)) throw new PanelCaptureError('camera_frame_unavailable');
    canvas = videoPreview(target.video);
  } else {
    canvas = await rasterPanel(target.element);
    if (!isPanelVisible(target.element)) throw new PanelCaptureError('panel_not_visible');
  }
  try {
    signal?.throwIfAborted();
    const jpegBase64 = await canvasToBase64(canvas);
    signal?.throwIfAborted();
    return { jpegBase64, width: canvas.width, height: canvas.height, kind: target.kind === 'video' ? 'camera-frame' : 'panel' };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function captureErrorCode(error: unknown) {
  return error instanceof PanelCaptureError ? error.code : 'panel_capture_failed';
}

function waitForAdvancingFrames(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== 'function') return Promise.reject(new PanelCaptureError('camera_frame_unavailable'));
  return new Promise((resolve, reject) => {
    const deadline = AbortSignal.timeout(FRESH_FRAME_TIMEOUT_MS);
    let callbackId: number | undefined;
    let baseline: VideoFrameCallbackMetadata | undefined;
    const finish = (error?: Error) => {
      deadline.removeEventListener('abort', onTimeout);
      if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(new PanelCaptureError('capture_cancelled'));
    const onTimeout = () => finish(new PanelCaptureError('camera_frame_unavailable'));
    deadline.addEventListener('abort', onTimeout, { once: true });
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (!isLiveVideo(video)) { finish(new PanelCaptureError('camera_frame_unavailable')); return; }
      // Two callbacks with progressing timestamps exclude a queued old frame.
      if (baseline && metadata.presentedFrames > baseline.presentedFrames && metadata.mediaTime > baseline.mediaTime) {
        finish();
        return;
      }
      baseline = metadata;
      callbackId = video.requestVideoFrameCallback(onFrame);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    callbackId = video.requestVideoFrameCallback(onFrame);
  });
}

function previewSize(width: number, height: number) {
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

function videoPreview(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  const size = previewSize(video.videoWidth, video.videoHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new PanelCaptureError('camera_frame_unavailable');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function rasterPanel(panel: HTMLElement) {
  // The rasterizer is only needed when an agent captures a panel view; load
  // it before reading any frame so capture timing is unchanged once cached.
  const { default: html2canvas } = await import('html2canvas');
  // Reject unreadable canvases instead of returning a silently blank chart.
  for (const canvas of panel.querySelectorAll('canvas')) {
    if (!canvas.getContext('2d')) throw new PanelCaptureError('panel_view_unsupported');
    canvas.toDataURL();
  }
  const videos = [...panel.querySelectorAll('video')];
  const frames = videos.map((video) => {
    if (video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new PanelCaptureError('panel_capture_failed');
      context.drawImage(video, 0, 0);
      return canvas.toDataURL('image/png');
    } finally { canvas.width = 0; canvas.height = 0; }
  });
  const rect = panel.getBoundingClientRect();
  const size = previewSize(rect.width, rect.height);
  return html2canvas(panel, {
    logging: false,
    foreignObjectRendering: true,
    scale: size.scale,
    backgroundColor: null,
    imageTimeout: 2000,
    // Clone this panel and its ancestor layout, without mounting other apps.
    ignoreElements: (element) => element.tagName === 'IFRAME' || !(element === panel || element.contains(panel) || panel.contains(element)),
    onclone: async (_document, clonedPanel) => {
      // With inlineImages enabled by foreignObjectRendering, readable source
      // canvases become images; only the cloned videos remain as canvases.
      // Restore native dimensions so CSS object-fit/position still work.
      const clonedVideos = [...clonedPanel.querySelectorAll('canvas')];
      if (clonedVideos.length !== videos.length) throw new PanelCaptureError('panel_capture_failed');
      await Promise.all(clonedVideos.map(async (cloned, index) => {
        const frame = frames[index];
        if (!frame) return;
        const image = _document.createElement('img');
        image.style.cssText = cloned.style.cssText;
        image.src = frame;
        await image.decode();
        cloned.replaceWith(image);
      }));
    },
  });
}

async function canvasToBase64(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
  if (!blob) throw new PanelCaptureError('panel_capture_failed');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new PanelCaptureError('panel_capture_failed'));
    reader.readAsDataURL(blob);
  });
}

function cssEscape(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}
