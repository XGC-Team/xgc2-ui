/** Pure authoring model. An archive listing is not an immutable render snapshot. */
export const VIDEO_RENDER_ACTION_PORT = 'render-video';
export const VIDEO_WORKFLOW_INSTANCE_ID = 'offline-video-production-workflow';
export const VIDEO_FRAME_RATES = [24,25,30,50,60] as const;
const NS_PER_SECOND = 1_000_000_000n;

export type VideoBag = {
  id: string;
  name: string;
  size: number;
  experimentId?: string;
  sessionId?: string;
};

export type VideoCatalog = {
  id: string;
  durationSec: number;
  durationNs?: string;
  topics: readonly { name: string;type: string;messageCount: number }[];
  /** Explicit installed worker support; omitted only for legacy pure-model callers. */
  supportedCameraMessageTypes?: readonly string[];
};

export type VideoLayers = {
  history: boolean;
  predictions: boolean;
  labels: boolean;
  obstacles: boolean;
};

export const VIDEO_TRAIL_MAX_SAMPLES = 32;
/** Afterimage needs ≥3 samples: the background is a per-pixel median of the samples. */
export const VIDEO_TRAIL_MIN_SAMPLES = 3;
/** R23 ghost ramp defaults (percent of full opacity) for the oldest and newest earlier sample. */
export const VIDEO_TRAIL_DEFAULT_FADE = { from: '28',to: '72' } as const;

/** Mirrors tools/video-renderer/rendition.mjs: the four-state rendition contract. */
export type VideoRenditionKind = 'video' | 'still' | 'preview' | 'trail';
export type VideoRendition =
  | { kind: 'video' }
  | { kind: 'still';frame: number }
  | { kind: 'preview';frame: number }
  /** R23 pixel afterimage over native Lichtblick frames: window end solid, earlier foreground faded. */
  | { kind: 'trail';frames: readonly number[];method: 'afterimage';fadeFromPermille: number;fadeToPermille: number }
  /** Legacy normalized exposure; only read back from older saved recipes and jobs, never authored. */
  | { kind: 'trail';frames: readonly number[];halfLifeNs: string;method?: undefined };

export type VideoDraft = {
  cameraTopic: string;
  startSeconds: string;
  endSeconds: string;
  fps: number;
  layers: VideoLayers;
  /** Preview stays a workbench action; only publishable kinds live in the draft. */
  renditionKind: 'video' | 'still' | 'trail';
  stillFrame: string;
  trailFrames: string;
  /** Ghost opacity (percent) of the oldest and newest earlier sample; the window end is solid. */
  trailFadeFrom: string;
  trailFadeTo: string;
};

export type VideoRecipe = {
  schema: 'xgc2.video-recipe';
  version: 1;
  experimentId: string;
  source: {
    kind: 'rosbag';
    bagId: string;
    recordedSize: number;
    sessionId?: string;
    cameraTopic: string;
    messageType: string;
  };
  interval: {
    basis: 'bag-start';
    startNs: string;
    endNs: string;
    endExclusive: true;
  };
  output: {
    width: 3840;
    height: 2160;
    fps: number;
    codec: 'h264';
    pixelFormat: 'yuv420p';
  };
  view: { kind: 'ar';layers: VideoLayers };
  requires: {
    immutableSourceSnapshot: true;
    nativeCameraPixels: true;
    frameReadyProtocol: 1;
  };
};

export type RecipeIssue =
  | 'experiment-required' | 'bag-required' | 'wrong-experiment' | 'invalid-bag'
  | 'catalog-required' | 'invalid-duration' | 'camera-required'
  | 'invalid-start' | 'invalid-end' | 'empty-range' | 'outside-range' | 'invalid-fps' | 'too-many-frames';
export type RecipeResult =
  | { ok: true;recipe: VideoRecipe;frameCount: number }
  | { ok: false;issues: RecipeIssue[] };

export function newVideoDraft(): VideoDraft {
  return {
    cameraTopic: '',startSeconds: '0',endSeconds: '',fps: 30,
    layers: { history: true,predictions: true,labels: true,obstacles: true },
    renditionKind: 'video',stillFrame: '0',trailFrames: '',trailFadeFrom: VIDEO_TRAIL_DEFAULT_FADE.from,trailFadeTo: VIDEO_TRAIL_DEFAULT_FADE.to,
  };
}

/** A candidate only. The render worker must verify closure, bytes and assets again. */
export function isVideoBagCandidate(bag: VideoBag) {
  return Boolean(bag.id.trim() && bag.name.endsWith('.bag') && Number.isSafeInteger(bag.size) && bag.size > 0);
}

function videoBagSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KiB','MiB','GiB'];
  let value = size;let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;unit = next;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

/** Readable picker label: the bag file name and size, not the opaque archive path. */
export function videoBagLabel(bag: VideoBag) {
  const name = bag.name.split('/').pop() ?? bag.name;
  const size = videoBagSize(bag.size);
  return size ? `${name} · ${size}` : name;
}

