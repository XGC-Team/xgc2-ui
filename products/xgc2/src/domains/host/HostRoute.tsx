import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useNavigation } from '../../app/navigationContext';
import { useTargetCore } from '../../app/useTargetCore';
import type { HostTab } from '../../shared/productWebComposition';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import { isLocalManagedHost, useManagedHosts } from '../managedHost/managedHostPublic';
import { resolveHostSystemContext } from './hostCapabilityModel';
import { HostSystemPage } from './HostSystemPageView';
import {
  EMPTY_HOST_SYSTEM_COMPOSITION,
  type HostRuntimeProcessFocus,
  type HostRuntimeProcessRequest,
  type HostSystemComposition,
} from './hostSystemComposition';

export type HostRouteProps = {
  composition?: HostSystemComposition;
};

export function HostRoute({
  composition = EMPTY_HOST_SYSTEM_COMPOSITION,
}: HostRouteProps = {}) {
  const nav = useNavigation();
  const { routedTargetCoreId,selectedTargetCore } = useTargetCore('system');
  const managedHosts = useManagedHosts();
  const { setPageSection } = nav;
  const executionTargetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const runtimeFocusSequence = useRef(0);
  const [runtimeProcessFocus,setRuntimeProcessFocus] = useState<{
    targetKey: string;
    focus: HostRuntimeProcessFocus;
  }>();
  const targetKey = `${routedTargetCoreId ?? 'local'}:${nav.managedHostId || 'local'}`;
  const inspectRuntimeProcess = useCallback((request: HostRuntimeProcessRequest) => {
    runtimeFocusSequence.current += 1;
    setRuntimeProcessFocus({
      targetKey,
      focus: { ...request,requestId: runtimeFocusSequence.current },
    });
    setPageSection('system','processes');
  },[setPageSection,targetKey]);
  const clearRuntimeProcessFocus = useCallback((requestId: number) => {
    setRuntimeProcessFocus((current) => (
      current?.focus.requestId === requestId ? undefined : current
    ));
  },[]);
  const requestedTab = (nav.pageSection('system') || 'overview') as HostTab;
  const [lastHostTab,setLastHostTab] = useState<HostTab>(() => requestedTab === 'maintenance' ? 'overview' : requestedTab);
  // Maintenance belongs to its own parked ToolboxRoute. Keep this route's
  // existing leaves mounted while that sibling is active, including file paths.
  const activeTab = requestedTab === 'maintenance' ? lastHostTab : requestedTab;
  useEffect(() => {
    if (requestedTab !== 'maintenance') setLastHostTab(requestedTab);
  },[requestedTab]);
  const selectedHost = useMemo(() => {
    if (isLocalManagedHost(nav.managedHostId)) return undefined;
    return managedHosts.find((host) => host.id === nav.managedHostId);
  }, [managedHosts,nav.managedHostId]);
  const system = useMemo(
    () => resolveHostSystemContext({ managedHostId: nav.managedHostId,host: selectedHost }),
    [nav.managedHostId,selectedHost],
  );

  return (
    <HostSystemPage
      activeTab={activeTab}
      targetCoreId={routedTargetCoreId}
      managedHostId={nav.managedHostId}
      executionTargetId={executionTargetId}
      systemProfile={system.systemProfile}
      managementConnection={system.managementConnection}
      composition={composition}
      runtimeProcessFocus={runtimeProcessFocus?.targetKey === targetKey
        ? runtimeProcessFocus.focus
        : undefined}
      onInspectRuntimeProcess={inspectRuntimeProcess}
      onClearRuntimeProcessFocus={clearRuntimeProcessFocus}
    />
  );
}
