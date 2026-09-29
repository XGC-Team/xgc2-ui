const NS = 1_000_000_000n;

/** Output-grid frame step in nanoseconds (floored; per-index times stay exact). */
export function frameStepNs(fps: number) {
  return frameTimeNs(1n,fps);
}

function frameRate(fps: number) {
  if (!Number.isSafeInteger(fps) || fps <= 0) throw new RangeError('Invalid frame rate');
  return BigInt(fps);
}

/** Keep the index before converting to integer nanoseconds to avoid rounding twice. */
export function nearestFrameIndex(value: bigint,fps: number) {
  const rate = frameRate(fps);
  if (value <= 0n) return 0n;
  return (value * rate * 2n + NS) / (2n * NS);
}

export function frameTimeNs(index: bigint,fps: number) {
  return (index < 0n ? 0n : index) * NS / frameRate(fps);
}

/** Round an arbitrary bag-relative time onto the output frame grid. */
export function snapToFrameNs(value: bigint,fps: number) {
  return frameTimeNs(nearestFrameIndex(value,fps),fps);
}

/** Remotion-style timecode: MM:SS:FF, with hours prepended when needed. */
export function formatTimecode(value: bigint,fps: number) {
  const rate = frameRate(fps);
  // Invert the floored nanosecond grid: frame 1 at 30 fps starts at
  // 33333333 ns, which a second floor of time * fps would call frame 0.
  const index = value < 0n ? 0n : ((value + 1n) * rate - 1n) / NS;
  const totalSeconds = index / rate;
  const frame = Number(index % rate);
  const seconds = Number(totalSeconds % 60n);
  const minutes = Number((totalSeconds / 60n) % 60n);
  const hours = Number(totalSeconds / 3600n);
  const pad = (n: number) => String(n).padStart(2,'0');
  const base = `${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

const TICK_STEPS_SECONDS = [0.1,0.2,0.5,1,2,5,10,15,30,60,120,300,600,1800,3600];

/** Ruler ticks with a readable step; always includes t=0 and never exceeds maxTicks. */
export function timelineTicks(durationNs: bigint,maxTicks = 10,offsetNs = 0n) {
  const durationSec = Number(durationNs) / 1e9;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const step = TICK_STEPS_SECONDS.find((candidate) => durationSec / candidate <= maxTicks) ?? 7200;
  const offsetSec = Number(offsetNs) / 1e9;
  const ticks: { ns: bigint;label: string }[] = [];
  for (let index = Math.max(0,Math.ceil(offsetSec / step - 1e-9)); index * step <= offsetSec + durationSec + 1e-9; index += 1) {
    const ns = BigInt(Math.round(index * step * 1e9));
    if (ns > offsetNs + durationNs) break;
    ticks.push({ ns,label: tickLabel(step,index) });
  }
  return ticks;
}

function tickLabel(stepSeconds: number,index: number) {
  const total = index * stepSeconds;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const rest = stepSeconds < 1 ? seconds.toFixed(1).padStart(4,'0') : String(Math.round(seconds)).padStart(2,'0');
  return `${minutes}:${rest}`;
}

/** Zoom keeps at least one second (or the whole bag when shorter) in view. */
export function timelineMinWindowNs(durationNs: bigint) {
  return durationNs < NS ? durationNs : NS;
}

export function timelineMaxZoom(durationNs: bigint) {
  if (durationNs <= 0n) return 1;
  const max = durationNs / timelineMinWindowNs(durationNs);
  return max > 1024n ? 1024 : Number(max);
}

/**
 * The visible window under zoom. The anchor (playhead) stays visible: an
 * in-window anchor keeps the current start, otherwise the window recenters.
 */
export function timelineViewWindow(durationNs: bigint,zoom: number,anchorNs: bigint,currentStartNs?: bigint): { startNs: bigint;endNs: bigint } {
  if (durationNs <= 0n || !Number.isFinite(zoom) || zoom <= 1) return { startNs: 0n,endNs: durationNs };
  const capped = Math.min(zoom,timelineMaxZoom(durationNs));
  const windowNs = durationNs / BigInt(Math.max(1,Math.round(capped)));
  if (windowNs >= durationNs) return { startNs: 0n,endNs: durationNs };
  const anchor = anchorNs < 0n ? 0n : anchorNs > durationNs ? durationNs : anchorNs;
  if (currentStartNs !== undefined && currentStartNs >= 0n) {
    const currentEnd = currentStartNs + windowNs;
    if (currentEnd <= durationNs && anchor >= currentStartNs && anchor <= currentEnd) {
      return { startNs: currentStartNs,endNs: currentEnd };
    }
  }
  let start = anchor - windowNs / 2n;
  if (start < 0n) start = 0n;
  if (start + windowNs > durationNs) start = durationNs - windowNs;
  return { startNs: start,endNs: start + windowNs };
}
