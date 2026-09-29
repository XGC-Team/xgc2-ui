// @vitest-environment jsdom
import { describe,expect,it } from 'vitest';
import {
  createVideoEditingSettings,newVideoClockMappingDraft,newVideoEditingDraft,newVideoTrackDraft,partitionVideoEditingIssues,
  signedNsToSeconds,signedSecondsToNs,videoClockMappingDraftFromWire,videoEditingSourceIssues,videoTrackDraftFromWire,
} from './videoEditingModel';
import type { VideoTrack } from '../../../domains/recording/recordingPublic';

const NS = 1_000_000_000n;

describe('signed seconds conversion',() => {
  it('round-trips signed offsets at nanosecond precision',() => {
    expect(signedSecondsToNs('0')).toBe(0n);
    expect(signedSecondsToNs('1.5')).toBe(1_500_000_000n);
    expect(signedSecondsToNs('-0.5')).toBe(-500_000_000n);
    expect(signedSecondsToNs('1700000000.000000001')).toBe(1_700_000_000_000_000_001n);
    expect(signedNsToSeconds(-500_000_000n)).toBe('-0.5');
    expect(signedNsToSeconds(1_700_000_000_000_000_001n)).toBe('1700000000.000000001');
  });
  it('rejects negative zero and malformed input',() => {
    expect(signedSecondsToNs('-0')).toBeUndefined();
    expect(signedSecondsToNs('-0.000000000')).toBeUndefined();
    expect(signedSecondsToNs('abc')).toBeUndefined();
    expect(signedSecondsToNs('1.0000000001')).toBeUndefined();
  });
});

