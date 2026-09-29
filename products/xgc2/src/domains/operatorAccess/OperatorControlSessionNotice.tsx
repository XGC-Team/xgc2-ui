import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { operatorAccessCopy } from './operatorAccessMessages';
import { useOperatorControlSession } from './operatorControlSession';

/**
 * Inline annotation for fenced robot-control affordances. Renders nothing
 * while the session is unused, verifying or verified; on a definitive sign-out
 * or an unreachable station it explains why control is disabled and offers a
 * retry in place — it never replaces the surrounding UI.
 */
export function OperatorControlSessionNotice() {
  const copy = operatorAccessCopy(useAppLanguage());
  const { phase, ensuring, retry } = useOperatorControlSession();
  if (phase !== 'denied' && phase !== 'unavailable') return null;
  return (
    <Notice tone={phase === 'denied' ? 'danger' : 'warning'} density="compact"
      data-xgc-role="operator-control-session-notice" data-xgc-id="operator-control-session">
      <span>{phase === 'denied' ? copy.controlSessionDenied : copy.controlSessionUnavailable}</span>
      {' '}
      <ControlButton size="compact" appearance="ghost" disabled={ensuring} aria-busy={ensuring || undefined}
        dataXgcRole="operator-control-session-retry" dataXgcId="operator-control-session"
        onClick={retry}>{ensuring ? copy.controlSessionChecking : copy.controlSessionRetry}</ControlButton>
    </Notice>
  );
}
