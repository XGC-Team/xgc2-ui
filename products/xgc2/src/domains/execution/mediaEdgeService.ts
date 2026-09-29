import { HTTPError,requestCookieResponse,requestExternalJSON,requestStationResponse } from '../../api/http';

export const MEDIA_EDGE_CONTROL_DATA_CHANNEL = 'xgc-media-control.v1';

const maximumSDPBytes = 256 << 10;
const safeMediaID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const absoluteHTTPOrigin = /^https?:\/\/[^/?#]+\/?$/i;

export type MediaEdgeSessionReference = {
  edgeUrl: string;
  sourceId: string;
};

/**
 * Signaling channel abstraction: how the browser opens/closes one Media Edge
 * WebRTC session. The classic channel posts to an absolute edge origin; the
 * same-origin channel (Core visualization proxy or shared access listener)
 * keeps guests off loopback edgeUrl values. Signaling success only means the
 * HTTP answer arrived — ICE connectivity is established separately.
 */
export type MediaEdgeSignalingChannel = {
  open: (offerSDP: string, signal?: AbortSignal) => Promise<MediaEdgeSessionAnswer>;
  close: (sessionId: string, signal?: AbortSignal) => Promise<void>;
};

export type MediaEdgeSameOriginSignalingReference = {
  /** Same-origin relative API path that accepts the SDP offer POST. */
  sessionsPath: string;
  /** Same-origin relative API path prefix; DELETE {prefix}/{sessionId}. */
  sessionPathPrefix: string;
  sourceId: string;
};

export type MediaEdgeSourceDescription = {
  id: string;
  width: number;
  height: number;
  fps: number;
  frameId: string;
  codec: 'H264';
};

export type MediaEdgeSessionAnswer = {
  sessionId: string;
  sdp: string;
  dataChannelLabel: typeof MEDIA_EDGE_CONTROL_DATA_CHANNEL;
  source: MediaEdgeSourceDescription;
};

export type MediaEdgeSessionControllerOptions = {
  /** Absolute-edge signaling; exactly one of reference / signaling is required. */
  reference?: MediaEdgeSessionReference;
  /** Pre-built signaling channel (e.g. same-origin station transport). */
  signaling?: MediaEdgeSignalingChannel;
  onStream: (stream: MediaStream,track: MediaStreamTrack) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  iceGatheringTimeoutMs?: number;
};

export type MediaEdgeSessionControllerDependencies = {
  peerConnectionFactory?: () => RTCPeerConnection;
  mediaStreamFactory?: (tracks: MediaStreamTrack[]) => MediaStream;
  openSession?: typeof openMediaEdgeSession;
  closeSession?: typeof closeMediaEdgeSession;
};

export type MediaEdgeSessionState = 'connecting' | 'connected' | 'failed' | 'closed';
export type MediaEdgeSessionCloseReason = 'consumer-unmounted' | 'owner-stopping' | 'connection-failed';

export type CreateMediaEdgeSessionOptions = {
  /** Required without a signaling channel. */
  edgeUrl?: string;
  /** Required without a signaling channel. */
  sourceId?: string;
  signaling?: MediaEdgeSignalingChannel;
  onTrack: (stream: MediaStream,track: MediaStreamTrack) => void;
  onStateChange?: (state: MediaEdgeSessionState) => void;
  signal?: AbortSignal;
  iceGatheringTimeoutMs?: number;
};

export type MediaEdgeSessionHandle = {
  answer: MediaEdgeSessionAnswer;
  close: (reason?: MediaEdgeSessionCloseReason) => Promise<void>;
};

export function mediaEdgeSourceSessionsURL(reference: MediaEdgeSessionReference) {
  const validated = validateReference(reference);
  return `${validated.edgeUrl}/api/v1/sources/${encodeURIComponent(validated.sourceId)}/sessions`;
}

export function mediaEdgeSessionURL(reference: MediaEdgeSessionReference, sessionId: string) {
  const validated = validateReference(reference);
  return `${validated.edgeUrl}/api/v1/sessions/${encodeURIComponent(mediaID(sessionId, 'sessionId'))}`;
}

export async function openMediaEdgeSession(
  reference: MediaEdgeSessionReference,
  offerSDP: string,
  signal?: AbortSignal,
) {
  const validated = validateReference(reference);
  const sdp = boundedSDP(offerSDP, 'offer.sdp');
  const payload = await requestExternalJSON<unknown>(
    mediaEdgeSourceSessionsURL(validated),
    { method: 'POST',cache: 'no-store',body: JSON.stringify({ sdp }),signal },
  );
  return decodeMediaEdgeSessionAnswer(payload, validated.sourceId);
}

export async function closeMediaEdgeSession(
  reference: MediaEdgeSessionReference,
  sessionId: string,
  signal?: AbortSignal,
) {
  await requestExternalJSON<void>(
    mediaEdgeSessionURL(reference, sessionId),
    { method: 'DELETE',cache: 'no-store',signal },
  );
}

/**
 * Same-origin signaling channel: the browser talks to the station's own API
 * (Core visualization media-edge proxy or a shared access listener) instead
 * of an absolute Media Edge origin, so LAN guests never resolve a loopback
 * edgeUrl against their own device. Authorization rides the same-origin
 * transport (HttpOnly cookie where required); no X-XGC headers are attached.
 */
export function createSameOriginMediaEdgeSignaling(
  reference: MediaEdgeSameOriginSignalingReference,
): MediaEdgeSignalingChannel {
  return createRelativeMediaEdgeSignaling(reference,requestCookieResponse);
}

/** Station identity stays in the existing station transport, never the guest channel. */
export function createStationMediaEdgeSignaling(
  targetId: string,
  processInstanceId: string,
  sourceId: string,
): MediaEdgeSignalingChannel {
  if (targetId !== 'local') throw new Error('Station Media Edge requires the local target.');
  return createRelativeMediaEdgeSignaling(
    visualizationMediaEdgeSignalingReference(targetId,processInstanceId,sourceId),
    requestStationResponse,
  );
}

function createRelativeMediaEdgeSignaling(
  reference: MediaEdgeSameOriginSignalingReference,
  transport: (path: string,init: RequestInit) => Promise<Response>,
): MediaEdgeSignalingChannel {
  const sessionsPath = sameOriginApiPath(reference.sessionsPath, 'sessionsPath');
  const sessionPathPrefix = sameOriginApiPath(reference.sessionPathPrefix, 'sessionPathPrefix');
  const sourceId = mediaID(reference.sourceId, 'sourceId');
  return {
    open: async (offerSDP, signal) => {
      const sdp = boundedSDP(offerSDP, 'offer.sdp');
      const payload = await sameOriginSignalingFetch(transport,sessionsPath, {
        method: 'POST',cache: 'no-store',body: JSON.stringify({ sdp }),signal,
      });
      return decodeMediaEdgeSessionAnswer(payload, sourceId);
    },
    close: async (sessionId, signal) => {
      await sameOriginSignalingFetch(
        transport,
        `${sessionPathPrefix}/${encodeURIComponent(mediaID(sessionId, 'sessionId'))}`,
        { method: 'DELETE',cache: 'no-store',signal },
      );
    },
  };
}

/**
 * Main-station visualization media-edge proxy paths
 * (core-xgc/internal/api/visualization.go): both open and close stay under
 * the owned instance's /sources/{sourceId}/sessions collection.
 */
export function visualizationMediaEdgeSignalingReference(
  targetId: string,
  processInstanceId: string,
  sourceId: string,
): MediaEdgeSameOriginSignalingReference {
  const target = mediaID(targetId, 'targetId');
  const instance = mediaID(processInstanceId, 'processInstanceId');
  const source = mediaID(sourceId, 'sourceId');
  const prefix = `/api/visualization/targets/${encodeURIComponent(target)}/media-edge/${encodeURIComponent(instance)}/sources/${encodeURIComponent(source)}/sessions`;
  return {
    sessionsPath: prefix,
    sessionPathPrefix: prefix,
    sourceId: source,
  };
}

const sameOriginApiPathPattern = /^\/api\/[A-Za-z0-9][A-Za-z0-9/_.:-]{0,511}$/;

function sameOriginApiPath(value: unknown, path: string): string {
  const result = boundedString(value, path, 512);
  if (!sameOriginApiPathPattern.test(result)) {
    throw new Error(`${path} must be a same-origin relative /api path`);
  }
  return result;
}

async function sameOriginSignalingFetch(
  transport: (path: string,init: RequestInit) => Promise<Response>,
  path: string, init: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await transport(path, {
    ...init,
    credentials: 'include',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers,
  });
  if (!response.ok) {
    throw new HTTPError(response.status, response.statusText, await readSignalingErrorBody(response));
  }
  if (response.status === 204) return undefined;
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function readSignalingErrorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

export function decodeMediaEdgeSessionAnswer(
  value: unknown,
  expectedSourceId?: string,
): MediaEdgeSessionAnswer {
  const root = exactRecord(value, 'media session answer', [
    'sessionId','sdp','dataChannelLabel','source',
  ]);
  const source = exactRecord(root.source, 'media session answer.source', [
    'id','width','height','fps','frameId','codec',
  ]);
  const sourceId = mediaID(source.id, 'media session answer.source.id');
  if (expectedSourceId !== undefined && sourceId !== mediaID(expectedSourceId, 'expectedSourceId')) {
    throw new Error('media session answer.source.id does not match the requested source');
  }
  const dataChannelLabel = string(root.dataChannelLabel, 'media session answer.dataChannelLabel');
  if (dataChannelLabel !== MEDIA_EDGE_CONTROL_DATA_CHANNEL) {
    throw new Error(`media session answer.dataChannelLabel must be ${MEDIA_EDGE_CONTROL_DATA_CHANNEL}`);
  }
  const codec = string(source.codec, 'media session answer.source.codec');
  if (codec !== 'H264') throw new Error('media session answer.source.codec must be H264');
  return {
    sessionId: mediaID(root.sessionId, 'media session answer.sessionId'),
    sdp: boundedSDP(root.sdp, 'media session answer.sdp'),
    dataChannelLabel,
    source: {
      id: sourceId,
      width: boundedInteger(source.width, 'media session answer.source.width', 16,8192),
      height: boundedInteger(source.height, 'media session answer.source.height', 16,8192),
      fps: boundedNumber(source.fps, 'media session answer.source.fps', 0,240),
      frameId: boundedString(source.frameId, 'media session answer.source.frameId', 512,true),
      codec,
    },
  };
}

export class MediaEdgeSessionController {
  private readonly reference?: MediaEdgeSessionReference;
  private readonly signaling?: MediaEdgeSignalingChannel;
  private readonly onStream: MediaEdgeSessionControllerOptions['onStream'];
  private readonly onConnectionState: MediaEdgeSessionControllerOptions['onConnectionState'];
  private readonly iceGatheringTimeoutMs: number;
  private readonly peerConnectionFactory: () => RTCPeerConnection;
  private readonly mediaStreamFactory: (tracks: MediaStreamTrack[]) => MediaStream;
  private readonly openSession: typeof openMediaEdgeSession;
  private readonly closeSession: typeof closeMediaEdgeSession;
  private readonly connectionAbort = new AbortController();
  private readonly remoteNegotiationAbort = new AbortController();
  private peer?: RTCPeerConnection;
  private peerClosed = false;
  private closed = false;
  private connectPromise?: Promise<MediaEdgeSessionAnswer>;
  private closePromise?: Promise<void>;
  private remoteClosePromise?: Promise<void>;
  private sessionId = '';
  private releaseRemoteOnClose = true;
  private readonly deliveredTracks = new Set<MediaStreamTrack>();

  constructor(
    options: MediaEdgeSessionControllerOptions,
    dependencies: MediaEdgeSessionControllerDependencies = {},
  ) {
    if (options.signaling ? Boolean(options.reference) : !options.reference) {
      throw new Error('media session controller requires exactly one reference or signaling channel');
    }
    this.reference = options.reference ? validateReference(options.reference) : undefined;
    this.signaling = options.signaling;
    this.onStream = options.onStream;
    this.onConnectionState = options.onConnectionState;
    this.iceGatheringTimeoutMs = boundedNumber(
      options.iceGatheringTimeoutMs ?? 8_000,
      'iceGatheringTimeoutMs',
      0,
      120_000,
    );
    this.peerConnectionFactory = dependencies.peerConnectionFactory
      ?? (() => new RTCPeerConnection());
    this.mediaStreamFactory = dependencies.mediaStreamFactory
      ?? ((tracks) => new MediaStream(tracks));
    this.openSession = dependencies.openSession ?? openMediaEdgeSession;
    this.closeSession = dependencies.closeSession ?? closeMediaEdgeSession;
  }

  connect(signal?: AbortSignal): Promise<MediaEdgeSessionAnswer> {
    if (this.closed) return Promise.reject(abortError('media session controller is closed'));
    if (this.connectPromise) return this.connectPromise;
    const forwardAbort = () => this.connectionAbort.abort();
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    const promise = this.connectInternal(this.connectionAbort.signal)
      .finally(() => signal?.removeEventListener('abort', forwardAbort));
    this.connectPromise = promise;
    return promise;
  }

  close(reason: MediaEdgeSessionCloseReason = 'consumer-unmounted'): Promise<void> {
    if (reason === 'owner-stopping') {
      this.releaseRemoteOnClose = false;
      this.remoteNegotiationAbort.abort();
    }
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.connectionAbort.abort();
    this.closePeer();
    const promise = this.finishClose();
    this.closePromise = promise;
    return promise;
  }

  private async connectInternal(signal: AbortSignal) {
    try {
      assertActive(this.closed, signal);
      const peer = this.peerConnectionFactory();
      this.peer = peer;
      peer.addEventListener('track', this.handleTrack);
      peer.addEventListener('connectionstatechange', this.handleConnectionState);
      peer.addTransceiver('video', { direction: 'recvonly' });
      const offer = await peer.createOffer();
      assertActive(this.closed, signal);
      await peer.setLocalDescription(offer);
      assertActive(this.closed, signal);
      await waitForICEGathering(peer, signal, this.iceGatheringTimeoutMs);
      assertActive(this.closed, signal);
      const localSDP = peer.localDescription?.sdp;
      if (!localSDP) throw new Error('WebRTC offer has no gathered local SDP');

      // Consumer teardown retains an accepted POST so the exact remote session
      // can be deleted. Owner teardown aborts negotiation because the Media
      // Edge process is already responsible for removing its own sessions.
      const answer = this.signaling
        ? await this.signaling.open(localSDP, this.remoteNegotiationAbort.signal)
        : await this.openSession(
            this.reference as MediaEdgeSessionReference,
            localSDP,
            this.remoteNegotiationAbort.signal,
          );
      this.sessionId = answer.sessionId;
      assertActive(this.closed, signal);
      await peer.setRemoteDescription({ type: 'answer',sdp: answer.sdp });
      assertActive(this.closed, signal);
      return answer;
    } catch (cause) {
      this.closed = true;
      this.connectionAbort.abort();
      this.closePeer();
      try {
        if (this.releaseRemoteOnClose) await this.releaseRemoteSession();
      } catch {
        // Preserve the negotiation failure. A later explicit close observes
        // the retained DELETE failure without attempting a duplicate request.
      }
      throw cause;
    }
  }

  private readonly handleTrack = (event: RTCTrackEvent) => {
    if (this.closed) return;
    this.deliveredTracks.add(event.track);
    this.onStream(this.mediaStreamFactory([event.track]), event.track);
  };

  private readonly handleConnectionState = () => {
    if (this.closed || !this.peer) return;
    this.onConnectionState?.(this.peer.connectionState);
  };

  private closePeer() {
    if (this.peerClosed || !this.peer) return;
    this.peerClosed = true;
    this.peer.removeEventListener('track', this.handleTrack);
    this.peer.removeEventListener('connectionstatechange', this.handleConnectionState);
    this.peer.getReceivers().forEach((receiver) => receiver.track?.stop());
    this.deliveredTracks.forEach((track) => track.stop?.());
    this.deliveredTracks.clear();
    this.peer.close();
  }

  private async finishClose() {
    try {
      await this.connectPromise;
    } catch {
      // Connection failure and caller-driven abort both converge on cleanup.
    }
    if (this.releaseRemoteOnClose) await this.releaseRemoteSession();
  }

  private releaseRemoteSession(): Promise<void> {
    if (!this.sessionId) return Promise.resolve();
    if (!this.remoteClosePromise) {
      this.remoteClosePromise = this.signaling
        ? this.signaling.close(this.sessionId)
        : this.closeSession(this.reference as MediaEdgeSessionReference, this.sessionId);
    }
    return this.remoteClosePromise;
  }
}

export function createMediaEdgeSessionController(
  options: MediaEdgeSessionControllerOptions,
  dependencies?: MediaEdgeSessionControllerDependencies,
) {
  return new MediaEdgeSessionController(options, dependencies);
}

export async function createMediaEdgeSession(
  options: CreateMediaEdgeSessionOptions,
  dependencies?: MediaEdgeSessionControllerDependencies,
): Promise<MediaEdgeSessionHandle> {
  const sessionTarget = options.signaling
    ? { signaling: options.signaling }
    : {
        reference: {
          edgeUrl: requiredSessionOption(options.edgeUrl, 'edgeUrl'),
          sourceId: requiredSessionOption(options.sourceId, 'sourceId'),
        },
      };
  const controller = createMediaEdgeSessionController(
    {
      ...sessionTarget,
      onStream: options.onTrack,
      onConnectionState: (state) => {
        if (state !== 'failed') return;
        transition('failed');
        void close('connection-failed').catch(() => undefined);
      },
      iceGatheringTimeoutMs: options.iceGatheringTimeoutMs,
    },
    dependencies,
  );
  let state: MediaEdgeSessionState | undefined;
  let closePromise: Promise<void> | undefined;
  const transition = (next: MediaEdgeSessionState) => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };
  const detachAbort = () => options.signal?.removeEventListener('abort', handleAbort);
  const close = (reason: MediaEdgeSessionCloseReason = 'consumer-unmounted') => {
    const controllerClose = controller.close(reason);
    if (!closePromise) {
      closePromise = controllerClose.finally(() => {
        detachAbort();
        transition('closed');
      });
    }
    return closePromise;
  };
  const handleAbort = () => {
    // Consumer teardown keeps the POST alive long enough to learn its session
    // ID and DELETE it. Owner teardown aborts the POST because process exit
    // owns remote cleanup.
    void close(closeReason(options.signal?.reason)).catch(() => undefined);
  };

  transition('connecting');
  options.signal?.addEventListener('abort', handleAbort, { once: true });
  if (options.signal?.aborted) handleAbort();
  try {
    const answer = await controller.connect(options.signal);
    if (options.signal?.aborted) throw abortError('media session negotiation was aborted');
    transition('connected');
    return { answer,close };
  } catch (cause) {
    try {
      await close(options.signal?.aborted ? closeReason(options.signal.reason) : 'connection-failed');
    } catch {
      // Preserve the negotiation error; explicit handle cleanup reports its
      // own DELETE error when a handle has already been returned.
    }
    throw cause;
  }
}

function closeReason(value: unknown): MediaEdgeSessionCloseReason {
  return value === 'owner-stopping' || value === 'connection-failed' || value === 'consumer-unmounted'
    ? value
    : 'consumer-unmounted';
}

function requiredSessionOption(value: string | undefined, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} is required without a signaling channel`);
  }
  return value;
}

function waitForICEGathering(
  peer: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  if (signal.aborted) return Promise.reject(abortError('WebRTC ICE gathering was aborted'));
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return new Promise((resolve,reject) => {
    const cleanup = () => {
      peer.removeEventListener('icegatheringstatechange', onState);
      signal.removeEventListener('abort', onAbort);
      timeoutSignal.removeEventListener('abort', onTimeout);
    };
    const settle = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onState = () => {
      if (peer.iceGatheringState === 'complete') settle();
    };
    const onAbort = () => settle(abortError('WebRTC ICE gathering was aborted'));
    const onTimeout = () => settle(new Error(`WebRTC ICE gathering timed out after ${timeoutMs}ms`));
    peer.addEventListener('icegatheringstatechange', onState);
    signal.addEventListener('abort', onAbort, { once: true });
    timeoutSignal.addEventListener('abort', onTimeout, { once: true });
    onState();
  });
}

function validateReference(reference: MediaEdgeSessionReference): MediaEdgeSessionReference {
  if (!reference || typeof reference !== 'object') {
    throw new Error('media session reference must be an object');
  }
  return {
    edgeUrl: normalizeMediaEdgeURL(reference.edgeUrl),
    sourceId: mediaID(reference.sourceId, 'sourceId'),
  };
}

function exactRecord(value: unknown, path: string, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const record = value as Record<string,unknown>;
  const allowed = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unknown.length || missing.length) {
    throw new Error(`${path} has invalid fields (missing: ${missing.join(',') || 'none'}; unknown: ${unknown.join(',') || 'none'})`);
  }
  return record;
}

export function normalizeMediaEdgeURL(value: unknown) {
  const raw = boundedString(value, 'edgeUrl', 2048);
  if (raw.trim() !== raw) throw new Error('edgeUrl must not contain surrounding whitespace');
  // Check the unparsed spelling as well as the parsed URL: the WHATWG parser
  // collapses paths such as "/." and "/%2e" to "/", but they are still paths
  // and are outside this origin-only configuration contract.
  if (!absoluteHTTPOrigin.test(raw)) {
    throw new Error('edgeUrl must be an absolute HTTP or HTTPS origin');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('edgeUrl must be an absolute HTTP or HTTPS origin');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('edgeUrl must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('edgeUrl must not contain credentials');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('edgeUrl must contain only scheme, host, and port');
  }
  return parsed.origin;
}

export function mediaSourceID(value: unknown) {
  const sourceID = typeof value === 'string' ? value.trim() : '';
  return safeMediaID.test(sourceID) ? sourceID : '';
}

function mediaID(value: unknown, path: string) {
  const result = string(value, path);
  if (!safeMediaID.test(result)) throw new Error(`${path} must be a stable media identifier`);
  return result;
}

function boundedSDP(value: unknown, path: string) {
  const result = string(value, path);
  if (!result.trim() || result.length > maximumSDPBytes) {
    throw new Error(`${path} must be non-empty and at most ${maximumSDPBytes} bytes`);
  }
  return result;
}

function boundedString(value: unknown, path: string, maximum: number, allowEmpty = false) {
  const result = string(value, path);
  if ((!allowEmpty && !result) || result.length > maximum) {
    throw new Error(`${path} must contain ${allowEmpty ? 'at most' : 'between 1 and'} ${maximum} characters`);
  }
  return result;
}

function string(value: unknown, path: string) {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function boundedInteger(value: unknown, path: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value)) throw new Error(`${path} must be an integer`);
  return boundedNumber(value, path, minimum - 1,maximum);
}

function boundedNumber(value: unknown, path: string, exclusiveMinimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value <= exclusiveMinimum || value > maximum) {
    throw new Error(`${path} must be greater than ${exclusiveMinimum} and at most ${maximum}`);
  }
  return value;
}

function assertActive(closed: boolean, signal: AbortSignal) {
  if (closed || signal.aborted) throw abortError('media session negotiation was aborted');
}

function abortError(message: string) {
  return new DOMException(message, 'AbortError');
}
