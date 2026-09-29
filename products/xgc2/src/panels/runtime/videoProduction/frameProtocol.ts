/** Offline-only RPC. Nothing in this module controls a live player or ROS graph. */
import { videoRandomId } from './videoRandomId';

export const VIDEO_FRAME_CHANNEL = 'xgc2.offline-video';
export const VIDEO_FRAME_VERSION = 1;

export type FramePlan = {
  snapshotSha256: string;
  frameIndex: number;
  targetTimeNs: string;
  sourceFrameId: string;
  cameraTimeNs: string;
  width: number;
  height: number;
};
export type FrameRequest = {
  channel: typeof VIDEO_FRAME_CHANNEL;
  version: typeof VIDEO_FRAME_VERSION;
  type: 'render-frame';
  requestId: string;
  plan: FramePlan;
};
export type FrameReady = Omit<FrameRequest,'type'> & { type: 'frame-ready' };
export type FrameFailure = {
  channel: typeof VIDEO_FRAME_CHANNEL;
  version: typeof VIDEO_FRAME_VERSION;
  type: 'frame-error';
  requestId: string;
  error: string;
};

export interface FrameTransport {
  postMessage(message: FrameRequest,targetOrigin: string): void;
  subscribe(listener: (event: { origin: string;source: unknown;data: unknown }) => void): () => void;
  expectedSource: unknown;
}

function record(value: unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function token(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false;
  // Reject C0 control characters without a control-character regex literal.
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 0x20) return false;
  }
  return true;
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,29})$/.test(value);
}

export function isFramePlan(value: unknown): value is FramePlan {
  return record(value)
    && typeof value.snapshotSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.snapshotSha256)
    && Number.isSafeInteger(value.frameIndex) && (value.frameIndex as number) >= 0
    && timestamp(value.targetTimeNs) && timestamp(value.cameraTimeNs)
    && token(value.sourceFrameId)
    && Number.isSafeInteger(value.width) && (value.width as number) > 0 && (value.width as number) <= 16384
    && Number.isSafeInteger(value.height) && (value.height as number) > 0 && (value.height as number) <= 16384;
}

export function isFrameRequest(value: unknown): value is FrameRequest {
  return record(value) && value.channel === VIDEO_FRAME_CHANNEL && value.version === VIDEO_FRAME_VERSION
    && value.type === 'render-frame' && token(value.requestId) && isFramePlan(value.plan);
}

function samePlan(a: FramePlan,b: FramePlan) {
  return a.snapshotSha256 === b.snapshotSha256 && a.frameIndex === b.frameIndex
    && a.targetTimeNs === b.targetTimeNs && a.sourceFrameId === b.sourceFrameId
    && a.cameraTimeNs === b.cameraTimeNs && a.width === b.width && a.height === b.height;
}

/**
 * Readiness means the adapter completed state restore, decoding, resource loading,
 * draw and its GPU fence/readback. A seek ACK or iframe load is never accepted.
 * A timeout/abort taints this client: dispose/recreate the render page before retry.
 */
export function createFrameClient(options: {
  transport: FrameTransport;
  origin: string;
  timeoutMs?: number;
  requestIdPrefix?: string;
}) {
  const { transport,origin } = options;
  const parsed = new URL(origin);
  if (!['http:','https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new TypeError('An exact HTTP(S) origin is required');
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError('Invalid frame timeout');
  }
  let disposed = false;
  let tainted = false;
  let inFlight: ((error: Error) => void) | undefined;
  if (transport.expectedSource == null) throw new TypeError('An exact message source is required');
  const prefix = options.requestIdPrefix ?? videoRandomId();
  if (!token(prefix) || prefix.length > 220) throw new TypeError('Invalid request ID prefix');
  let sequence = 0;

  function requestFrame(plan: FramePlan,signal?: AbortSignal): Promise<FrameReady> {
    if (disposed || tainted) return Promise.reject(new Error('Render client must be recreated'));
    if (inFlight) return Promise.reject(new Error('A render request is already in flight'));
    if (!isFramePlan(plan)) return Promise.reject(new TypeError('Invalid frame plan'));
    if (signal?.aborted) return Promise.reject(new Error('Frame request aborted'));
    if (!Number.isSafeInteger(sequence)) return Promise.reject(new Error('Render client sequence exhausted'));
    const requestId = `${prefix}:${sequence++}`;
    const expected = { ...plan };
    const request: FrameRequest = {
      channel: VIDEO_FRAME_CHANNEL,version: VIDEO_FRAME_VERSION,type: 'render-frame',requestId,plan: { ...expected },
    };
    return new Promise<FrameReady>((resolve,reject) => {
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error,result?: FrameReady) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener('abort',abort);
        inFlight = undefined;
        if (error) { tainted = true;reject(error); }
        else if (result) resolve(result);
      };
      const abort = () => finish(new Error('Frame request aborted; recreate render page'));
      inFlight = (error) => finish(error);
      try {
        unsubscribe = transport.subscribe((event) => {
          if (event.origin !== origin || event.source !== transport.expectedSource || !record(event.data)) return;
          const value = event.data;
          if (value.channel !== VIDEO_FRAME_CHANNEL || value.version !== VIDEO_FRAME_VERSION || value.requestId !== requestId) return;
          if (value.type === 'frame-error') {
            finish(new Error(typeof value.error === 'string' ? value.error.slice(0,4096) : 'Frame rendering failed'));
          } else if (value.type === 'frame-ready') {
            if (!isFramePlan(value.plan) || !samePlan(expected,value.plan)) {
              finish(new Error('Rendered frame does not match the requested snapshot, source or dimensions'));
              return;
            }
            finish(undefined,{ ...request,type: 'frame-ready',plan: { ...value.plan } });
          }
        });
        timer = setTimeout(() => finish(new Error('Frame rendering timed out; recreate render page')),timeoutMs);
        signal?.addEventListener('abort',abort,{ once: true });
        if (signal?.aborted) abort();
        else transport.postMessage(request,origin);
      } catch (cause) {
        finish(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  return {
    requestFrame,
    dispose() {
      disposed = true;
      inFlight?.(new Error('Render client disposed'));
    },
  };
}

export function browserFrameTransport(frame: Window,eventWindow: Window): FrameTransport {
  return {
    expectedSource: frame,
    postMessage: (message,origin) => frame.postMessage(message,origin),
    subscribe(listener) {
      const receive = (event: MessageEvent<unknown>) => listener(event);
      eventWindow.addEventListener('message',receive);
      return () => eventWindow.removeEventListener('message',receive);
    },
  };
}
