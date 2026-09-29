import { useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore } from 'react';
import { Notice,useTextPromptDialog } from '@xgc2/ui-react';
import type { TerminalComposition } from './terminalComposition';
import { EMPTY_TERMINAL_COMPOSITION } from './terminalComposition';
import {
  buildTerminalLoginHosts,
  isTerminalDirectShellHostId,
  terminalLoginIdentity,
} from './terminalLoginHosts';
import type { TerminalHost } from './terminalModel';
import { terminalPersistenceScope } from './terminalPersistenceModel';
import { retainTerminalTarget,terminalEmbeddedScope,type TerminalEmbeddedTarget } from './terminalEmbeddedScopeModel';
import { useTerminalText } from './terminalMessages';
import type { TerminalTab } from './terminalNavigation';
import { TerminalWorkspace } from './TerminalWorkspace';
import { useTerminalHostCatalog } from './useTerminalHostCatalog';
import { useTerminalRobotHosts } from './useTerminalRobotHosts';
import { useTerminalSessionController } from './useTerminalSessionController';
import { useTerminalSettingSnapshot } from './useTerminalSettingSnapshot';
import { useProductRouteVisible } from '../../shared/routeReady';
import { TERMINAL_ROBOT_HOST_ID_PREFIX } from './terminalRobotHosts';
import { peekTerminalRobotLogin,subscribeTerminalRobotLogin,takeTerminalRobotLogin } from './terminalRobotLoginIntent';
import '../../styles/terminal.css';

export type TerminalPageProps = {
  activeTab: TerminalTab;
  onTabChange: (tab: TerminalTab) => void;
  visible?: boolean;
  targetCoreId?: string;
  /**
   * Selected managed host (Agent). Omitted/local means Core identity.
   * Login targets and session dials always use this identity's local data plane.
   */
  managedHostId?: string;
  /** Display label for Agent-local synthetic targets. */
  agentLabel?: string;
  /** The containing workspace already selects the target; show its shell directly. */
  embedded?: boolean;
  /** Stable owning workspace ID, used only to isolate embedded session UI state. */
  workspaceId?: string;
  /** Literal working directory for newly created Direct shell sessions. */
  initialDirectory?: string;
  /** Static product leaf graph. Missing slots hide and do not load that owner UI. */
  composition?: TerminalComposition;
};

export function TerminalPage(props: TerminalPageProps) {
  if (props.embedded) {
    return <EmbeddedTerminalPages key={props.workspaceId ?? ''} {...props} />;
  }
  const persistenceScope = terminalPersistenceScope(props.targetCoreId, props.managedHostId);
  return <TerminalPageScope key={persistenceScope} {...props} persistenceScope={persistenceScope} />;
}

// Keep visited host panes mounted while the owning workspace lives. Switching
// A -> B hides A instead of disconnecting its Agent stream or recreating its PTY.
// The containing Deploy page must also hide, not unmount, this component on tabs.
function EmbeddedTerminalPages(props: TerminalPageProps) {
  const { targetCoreId,managedHostId,agentLabel,workspaceId,initialDirectory } = props;
  const target = useMemo(() => ({
    persistenceScope: terminalEmbeddedScope(targetCoreId,managedHostId,workspaceId),
    targetCoreId,
    managedHostId,
    agentLabel,
    initialDirectory,
  }),[agentLabel,managedHostId,targetCoreId,workspaceId,initialDirectory]);
  const [visited,setVisited] = useState<readonly TerminalEmbeddedTarget[]>([target]);
  useEffect(() => {
    setVisited((items) => retainTerminalTarget(items,target));
  },[target]);
  // Render a newly selected target immediately; committing the visit keeps its key.
  return retainTerminalTarget(visited,target).map((item) => (
    <TerminalPageScope
      key={item.persistenceScope}
      {...props}
      {...item}
      activeTab="terminal"
      visible={props.visible !== false && item.persistenceScope === target.persistenceScope}
    />
  ));
}

