import { LoaderCircle, Wifi, WifiOff } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useAssetsText } from '../assets/assetsPublic';
import {
  robotAssetConnectivityLevel,
  robotReachabilityLabel,
} from './robotAssetReachability';
import type { RobotAssetReachabilityState } from './useRobotAssetReachability';
import './robot-asset-reachability.css';

export function RobotAssetReachabilityButton({
  dataXgcRole,
  dataXgcId,
  state,
  disabled,
  onClick,
}: {
  dataXgcRole: string;
  dataXgcId: string;
  state?: RobotAssetReachabilityState;
  disabled?: boolean;
  onClick: () => void;
}) {
  const t = useAssetsText();
  const connectivityLevel = robotAssetConnectivityLevel(state);
  const reachabilityLabel = robotReachabilityLabel(state, t);
  const checking = state?.status === 'checking';
  return (
    <ControlButton
      iconOnly
      size="compact"
      className="robot-asset-reachability"
      tone={connectivityLevel === 'success' ? 'success'
        : connectivityLevel === 'danger' ? 'danger' : 'default'}
      dataXgcRole={dataXgcRole}
      dataXgcId={dataXgcId}
      data-xgc-state={connectivityLevel}
      data-xgc-check-state={state?.status ?? 'unknown'}
      data-xgc-latency-ms={state?.result?.reachable ? state.result.latencyMs : undefined}
      aria-label={reachabilityLabel}
      title={reachabilityLabel}
      disabled={disabled || checking}
      aria-busy={checking || undefined}
      onClick={onClick}
    >
      {checking
        ? <LoaderCircle data-xgc-spinning="true" size={15} />
        : connectivityLevel === 'danger'
          ? <WifiOff size={15} /> : <Wifi size={15} />}
    </ControlButton>
  );
}
