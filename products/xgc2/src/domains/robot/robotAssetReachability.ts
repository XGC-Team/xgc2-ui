import {
  PX4_MODEL_FS150,
  isMecanumRobotAsset,
  isPX4RobotAsset,
  isScoutRobotAsset,
  px4RobotModelId,
  type RobotAssetDocument,
  type RobotAssetSpec,
} from './robotAssetContracts';
import type { RobotAssetReachabilityState } from './useRobotAssetReachability';

export type RobotAssetConnectivityLevel = 'neutral' | 'success' | 'warning' | 'danger';

export function robotAssetConnectivityLevel(
  state: RobotAssetReachabilityState | undefined,
): RobotAssetConnectivityLevel {
  if (!state) return 'neutral';
  if (state.status === 'error' || state.status === 'unreachable') return 'danger';
  if (!state.result) return 'neutral';
  if (!state.result.reachable) return 'danger';
  return state.result.latencyMs < 15 ? 'success' : 'warning';
}

export function robotReachabilityLabel(
  state: RobotAssetReachabilityState | undefined,
  t: (message: string) => string,
) {
  if (!state) return t('Check management reachability');
  if (state.status === 'checking') return t('Checking management reachability…');
  const prefix = state.status === 'checked' ? `${t('Last management reachability check')} · ` : '';
  if (!state.result) {
    return `${prefix}${t('Management reachability check failed')} · ${state.message || t('Unknown error')}`;
  }
  const outcome = t(state.result.reachable
    ? 'Management address reachable'
    : 'Management address unreachable');
  const latency = state.result.reachable
    ? ` · ${state.result.latencyMs < 1 ? '<1' : Math.round(state.result.latencyMs)} ms` : '';
  return `${prefix}${outcome} · ${state.result.address}${latency} · ${state.result.detail}`;
}

export function robotAssetManagementReachabilitySupported(
  asset: RobotAssetSpec | RobotAssetDocument,
): boolean {
  if (isScoutRobotAsset(asset) || isMecanumRobotAsset(asset)) return true;
  if (!isPX4RobotAsset(asset)) return false;
  const spec = 'head' in asset ? asset.spec : asset;
  return px4RobotModelId(spec) === PX4_MODEL_FS150;
}
