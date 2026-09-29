import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { InputControl } from '../../components/controls/TextControls';
import { FormActions, FormField } from '../../components/FormPrimitives';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import type { OperatorIdentity } from './operatorAccessTypes';
import { formatOperatorExpiry, operatorAccessCopy } from './operatorAccessMessages';
import { useOperatorSessionStatus } from './useOperatorSessionStatus';

export function OperatorSessionStatus({ language, identity, onSignedOut }: {
  language: AppLanguage;
  identity?: OperatorIdentity;
  onSignedOut?: () => void;
}) {
  const copy = operatorAccessCopy(language);
  const { current, error, busy, signOut } = useOperatorSessionStatus({ language, identity, onSignedOut });
  return (
    <>
      {error ? <Notice density="compact" tone="danger">{error}</Notice> : null}
      {!current && !error ? <span role="status" aria-label={copy.loading} className="xgc-visually-hidden">{copy.loading}</span> : null}
      {current?.authenticated === false ? <Notice density="compact" tone="neutral">{copy.signedOut}</Notice> : null}
      {current?.authenticated ? (
        <FormField label={copy.current} dataXgcRole="operator-session-browser-setting" dataXgcId={current.stationId}>
          <InputControl readOnly value={current.name} aria-label={copy.current}
            dataXgcRole="operator-session-browser" dataXgcId={current.stationId} />
        </FormField>
      ) : null}
      {current?.authenticated && current.expiresAt ? (
        <FormField label={copy.expires} dataXgcRole="operator-session-expiry-setting" dataXgcId={current.stationId}>
          <InputControl readOnly value={formatOperatorExpiry(current.expiresAt, language)} aria-label={copy.expires}
            dataXgcRole="operator-session-expiry" dataXgcId={current.stationId} />
        </FormField>
      ) : null}
      {current?.authenticated && current.transport !== 'local' ? (
        <FormActions dataXgcRole="operator-device-sign-in-actions" dataXgcId={current.stationId}>
          <ControlButton size="compact" onClick={() => void signOut()} disabled={busy} aria-busy={busy}
            dataXgcRole="operator-session-signout" dataXgcId={current.stationId}>{copy.logout}</ControlButton>
        </FormActions>
      ) : null}
    </>
  );
}
