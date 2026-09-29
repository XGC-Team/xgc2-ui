import { apiUrl,HTTPError,request,requestBlob,requestStationResponse } from '../../api/http';
import { queryString } from '../../shared/url';

export type VideoLayerName = 'history' | 'predictions' | 'labels' | 'obstacles';
// Additive editing contract (2026-09-19): optional clock mappings and per-object
// tracks on top of the unchanged source selections. Nanoseconds stay canonical
// decimal strings; offsets are signed. Absence of tracks preserves the current
// source rendering; an explicit track wholly owns its style/span/animation.
export type VideoClockSelector =
  | { kind: 'topic';topic: string }
  | { kind: 'tf-edge';topic: string;parentFrame: string;childFrame: string };
export type VideoClockMapping = {
  id: string;selector: VideoClockSelector;offsetNs: string;provenance: 'operator-declared';
};
export type VideoTrackSelector =
  | { kind: 'topic';topic: string }
  | { kind: 'marker';topic: string;namespace: string;id: number };
export type VideoEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type VideoTrackAnimation = { fadeInNs: string;fadeOutNs: string;easing: VideoEasing };
export type VideoTrackSpan = { startNs: string;endNs: string };
type VideoTrackBase = { id: string;label: string;enabled?: boolean;span: VideoTrackSpan;animation: VideoTrackAnimation };
export type VideoTrack = VideoTrackBase & (
  | { kind: 'path';selector: { kind: 'topic';topic: string };style: { color: string;opacity: number;widthMeters: number } }
  | { kind: 'markers';selector: VideoTrackSelector;style: { color?: string;opacity: number;scale: number;presentation: 'recorded' | 'solid' | 'wireframe' } }
  | { kind: 'robot-model';source: { modelId: string;frameId: string;bundleSha256?: string };style: { color?: string;opacity: number;scale: number } }
);
export type VideoRecipe = {
  schema: 'xgc2.video-recipe';version: 1;experimentId: string;
  source: { kind: 'rosbag';bagId: string;recordedSize: number;sessionId?: string;cameraTopic: string;messageType: string };
  interval: { basis: 'bag-start';startNs: string;endNs: string;endExclusive: true };
  output: { width: 3840;height: 2160;fps: number;codec: 'h264';pixelFormat: 'yuv420p' };
  view: { kind: 'ar';layers: Record<VideoLayerName,boolean> };
  requires: { immutableSourceSnapshot: true;nativeCameraPixels: true;frameReadyProtocol: 1 };
};
export type VideoSettings = {
  calibrationTopic: string;fixedFrame: string;transformTopics: string[];staticTransformTopics: string[];
  layerTopics: Record<VideoLayerName,string[]>;pathColors?: Record<string,string>;pathWidth: number;
  clockMappings?: VideoClockMapping[];tracks?: VideoTrack[];sourceContextSha256?: string;recordFactsSha256?: string;
};
/** Four-state rendition contract shared with Core and the offline render worker. */
export type VideoRendition =
  | { kind: 'video' }
  | { kind: 'still';frame: number }
  | { kind: 'preview';frame: number }
  /** R23 pixel afterimage over native Lichtblick frames: window end solid, earlier foreground faded. */
  | { kind: 'trail';frames: readonly number[];method: 'afterimage';fadeFromPermille: number;fadeToPermille: number }
  /** Legacy normalized exposure; only read back from older saved recipes and jobs, never authored. */
  | { kind: 'trail';frames: readonly number[];halfLifeNs: string;method?: undefined };
export type VideoRequest = { videoRecipe: VideoRecipe;settings: VideoSettings;rendition: VideoRendition };
export type VideoRecordedContext =
  | { status: 'available';sha256: string;experimentId: string;experimentName?: string;recordingId?: string;sessionId?: string;
      runMode?: 'simulation' | 'physical' | 'hybrid';startedAt?: string;endedAt?: string }
  | { status: 'unavailable';reason: 'missing-sidecar' | 'unsupported-sidecar' | 'invalid-sidecar' | 'identity-conflict' };
export type VideoRecordFacts =
  | { status: 'absent';reason: 'missing-descriptor' }
  | { status: 'unavailable';reason: 'missing-log' | 'invalid-log' | 'digest-mismatch' | 'unsupported' | 'invalid-sidecar' | 'unsupported-sidecar' | 'identity-conflict';failures?: string[] }
  | { status: 'available';sha256: string;relativePath?: string;eventCount: number;failures?: string[] };
