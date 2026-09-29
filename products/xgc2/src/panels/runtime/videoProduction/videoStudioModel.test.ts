// @vitest-environment jsdom
import { describe,expect,it } from 'vitest';
import {
  distinctSourceFrames,distributeTrailFrames,formatDurationSeconds,gridIndex,isTypingTarget,nextTrackColor,onFrameGrid,reanchorFrames,TRACK_PALETTE,
} from './videoStudioModel';
import { createVideoRendition,fadePermille } from './videoProductionModel';

describe('trail sampling helpers',() => {
  it('spreads samples over the window and always ends on the window end',() => {
    expect(distributeTrailFrames(0,299,4)).toEqual([0,100,199,299]);
    expect(distributeTrailFrames(10,20,2)).toEqual([10,20]);
    expect(distributeTrailFrames(0,3,12)).toEqual([0,1,2,3]);
    expect(distributeTrailFrames(0,10000,99)).toHaveLength(32);
    expect(distributeTrailFrames(5,5,4)).toEqual([]);
    expect(distributeTrailFrames(-1,5,4)).toEqual([]);
  });
  it('drops held camera images, keeping the later frame of each source image',() => {
    const plans = [0,1,2,3,4,5].map((frameIndex) => ({ frameIndex,sourceFrameId: `camera:${Math.floor(frameIndex / 2)}` }));
    expect(distinctSourceFrames([0,1,2,3,5],plans)).toEqual([1,3,5]);
    expect(distinctSourceFrames([0,1],undefined)).toEqual([0,1]);
  });
});

describe('afterimage rendition authoring',() => {
  it('writes the afterimage method with explicit fade permille and needs three moments',() => {
    const base = { kind: 'trail' as const,frame: '0',trailFadeFrom: '28',trailFadeTo: '72' };
    expect(createVideoRendition({ ...base,trailFrames: '0,10,20' },30)).toEqual({ ok: true,
      rendition: { kind: 'trail',frames: [0,10,20],method: 'afterimage',fadeFromPermille: 280,fadeToPermille: 720 } });
    expect(createVideoRendition({ ...base,trailFrames: '0,10' },30)).toEqual({ ok: false,issues: ['trail-count'] });
    expect(createVideoRendition({ ...base,trailFrames: '0,10,20',trailFadeTo: '101' },30)).toEqual({ ok: false,issues: ['trail-fade'] });
  });
  it('parses ghost opacity percent to permille',() => {
    expect(fadePermille('28')).toBe(280);
    expect(fadePermille('72.5')).toBe(725);
    expect(fadePermille('100')).toBe(1000);
    expect(fadePermille('0')).toBeUndefined();
    expect(fadePermille('0.05')).toBeUndefined();
    expect(fadePermille('-1')).toBeUndefined();
  });
});

describe('source-anchored markers',() => {
  it('shifts output markers by the trimmed frames and drops those outside the clip',() => {
    expect(reanchorFrames([5,10,20,40],10,25)).toEqual([0,10]);
    expect(reanchorFrames([0,3],-2,10)).toEqual([2,5]);
  });
  it('recognises the floored output frame grid',() => {
    expect(gridIndex(1_000_000_000n,30)).toBe(30n);
    expect(onFrameGrid(33_333_333n,30)).toBe(true);
    expect(onFrameGrid(33_333_334n,30)).toBe(false);
    expect(formatDurationSeconds(62_500_000_000n)).toBe('1:02.500');
  });
  it('treats fields and sliders as typing targets',() => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

it('gives new path tracks distinct default colours',() => {
  expect(nextTrackColor([])).toBe('#3b82f6');
  expect(nextTrackColor(['#3B82F6'])).toBe('#f59e0b');
  expect(nextTrackColor([...TRACK_PALETTE])).toBe(TRACK_PALETTE[0]);
});
