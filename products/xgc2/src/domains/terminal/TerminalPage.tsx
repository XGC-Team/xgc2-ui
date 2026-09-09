import { useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore } from 'react';
import { Notice,useTextPromptDialog } from '@xgc2/ui-react';
import type { TerminalComposition } from './terminalComposition';
import { EMPTY_TERMINAL_COMPOSITION } from './terminalComposition';
import {
  buildTerminalLoginHosts,
  terminalLoginIdentity,
} from './terminalLoginHosts';
import type { TerminalHost } from './terminalModel';
import { terminalPersistenceScope } from './terminalPersistenceModel';
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
  /** Static product leaf graph. Missing slots hide and do not load that owner UI. */
  composition?: TerminalComposition;
};

export function TerminalPage(props: TerminalPageProps) {
  const persistenceScope = terminalPersistenceScope(props.targetCoreId, props.managedHostId);
  return <TerminalPageScope key={persistenceScope} {...props} persistenceScope={persistenceScope} />;
}

function TerminalPageScope({
  activeTab,
  onTabChange,
  visible = true,
  targetCoreId,
  managedHostId,
  agentLabel,
  persistenceScope,
  composition = EMPTY_TERMINAL_COMPOSITION,
}: TerminalPageProps & { persistenceScope: string }) {
  const routeVisible = useProductRouteVisible();
  const loginIntent = useSyncExternalStore(subscribeTerminalRobotLogin,peekTerminalRobotLogin,() => undefined);
  const localShellEnabled = composition.LocalShell === true;
  const HostsLeaf = composition.RemoteSSH;
  const UserScriptsLeaf = composition.UserScripts;
  const identity = terminalLoginIdentity(managedHostId);
  const isAgentIdentity = identity === 'agent';
  // Agent: Direct shell only. Hosts catalog management is Core-only.
  const hostsEnabled = HostsLeaf != null && !isAgentIdentity;
  const userScriptsEnabled = UserScriptsLeaf != null;

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
  });
  const [customHostsReady,setCustomHostsReady] = useState(false);
  // Agent identity never loads Core Host catalog into Targets (local Agent data only).
  const hosts = useTerminalHostCatalog({
    persistenceScope,
    targetCoreId: isAgentIdentity ? undefined : targetCoreId,
    enabled: !isAgentIdentity,
    // Session restore waits until identity catalogs are ready (see effect below).
    onLoaded: () => setCustomHostsReady(true),
  });
  // Host catalog errors still count as "ready" so robot-only / Agent login remains usable.
  useEffect(() => {
    if (isAgentIdentity || hosts.error) setCustomHostsReady(true);
  },[hosts.error,isAgentIdentity]);
  // Robot SSH shortcuts are Core-local inventory only — never projected for Agent.
  const robotHosts = useTerminalRobotHosts(isAgentIdentity ? undefined : targetCoreId, {
    enabled: !isAgentIdentity,
  });
  // Targets rail is identity-local: Core = Direct + Hosts + robots; Agent = Direct only.
  const loginHosts = useMemo(
    () => buildTerminalLoginHosts({
      identity,
      customHosts: isAgentIdentity ? [] : hosts.items,
      robotHosts: isAgentIdentity ? [] : robotHosts.hosts,
      agentLabel,
    }),
    [agentLabel,hosts.items,identity,isAgentIdentity,robotHosts.hosts],
  );
  const restoreSessions = terminal.restoreSessions;
  // Wait for Host + Robot catalogs before restoring sessions so Xterm does not
  // connect from stale localStorage first, then get re-restore after close.
  const [loginCatalogReady,setLoginCatalogReady] = useState(false);
  const didRestoreSessions = useRef(false);
  useEffect(() => {
    if (!customHostsReady || !robotHosts.ready || didRestoreSessions.current) return;
    didRestoreSessions.current = true;
    restoreSessions(loginHosts);
    setLoginCatalogReady(true);
  },[customHostsReady,loginHosts,restoreSessions,robotHosts.ready]);
  const openHost = terminal.openHost;
  const openHostRef = useRef(openHost);
  openHostRef.current = openHost;
  useEffect(() => {
    if (!routeVisible || !visible || !localShellEnabled || activeTab !== 'terminal'
      || !loginCatalogReady || !loginIntent || loginIntent.scope !== persistenceScope) return;
    const host = loginHosts.find((item) => item.id === `${TERMINAL_ROBOT_HOST_ID_PREFIX}${loginIntent.robotAssetId}`);
    if (!host || !takeTerminalRobotLogin(loginIntent)) return;
    void openHostRef.current(host);
  },[activeTab,localShellEnabled,loginCatalogReady,loginHosts,loginIntent,persistenceScope,routeVisible,visible]);
  const setting = useTerminalSettingSnapshot(targetCoreId, managedHostId);
  const error = terminal.error
    || (hostsEnabled && !isAgentIdentity ? hosts.error : '')
    || (!isAgentIdentity ? robotHosts.error : '')
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