describe('createVideoEditingSettings',() => {
  it('omits editing keys entirely when nothing was authored',() => {
    const result = createVideoEditingSettings(newVideoEditingDraft(),10n * NS);
    expect(result).toEqual({ ok: true,settings: {} });
  });
  it('builds a wire path track with span, fades and style',() => {
    const draft = newVideoTrackDraft('path',{ topic: '/planned',color: '#22c55e',widthMeters: 0.01,durationNs: 10n * NS });
    draft.label = 'Planned path';draft.fadeInSeconds = '0.25';draft.easing = 'ease-out';
    const result = createVideoEditingSettings({ clockMappings: [],tracks: [draft] },10n * NS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.tracks).toEqual([{
      id: draft.id,label: 'Planned path',kind: 'path',selector: { kind: 'topic',topic: '/planned' },
      span: { startNs: '0',endNs: '10000000000' },
      animation: { fadeInNs: '250000000',fadeOutNs: '0',easing: 'ease-out' },
      style: { color: '#22c55e',opacity: 1,widthMeters: 0.01 },
    }]);
    expect(result.settings.clockMappings).toBeUndefined();
  });
  it('rejects same-object tracks with intersecting spans, allows disjoint spans',() => {
    const a = newVideoTrackDraft('path',{ topic: '/planned',color: '#22c55e',durationNs: 10n * NS });
    a.label = 'A';a.endSeconds = '6';
    const b = { ...newVideoTrackDraft('path',{ topic: '/planned',color: '#22c55e',durationNs: 10n * NS }),id: 'b' };
    b.label = 'B';b.startSeconds = '4';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [a,b] },10n * NS)).toEqual({ ok: false,issues: ['overlapping-tracks'] });
    b.startSeconds = '6';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [a,b] },10n * NS)).toEqual(expect.objectContaining({ ok: true }));
  });
  it('treats a topic-wide markers track as covering specific markers of the topic',() => {
    const wide = newVideoTrackDraft('markers',{ topic: '/obstacles',durationNs: 10n * NS });wide.label = 'Wide';
    const specific = { ...newVideoTrackDraft('markers',{ topic: '/obstacles',durationNs: 10n * NS }),id: 's' };
    specific.label = 'One';specific.namespace = 'walls';specific.markerId = '1';specific.startSeconds = '2';specific.endSeconds = '4';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [wide,specific] },10n * NS)).toEqual({ ok: false,issues: ['overlapping-tracks'] });
    const otherTopic = { ...specific,id: 's2',topic: '/labels' };
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [wide,otherTopic] },10n * NS)).toEqual(expect.objectContaining({ ok: true }));
  });
  it('accepts signed int32 marker IDs and empty namespaces, rejects overflow',() => {
    const marker = newVideoTrackDraft('markers',{ topic: '/obstacles',durationNs: 10n * NS });
    marker.label = 'M';marker.markerId = '-1';
    const negative = createVideoEditingSettings({ clockMappings: [],tracks: [marker] },10n * NS);
    expect(negative.ok).toBe(true);
    if (negative.ok) expect(negative.settings.tracks?.[0]).toEqual(expect.objectContaining({ selector: { kind: 'marker',topic: '/obstacles',namespace: '',id: -1 } }));
    marker.markerId = '2147483648';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [marker] },10n * NS)).toEqual({ ok: false,issues: ['invalid-marker-id'] });
    marker.markerId = '-2147483649';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [marker] },10n * NS)).toEqual({ ok: false,issues: ['invalid-marker-id'] });
  });
  it('validates robot-model frame and the Core scale range [0.001, 100]',() => {
    const robot = newVideoTrackDraft('robot-model',{ durationNs: 10n * NS,modelId:'mocap-rotor' });robot.label = 'R';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [robot] },10n * NS)).toEqual({ ok: false,issues: ['track-frame-id-required'] });
    robot.frameId = 'uav1/base_link';robot.scale = '101';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [robot] },10n * NS)).toEqual({ ok: false,issues: ['invalid-track-scale'] });
    robot.scale = '0.0005';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [robot] },10n * NS)).toEqual({ ok: false,issues: ['invalid-track-scale'] });
    robot.scale = '100';
    const ok = createVideoEditingSettings({ clockMappings: [],tracks: [robot] },10n * NS);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.settings.tracks?.[0]).toEqual(expect.objectContaining({ source: { modelId: 'mocap-rotor',frameId: 'uav1/base_link' } }));
  });
  it('rejects fades exceeding the span and spans outside the bag',() => {
    const track = newVideoTrackDraft('path',{ topic: '/planned',color: '#22c55e',durationNs: 10n * NS });
    track.label = 'F';track.startSeconds = '4';track.endSeconds = '6';track.fadeInSeconds = '1.5';track.fadeOutSeconds = '1';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [track] },10n * NS)).toEqual({ ok: false,issues: ['fades-exceed-span'] });
    track.fadeInSeconds = '1';track.endSeconds = '11';
    expect(createVideoEditingSettings({ clockMappings: [],tracks: [track] },10n * NS)).toEqual({ ok: false,issues: ['track-span-outside-bag'] });
  });
  it('rejects duplicate clock scopes and topic-wide TF over edge mappings',() => {
    const edge = { ...newVideoClockMappingDraft(),id: 'e',kind: 'tf-edge' as const,topic: '/tf',parentFrame: 'world',childFrame: 'uav1/base_link',offsetSeconds: '-0.5' };
    const duplicate = { ...newVideoClockMappingDraft(),id: 'e2',kind: 'tf-edge' as const,topic: '/tf',parentFrame: 'world',childFrame: 'uav1/base_link' };
    const result = createVideoEditingSettings({ clockMappings: [edge,duplicate],tracks: [] });
    expect(result).toEqual({ ok: false,issues: ['duplicate-clock-mapping'] });
    const wide = { ...newVideoClockMappingDraft(),id: 'w',topic: '/tf' };
    expect(createVideoEditingSettings({ clockMappings: [edge,wide],tracks: [] })).toEqual({ ok: false,issues: ['overlapping-tf-clock-mapping'] });
    const otherEdge = { ...edge,id: 'e3',childFrame: 'uav2/base_link' };
    expect(createVideoEditingSettings({ clockMappings: [edge,otherEdge],tracks: [] })).toEqual(expect.objectContaining({ ok: true }));
  });
  it('maps a signed offset onto the wire and back',() => {
    const mapping = { ...newVideoClockMappingDraft(),id: 'm',topic: '/tf',offsetSeconds: '-1.25' };
    const result = createVideoEditingSettings({ clockMappings: [mapping],tracks: [] });
    expect(result).toEqual({ ok: true,settings: { clockMappings: [{
      id: 'm',selector: { kind: 'topic',topic: '/tf' },offsetNs: '-1250000000',provenance: 'operator-declared',
    }] } });
    if (result.ok) {
      expect(videoClockMappingDraftFromWire(result.settings.clockMappings![0])).toEqual(mapping);
    }
  });
  it('rejects clock offsets beyond signed int64 nanoseconds',() => {
    const overflow = { ...newVideoClockMappingDraft(),id: 'o',topic: '/tf',offsetSeconds: '9223372036.854775808' };
    expect(createVideoEditingSettings({ clockMappings: [overflow],tracks: [] })).toEqual({ ok: false,issues: ['invalid-clock-offset'] });
    const max = { ...newVideoClockMappingDraft(),id: 'm',topic: '/tf',offsetSeconds: '9223372036.854775807' };
    expect(createVideoEditingSettings({ clockMappings: [max],tracks: [] })).toEqual(expect.objectContaining({ ok: true }));
  });
  it('round-trips a wire track through the draft form',() => {
    const wire: VideoTrack = {
      id: 't',label: 'Obstacle',kind: 'markers',selector: { kind: 'marker',topic: '/obstacles',namespace: 'walls',id: 1 },
      span: { startNs: String(NS),endNs: String(8n * NS) },
      animation: { fadeInNs: String(200_000_000n),fadeOutNs: '0',easing: 'ease-in-out' },
      style: { color: '#ff9900',opacity: 0.8,scale: 1,presentation: 'wireframe' },
    };
    const draft = videoTrackDraftFromWire(wire);
    const result = createVideoEditingSettings({ clockMappings: [],tracks: [draft] },10n * NS);
    expect(result).toEqual({ ok: true,settings: { tracks: [wire] } });
  });
  it.each([undefined,false,true])('preserves legacy model and optional visibility %s without adding a bundle', (enabled) => {
    const wire:VideoTrack = { id:'old',label:'Old model',kind:'robot-model',source:{ modelId:'mocap-rotor',frameId:'uav1/base_link' },
      ...(enabled === undefined ? {} : { enabled }),span:{ startNs:'0',endNs:String(10n * NS) },
      animation:{ fadeInNs:'0',fadeOutNs:'0',easing:'linear' },style:{ opacity:1,scale:1 } };
    expect(createVideoEditingSettings({ tracks:[videoTrackDraftFromWire(wire)],clockMappings:[] })).toEqual({ ok:true,settings:{ tracks:[wire] } });
  });
  it('requires a controlled model bundle and keeps its exact digest through editing',() => {
    const track = newVideoTrackDraft('robot-model',{ modelId:'scout',frameId:'ugv/base_link',durationNs:10n * NS });track.label = 'Scout';
    expect(createVideoEditingSettings({ tracks:[track],clockMappings:[] })).toEqual({ ok:false,issues:['track-model-bundle-required'] });
    track.bundleSha256 = 'b'.repeat(64);track.enabled = false;
    const result = createVideoEditingSettings({ tracks:[track],clockMappings:[] });
    expect(result.ok).toBe(true);if (!result.ok) return;
    expect(result.settings.tracks![0]).toMatchObject({ enabled:false,source:{ modelId:'scout',bundleSha256:track.bundleSha256 } });
    expect(videoTrackDraftFromWire(result.settings.tracks![0])).toMatchObject({ bundleSha256:track.bundleSha256,enabled:false });
    expect(createVideoEditingSettings({ tracks:[track,{ ...track,id:'overlap' }],clockMappings:[] })).toEqual({ ok:false,issues:['overlapping-tracks'] });
  });
  it('splits track and clock issues for the two inspector cards',() => {
    const track = newVideoTrackDraft('robot-model',{ durationNs: 10n * NS });
    const clock = newVideoClockMappingDraft();
    const result = createVideoEditingSettings({ clockMappings: [clock],tracks: [track] });
    if (result.ok) throw new Error('must fail');
    const { trackIssues,clockIssues } = partitionVideoEditingIssues(result.issues);
    expect(trackIssues).toEqual(['track-label-required','track-frame-id-required','track-model-required']);
    expect(clockIssues).toEqual(['clock-topic-required']);
  });
  it('flags tracks whose layer is disabled or whose topic source was removed',() => {
    const base = {
      layerTopics: { history: ['/planned'],predictions: [],labels: [],obstacles: [] },
      layers: { history: true,predictions: false,labels: false,obstacles: false },
      transformTopics: ['/tf'],staticTransformTopics: [],calibrationTopic: '/camera/info',cameraTopic: '/camera/image/compressed',
    };
    const track = newVideoTrackDraft('path',{ topic: '/planned',color: '#22c55e',durationNs: 10n * NS });track.label = 'P';
    const editing = { clockMappings: [],tracks: [track] };
    expect(videoEditingSourceIssues(base,editing)).toEqual([]);
    expect(videoEditingSourceIssues({ ...base,layers: { ...base.layers,history: false } },editing)).toEqual(['track-layer-disabled']);
    expect(videoEditingSourceIssues({ ...base,layerTopics: { ...base.layerTopics,history: [] } },editing)).toEqual(['track-topic-not-selected']);
    const robot = newVideoTrackDraft('robot-model',{ durationNs: 10n * NS,modelId:'mocap-rotor' });robot.label = 'R';robot.frameId = 'uav1/base_link';
    expect(videoEditingSourceIssues(base,{ clockMappings: [],tracks: [robot] })).toEqual([]);
  });
  it('flags clock mappings whose topic is no longer a selected source',() => {
    const base = {
      layerTopics: { history: [],predictions: [],labels: [],obstacles: [] },
      layers: { history: false,predictions: false,labels: false,obstacles: false },
      transformTopics: ['/tf'],staticTransformTopics: [],calibrationTopic: '/camera/info',cameraTopic: '/camera/image/compressed',
    };
    const mapping = { ...newVideoClockMappingDraft(),topic: '/tf' };
    expect(videoEditingSourceIssues(base,{ clockMappings: [mapping],tracks: [] })).toEqual([]);
    expect(videoEditingSourceIssues({ ...base,transformTopics: [] },{ clockMappings: [mapping],tracks: [] })).toEqual(['clock-topic-not-selected']);
  });
});