export type VideoModelCapability = {
  modelId: string;label: string;bundleSha256: string;description: { package: string;file: string };
  rootFrame: 'base_link';jointPose: 'urdf-rest';
};
export type VideoSourceObject = {
  id: string;kind: 'robot' | 'camera' | 'path' | 'markers' | 'source-layer' | 'world' | 'ground' | 'fence';label: string;
  labelSource: 'recorded-name' | 'slot' | 'topic' | 'recorded-fact';parentId?: string;topic?: string;selector?: VideoTrackSelector;
  robot?: {
    slotId: string;kind: string;namespace: string;
    assetRef?: { resourceId: string;commitId: string;digest: string };
    visualizationDigest: string;
    frame: { id: string;evidence: 'recorded-visualization';availability: 'unverified' };
    description: { package: string;file: string };modelEvidence: 'metadata-only' | 'unknown';suggestedModelIds: string[];
  };
  fact?: { availability: 'applied' | 'stopped' | 'unknown';sourceId?: string;sequence?: number };
};
export type VideoSourceCatalog = {
  id: string;name: string;experimentId: string;sessionId: string;size: number;durationNs: string;
  topics: { name: string;type: string;messageCount: number }[];
  recordedContext: VideoRecordedContext;recordFacts: VideoRecordFacts;objects: VideoSourceObject[];
};
export type VideoJobStatus = 'prepared' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export type VideoJob = {
  id: string;experimentId: string;bagId: string;rendition: VideoRendition;
  status: VideoJobStatus;
  createdAt: string;updatedAt: string;coreJobId?: string;requestSha256: string;
  outputFrames: number;renderedFrames: number;encodedFrames: number;captureCount: number;
  artifact?: string;artifactSha256?: string;artifactSize?: number;error?: string;
};
export type SavedVideoRecipe = { id: string;experimentId: string;revision: string;updatedAt: string;request: VideoRequest };
export type VideoJobPage = { items: VideoJob[];nextOffset?: number };
export type VideoCapabilities = { available: boolean;reason: string;jobKind: string;actionPort: string;maxFrames: number;width: number;height: number;messageTypes: string[];models: VideoModelCapability[];modelReason: string;editing: { trackEnabled: boolean } };
export const VIDEO_ARTIFACT_NAMES = ['video.mp4','still.png','preview.png','trail.png','result.json','publication.json','status.json','frame-map.json'] as const;
function root(experimentId: string) {
  return `/recordings/video-production/${encodeURIComponent(experimentId)}`;
}
const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' },body: JSON.stringify(body) });
export async function getVideoCapabilities(id: string,signal?: AbortSignal) {
  return decodeVideoCapabilities(await request<unknown>(`${root(id)}/capabilities`,{ signal },{ timeoutMs: 60_000 }));
}
export async function getVideoSourceCatalog(id: string,bagId: string,sessionId?: string,signal?: AbortSignal) {
  const value = decodeVideoSourceCatalog(await request<unknown>(`${root(id)}/catalog/${encodeURIComponent(bagId)}${queryString({ sessionId })}`,{ signal },{ timeoutMs: 60_000 }));
  if (value.id !== bagId || value.experimentId !== id) throw new Error('Video source catalog scope mismatch.');
  return value;
}
export function createVideoJob(id: string,value: VideoRequest,key: string,signal?: AbortSignal) {
  return request<VideoJob>(`${root(id)}/jobs`,{ method: 'POST',...json(value),headers: { 'Content-Type': 'application/json','Idempotency-Key': key },signal },{ timeoutMs: 120_000 });
}
export function listVideoJobs(id: string,offset = 0,signal?: AbortSignal) { return request<VideoJobPage>(`${root(id)}/jobs${queryString({ offset,limit: 25 })}`,{ signal }); }
export function getVideoJob(id: string,jobId: string,signal?: AbortSignal) { return request<VideoJob>(`${root(id)}/jobs/${encodeURIComponent(jobId)}`,{ signal }); }
export function listVideoRecipes(id: string,signal?: AbortSignal) { return request<{ items: SavedVideoRecipe[] }>(`${root(id)}/recipes`,{ signal }); }
export function saveVideoRecipe(id: string,value: VideoRequest,previous?: SavedVideoRecipe,signal?: AbortSignal) {
  return request<SavedVideoRecipe>(`${root(id)}/recipes/${encodeURIComponent(previous?.id ?? 'new')}`,{ method: 'PUT',...json({ request: value,expectedRevision: previous?.revision ?? '' }),signal },{ timeoutMs: 120_000 });
}
export function deleteVideoRecipe(id: string,recipe: SavedVideoRecipe,signal?: AbortSignal) {
  return request<{ deleted: boolean }>(`${root(id)}/recipes/${encodeURIComponent(recipe.id)}${queryString({ revision: recipe.revision })}`,{ method: 'DELETE',signal });
}
export function cancelPreparedVideoJob(id: string,jobId: string,signal?: AbortSignal) { return request<{ cancelled: boolean }>(`${root(id)}/jobs/${encodeURIComponent(jobId)}/cancel-prepared`,{ method: 'POST',signal }); }
export type VideoGalleryPublication = { galleryId: string;publicationId: string;file: string };
export function publishVideoJobToGallery(id: string,jobId: string,signal?: AbortSignal) {
  return request<VideoGalleryPublication>(`${root(id)}/jobs/${encodeURIComponent(jobId)}/publish-gallery`,{ method: 'POST',signal });
}
export function videoArtifactPath(id: string,jobId: string,name: string) {
  return `${root(id)}/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(name)}`;
}
export function fetchVideoArtifact(id: string,jobId: string,name: string,signal?: AbortSignal) {
  if (!(VIDEO_ARTIFACT_NAMES as readonly string[]).includes(name)) return Promise.reject(new Error('Unsupported video artifact.'));
  return requestBlob(videoArtifactPath(id,jobId,name),{ signal },{ timeoutMs: 120_000 });
}
export function fetchVideoPreview(id: string,jobId: string,signal?: AbortSignal) { return fetchVideoArtifact(id,jobId,'preview.png',signal); }

