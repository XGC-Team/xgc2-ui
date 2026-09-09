import { useMemo } from 'react';
import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import { HostSettingsPanel,resolveHostSystemContext } from '../host/hostPublic';
import { isLocalManagedHost,useManagedHosts } from '../managedHost/managedHostPublic';
import { ToolboxPage } from './ToolboxPage';
import '../../styles/toolbox.css';

export function ToolboxRoute() {
  const nav = useNavigation();
  const { routedTargetCoreId,selectedTargetCore } = useTargetCore('maintenance');
  const managedHosts = useManagedHosts();
  const targetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const selectedHost = useMemo(() => {
    if (isLocalManagedHost(nav.managedHostId)) return undefined;
    return managedHosts.find((host) => host.id === nav.managedHostId);
  }, [managedHosts,nav.managedHostId]);
  const isRemote = !isLocalManagedHost(nav.managedHostId);
  const system = resolveHostSystemContext({ managedHostId: nav.managedHostId,host: selectedHost });
  const maintenanceEnabled = isRemote ? system.systemProfile.MaintenanceCleanup : true;

  return (
    <ToolboxPage
      activeTab="cleanup"
      targetId={targetId}
      targetCoreId={routedTargetCoreId}
      language={nav.language}
      managedHostId={isRemote ? nav.managedHostId : undefined}
      maintenanceEnabled={maintenanceEnabled}
      requestsAllowed={system.requestsAllowed}
      managementConnection={system.managementConnection}
      performanceControl={system.requestsAllowed && (!isRemote || system.systemProfile.Overview) ? (
        <HostSettingsPanel
          apiTarget={{
            ...(routedTargetCoreId ? { targetCoreId: routedTargetCoreId } : {}),
            ...(isRemote ? { managedHostId: nav.managedHostId } : {}),
          }}
          actionsEnabled={system.requestsAllowed}
          presentation="performance"
        />
      ) : undefined}
    />
  );
}