const VIDEO_CAMERA_MESSAGE_TYPES = ['sensor_msgs/CompressedImage','foxglove_msgs/CompressedVideo'] as const;
export function videoCameraTopics(catalog: VideoCatalog | undefined) {
  const supported = catalog?.supportedCameraMessageTypes ?? ['sensor_msgs/CompressedImage'];
  return (catalog?.topics ?? []).filter((topic) => (
    (VIDEO_CAMERA_MESSAGE_TYPES as readonly string[]).includes(topic.type) && supported.includes(topic.type)
    && topic.messageCount > 0
  ));
}

/** Parse decimal seconds without first converting timestamps to IEEE-754 numbers. */
export function secondsToNs(value: string): bigint | undefined {
  const match = /^(\d{1,12})(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) return undefined;
  return BigInt(match[1]) * NS_PER_SECOND + BigInt((match[2] ?? '').padEnd(9,'0'));
}

export function nsToSeconds(value: bigint) {
  if (value < 0n) throw new RangeError('Time must not be negative');
  const fraction = (value % NS_PER_SECOND).toString().padStart(9,'0').replace(/0+$/,'');
  return `${value / NS_PER_SECOND}${fraction ? `.${fraction}` : ''}`;
}

/** The existing catalog duration is a number, not an authoritative sample timestamp. */
export function catalogDurationNs(catalog: VideoCatalog | undefined): bigint | undefined {
  if (catalog?.durationNs !== undefined) {
    return /^(0|[1-9]\d{0,18})$/.test(catalog.durationNs) && BigInt(catalog.durationNs) > 0n ? BigInt(catalog.durationNs) : undefined;
  }
  if (!catalog || !Number.isFinite(catalog.durationSec) || catalog.durationSec <= 0) return undefined;
  const rounded = Math.round(catalog.durationSec * 1e9);
  return Number.isSafeInteger(rounded) && rounded > 0 ? BigInt(rounded) : undefined;
}

export function createVideoRecipe(input: {
  experimentId: string;
  bag?: VideoBag;
  catalog?: VideoCatalog;
  draft: VideoDraft;
}): RecipeResult {
  const { experimentId,bag,catalog,draft } = input;
  const issues: RecipeIssue[] = [];
  if (!experimentId.trim()) issues.push('experiment-required');
  if (!bag) issues.push('bag-required');
  else {
    if (bag.experimentId !== experimentId) issues.push('wrong-experiment');
    if (!bag.id.trim() || !bag.name.endsWith('.bag') || !Number.isSafeInteger(bag.size) || bag.size <= 0) {
      issues.push('invalid-bag');
    }
  }
  if (!catalog || catalog.id !== bag?.id) issues.push('catalog-required');
  const duration = catalogDurationNs(catalog);
  if (catalog && duration === undefined) issues.push('invalid-duration');
  const camera = videoCameraTopics(catalog).find((topic) => topic.name === draft.cameraTopic);
  if (!camera) issues.push('camera-required');
  const start = secondsToNs(draft.startSeconds);
  const end = secondsToNs(draft.endSeconds);
  if (start === undefined) issues.push('invalid-start');
  if (end === undefined) issues.push('invalid-end');
  if (start !== undefined && end !== undefined && start >= end) issues.push('empty-range');
  if (duration !== undefined && end !== undefined && end > duration) issues.push('outside-range');
  if (!(VIDEO_FRAME_RATES as readonly number[]).includes(draft.fps)) issues.push('invalid-fps');
  if (issues.length || !bag || !camera || start === undefined || end === undefined) {
    return { ok: false,issues };
  }
  const recipe: VideoRecipe = {
    schema: 'xgc2.video-recipe',version: 1,experimentId,
    source: {
      kind: 'rosbag',bagId: bag.id,recordedSize: bag.size,
      ...(bag.sessionId ? { sessionId: bag.sessionId } : {}),
      cameraTopic: camera.name,messageType: camera.type,
    },
    interval: { basis: 'bag-start',startNs: String(start),endNs: String(end),endExclusive: true },
    output: { width: 3840,height: 2160,fps: draft.fps,codec: 'h264',pixelFormat: 'yuv420p' },
    view: { kind: 'ar',layers: { ...draft.layers } },
    requires: { immutableSourceSnapshot: true,nativeCameraPixels: true,frameReadyProtocol: 1 },
  };
  const frameCount = outputFrameCount(recipe);
  if (frameCount > 100000) return { ok: false,issues: ['too-many-frames'] };
  return { ok: true,recipe,frameCount };
}

/** Half-open output interval. The indexer separately maps each target to a source frame. */
export function outputFrameCount(recipe: VideoRecipe): number {
  const count = ((BigInt(recipe.interval.endNs) - BigInt(recipe.interval.startNs))
    * BigInt(recipe.output.fps) + NS_PER_SECOND - 1n) / NS_PER_SECOND;
  if (count <= 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Invalid frame count');
  return Number(count);
}

export function outputFrameTimeNs(recipe: VideoRecipe,frameIndex: number): string {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= outputFrameCount(recipe)) {
    throw new RangeError('Frame index outside recipe');
  }
  // Calculate from the absolute index, never repeatedly add a rounded frame duration.
  return String(BigInt(recipe.interval.startNs) + BigInt(frameIndex) * NS_PER_SECOND / BigInt(recipe.output.fps));
}

