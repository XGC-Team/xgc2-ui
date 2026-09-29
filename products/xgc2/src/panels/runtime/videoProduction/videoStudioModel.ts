/** Pure studio helpers: output-frame markers, trail sampling and readouts.
 * Nothing here decides admission; Core and the worker re-validate every index. */
import { VIDEO_TRAIL_MAX_SAMPLES } from './videoProductionModel';

const NS = 1_000_000_000n;

/**
 * Evenly spaced output-frame indices over [first, last], both ends included.
 * The window end is always the final sample: the afterimage restores it solid
 * and fades the earlier moments in (R23).
 */
export function distributeTrailFrames(first: number,last: number,count: number): number[] {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || last <= first) return [];
  const span = last - first;
  const wanted = Math.max(2,Math.min(Math.floor(count),VIDEO_TRAIL_MAX_SAMPLES,span + 1));
  const frames = new Set<number>();
  for (let index = 0; index < wanted; index += 1) frames.add(first + Math.round(index * span / (wanted - 1)));
  return [...frames].sort((a,b) => a - b);
}

/**
 * Held camera images are not new observations (R27): when the prepared frame
 * map is known, keep one output frame per source image, preferring the later
 * frame so the window end survives. Without plans the input is returned as-is.
 */
export function distinctSourceFrames(frames: readonly number[],plans?: readonly { frameIndex: number;sourceFrameId: string }[]): number[] {
  if (!plans?.length) return [...frames];
  const seen = new Set<string>();
  const kept: number[] = [];
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const source = plans[frames[index]]?.sourceFrameId;
    if (source === undefined) { kept.push(frames[index]);continue; }
    if (seen.has(source)) continue;
    seen.add(source);kept.push(frames[index]);
  }
  return kept.reverse();
}

/**
 * Output-frame markers (still frame, trail samples) are anchored to source
 * time, not to the clip-relative index: trimming the clip start by Δ frames
 * shifts them by −Δ and drops the ones that fall outside the new clip.
 */
export function reanchorFrames(frames: readonly number[],deltaFrames: number,frameCount: number): number[] {
  return frames.map((frame) => frame - deltaFrames).filter((frame) => frame >= 0 && frame < frameCount);
}

/** Output-grid index whose floored time is at or after a bag-relative time.
 * Grid times are floor(n·1e9/fps), so the exact inverse is a ceiling. */
export function gridIndex(valueNs: bigint,fps: number): bigint {
  return valueNs <= 0n ? 0n : (valueNs * BigInt(fps) + NS - 1n) / NS;
}

/** Whether a bag-relative time lies exactly on the output frame grid. */
export function onFrameGrid(valueNs: bigint,fps: number) {
  return gridIndex(valueNs,fps) * NS / BigInt(fps) === valueNs;
}

/** Human duration like 1:02.500 (minutes:seconds.millis). */
export function formatDurationSeconds(valueNs: bigint) {
  const millis = valueNs <= 0n ? 0n : valueNs / 1_000_000n;
  const minutes = millis / 60_000n;
  const seconds = (millis % 60_000n) / 1000n;
  const rest = millis % 1000n;
  return `${minutes}:${String(seconds).padStart(2,'0')}.${String(rest).padStart(3,'0')}`;
}

/** Keyboard shortcuts must not fire while the operator types into a field. */
export function isTypingTarget(target: EventTarget | null) {
  if (!target || typeof (target as HTMLElement).closest !== 'function') return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('input,textarea,select,[contenteditable="true"],[role="combobox"],[role="listbox"],[role="slider"],iframe'));
}

/** Distinct default colours for new path tracks (colour-blind-aware order). */
export const TRACK_PALETTE = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316'] as const;

/** First palette colour not used by an existing track; cycles when exhausted. */
export function nextTrackColor(used: readonly string[]) {
  const taken = new Set(used.map((color) => color.toLowerCase()));
  return TRACK_PALETTE.find((color) => !taken.has(color)) ?? TRACK_PALETTE[used.length % TRACK_PALETTE.length];
}
