/** Pure editing model for the additive v1 contract: clock mappings and tracks.
 * Drafts keep operator text verbatim; the wire keeps canonical nanoseconds. */
import type { VideoClockMapping,VideoEasing,VideoSettings,VideoTrack,VideoSourceObject } from '../../../domains/recording/recordingPublic';
import { nsToSeconds,secondsToNs } from './videoProductionModel';
import { videoRandomId } from './videoRandomId';

export type VideoTrackKind = 'path' | 'markers' | 'robot-model';
export const videoTrackKindNames = [['path','Path'],['markers','Markers'],['robot-model','Robot model']] as const;
export const videoEasingNames = [['linear','Linear'],['ease-in','Ease in'],['ease-out','Ease out'],['ease-in-out','Ease in-out']] as const;
export const videoMarkerPresentationNames = [['recorded','Recorded'],['solid','Solid'],['wireframe','Wireframe']] as const;

export type VideoClockMappingDraft = {
  id: string;
  kind: 'topic' | 'tf-edge';
  topic: string;
  parentFrame: string;
  childFrame: string;
  offsetSeconds: string;
};

export type VideoTrackDraft = {
  id: string;
  kind: VideoTrackKind;
  label: string;
  enabled?: boolean;
  modelId: string;
  bundleSha256?: string;
  topic: string;
  namespace: string;
  /** Canonical non-negative integer text; empty means the whole markers topic. */
  markerId: string;
  /** Explicit recorded TF frame a robot model attaches to. */
  frameId: string;
  /** #RRGGBB; empty keeps the recorded/default colour where the kind allows it. */
  color: string;
  opacity: string;
  widthMeters: string;
  scale: string;
  presentation: 'recorded' | 'solid' | 'wireframe';
  startSeconds: string;
  endSeconds: string;
  fadeInSeconds: string;
  fadeOutSeconds: string;
  easing: VideoEasing;
};

export type VideoEditingDraft = {
  clockMappings: VideoClockMappingDraft[];
  tracks: VideoTrackDraft[];
};

export function newVideoEditingDraft(): VideoEditingDraft {
  return { clockMappings: [],tracks: [] };
}

const TRACK_ISSUES: readonly VideoEditingIssue[] = [
  'track-label-required','track-topic-required','track-frame-id-required','track-model-required','track-model-bundle-required',
  'invalid-track-start','invalid-track-end','empty-track-span','track-span-outside-bag',
  'invalid-fade-in','invalid-fade-out','fades-exceed-span',
  'invalid-track-color','invalid-track-opacity','invalid-track-width','invalid-track-scale',
  'invalid-marker-id','overlapping-tracks','track-layer-disabled','track-topic-not-selected',
];

/** Split combined issues so each inspector card only shows its own domain. */
export function partitionVideoEditingIssues(issues: readonly VideoEditingIssue[]) {
  const trackIssues = issues.filter((issue) => TRACK_ISSUES.includes(issue));
  const clockIssues = issues.filter((issue) => !TRACK_ISSUES.includes(issue));
  return { trackIssues,clockIssues };
}

export type VideoEditingIssue =
  | 'track-label-required' | 'track-topic-required' | 'track-frame-id-required' | 'track-model-required' | 'track-model-bundle-required'
  | 'invalid-track-start' | 'invalid-track-end' | 'empty-track-span' | 'track-span-outside-bag'
  | 'invalid-fade-in' | 'invalid-fade-out' | 'fades-exceed-span'
  | 'invalid-track-color' | 'invalid-track-opacity' | 'invalid-track-width' | 'invalid-track-scale'
  | 'invalid-marker-id' | 'overlapping-tracks'
  | 'track-layer-disabled' | 'track-topic-not-selected'
  | 'clock-topic-required' | 'clock-edge-required' | 'invalid-clock-offset'
  | 'duplicate-clock-mapping' | 'overlapping-tf-clock-mapping' | 'clock-topic-not-selected';

export type VideoEditingResult =
  | { ok: true;settings: Pick<VideoSettings,'clockMappings' | 'tracks'> }
  | { ok: false;issues: VideoEditingIssue[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const NS = 1_000_000_000n;

/** Parse signed decimal seconds; rejects negative zero and int64 overflow. */
const INT64_MAX = 9223372036854775807n;
export function signedSecondsToNs(value: string): bigint | undefined {
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) return undefined;
  const magnitude = BigInt(match[2]) * NS + BigInt((match[3] ?? '').padEnd(9,'0'));
  if (match[1] === '-' && magnitude === 0n) return undefined;
  if (magnitude > INT64_MAX) return undefined;
  return match[1] === '-' ? -magnitude : magnitude;
}

export function signedNsToSeconds(value: bigint) {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % NS).toString().padStart(9,'0').replace(/0+$/,'');
  return `${sign}${magnitude / NS}${fraction ? `.${fraction}` : ''}`;
}

