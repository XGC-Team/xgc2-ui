import { EmptyState,StatusText,WorkspaceTabs } from '@xgc2/ui-react';
import { X } from 'lucide-react';
import { useMemo,useState,type KeyboardEvent,type MutableRefObject,type ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { normalizeHostGroup,TERMINAL_HOST_GROUP } from './terminalCatalogModel';
import { isTerminalDirectShellHostId } from './terminalLoginHosts';
import type { TerminalHost,TerminalSetting } from './terminalModel';
import { terminalGroupLabel,useTerminalText } from './terminalMessages';
import { isTerminalRobotHostId } from './terminalRobotHosts';
import {
  terminalSessionAttention,
  type TerminalHandle,
  type TerminalLayout,
  type TerminalSession,
} from './terminalSessionModel';
import { TerminalSidebarGroup } from './terminalSidebarGroup';
import { XtermSession } from './XtermSession';
import type { LocalizedText } from '../../shared/localization/localizedText';

/** Visible endpoint for Targets rail labels (Direct shell vs SSH user@host). */
function terminalHostEndpoint(host: TerminalHost, t: LocalizedText): string {
  if (isTerminalDirectShellHostId(host.id) || host.authMode === 'local-shell') {
    return t('local shell');
  }
  const port = host.port > 0 ? host.port : 22;
  return `${host.user}@${host.address}:${port}`;
}

/** Local group first, then Hosts, then remaining (robot kinds). */
function orderTargetGroups(groups: Record<string,TerminalHost[]>): Array<[string,TerminalHost[]]> {
  const entries = Object.entries(groups);
  const local = entries.filter(([name]) => name === 'Local');
  const hosts = entries.filter(([name]) => name === TERMINAL_HOST_GROUP);
  const rest = entries.filter(([name]) => name !== 'Local' && name !== TERMINAL_HOST_GROUP);
  return [...local,...hosts,...rest];
}

export function TerminalWorkspace({
  visible,
  hosts,
  sessions,
  activeSessionId,
  layout,
  setting,
  targetCoreId,
  managedHostId,
  terminalRefs,
  connectPasswordFor,
  onOpenHost,
  onCloseSession,
  onActivateSession,
  onLayoutChange,
  onSessionStatus,
  onError,
  userScriptsRailStart,
}: {
  visible: boolean;
  hosts: TerminalHost[];
  sessions: TerminalSession[];
  activeSessionId: string;
  layout: TerminalLayout;
  setting: TerminalSetting;
  targetCoreId?: string;
  managedHostId?: string;
  terminalRefs: MutableRefObject<Record<string,TerminalHandle | null>>;
  connectPasswordFor: (sessionId: string) => string;
  onOpenHost: (host: TerminalHost) => void;
  onCloseSession: (sessionId: string) => void;
  onActivateSession: (sessionId: string) => void;
  onLayoutChange: (layout: TerminalLayout) => void;
  onSessionStatus: (sessionId: string,patch: Partial<TerminalSession>) => void;
  onError: (message: string) => void;
  userScriptsRailStart?: ReactNode;
}) {
  const t = useTerminalText();
  const [collapsedHostGroups,setCollapsedHostGroups] = useState<string[]>([]);
  const showUserScriptsRail = Boolean(userScriptsRailStart);
  // Local first, then Hosts, then robot kind groups (PX4 / Scout / …).
  const hostGroupEntries = useMemo(
    () => orderTargetGroups(groupBy(hosts,(host) => {
      if (isTerminalDirectShellHostId(host.id) || host.group === 'Local') return 'Local';
      if (isTerminalRobotHostId(host.id)) return host.group || 'Robots';
      return normalizeHostGroup(host.group);
    })),
    [hosts],
  );

  return (
    <section
      className="terminal-workspace"
      data-xgc-role="terminal-workspace" data-xgc-id="terminal-workspace"
      aria-label={t('Terminal')}
      hidden={!visible}
    >
      <div
        className="terminal-chrome"
        data-xgc-role="terminal-chrome" data-xgc-id="terminal-chrome"
        aria-label={t('Terminal chrome')}
      >
        <h2 className="terminal-column-heading" data-xgc-role="terminal-targets-heading" data-xgc-id="targets">{t('Targets')}</h2>
        <header
          className="terminal-toolbar"
          data-xgc-role="terminal-toolbar" data-xgc-id="terminal-toolbar"
          aria-label={t('Terminal sessions')}
        >
          <WorkspaceTabs
            ariaLabel={t('Terminal sessions')}
            className="terminal-session-tabs"
            dataXgcRole="terminal-session-tabs" dataXgcId="terminal-session-tabs"
            deleteDataXgcRole="terminal-session-tab-close"
            deleteIcon={<X size={12} aria-hidden="true" />}
            deleteLabel={(session) => t('Close {title}', { title: session.label })}
            getTabTitle={(session) => session.label}
            itemDataXgcRole="terminal-session-tab"
            items={sessions.map((session) => ({
              id: session.id,
              label: session.title,
              prefix: sessionAttentionChrome(session),
            }))}
            minimumItems={0}
            onDelete={onCloseSession}
            onValueChange={onActivateSession}
            tabDataXgcRole="terminal-session-tab-select"
            value={activeSessionId}
          />
          <SegmentedControl
            className="terminal-layout-toggle"
            value={layout}
            options={[
              { value: 'tabs',label: t('Tabs') },
              { value: 'grid',label: t('Grid') },
            ]}
            onChange={onLayoutChange}
            ariaLabel={t('Terminal layout')}
            dataXgcRole="terminal-layout-toggle" dataXgcId="terminal-layout-toggle"
          />
        </header>
        {showUserScriptsRail ? (
          <h2 className="terminal-column-heading" data-xgc-role="terminal-user-scripts-heading" data-xgc-id="user-scripts">{t('User scripts')}</h2>
        ) : null}
      </div>
      <div className="terminal-body-content" data-xgc-role="terminal-body" data-xgc-id="terminal-body">
        <aside className="terminal-rail terminal-targets-rail" data-xgc-role="terminal-sidebar" data-xgc-id="terminal-sidebar" data-xgc-rail="targets">
          <div className="terminal-rail-body terminal-host-tree" data-xgc-role="terminal-targets-list" data-xgc-id="terminal-targets-list">
            {hostGroupEntries.length === 0 && (
              <p className="terminal-rail-empty">{t('No login targets for the selected Core or Agent.')}</p>
            )}
            {hostGroupEntries.map(([group,items]) => (
              <TerminalSidebarGroup
                key={`host-${group}`}
                title={terminalGroupLabel(group,t)}
                collapsed={collapsedHostGroups.includes(group)}
                onToggle={() => setCollapsedHostGroups(toggleItem(collapsedHostGroups,group))}
              >
                {items.map((host) => {
                  const endpoint = terminalHostEndpoint(host,t);
                  const source = isTerminalDirectShellHostId(host.id)
                    ? 'direct-shell'
                    : isTerminalRobotHostId(host.id) ? 'robot-asset' : 'host';
                  return (
                    <ControlButton
                      key={host.id}
                      className="terminal-sidebar-item terminal-sidebar-host"
                      appearance="ghost"
                      size="compact"
                      title={`${host.name} ${endpoint}`}
                      dataXgcRole="terminal-sidebar-host"
                      dataXgcId={host.id}
                      data-xgc-source={source}
                      onClick={() => onOpenHost(host)}
                    >
                      <span className="terminal-sidebar-host-copy">
                        <span className="terminal-sidebar-host-name">{host.name || host.address}</span>
                        <span className="terminal-sidebar-host-endpoint">{endpoint}</span>
                      </span>
                    </ControlButton>
                  );
                })}
              </TerminalSidebarGroup>
            ))}
          </div>
        </aside>

        <main className="terminal-console-card" data-xgc-role="terminal-console" data-xgc-id="terminal-console">
          <div className="terminal-console-stack" data-xgc-layout={layout} data-xgc-role="terminal-console-stack" data-xgc-id="terminal-console-stack">
            {sessions.length === 0 && (
              <EmptyState
                className="terminal-empty"
                appearance="plain"
                fill
                title={t('No terminal session')}
                description={t('Select Direct shell, loopback, a Host, or a robot on the left to open a session as the currently selected Core or Agent.')}
              />
            )}
            {sessions.map((session) => (
              <section
                className="terminal-session-cell"
                data-xgc-role="terminal-session-cell"
                data-xgc-id={session.id}
                data-xgc-active={activeSessionId === session.id ? 'true' : undefined}
                key={session.id}
                onPointerDown={() => onActivateSession(session.id)}
                onFocusCapture={() => onActivateSession(session.id)}
              >
                <header>
                  <ControlButton
                    className="terminal-session-title-button"
                    appearance="ghost"
                    size="compact"
                    aria-pressed={activeSessionId === session.id}
                    dataXgcRole="terminal-session-title"
                    dataXgcId={session.id}
                    onClick={() => onActivateSession(session.id)}
                  >
                    <strong>{session.title}</strong>
                  </ControlButton>
                  {sessionAttentionChrome(session)}
                  <ControlButton
                    className="terminal-session-close-button"
                    iconOnly
                    size="compact"
                    appearance="ghost"
                    tone="danger"
                    aria-label={t('Close {title}', { title: session.title })}
                    dataXgcRole="terminal-session-close"
                    dataXgcId={session.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseSession(session.id);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                  </ControlButton>
                </header>
                <div className="terminal-session-body">
                  <XtermSession
                    key={`${session.id}-${session.refresh}`}
                    ref={(value) => { terminalRefs.current[session.id] = value; }}
                    session={session}
                    setting={setting}
                    targetCoreId={targetCoreId}
                    managedHostId={managedHostId}
                    connectPassword={connectPasswordFor(session.id)}
                    active={layout === 'grid' || activeSessionId === session.id}
                    onStatus={(patch) => onSessionStatus(session.id,patch)}
                    onError={onError}
                  />
                </div>
              </section>
            ))}
          </div>
        </main>

        {showUserScriptsRail ? <aside className="terminal-rail terminal-user-scripts-rail" data-xgc-role="terminal-user-scripts-rail" data-xgc-id="terminal-user-scripts-rail" data-xgc-rail="usernode">
          <div
            className="terminal-rail-body terminal-user-scripts-tree"
            data-xgc-role="terminal-user-scripts-list" data-xgc-id="terminal-user-scripts-list"
            onKeyDownCapture={ignoreUserScriptsListEnter}
          >
            {userScriptsRailStart}
          </div>
        </aside> : null}
      </div>
    </section>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string,T[]>>((groups,item) => {
    const key = keyFn(item);
    groups[key] = [...(groups[key] || []),item];
    return groups;
  }, {});
}

function sessionAttentionChrome(session: TerminalSession): ReactNode {
  const attention = terminalSessionAttention(session);
  if (!attention) return null;
  return (
    <span className="terminal-session-attention" data-xgc-role="terminal-session-attention" data-xgc-id={session.id}>
      <StatusText className="terminal-session-status" status={attention.status}>{attention.status}</StatusText>
    </span>
  );
}

function toggleItem(items: string[],item: string) {
  return items.includes(item) ? items.filter((candidate) => candidate !== item) : [...items,item];
}

/** Rail insert is click/Space only. Enter must reach the PTY, not re-fire a focused script. */
function ignoreUserScriptsListEnter(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  event.preventDefault();
}