// Interactive preview sessions: Core prepares the immutable snapshot, serves
// the pinned renderer for a same-origin iframe and computes the output-grid
// frame map. The station scrubs through the frame protocol; no media artifact.
// The session takes the same edit request as a render (minus the published
// rendition); its full content is the invalidation fingerprint.
export type VideoPreviewSessionRequest = { videoRecipe: VideoRecipe;settings: VideoSettings };
export type VideoPreviewSession = { sessionId: string;status: string;error?: string;frameCount?: number;snapshotSha256?: string };
/** Mirrors the frame protocol plan shape; posted to the renderer verbatim. */
export type VideoPreviewFramePlan = {
  snapshotSha256: string;frameIndex: number;targetTimeNs: string;sourceFrameId: string;
  cameraTimeNs: string;width: number;height: number;
};
export type VideoPreviewFrameMap = { plans: VideoPreviewFramePlan[];diagnostics?: Record<string,number> };
function previewPath(id: string,sessionId: string) {
  return `${root(id)}/preview-sessions/${encodeURIComponent(sessionId)}`;
}
export function createVideoPreviewSession(id: string,value: VideoPreviewSessionRequest,signal?: AbortSignal) {
  return request<VideoPreviewSession>(`${root(id)}/preview-sessions`,{ method: 'POST',...json(value),signal },{ timeoutMs: 120_000 });
}
export function getVideoPreviewSession(id: string,sessionId: string,signal?: AbortSignal) {
  return request<VideoPreviewSession>(previewPath(id,sessionId),{ signal });
}
/** 404 from the session read is terminal: unknown, cross-Experiment or TTL-expired. */
export function isVideoPreviewSessionGone(cause: unknown) {
  return cause instanceof HTTPError && cause.status === 404;
}
export function getVideoPreviewFrameMap(id: string,sessionId: string,signal?: AbortSignal) {
  return request<VideoPreviewFrameMap>(`${previewPath(id,sessionId)}/frame-map.json`,{ signal },{ timeoutMs: 60_000 });
}
/** Same-origin iframe entry for one ready session; the hash pins the verified snapshot. */
export function videoPreviewRendererUrl(id: string,sessionId: string,snapshotSha256: string) {
  const base = apiUrl(`${previewPath(id,sessionId)}/renderer/index.html?xgcTfHistorySeconds=600&xgcInteractive=1`);
  const snapshot = apiUrl(`${previewPath(id,sessionId)}/snapshot/snapshot.json`);
  return `${base}#${new URLSearchParams({ snapshot,sha256: snapshotSha256 }).toString()}`;
}

