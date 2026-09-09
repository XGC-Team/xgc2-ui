import { useMemo } from 'react';
import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import type { ProductSettingsContext } from '../../shared/productWebComposition';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import { AppStoreSettingsSection } from './AppStoreSettingsSection';
import { appStoreSettingsCopy } from './appStoreSettingsCopy';

/**
 * AppStore-domain-owned Settings contribution.
 * Derives targetId/targetCoreId from navigation + target core; generic Settings
 * hosts never receive AppStore fields or copy.
 */
export function AppStoreSettingsAdapter({ language }: ProductSettingsContext) {
  const nav = useNavigation();
  const { routedTargetCoreId,selectedTargetCore } = useTargetCore('appStore');
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const copy = appStoreSettingsCopy[language];
  const labels = useMemo(() => copy.labels, [copy.labels]);

  return (
    <AppStoreSettingsSection
      targetId={targetId}
      targetCoreId={routedTargetCoreId}
      title={copy.title}
      labels={labels}
    />
  );
}