function decimalInRange(value: string,min: number,max: number) {
  if (!/^\d{1,9}(?:\.\d{1,9})?$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

/** Core contract: marker/robot scale is bounded to [0.001, 100]. */
function scaleDecimal(value: string) {
  return decimalInRange(value,0.001,100);
}

/** Marker IDs are signed int32; -1 is a valid recorded ID. */
function markerIdDecimal(value: string) {
  if (!/^-?(0|[1-9]\d{0,9})$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : undefined;
}

function clockSelectorKey(draft: VideoClockMappingDraft) {
  return draft.kind === 'topic' ? `topic|${draft.topic}` : `tf-edge|${draft.topic}|${draft.parentFrame}|${draft.childFrame}`;
}

/** The object a track edits; overlapping selectors of the same object conflict. */
function trackObjectKeys(draft: VideoTrackDraft): string[] {
  if (draft.kind === 'path') return [`path|${draft.topic}`];
  if (draft.kind === 'robot-model') return [`robot-model|${draft.frameId}`];
  if (draft.namespace.trim() && draft.markerId.trim()) return [`markers|${draft.topic}|${draft.namespace.trim()}|${draft.markerId.trim()}`];
  return [`markers|${draft.topic}|*`];
}

function tracksConflict(a: VideoTrackDraft,b: VideoTrackDraft) {
  const keysA = trackObjectKeys(a);const keysB = trackObjectKeys(b);
  const topic = (key: string) => key.split('|')[1];
  const shared = keysA.some((keyA) => keysB.some((keyB) => {
    if (keyA === keyB) return true;
    // A topic-wide markers track covers every marker object on the topic.
    return keyA.startsWith('markers|') && keyB.startsWith('markers|') && topic(keyA) === topic(keyB)
      && (keyA.endsWith('|*') || keyB.endsWith('|*'));
  }));
  if (!shared) return false;
  const startA = secondsToNs(a.startSeconds);const endA = secondsToNs(a.endSeconds);
  const startB = secondsToNs(b.startSeconds);const endB = secondsToNs(b.endSeconds);
  if (startA === undefined || endA === undefined || startB === undefined || endB === undefined) return false;
  return startA < endB && startB < endA;
}

export function newVideoTrackDraft(kind: VideoTrackKind,seed?: { topic?: string;color?: string;widthMeters?: number;durationNs?: bigint;modelId?: string;bundleSha256?: string;frameId?: string }): VideoTrackDraft {
  const end = seed?.durationNs !== undefined ? nsToSeconds(seed.durationNs) : '';
  return {
    id: videoRandomId(),kind,label: '',
    topic: seed?.topic ?? '',namespace: '',markerId: '',frameId: seed?.frameId ?? '',modelId: seed?.modelId ?? '',
    ...(seed?.bundleSha256 ? { bundleSha256:seed.bundleSha256 } : {}),
    color: seed?.color ?? '',opacity: '1',widthMeters: String(seed?.widthMeters ?? 0.01),scale: '1',
    presentation: 'recorded',
    startSeconds: '0',endSeconds: end,fadeInSeconds: '0',fadeOutSeconds: '0',easing: 'linear',
  };
}

export function newVideoClockMappingDraft(): VideoClockMappingDraft {
  return { id: videoRandomId(),kind: 'topic',topic: '',parentFrame: '',childFrame: '',offsetSeconds: '0' };
}

/**
 * Source-reference closure: a track only renders from an enabled layer whose
 * source selection still owns the topic, and a clock mapping only applies to a
 * topic still selected as a source. Disabling/removing the source must surface
 * here, never silently drop the edit on the floor.
 */
export function videoEditingSourceIssues(input: {
  layerTopics: Record<'history' | 'predictions' | 'labels' | 'obstacles',readonly string[]>;
  layers: Record<'history' | 'predictions' | 'labels' | 'obstacles',boolean>;
  transformTopics: readonly string[];
  staticTransformTopics: readonly string[];
  calibrationTopic: string;
  cameraTopic: string;
},editing: VideoEditingDraft): VideoEditingIssue[] {
  const issues = new Set<VideoEditingIssue>();
  for (const track of editing.tracks) {
    if (track.kind === 'robot-model' || !track.topic) continue;
    const roles = track.kind === 'path' ? ['history','predictions'] as const : ['labels','obstacles'] as const;
    const owner = roles.find((role) => input.layerTopics[role].includes(track.topic));
    if (!owner) { issues.add('track-topic-not-selected');continue; }
    if (!input.layers[owner]) issues.add('track-layer-disabled');
  }
  const selectedSources = new Set([
    ...input.transformTopics,...input.staticTransformTopics,...Object.values(input.layerTopics).flat(),
    input.calibrationTopic,input.cameraTopic,
  ].filter(Boolean));
  for (const mapping of editing.clockMappings) {
    if (mapping.topic && !selectedSources.has(mapping.topic)) issues.add('clock-topic-not-selected');
  }
  return [...issues];
}

export function videoTrackDraftFromWire(track: VideoTrack): VideoTrackDraft {
  const base = {
    id: track.id,label: track.label,namespace: '',markerId: '',topic: '',frameId: '',modelId: '',
    ...(track.enabled !== undefined ? { enabled:track.enabled } : {}),
    color: '',opacity: '1',widthMeters: '0.01',scale: '1',presentation: 'recorded' as const,
    startSeconds: nsToSeconds(BigInt(track.span.startNs)),endSeconds: nsToSeconds(BigInt(track.span.endNs)),
    fadeInSeconds: nsToSeconds(BigInt(track.animation.fadeInNs)),fadeOutSeconds: nsToSeconds(BigInt(track.animation.fadeOutNs)),
    easing: track.animation.easing,
  };
  if (track.kind === 'path') {
    return { ...base,kind: 'path',topic: track.selector.topic,color: track.style.color,
      opacity: String(track.style.opacity),widthMeters: String(track.style.widthMeters) };
  }
  if (track.kind === 'markers') {
    return { ...base,kind: 'markers',topic: track.selector.topic,
      namespace: track.selector.kind === 'marker' ? track.selector.namespace : '',
      markerId: track.selector.kind === 'marker' ? String(track.selector.id) : '',
      color: track.style.color ?? '',opacity: String(track.style.opacity),scale: String(track.style.scale),
      presentation: track.style.presentation };
  }
  return { ...base,kind: 'robot-model',frameId: track.source.frameId,modelId:track.source.modelId,
    ...(track.source.bundleSha256 !== undefined ? { bundleSha256:track.source.bundleSha256 } : {}),
    color: track.style.color ?? '',opacity: String(track.style.opacity),scale: String(track.style.scale) };
}

export function videoClockMappingDraftFromWire(mapping: VideoClockMapping): VideoClockMappingDraft {
  return {
    id: mapping.id,kind: mapping.selector.kind,
    topic: mapping.selector.topic,
    parentFrame: mapping.selector.kind === 'tf-edge' ? mapping.selector.parentFrame : '',
    childFrame: mapping.selector.kind === 'tf-edge' ? mapping.selector.childFrame : '',
    offsetSeconds: signedNsToSeconds(BigInt(mapping.offsetNs)),
  };
}

export function createVideoEditingSettings(draft: VideoEditingDraft,durationNs?: bigint): VideoEditingResult {
  const issues = new Set<VideoEditingIssue>();
  const tracks: VideoTrack[] = [];
  for (const item of draft.tracks) {
    if (!item.label.trim()) issues.add('track-label-required');
    const start = secondsToNs(item.startSeconds);
    const end = secondsToNs(item.endSeconds);
    const fadeIn = secondsToNs(item.fadeInSeconds);
    const fadeOut = secondsToNs(item.fadeOutSeconds);
    if (start === undefined) issues.add('invalid-track-start');
    if (end === undefined) issues.add('invalid-track-end');
    if (start !== undefined && end !== undefined) {
      if (start >= end) issues.add('empty-track-span');
      if (durationNs !== undefined && end > durationNs) issues.add('track-span-outside-bag');
    }
    if (fadeIn === undefined) issues.add('invalid-fade-in');
    if (fadeOut === undefined) issues.add('invalid-fade-out');
    if (start !== undefined && end !== undefined && fadeIn !== undefined && fadeOut !== undefined && fadeIn + fadeOut > end - start) {
      issues.add('fades-exceed-span');
    }
    const opacity = decimalInRange(item.opacity,0,1);
    if (opacity === undefined) issues.add('invalid-track-opacity');
    if (item.color && !HEX.test(item.color.trim())) issues.add('invalid-track-color');
    const animation = (fadeIn !== undefined && fadeOut !== undefined)
      ? { fadeInNs: String(fadeIn),fadeOutNs: String(fadeOut),easing: item.easing } : undefined;
    const span = (start !== undefined && end !== undefined) ? { startNs: String(start),endNs: String(end) } : undefined;
    if (!span || !animation || opacity === undefined) continue;
    const base = { id: item.id,label: item.label.trim(),span,animation,...(item.enabled !== undefined ? { enabled:item.enabled } : {}) };
    if (item.kind === 'path') {
      if (!item.topic) { issues.add('track-topic-required');continue; }
      if (!HEX.test(item.color.trim())) issues.add('invalid-track-color');
      const width = decimalInRange(item.widthMeters,0.001,1);
      if (width === undefined) { issues.add('invalid-track-width');continue; }
      if (!HEX.test(item.color.trim())) continue;
      tracks.push({ ...base,kind: 'path',selector: { kind: 'topic',topic: item.topic },
        style: { color: item.color.trim(),opacity,widthMeters: width } });
      continue;
    }
    if (item.kind === 'markers') {
      if (!item.topic) { issues.add('track-topic-required');continue; }
      const scale = scaleDecimal(item.scale);
      if (scale === undefined) { issues.add('invalid-track-scale');continue; }
      const namespace = item.namespace.trim();const markerId = item.markerId.trim();
      // An empty namespace with an explicit ID is a valid recorded marker.
      if (markerId) {
        const id = markerIdDecimal(markerId);
        if (id === undefined) { issues.add('invalid-marker-id');continue; }
        tracks.push({ ...base,kind: 'markers',selector: { kind: 'marker',topic: item.topic,namespace,id },
          style: { ...(item.color.trim() ? { color: item.color.trim() } : {}),opacity,scale,presentation: item.presentation } });
        continue;
      }
      tracks.push({ ...base,kind: 'markers',selector: { kind: 'topic',topic: item.topic },
        style: { ...(item.color.trim() ? { color: item.color.trim() } : {}),opacity,scale,presentation: item.presentation } });
      continue;
    }
    if (!item.frameId.trim()) issues.add('track-frame-id-required');
    if (!item.modelId.trim()) issues.add('track-model-required');
    if ((item.bundleSha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.bundleSha256)) || (item.modelId && item.modelId !== 'mocap-rotor' && !item.bundleSha256)) issues.add('track-model-bundle-required');
    if (!item.frameId.trim() || !item.modelId.trim()) continue;
    const scale = scaleDecimal(item.scale);
    if (scale === undefined) { issues.add('invalid-track-scale');continue; }
    tracks.push({ ...base,kind: 'robot-model',source: { modelId:item.modelId,frameId:item.frameId.trim(),...(item.bundleSha256 !== undefined ? { bundleSha256:item.bundleSha256 } : {}) },
      style: { ...(item.color.trim() ? { color: item.color.trim() } : {}),opacity,scale } });
  }
  for (let index = 0; index < draft.tracks.length; index += 1) {
    for (let other = index + 1; other < draft.tracks.length; other += 1) {
      if (tracksConflict(draft.tracks[index],draft.tracks[other])) issues.add('overlapping-tracks');
    }
  }
  const clockMappings: VideoClockMapping[] = [];
  const seenSelectors = new Set<string>();
  for (const item of draft.clockMappings) {
    if (!item.topic) { issues.add('clock-topic-required');continue; }
    if (item.kind === 'tf-edge' && (!item.parentFrame.trim() || !item.childFrame.trim())) { issues.add('clock-edge-required');continue; }
    const offset = signedSecondsToNs(item.offsetSeconds);
    if (offset === undefined) { issues.add('invalid-clock-offset');continue; }
    const key = clockSelectorKey(item);
    if (seenSelectors.has(key)) { issues.add('duplicate-clock-mapping');continue; }
    seenSelectors.add(key);
    clockMappings.push({
      id: item.id,
      selector: item.kind === 'topic' ? { kind: 'topic',topic: item.topic }
        : { kind: 'tf-edge',topic: item.topic,parentFrame: item.parentFrame.trim(),childFrame: item.childFrame.trim() },
      offsetNs: String(offset),provenance: 'operator-declared',
    });
  }
  const topicWideTf = draft.clockMappings.filter((item) => item.kind === 'topic' && item.topic);
  const edgeMappings = draft.clockMappings.filter((item) => item.kind === 'tf-edge' && item.topic);
  if (topicWideTf.some((wide) => edgeMappings.some((edge) => edge.topic === wide.topic))) issues.add('overlapping-tf-clock-mapping');
  if (issues.size) return { ok: false,issues: [...issues] };
  return { ok: true,settings: {
    ...(clockMappings.length ? { clockMappings } : {}),
    ...(tracks.length ? { tracks } : {}),
  } };
}

/** Only an unambiguous catalog relation owns a track; namespaces are never guessed. */
export function videoTrackSourceObject(track: VideoTrackDraft,objects: readonly VideoSourceObject[]) {
  const matches = objects.filter((object) => {
    if (track.kind === 'robot-model') return object.kind === 'robot' && object.robot?.frame.id === track.frameId.trim();
    return object.kind === track.kind && object.selector?.kind === 'topic' && object.selector.topic === track.topic;
  });
  return matches.length === 1 ? matches[0] : undefined;
}
export function videoTrackRobotOwner(track: VideoTrackDraft,objects: readonly VideoSourceObject[]) {
  const object = videoTrackSourceObject(track,objects);
  if (object?.kind === 'robot') return object.id;
  return object?.parentId && objects.some((parent) => parent.id === object.parentId && parent.kind === 'robot') ? object.parentId : undefined;
}
