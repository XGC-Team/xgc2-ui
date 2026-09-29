import { booleanValue,streamChannelReady } from './robotTelemetryValues';

export const ROBOT_IMU_CHANNEL_ID = 'state.imu';
export const B2_LINK_CHANNEL_ID = 'diagnostic.link';

/** Matches Core `connectionReleaseDetail` in connection_lifecycle.go. */
export const CONNECTION_RELEASE_DETAIL = 'orchestration runtime released robot connection';
/** Matches Core `connectionRollbackDetailPrefix`. */
export const CONNECTION_ROLLBACK_DETAIL_PREFIX = 'connection startup rolled back: ';

export type RobotConnectionPresentation = 'disconnected' | 'recovering' | 'connected';

export type RobotConnectionLifecycleKind =
  | 'idle'
  | 'opening'
  | 'live'
  | 'user-stop'
  | 'rollback'
  | 'source-loss'
  | 'unknown';

/**
 * Same classification as Core ConnectionLifecycleKindOf. Instruments consume
 * this instead of treating every closed/revoked row as a completed user stop.
 */
export function robotConnectionLifecycleKind(input: {
  connectionState?: string | null;
  connectionDetail?: string | null;
}): RobotConnectionLifecycleKind {
  const state = (input.connectionState ?? '').trim().toLowerCase();
  const detail = input.connectionDetail ?? '';
  if (state === '' || state === 'inactive' || state === 'idle') return 'idle';
  if (state === 'opening') return 'opening';
  if (state === 'live') return 'live';
  if (state === 'closed') return 'source-loss';
  if (state === 'revoked') {
    if (detail.startsWith(CONNECTION_ROLLBACK_DETAIL_PREFIX)) return 'rollback';
    if (detail === CONNECTION_RELEASE_DETAIL) return 'user-stop';
    return 'unknown';
  }
  return 'unknown';
}

/**
 * XGC1 ConnectStatus mapped onto XGC2 tokens, not RGB:
 * NotConnected / completed disconnect → disconnected (dark HUD, gray icon);
 * Connecting / not yet in place → recovering (light HUD);
 * Communicating → connected. RTT is never a connected proof.
 *
 * A1 kinds: user-stop / idle / source-loss → disconnected; opening / rollback /
 * unknown → recovering; live depends on coreReady.
 */
export function robotConnectionPresentation(input: {
  connectionState?: string | null;
  connectionDetail?: string | null;
  hasRun?: boolean;
  coreReady: boolean;
}): RobotConnectionPresentation {
  if (input.hasRun === false) return 'disconnected';
  const kind = robotConnectionLifecycleKind(input);
  if (kind === 'idle' || kind === 'user-stop' || kind === 'source-loss') {
    return 'disconnected';
  }
  if (kind === 'live') return input.coreReady ? 'connected' : 'recovering';
  return 'recovering';
}

export function connectionPresentationTone(
  presentation: RobotConnectionPresentation,
): 'neutral' | 'danger' | 'success' {
  if (presentation === 'disconnected') return 'neutral';
  if (presentation === 'recovering') return 'danger';
  return 'success';
}

export function connectionPresentationLabelKey(presentation: RobotConnectionPresentation) {
  if (presentation === 'disconnected') return 'Robot connection disconnected';
  if (presentation === 'recovering') return 'Robot connection recovering';
  return 'Robot connection normal';
}

export function px4CoreSubscriptionReady(input: {
  flight?: Record<string,unknown>;
  streamHealth?: Record<string,unknown>;
}) {
  return booleanValue(input.flight?.connected) === true
    && streamChannelReady(input.streamHealth, ROBOT_IMU_CHANNEL_ID);
}

export function groundCoreSubscriptionReady(streamHealth?: Record<string,unknown>) {
  return streamChannelReady(streamHealth, ROBOT_IMU_CHANNEL_ID);
}

export function b2CoreSubscriptionReady(linkChannel?: { stale?: boolean } | null) {
  return Boolean(linkChannel) && linkChannel?.stale !== true;
}
