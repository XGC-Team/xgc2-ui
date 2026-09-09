export type RobotHealthTone = 'idle' | 'healthy' | 'fault' | 'unavailable';

export type RobotInstrumentVector = {
  x: number | null;
  y: number | null;
  z: number | null;
};

type Quaternion = { x: number;y: number;z: number;w: number };

export function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

/** Protojson may emit camelCase or proto names depending on the Core encoder. */
export function firstNumber(record: Record<string,unknown> | undefined, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value != null) return value;
  }
  return undefined;
}

export function clamp(value: number,min: number,max: number) {
  return Math.max(min,Math.min(max,value));
}

/**
 * HUD ruler decimal. `Number#toFixed` keeps IEEE signed zero (`-0.0`) for
 * tiny negatives, which flickers the leading minus on a parked UGV.
 * Values that round to 0 paint unsigned `0.0`. Real negatives keep `-`.
 * Do not reserve a HUD figure-space sign column — that would shift UAV
 * positive altitudes and change the PFD.
 */
export function unsignedZeroFixed(value: number, digits: number) {
  const formatted = value.toFixed(digits);
  return formatted.startsWith('-') && Number(formatted) === 0
    ? formatted.slice(1)
    : formatted;
}

export function normalizedQuaternion(value?: Record<string,unknown>): Quaternion {
  const quaternion = {
    x: numberValue(value?.x) ?? 0,
    y: numberValue(value?.y) ?? 0,
    z: numberValue(value?.z) ?? 0,
    w: numberValue(value?.w) ?? 1,
  };
  const norm = Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
  if (norm < 1e-12) return { x: 0,y: 0,z: 0,w: 1 };
  return { x: quaternion.x / norm,y: quaternion.y / norm,z: quaternion.z / norm,w: quaternion.w / norm };
}

export function quaternionRollDegrees(q: Quaternion) {
  return Math.atan2(2 * (q.w * q.x + q.y * q.z),1 - 2 * (q.x * q.x + q.y * q.y)) * 180 / Math.PI;
}

export function quaternionPitchDegrees(q: Quaternion) {
  return Math.asin(clamp(2 * (q.w * q.y - q.z * q.x),-1,1)) * 180 / Math.PI;
}

export function quaternionYawDegrees(q: Quaternion) {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y),1 - 2 * (q.y * q.y + q.z * q.z)) * 180 / Math.PI;
}

export function normalizeYaw(value: number) {
  const yaw = value % 360;
  return yaw < 0 ? yaw + 360 : yaw;
}

export function orientationYawDegrees(value: unknown) {
  const orientation = objectValue(value);
  if (!orientation || !['x','y','z','w'].some((axis) => numberValue(orientation[axis]) != null)) return null;
  return normalizeYaw(quaternionYawDegrees(normalizedQuaternion(orientation)));
}

export function robotStreamRate(health: Record<string,unknown>, channelId: string) {
  const channels = Array.isArray(health.channels) ? health.channels : [];
  const channel = channels.map(objectValue).find((item) => (
    item?.channelId === channelId || item?.channel_id === channelId
  ));
  return numberValue(channel?.sourceRateHz) ?? numberValue(channel?.source_rate_hz) ?? 0;
}

/** Euclidean ||twist.linear||_2. Missing axes count as 0; all missing => null. */
export function twistLinearSpeed2Norm(linear?: Record<string, unknown> | null) {
  if (!linear) return null;
  const x = numberValue(linear.x);
  const y = numberValue(linear.y);
  const z = numberValue(linear.z);
  if (x == null && y == null && z == null) return null;
  return Math.hypot(x ?? 0, y ?? 0, z ?? 0);
}