export function recipeJSON(recipe: VideoRecipe) {
  return `${JSON.stringify(recipe,null,2)}\n`;
}

export type RenditionIssue =
  | 'invalid-frame' | 'trail-frames' | 'trail-count' | 'trail-range' | 'trail-order' | 'trail-fade';
export type RenditionResult =
  | { ok: true;rendition: VideoRendition }
  | { ok: false;issues: RenditionIssue[] };

/** Canonical non-negative integer text, never a rounded or scientific notation. */
export function parseFrameIndex(value: string,frameCount: number): number | undefined {
  if (!/^(0|[1-9]\d{0,15})$/.test(value.trim())) return undefined;
  const frame = Number(value.trim());
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frameCount) return undefined;
  return frame;
}

/** Comma-separated canonical frame indices; whitespace around entries is ignored. */
export function parseTrailFrames(value: string): number[] | undefined {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.some((part) => !/^(0|[1-9]\d{0,15})$/.test(part))) return undefined;
  const frames = parts.map((part) => Number(part));
  return frames.every((frame) => Number.isSafeInteger(frame)) ? frames : undefined;
}

export function createVideoRendition(input: {
  kind: VideoRenditionKind;
  frame: string;
  trailFrames: string;
  trailFadeFrom: string;
  trailFadeTo: string;
},frameCount: number): RenditionResult {
  if (input.kind === 'video') return { ok: true,rendition: { kind: 'video' } };
  if (input.kind === 'still' || input.kind === 'preview') {
    const frame = parseFrameIndex(input.frame,frameCount);
    return frame === undefined
      ? { ok: false,issues: ['invalid-frame'] }
      : { ok: true,rendition: { kind: input.kind,frame } };
  }
  const issues: RenditionIssue[] = [];
  const frames = parseTrailFrames(input.trailFrames);
  if (frames === undefined) issues.push('trail-frames');
  else {
    if (frames.length < VIDEO_TRAIL_MIN_SAMPLES || frames.length > VIDEO_TRAIL_MAX_SAMPLES) issues.push('trail-count');
    if (frames.some((frame) => frame >= frameCount)) issues.push('trail-range');
    if (!frames.every((frame,index) => index === 0 || frame > frames[index - 1])) issues.push('trail-order');
  }
  const from = fadePermille(input.trailFadeFrom);
  const to = fadePermille(input.trailFadeTo);
  if (from === undefined || to === undefined) issues.push('trail-fade');
  if (issues.length || frames === undefined || from === undefined || to === undefined) return { ok: false,issues };
  return { ok: true,rendition: { kind: 'trail',frames,method: 'afterimage',fadeFromPermille: from,fadeToPermille: to } };
}

/** Percent text with at most one decimal (0.1–100) → integer permille in [1,1000]. */
export function fadePermille(value: string): number | undefined {
  if (!/^\d{1,3}(?:\.\d)?$/.test(value.trim())) return undefined;
  const permille = Math.round(Number(value.trim()) * 10);
  return permille >= 1 && permille <= 1000 ? permille : undefined;
}

export function permilleToPercent(value: number) {
  return String(value / 10);
}

/** Frames the renderer must actually capture: the whole clip, one frame, or trail samples. */
export function renditionCaptureCount(rendition: VideoRendition,frameCount: number) {
  return rendition.kind === 'video' ? frameCount : rendition.kind === 'trail' ? rendition.frames.length : 1;
}

export function renditionArtifactName(rendition: VideoRendition) {
  switch (rendition.kind) {
    case 'video': return 'video.mp4';
    case 'still': return 'still.png';
    case 'preview': return 'preview.png';
    case 'trail': return 'trail.png';
  }
}

/** Publishable kinds in workbench order; preview stays an action, not a rendition choice. */
export const videoRenditionKindNames = [['video','Video'],['still','Still frame'],['trail','Afterimage trail']] as const;

export function renditionLabelKey(rendition: VideoRendition): string {
  switch (rendition.kind) {
    case 'video': return 'Video';
    case 'still': return 'Still frame';
    case 'preview': return 'AR preview';
    case 'trail': return rendition.method === 'afterimage' ? 'Afterimage trail' : 'Legacy exposure trail';
  }
}

export function savedVideoRecipeLabel(recipe: { source: { bagId: string;cameraTopic: string };interval: { startNs: string;endNs: string } }): string {
  const start = Number(recipe.interval.startNs) / 1e9;
  const end = Number(recipe.interval.endNs) / 1e9;
  const clip = Number.isFinite(start) && Number.isFinite(end) ? `${start}–${end}s` : '';
  return [recipe.source.bagId,recipe.source.cameraTopic,clip].filter(Boolean).join(' · ');
}
