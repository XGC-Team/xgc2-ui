import { AppStorePanel } from './AppStorePanel';
import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import { selectedExecutionTargetId } from '../execution/executionPublic';

export function AppStoreRoute() {
  const nav = useNavigation();
  const { routedTargetCoreId,selectedTargetCore } = useTargetCore('appStore');
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });

  return (
    <AppStorePanel
      targetId={targetId}
      targetCoreId={routedTargetCoreId}
    />
  );
}
