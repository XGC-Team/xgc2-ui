export type RobotInstrumentBoardLayout = {
  visibleRows: number;
  rowHeight: number;
  scrollStep: number;
};

export type RobotInstrumentRectangle = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const preferredRowHeight = 200;
const minimumRowHeight = 176;
const maximumRowHeight = 232;

export function robotInstrumentBoardLayout(
  viewportHeight: number,
  rowGap: number,
  verticalPadding = 0,
): RobotInstrumentBoardLayout {
  const height = Math.max(1, viewportHeight - Math.max(0, verticalPadding));
  const gap = Math.max(0, rowGap);
  const maximumRows = Math.max(1, Math.ceil((height + gap) / (minimumRowHeight + gap)) + 1);
  let best = { rows: 1,height,score: Number.POSITIVE_INFINITY };

  for (let rows = 1; rows <= maximumRows; rows += 1) {
    const rowHeight = (height - gap * (rows - 1)) / rows;
    if (rowHeight <= 0) continue;
    const score = rowHeight < minimumRowHeight
      ? 1000 + (minimumRowHeight - rowHeight) * 10
      : rowHeight > maximumRowHeight
        ? Math.abs(rowHeight - preferredRowHeight) + (rowHeight - maximumRowHeight) * 2
        : Math.abs(rowHeight - preferredRowHeight);
    if (score < best.score) best = { rows,height: rowHeight,score };
  }

  return {
    visibleRows: best.rows,
    rowHeight: best.height,
    scrollStep: best.height + gap,
  };
}

export function robotInstrumentScrollTarget(
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number,
  scrollStep: number,
  rowDelta: number,
) {
  const maximum = Math.max(0, scrollHeight - viewportHeight);
  const current = Math.max(0, Math.min(maximum, scrollTop));
  if (scrollStep <= 0) return current;
  const row = Math.round(current / scrollStep) + Math.trunc(rowDelta);
  return Math.max(0, Math.min(maximum, row * scrollStep));
}

export function robotInstrumentWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number) {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) return deltaY * 40;
  if (deltaMode === 2) return deltaY * Math.max(1, viewportHeight);
  return deltaY;
}

export function robotInstrumentWheelRows(accumulatedDelta: number, wheelDelta: number) {
  if (Math.abs(wheelDelta) >= 40) {
    return {
      rowDelta: Math.sign(wheelDelta) * Math.max(1, Math.round(Math.abs(wheelDelta) / 100)),
      remainder: 0,
    };
  }
  const total = accumulatedDelta + wheelDelta;
  const rowDelta = Math.trunc(total / 40);
  return { rowDelta,remainder: total - rowDelta * 40 };
}

export function robotInstrumentSelectionRectangle(
  start: { x: number;y: number },
  end: { x: number;y: number },
  bounds: Pick<RobotInstrumentRectangle,'left' | 'top' | 'right' | 'bottom'>,
): RobotInstrumentRectangle {
  const startX = clamp(start.x, bounds.left, bounds.right);
  const startY = clamp(start.y, bounds.top, bounds.bottom);
  const endX = clamp(end.x, bounds.left, bounds.right);
  const endY = clamp(end.y, bounds.top, bounds.bottom);
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);
  return { left,top,right,bottom,width: right - left,height: bottom - top };
}

export function robotInstrumentSelectionContainsCenter(
  selection: Pick<RobotInstrumentRectangle,'left' | 'top' | 'right' | 'bottom'>,
  candidate: Pick<RobotInstrumentRectangle,'left' | 'top' | 'right' | 'bottom'>,
) {
  const centerX = (candidate.left + candidate.right) / 2;
  const centerY = (candidate.top + candidate.bottom) / 2;
  return centerX >= selection.left && centerX <= selection.right
    && centerY >= selection.top && centerY <= selection.bottom;
}

export function robotInstrumentToggleAllSelection(current: readonly string[], visible: readonly string[]) {
  if (!visible.length) return [...current];
  const visibleSet = new Set(visible);
  const allVisibleSelected = visible.every((id) => current.includes(id));
  if (allVisibleSelected) return current.filter((id) => !visibleSet.has(id));
  return Array.from(new Set([...current,...visible]));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
