import { ConfigSection } from '../../components/ConfigSection';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import { operatorAccessCopy } from './operatorAccessMessages';
import { OperatorDeviceSignIn } from './OperatorDeviceSignIn';

/** Settings secondary entry for device sign-in (composition owned by the Settings page). */
export function DeviceSignInSettingsSection({ language }: ProductSettingsContext) {
  const copy = operatorAccessCopy(language);
  return (
    <ConfigSection defaultOpen={false} title={copy.title} dataXgcRole="operator-device-sign-in-settings" dataXgcId="operator-device-sign-in">
      <OperatorDeviceSignIn language={language} />
    </ConfigSection>
  );
}
