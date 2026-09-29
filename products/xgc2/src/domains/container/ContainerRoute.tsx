import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import { ContainerPage } from './ContainerPage';
import type { ContainerTab } from './containerNavigation';
import './container.css';

export function ContainerRoute() {
  const nav = useNavigation((state) => ({ managedHostId: state.managedHostId,containerSection: state.pageSection('containers') }));
  const { routedTargetCoreId,selectedTargetCore } = useTargetCore('containers');
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const activeTab = (nav.containerSection || 'containers') as ContainerTab;
  return (
    <ContainerPage
      activeTab={activeTab}
      targetId={targetId}
      targetCoreId={routedTargetCoreId}
    />
  );
}
