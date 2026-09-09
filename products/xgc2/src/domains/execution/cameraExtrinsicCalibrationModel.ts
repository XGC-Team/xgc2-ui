import type { CameraExtrinsicPoint,CameraExtrinsicState } from './cameraExtrinsicCalibrationService';

export function cameraExtrinsicSolvePreflight(
  state: CameraExtrinsicState | undefined,
  points: readonly CameraExtrinsicPoint[],
) {
  if (state?.mode !== 'frozen') return 'Freeze a camera frame before solving.';
  if (points.length < 4) return `Select ${4 - points.length} more marker${points.length === 3 ? '' : 's'}.`;
  const markers = new Map(state.markers.map((marker) => [marker.name,marker.position]));
  const positions = points.map((point) => markers.get(point.marker));
  if (positions.some((position) => !position)) return 'One or more selected robot poses are no longer available.';
  if (spansPlane(positions as ReadonlyArray<readonly [number,number,number]>)) return '';
  return 'The selected robot poses are collinear. Choose markers that span more than one row.';
}

function spansPlane(points: ReadonlyArray<readonly [number,number,number]>) {
  let scale = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      scale = Math.max(scale, distance(points[left]!, points[right]!));
    }
  }
  if (scale <= Number.EPSILON) return false;
  const minimumArea = scale * scale * 1e-6;
  for (let origin = 0; origin < points.length; origin += 1) {
    for (let first = origin + 1; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        if (crossLength(points[origin]!, points[first]!, points[second]!) > minimumArea) return true;
      }
    }
  }
  return false;
}

function distance(left: readonly number[], right: readonly number[]) {
  return Math.hypot(left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!);
}

function crossLength(origin: readonly number[], first: readonly number[], second: readonly number[]) {
  const ax = first[0]! - origin[0]!;const ay = first[1]! - origin[1]!;const az = first[2]! - origin[2]!;
  const bx = second[0]! - origin[0]!;const by = second[1]! - origin[1]!;const bz = second[2]! - origin[2]!;
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}
