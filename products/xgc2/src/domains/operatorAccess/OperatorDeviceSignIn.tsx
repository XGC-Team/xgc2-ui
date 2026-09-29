import { Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { InputControl } from '../../components/controls/TextControls';
import { FormActions, FormField } from '../../components/FormPrimitives';
import type { AppLanguage } from '../../shared/localization/languagePreference';
import { operatorAccessCopy } from './operatorAccessMessages';
import { OperatorSessionStatus } from './OperatorSessionStatus';
import { useOperatorDeviceSignIn } from './useOperatorDeviceSignIn';

/**
 * Device sign-in: log another browser in with the identity already verified
 * here. The grant is matched exactly to the current identity — there is no
 * permission editing in this component. Rows are ConfigSection body children.
 */
export function OperatorDeviceSignIn({ language }: { language: AppLanguage }) {
  const copy = operatorAccessCopy(language);
  const { identity, options, host, issued, error, loading, busy, copyMessage, grant, grantUnknown, canGenerate, issuedExpired, selectHost, generate, copyLink } = useOperatorDeviceSignIn(language);
  const showGenerate = Boolean(grant && options);
  const showCopy = Boolean(issued && !issuedExpired);
  return (
    <>
      {identity ? <OperatorSessionStatus language={language} identity={identity} /> : null}
      {error ? <Notice tone="danger" density="compact">{error}</Notice> : null}
      {loading ? <span role="status" aria-label={copy.loading} className="xgc-visually-hidden">{copy.loading}</span> : null}
      {!loading && identity && !identity.canPair ? <Notice tone="neutral" density="compact">{copy.unavailable}</Notice> : null}
      {options && !grant ? <Notice tone="neutral" density="compact">{copy.noGrant}</Notice> : null}
      {grant && grantUnknown.length > 0 ? <Notice tone="warning" density="compact">{copy.issueUndescribed}</Notice> : null}
      {grant && options && !options.origins.length ? <Notice tone="neutral" density="compact">{copy.noOrigins}</Notice> : null}
      {grant && options ? (
        <FormField label={copy.address} dataXgcRole="operator-pairing-address-setting" dataXgcId="operator-pairing">
          <SelectControl ariaLabel={copy.address} value={host} disabled={loading} fill placeholder={copy.chooseAddress}
            dataXgcRole="operator-pairing-address" dataXgcId="operator-pairing"
            options={options.origins.map((origin) => ({ value: origin.host, label: origin.publicOrigin }))}
            onChange={selectHost} />
        </FormField>
      ) : null}
      {issued && !issuedExpired ? (
        <FormField label={copy.link} dataXgcRole="operator-pairing-link-setting" dataXgcId={issued.value.station.stationId}>
          <InputControl readOnly value={issued.link} aria-label={copy.link} dataXgcRole="operator-pairing-link" dataXgcId="operator-pairing" onFocus={(event) => event.currentTarget.select()} />
        </FormField>
      ) : null}
      {issued && issuedExpired ? <Notice tone="warning" density="compact" data-xgc-role="operator-pairing-link-expired" data-xgc-id={issued.value.station.stationId}>{copy.linkExpired}</Notice> : null}
      {showGenerate || showCopy ? (
        <FormActions dataXgcRole="operator-device-sign-in-actions" dataXgcId="operator-pairing">
          {showCopy ? (
            <ControlButton size="compact" dataXgcRole="operator-pairing-copy" dataXgcId="operator-pairing"
              onClick={() => void copyLink()}>{copy.copy}</ControlButton>
          ) : null}
          {showGenerate ? (
            <ControlButton size="compact" tone="primary" disabled={!canGenerate} aria-busy={busy}
              dataXgcRole="operator-pairing-generate" dataXgcId="operator-pairing"
              onClick={() => void generate()}>{copy.generate}</ControlButton>
          ) : null}
        </FormActions>
      ) : null}
      {copyMessage ? <span role="status" className="xgc-visually-hidden">{copyMessage}</span> : null}
    </>
  );
}