// A file-system picker lets large 4K results stream to disk without buffering an
// entire video in React or putting station credentials into an <a> URL.
type SavePickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }> };
export async function downloadVideoArtifact(id: string,job: VideoJob,name: string): Promise<void> {
  if (!(VIDEO_ARTIFACT_NAMES as readonly string[]).includes(name)) throw new Error('Unsupported video artifact.');
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  const handle = picker ? await picker.call(window,{ suggestedName: `xgc2-${job.id}-${name}` }) : undefined;
  const response = await requestStationResponse(apiUrl(videoArtifactPath(id,job.id,name)));
  if (!response.ok) throw new HTTPError(response.status,response.statusText);
  if (!response.body) throw new Error('The artifact response has no body.');
  if (handle) {
    const output = await handle.createWritable();
    await response.body.pipeTo(output);
    return;
  }
  // Explicitly bounded fallback for browsers without streaming file handles.
  // Do not claim that an arbitrarily large MP4 fits in a browser Blob.
  const limit = 256 * 1024 * 1024;
  const size = Number(response.headers.get('Content-Length'));
  if (!Number.isSafeInteger(size) || size < 1 || size > limit) {
    await response.body.cancel();
    throw new Error('This browser cannot stream this large artifact to disk. Use the Save File-capable Chromium desktop/browser.');
  }
  const reader = response.body.getReader();const chunks: ArrayBuffer[] = [];let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > size || bytes > limit) throw new Error('Artifact size changed during download.');
      chunks.push(new Uint8Array(item.value).buffer);
    }
    if (bytes !== size) throw new Error('Artifact transfer was incomplete.');
  } catch (cause) { await reader.cancel().catch(() => undefined);throw cause; }
  finally { reader.releaseLock(); }
  const url = URL.createObjectURL(new Blob(chunks,{ type: response.headers.get('Content-Type') ?? 'application/octet-stream' }));
  const link = document.createElement('a');link.href = url;link.download = `xgc2-${job.id}-${name}`;link.click();
  window.setTimeout(() => URL.revokeObjectURL(url),1000);
}

