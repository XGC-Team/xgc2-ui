import { useCallback,useEffect,useState } from 'react';
import { EmptyState,OperatorWorkspace,Panel } from '@xgc2/ui-react';
import {
  managementConnectionAllowsRequests,
  normalizeManagementConnection,
  normalizeSystemProfile,
  type HostManagementConnection,
  type HostSystemProfile,
  type HostSystemTab,
  LOCAL_HOST_SYSTEM_PROFILE,
} from './hostCapabilityModel';
import { HostRuntimeShell } from './HostRuntimeShell';
import { HostServicesShell } from './HostServicesShell';
import { HostSettingsPanel } from './HostSettingsPanel';
import {
  EMPTY_HOST_SYSTEM_COMPOSITION,
  type HostRuntimeProcessFocus,
  type HostRuntimeProcessRequest,
  type HostSystemComposition,
  type HostSystemLeafComponent,
  type HostSystemLeafContext,
  type HostSystemLeafSlot,
} from './hostSystemComposition';
import { useDeferRouteReady,useProductRouteVisible } from '../../shared/routeReady';
import {
  SystemTabSurface,
  type ParkedHostSystemTab,
} from './hostSystemTabSurface';
import { WorkspaceBusyOverlay } from '../../shared/WorkspaceBusyOverlay';
import './HostSystemPageView.css';

export type HostTab = HostSystemTab;

export function HostSystemPage({
  activeTab,
  targetCoreId,
  managedHostId = 'local',
  executionTargetId = 'local',
  systemProfile,
  managementConnection,
  composition = EMPTY_HOST_SYSTEM_COMPOSITION,
  runtimeProcessFocus,
  onInspectRuntimeProcess,
  onClearRuntimeProcessFocus,
}: {
  activeTab: HostTab;
  targetCoreId?: string;
  managedHostId?: string;
  executionTargetId?: string;
  /** Exact AgentEffective.System projection. Omitted only for local Core composition. */
  systemProfile?: HostSystemProfile;
  managementConnection?: HostManagementConnection;
  /** Static leaf graph supplied by the generated product root. */
  composition?: HostSystemComposition;
  runtimeProcessFocus?: HostRuntimeProcessFocus;
  onInspectRuntimeProcess?: (request: HostRuntimeProcessRequest) => void;
  onClearRuntimeProcessFocus?: (requestId: number) => void;
}) {
  const isRemote = Boolean(managedHostId && managedHostId !== 'local');
  const profile = isRemote
    ? normalizeSystemProfile(systemProfile)
    : LOCAL_HOST_SYSTEM_PROFILE;
  const linkState = isRemote
    ? normalizeManagementConnection(managementConnection)
    : 'ready' as const;
  const requestsAllowed = !isRemote || managementConnectionAllowsRequests(linkState);
  const actionsEnabled = requestsAllowed;
  const targetKey = `${targetCoreId ?? 'local'}:${isRemote ? managedHostId : 'local'}:${linkState}`;
  const leafContext: HostSystemLeafContext = {
    targetCoreId,
    managedHostId: isRemote ? managedHostId : undefined,
    executionTargetId,
    isRemote,
    requestsAllowed,
    actionsEnabled,
    runtimeProcessFocus,
    onInspectRuntimeProcess,
    onClearRuntimeProcessFocus,
  };
  // AgentEffective is an admission fence over a build-time graph; it never discovers code.
  const Overview = admittedLeaf(composition.Overview,!isRemote || profile.Overview);
  const Files = admittedLeaf(composition.Files,!isRemote || profile.Files);
  const Processes = admittedLeaf(composition.Processes,!isRemote || profile.Processes);
  const Network = admittedLeaf(composition.Network,!isRemote || profile.Network);
  const SSHService = admittedLeaf(composition.SSHService,!isRemote || profile.SSHService);
  const Firewall = admittedLeaf(composition.Firewall,!isRemote || profile.Firewall);
  const leaves = { Overview, Files, Processes, Network, SSHService, Firewall };
  const tabAvailable = compositionHasTab(activeTab, leaves);
  const groupedShellOwnsAvailability = activeTab === 'processes' || activeTab === 'ssh';

  return (
    <HostSystemPageTabs
      key={targetKey}
      activeTab={activeTab}
      isRemote={isRemote}
      linkState={linkState}
      requestsAllowed={requestsAllowed}
      tabAvailable={tabAvailable}
      groupedShellOwnsAvailability={groupedShellOwnsAvailability}
      leaves={leaves}
      leafContext={leafContext}
    />
  );
}

