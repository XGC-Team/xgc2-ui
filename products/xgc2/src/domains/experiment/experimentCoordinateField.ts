/** Authored meters and radians show at most two decimal places. */
export function coordinateFieldText(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = roundCoordinate(value);
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** An edited axis stores the same two-decimal value the field shows. */
export function coordinateFieldNumber(text: string): number {
  if (text.trim() === '') return Number.NaN;
  const value = Number(text);
  if (!Number.isFinite(value)) return Number.NaN;
  const rounded = roundCoordinate(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