// Keep the new source/model authority at the transport boundary. No coercion,
// inferred ownership, HEAD lookup or replacement model is permitted here.
const videoDigest = /^[a-f0-9]{64}$/;
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid video metadata response.');
  return value as Record<string,unknown>;
}
function textField(value: unknown,allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && value.trim() === value && !value.includes('\0') && !/[\r\n\t]/.test(value);
}
function requireVideo(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid video metadata response.');
}
function stringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => textField(item)); }
function description(value: unknown) {
  const item = record(value);
  requireVideo(textField(item.package,true) && textField(item.file,true));
}
export function decodeVideoCapabilities(input: unknown): VideoCapabilities {
  const value = record(input);
  requireVideo(typeof value.available === 'boolean' && textField(value.reason,true)
    && textField(value.jobKind) && textField(value.actionPort) && Number.isSafeInteger(value.maxFrames)
    && value.width === 3840 && value.height === 2160 && stringArray(value.messageTypes)
    && Array.isArray(value.models) && textField(value.modelReason,true));
  const ids = new Set<string>();
  for (const raw of value.models) {
    const model = record(raw);
    requireVideo(textField(model.modelId) && textField(model.label) && typeof model.bundleSha256 === 'string'
      && videoDigest.test(model.bundleSha256) && model.rootFrame === 'base_link' && model.jointPose === 'urdf-rest');
    requireVideo(!ids.has(model.modelId));ids.add(model.modelId);description(model.description);
  }
  requireVideo(typeof record(value.editing).trackEnabled === 'boolean');
  // modelIds is a legacy projection, never another list of selectable models.
  if (value.modelIds !== undefined) requireVideo(stringArray(value.modelIds) && value.modelIds.length === ids.size && new Set(value.modelIds).size === ids.size && value.modelIds.every((id) => ids.has(id)));
  return input as VideoCapabilities;
}
export function decodeVideoSourceCatalog(input: unknown): VideoSourceCatalog {
  const value = record(input);
  requireVideo(textField(value.id) && textField(value.name) && textField(value.experimentId) && textField(value.sessionId,true)
    && Number.isSafeInteger(value.size) && Number(value.size) > 0
    && typeof value.durationNs === 'string' && /^(0|[1-9]\d*)$/.test(value.durationNs)
    && Array.isArray(value.topics) && Array.isArray(value.objects));
  const topics = new Map<string,{ type:string;count:number }>();
  for (const raw of value.topics) {
    const topic = record(raw);
    requireVideo(textField(topic.name) && textField(topic.type) && Number.isSafeInteger(topic.messageCount) && Number(topic.messageCount) >= 0 && !topics.has(topic.name));
    topics.set(topic.name,{ type:topic.type,count:Number(topic.messageCount) });
  }
  const context = record(value.recordedContext);
  if (context.status === 'available') {
    requireVideo(typeof context.sha256 === 'string' && videoDigest.test(context.sha256) && textField(context.experimentId));
    for (const key of ['experimentName','recordingId','sessionId']) if (context[key] !== undefined) requireVideo(textField(context[key]));
    if (context.runMode !== undefined) requireVideo(['simulation','physical','hybrid'].includes(String(context.runMode)));
    for (const key of ['startedAt','endedAt']) if (context[key] !== undefined) requireVideo(textField(context[key]) && Number.isFinite(Date.parse(context[key])));
  } else {
    requireVideo(context.status === 'unavailable' && ['missing-sidecar','unsupported-sidecar','invalid-sidecar','identity-conflict'].includes(String(context.reason)) && context.sha256 === undefined);
  }
  const facts = record(value.recordFacts);
  if (facts.status === 'available') {
    requireVideo(typeof facts.sha256 === 'string' && videoDigest.test(facts.sha256)
      && Number.isSafeInteger(facts.eventCount) && Number(facts.eventCount) >= 0);
    if (facts.relativePath !== undefined) requireVideo(textField(facts.relativePath));
  } else if (facts.status === 'absent') {
    requireVideo(facts.reason === 'missing-descriptor' && facts.sha256 === undefined);
  } else {
    requireVideo(facts.status === 'unavailable' && ['missing-log','invalid-log','digest-mismatch','unsupported','invalid-sidecar','unsupported-sidecar','identity-conflict'].includes(String(facts.reason)) && facts.sha256 === undefined);
  }
  const objects = new Map<string,Record<string,unknown>>();
  for (const raw of value.objects) {
    const object = record(raw);
    requireVideo(textField(object.id) && textField(object.label) && !objects.has(object.id)
      && ['robot','camera','path','markers','source-layer','world','ground','fence'].includes(String(object.kind))
      && ['recorded-name','slot','topic','recorded-fact'].includes(String(object.labelSource)));
    objects.set(object.id,object);
    if (object.kind === 'robot') {
      requireVideo(context.status === 'available' && object.topic === undefined && object.selector === undefined && object.parentId === undefined);
      const robot = record(object.robot),frame = record(robot.frame);
      requireVideo(textField(robot.slotId) && textField(robot.kind) && textField(robot.namespace)
        && typeof robot.visualizationDigest === 'string' && videoDigest.test(robot.visualizationDigest)
        && textField(frame.id) && frame.evidence === 'recorded-visualization' && frame.availability === 'unverified'
        && ['metadata-only','unknown'].includes(String(robot.modelEvidence)) && stringArray(robot.suggestedModelIds));
      description(robot.description);
      if (robot.assetRef !== undefined) {
        const ref = record(robot.assetRef);
        requireVideo(textField(ref.resourceId) && textField(ref.commitId) && typeof ref.digest === 'string' && videoDigest.test(ref.digest));
      }
    } else if (object.kind === 'world' || object.kind === 'ground' || object.kind === 'fence') {
      requireVideo(object.robot === undefined && object.topic === undefined && object.selector === undefined && object.labelSource === 'recorded-fact');
      const fact = record(object.fact);
      requireVideo(['applied','stopped','unknown'].includes(String(fact.availability)));
      if (object.kind !== 'world') requireVideo(textField(object.parentId));
    } else {
      requireVideo(object.robot === undefined && object.labelSource === 'topic' && textField(object.topic));
      const topic = topics.get(object.topic);
      requireVideo(topic && topic.count > 0);
      if (object.kind === 'camera') requireVideo(['sensor_msgs/CompressedImage','foxglove_msgs/CompressedVideo'].includes(topic.type));
      if (object.kind === 'path') requireVideo(topic.type === 'nav_msgs/Path');
      if (object.kind === 'markers') requireVideo(['visualization_msgs/Marker','visualization_msgs/MarkerArray'].includes(topic.type));
      if (object.kind === 'path' || object.kind === 'markers') {
        const selector = record(object.selector);
        requireVideo(selector.kind === 'topic' && selector.topic === object.topic);
      } else requireVideo(object.selector === undefined);
    }
  }
  for (const object of objects.values()) if (object.parentId !== undefined) {
    const parent = objects.get(String(object.parentId));
    requireVideo(textField(object.parentId) && parent && (parent.kind === 'robot' || parent.kind === 'world'));
  }
  return input as VideoSourceCatalog;
}