function TerminalPageScope({
  activeTab,
  onTabChange,
  visible = true,
  targetCoreId,
  managedHostId,
  agentLabel,
  embedded = false,
  persistenceScope,
  initialDirectory,
  composition = EMPTY_TERMINAL_COMPOSITION,
}: TerminalPageProps & { persistenceScope: string }) {
  const routeVisible = useProductRouteVisible();
  const loginIntent = useSyncExternalStore(subscribeTerminalRobotLogin,peekTerminalRobotLogin,() => undefined);
  const localShellEnabled = composition.LocalShell === true;
  const HostsLeaf = composition.RemoteSSH;
  const UserScriptsLeaf = composition.UserScripts;
  const identity = terminalLoginIdentity(managedHostId);
  const isAgentIdentity = identity === 'agent';
  const directOnly = embedded || isAgentIdentity;
  // Agent: Direct shell only. Hosts catalog management is Core-only.
  const hostsEnabled = !embedded && HostsLeaf != null && !isAgentIdentity;
  const userScriptsEnabled = !embedded && UserScriptsLeaf != null;

  const terminalText = useTerminalText();
  const { prompt: promptText,dialog: passwordDialog } = useTextPromptDialog();
  const promptConnectPassword = useCallback(async (host: TerminalHost) => (
    promptText({
      title: `SSH password · ${host.name || host.address}`,
      label: `Password for ${host.user}@${host.address}`,
      submitLabel: terminalText('Connect'),
      placeholder: terminalText('Not saved — used only for this session'),
      inputType: 'password',
    })
  ),[promptText,terminalText]);
  const terminal = useTerminalSessionController({
    persistenceScope,
    onShowTerminal: () => onTabChange('terminal'),
    promptConnectPassword,
    targetCoreId,
    managedHostId,
    initialDirectory,
  });
  const [customHostsReady,setCustomHostsReady] = useState(false);
  // Embedded panes and Agent identity never load Core inventories into Targets.
  const hosts = useTerminalHostCatalog({
    persistenceScope,
    targetCoreId: isAgentIdentity ? undefined : targetCoreId,
    enabled: !directOnly,
    // Session restore waits until identity catalogs are ready (see effect below).
    onLoaded: () => setCustomHostsReady(true),
  });
  // Host catalog errors still count as "ready" so robot-only / Agent login remains usable.
  useEffect(() => {
    if (directOnly || hosts.error) setCustomHostsReady(true);
  },[directOnly,hosts.error]);
  // Robot SSH shortcuts are Core-local inventory only — never projected for Agent.
  const robotHosts = useTerminalRobotHosts(isAgentIdentity ? undefined : targetCoreId, {
    enabled: !directOnly,
  });
  // Embedded panes have one explicit target; the full global Core rail is unchanged.
  const loginHosts = useMemo(
    () => buildTerminalLoginHosts({
      identity,
      customHosts: directOnly ? [] : hosts.items,
      robotHosts: directOnly ? [] : robotHosts.hosts,
      agentLabel,
    }),
    [agentLabel,directOnly,hosts.items,identity,robotHosts.hosts],
  );
  const restoreSessions = terminal.restoreSessions;
  // Wait for Host + Robot catalogs before restoring sessions so Xterm does not
  // connect from stale localStorage first, then get re-restore after close.
  const [loginCatalogReady,setLoginCatalogReady] = useState(false);
  const didRestoreSessions = useRef(false);
  useEffect(() => {
    if (embedded && (!routeVisible || !visible)) return;
    if (!customHostsReady || !robotHosts.ready || didRestoreSessions.current) return;
    didRestoreSessions.current = true;
    restoreSessions(loginHosts);
    setLoginCatalogReady(true);
  },[customHostsReady,embedded,loginHosts,restoreSessions,robotHosts.ready,routeVisible,visible]);
  const openHost = terminal.openHost;
  const openHostRef = useRef(openHost);
  openHostRef.current = openHost;
  const didOpenEmbeddedSession = useRef(false);
  useEffect(() => {
    if (!embedded || !routeVisible || !visible || !localShellEnabled || !loginCatalogReady || didOpenEmbeddedSession.current) return;
    didOpenEmbeddedSession.current = true;
    const host = loginHosts.find((item) => isTerminalDirectShellHostId(item.id));
    if (host && terminal.sessions.length === 0) void openHostRef.current(host);
  }, [embedded,routeVisible,visible,localShellEnabled,loginCatalogReady,loginHosts,terminal.sessions.length]);
  useEffect(() => {
    if (embedded || !routeVisible || !visible || !localShellEnabled || activeTab !== 'terminal'
      || !loginCatalogReady || !loginIntent || loginIntent.scope !== persistenceScope) return;
    const host = loginHosts.find((item) => item.id === `${TERMINAL_ROBOT_HOST_ID_PREFIX}${loginIntent.robotAssetId}`);
    if (!host || !takeTerminalRobotLogin(loginIntent)) return;
    void openHostRef.current(host);
  },[activeTab,embedded,localShellEnabled,loginCatalogReady,loginHosts,loginIntent,persistenceScope,routeVisible,visible]);
  const setting = useTerminalSettingSnapshot(targetCoreId, managedHostId);
  const error = terminal.error
    || (hostsEnabled && !isAgentIdentity ? hosts.error : '')
    || (!directOnly ? robotHosts.error : '')
    || setting.error;

  const HostsView = hostsEnabled ? HostsLeaf : undefined;
  const workspaceVisible = activeTab === 'terminal' || (isAgentIdentity && activeTab === 'hosts');
  // Stale Hosts section while on Agent → fall back to the default Terminal tab.
  useEffect(() => {
    if (isAgentIdentity && activeTab === 'hosts') onTabChange('terminal');
  }, [activeTab, isAgentIdentity, onTabChange]);
  // Missing User scripts leaf → Terminal. There is no commands catalog.
  useEffect(() => {
    if (!userScriptsEnabled && activeTab === 'usernode') onTabChange('terminal');
  }, [activeTab, onTabChange, userScriptsEnabled]);

  return (
    <div
      className="terminal-page xgc-workspace-full-span"
      data-xgc-role="terminal-page" data-xgc-id="terminal-page"
      data-xgc-identity={identity}
      hidden={!visible}
      aria-hidden={!visible}
    >
      {isTerminalAccessError(error) ? (
        <Notice className="terminal-access-note" role="note" tone="warning">
          Terminal access was rejected by the backend policy. Local XGC development is allowed automatically; production should use the global login and ground-station authorization flow.
        </Notice>
      ) : terminal.error ? (
        <Notice className="terminal-access-note" role="note" tone="warning">
          {terminalText(terminal.error)}
        </Notice>
      ) : null}

      {localShellEnabled ? (
        <TerminalWorkspace
          embedded={embedded}
          visible={workspaceVisible}
          hosts={loginHosts}
          sessions={loginCatalogReady ? terminal.sessions : []}
          activeSessionId={terminal.activeSessionId}
          layout={terminal.layout}
          setting={setting.setting}
          targetCoreId={targetCoreId}
          managedHostId={managedHostId}
          terminalRefs={terminal.terminalRefs}
          connectPasswordFor={terminal.connectPasswordFor}
          onOpenHost={(host) => { void terminal.openHost(host); }}
          onCloseSession={terminal.closeSession}
          onActivateSession={terminal.setActiveSessionId}
          onLayoutChange={terminal.setLayout}
          onSessionStatus={terminal.updateSession}
          onError={() => { /* session errors stay silent — no page toast banners */ }}
          userScriptsRailStart={userScriptsEnabled && UserScriptsLeaf && workspaceVisible ? (
            <UserScriptsLeaf
              onSendCommand={terminal.sendCommand}
              targetCoreId={isAgentIdentity ? undefined : targetCoreId}
            />
          ) : null}
        />
      ) : null}
      {passwordDialog}

      {HostsView && activeTab === 'hosts' ? (
        <HostsView
          hosts={hosts.items}
          folders={hosts.collection.folders}
          groups={hosts.collection.groups}
          query={hosts.query}
          groupFilter={hosts.groupFilter}
          collapsedFolders={hosts.collapsedFolders}
          draft={hosts.draft}
          drawerOpen={hosts.drawerOpen}
          error={hosts.mutationError}
          busy={hosts.busy}
          onQueryChange={hosts.setQuery}
          onGroupFilterChange={hosts.setGroupFilter}
          onCollapsedFoldersChange={hosts.setCollapsedFolders}
          onDraftChange={hosts.setDraft}
          onDrawerOpenChange={hosts.setDrawerOpen}
          onCreate={hosts.createDraft}
          onConnect={(host) => { void terminal.openHost(host); }}
          onEdit={hosts.editDraft}
          onDelete={hosts.remove}
          onResetGroup={(host) => hosts.move(host,'Hosts')}
          onMove={hosts.move}
          onSave={hosts.saveDraft}
        />
      ) : null}

      {userScriptsEnabled && UserScriptsLeaf && activeTab === 'usernode' ? (
        <UserScriptsLeaf
          onInserted={() => onTabChange('terminal')}
          onSendCommand={terminal.sendCommand}
          surface="page"
          targetCoreId={isAgentIdentity ? undefined : targetCoreId}
        />
      ) : null}
    </div>
  );
}

function isTerminalAccessError(error: string): boolean {
  return error.includes('401') || error.includes('403');
}