function HostSystemPageTabs({
  activeTab,
  isRemote,
  linkState,
  requestsAllowed,
  tabAvailable,
  groupedShellOwnsAvailability,
  leaves,
  leafContext,
}: {
  activeTab: HostTab;
  isRemote: boolean;
  linkState: HostManagementConnection;
  requestsAllowed: boolean;
  tabAvailable: boolean;
  groupedShellOwnsAvailability: boolean;
  leaves: HostSystemComposition;
  leafContext: HostSystemLeafContext;
}) {
  const { Overview, Files, Processes, Network, SSHService, Firewall } = leaves;
  const [visitedTabs, setVisitedTabs] = useState(() => new Set<ParkedHostSystemTab>(
    isParkableTab(activeTab) ? [activeTab] : [],
  ));
  const [readyTabs, setReadyTabs] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!isParkableTab(activeTab)) return;
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const markReady = useCallback((tab: ParkedHostSystemTab) => {
    setReadyTabs((current) => {
      if (current.has(tab)) return current;
      const next = new Set(current);
      next.add(tab);
      return next;
    });
  }, []);

  const revealedTab = visibleParkedSystemTab(activeTab, readyTabs) as HostTab | null;
  const showBusyOverlay = revealedTab === null;
  const surfaceVisible = useProductRouteVisible();
  useDeferRouteReady((tabAvailable || groupedShellOwnsAvailability) && showBusyOverlay);

  if (!tabAvailable && !groupedShellOwnsAvailability) {
    return (
      <OperatorWorkspace
        className="xgc-host-page xgc-workspace-full-span"
        padding="none"
        role="main"
        data-xgc-tab={activeTab}
        data-xgc-role="host-system-page" data-xgc-id="host-system-page"
        data-xgc-remote={isRemote ? 'true' : undefined}
        data-xgc-management-connection={linkState}
      >
        <HostUnavailablePanel
          tab={activeTab}
          reason="disabled"
          description={`${tabLabel(activeTab)} is not present in this product or admitted by the selected Agent profile.`}
        />
      </OperatorWorkspace>
    );
  }

  return (
    <OperatorWorkspace
      className="xgc-host-page xgc-workspace-full-span"
      padding="none"
      role="main"
      data-xgc-tab={revealedTab ?? activeTab}
      data-xgc-role="host-system-page" data-xgc-id="host-system-page"
      data-xgc-remote={isRemote ? 'true' : undefined}
      data-xgc-management-connection={linkState}
      aria-busy={showBusyOverlay ? 'true' : undefined}
    >
      {showBusyOverlay && surfaceVisible ? <WorkspaceBusyOverlay id="system-page" /> : null}
      {includeTab(visitedTabs, activeTab, 'overview') && Overview ? (
        <SystemTabSurface tab="overview" revealed={revealedTab === 'overview'} onReady={markReady}>
          {!requestsAllowed ? (
            <HostOfflineMembershipPanel
              feature="Overview"
              title="Overview offline"
              managementConnection={linkState}
              description="Overview membership is enabled, but the Agent connection is not ready for automatic requests."
            />
          ) : (
            <Overview {...leafContext} />
          )}
        </SystemTabSurface>
      ) : null}
      {includeTab(visitedTabs, activeTab, 'host') ? (
        <SystemTabSurface
          tab="host"
          revealed={revealedTab === 'host'}
          fillWorkspace={false}
          onReady={markReady}
        >
          {!requestsAllowed ? (
            <HostOfflineMembershipPanel
              feature="Host"
              title="Host offline"
              managementConnection={linkState}
              description="Host policy is available, but the Agent connection is not ready for automatic requests."
            />
          ) : (
            <HostSettingsPanel
              apiTarget={{
                ...(leafContext.targetCoreId ? { targetCoreId: leafContext.targetCoreId } : {}),
                ...(leafContext.isRemote && leafContext.managedHostId
                  ? { managedHostId: leafContext.managedHostId }
                  : {}),
              }}
              actionsEnabled={leafContext.actionsEnabled}
            />
          )}
        </SystemTabSurface>
      ) : null}
      {includeTab(visitedTabs, activeTab, 'files') && Files ? (
        <SystemTabSurface tab="files" revealed={revealedTab === 'files'} onReady={markReady}>
          {!requestsAllowed ? (
            <HostOfflineMembershipPanel
              feature="Files"
              managementConnection={linkState}
              description="File browser membership is enabled, but the Agent connection is not ready for automatic requests."
            />
          ) : (
            <Files {...leafContext} />
          )}
        </SystemTabSurface>
      ) : null}
      {includeTab(visitedTabs, activeTab, 'processes') ? (
        <SystemTabSurface tab="processes" revealed={revealedTab === 'processes'} onReady={markReady}>
          <HostRuntimeShell
            context={leafContext}
            processes={Processes}
            network={Network}
          />
        </SystemTabSurface>
      ) : null}
      {includeTab(visitedTabs, activeTab, 'ssh') ? (
        <SystemTabSurface tab="ssh" revealed={revealedTab === 'ssh'} onReady={markReady}>
          <HostServicesShell
            context={leafContext}
            sshService={SSHService}
            firewall={Firewall}
          />
        </SystemTabSurface>
      ) : null}
    </OperatorWorkspace>
  );
}

