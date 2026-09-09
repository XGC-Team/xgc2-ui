export const INSTRUMENT_DETAIL_POINTER_GAP = 12;
export const INSTRUMENT_DETAIL_VIEWPORT_PAD = 8;

export function placeInstrumentDetailNearPointer({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  gap = INSTRUMENT_DETAIL_POINTER_GAP,
  pad = INSTRUMENT_DETAIL_VIEWPORT_PAD,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  pad?: number;
}) {
  const boxWidth = Math.max(width, 160);
  const boxHeight = Math.max(height, 24);
  const right = x + gap + boxWidth <= viewportWidth - pad;
  const below = y + gap + boxHeight <= viewportHeight - pad;
  const left = right
    ? x + gap
    : x - gap - boxWidth;
  const top = below
    ? y + gap
    : y - gap - boxHeight;
  return {
    left: Math.min(Math.max(pad, left), Math.max(pad, viewportWidth - boxWidth - pad)),
    top: Math.min(Math.max(pad, top), Math.max(pad, viewportHeight - boxHeight - pad)),
  };
}
