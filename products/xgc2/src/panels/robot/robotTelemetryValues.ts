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
  return measuredQuaternion(value) ?? { x: 0,y: 0,z: 0,w: 1 };
}

/** Measured attitude only. Missing or degenerate samples are unknown, never identity. */
export function measuredQuaternion(value?: Record<string,unknown>): Quaternion | null {
  if (!value) return null;
  const x = numberValue(value.x);
  const y = numberValue(value.y);
  const z = numberValue(value.z);
  const w = numberValue(value.w);
  if (x == null && y == null && z == null && w == null) return null;
  const quaternion = { x: x ?? 0,y: y ?? 0,z: z ?? 0,w: w ?? 0 };
  const norm = Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
  if (norm < 1e-12) return null;
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
  const quaternion = measuredQuaternion(objectValue(value));
  return quaternion ? normalizeYaw(quaternionYawDegrees(quaternion)) : null;
}

// A stream-health sample is read for many rows on every instrument repaint
// and replaced only when a new sample arrives, so each sample is indexed once.
const streamHealthIndexes = new WeakMap<object,ReadonlyMap<string,Record<string,unknown>>>();

function streamHealthIndex(channels: readonly unknown[]) {
  let index = streamHealthIndexes.get(channels);
  if (!index) {
    const byChannel = new Map<string,Record<string,unknown>>();
    channels.forEach((channel) => {
      const item = objectValue(channel);
      // The first row naming a channel wins, under either spelling.
      [item?.channelId,item?.channel_id].forEach((id) => {
        if (typeof id === 'string' && !byChannel.has(id)) byChannel.set(id, item!);
      });
    });
    index = byChannel;
    streamHealthIndexes.set(channels, index);
  }
  return index;
}

export function streamHealthChannel(health: Record<string,unknown> | undefined, channelId: string) {
  return Array.isArray(health?.channels) ? streamHealthIndex(health.channels).get(channelId) : undefined;
}

/** Missing channel is not ready. A present row without stale is ready. */
export function streamChannelReady(health: Record<string,unknown> | undefined, channelId: string) {
  const channel = streamHealthChannel(health, channelId);
  return Boolean(channel) && booleanValue(channel?.stale) !== true;
}

export function robotStreamRate(health: Record<string,unknown>, channelId: string) {
  const channel = streamHealthChannel(health, channelId);
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