function visibleParkedSystemTab(
  currentTab: string,
  readyTabs: ReadonlySet<string>,
): string | null {
  return readyTabs.has(currentTab) ? currentTab : null;
}

function includeTab(
  visited: ReadonlySet<ParkedHostSystemTab>,
  activeTab: HostTab,
  tab: ParkedHostSystemTab,
): boolean {
  return visited.has(tab) || activeTab === tab;
}

function isParkableTab(tab: HostTab): tab is ParkedHostSystemTab {
  return tab === 'overview' || tab === 'files' || tab === 'processes' || tab === 'host' || tab === 'ssh';
}

function HostUnavailablePanel({
  tab,
  reason,
  description,
}: {
  tab: HostTab;
  reason: 'disabled' | 'offline';
  description: string;
}) {
  return (
    <Panel title={tabLabel(tab)} data-xgc-role="host-service-unavailable" data-xgc-id={tab}>
      <EmptyState
        title={reason === 'disabled' ? `${tabLabel(tab)} unavailable` : `${tabLabel(tab)} offline`}
        description={description}
        density="compact"
        data-xgc-role="host-unavailable-notice" data-xgc-id="host-unavailable-notice"
        data-xgc-reason={reason}
      />
    </Panel>
  );
}

function HostOfflineMembershipPanel({
  feature,
  title,
  managementConnection,
  description,
}: {
  feature: string;
  title?: string;
  managementConnection: HostManagementConnection;
  description: string;
}) {
  return (
    <Panel title={feature} data-xgc-role="host-service-offline" data-xgc-id={feature.toLowerCase()}>
      <EmptyState
        title={title ?? `${feature} connection ${managementConnection}`}
        description={description}
        density="compact"
        data-xgc-role="host-offline-notice" data-xgc-id="host-offline-notice"
        data-xgc-management-connection={managementConnection}
      />
    </Panel>
  );
}

function admittedLeaf<Slot extends HostSystemLeafSlot>(
  leaf: HostSystemLeafComponent<Slot> | undefined,
  admitted: boolean,
): HostSystemLeafComponent<Slot> | undefined {
  return admitted ? leaf : undefined;
}

function compositionHasTab(tab: HostTab,composition: HostSystemComposition): boolean {
  switch (tab) {
  case 'overview': return Boolean(composition.Overview);
  case 'files': return Boolean(composition.Files);
  case 'processes': return Boolean(composition.Processes || composition.Network);
  case 'host': return true;
  case 'ssh': return Boolean(composition.SSHService || composition.Firewall);
  case 'maintenance': return false;
  default: return false;
  }
}

function tabLabel(tab: HostTab): string {
  switch (tab) {
  case 'overview': return 'Overview';
  case 'files': return 'Files';
  case 'processes': return 'Runtime';
  case 'host': return 'Host';
  case 'maintenance': return 'Maintenance';
  case 'ssh': return 'SSH';
  default: return tab;
  }
}
