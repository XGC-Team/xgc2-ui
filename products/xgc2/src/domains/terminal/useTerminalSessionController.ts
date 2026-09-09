import { useCallback,useRef,useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { hostNeedsConnectPassword } from './terminalLoginHosts';
import type { TerminalHost } from './terminalModel';
import { isString,terminalPersistenceKey } from './terminalPersistenceModel';
import { replaceTerminalInputLine } from './terminalInsertLine';
import { placeUserScript } from './terminalService';
import { userScriptPlaceRequest } from './terminalUserScriptPlace';
import {
  createTerminalSession,
  isTerminalLayout,
  isTerminalSessions,
  type SessionStatus,
  type TerminalHandle,
  type TerminalLayout,
  type TerminalSession,
} from './terminalSessionModel';

export { hostNeedsConnectPassword } from './terminalLoginHosts';

export function useTerminalSessionController({
  persistenceScope,
  onShowTerminal,
  promptConnectPassword,
  targetCoreId,
  managedHostId,
}: {
  persistenceScope: string;
  onShowTerminal: () => void;
  /**
   * Prompt for a one-time SSH password. Return null to cancel connect.
   * Password is held only in memory for the session, never persisted.
   */
  promptConnectPassword: (host: TerminalHost) => Promise<string | null>;
  targetCoreId?: string;
  managedHostId?: string;
}) {
  const [sessions,setSessions] = usePersistentState<TerminalSession[]>(terminalPersistenceKey(persistenceScope,'sessions'),[],isTerminalSessions);
  const [activeSessionId,setActiveSessionId] = usePersistentState(terminalPersistenceKey(persistenceScope,'active-session'),'',isString);
  const [layout,setLayout] = usePersistentState<TerminalLayout>(terminalPersistenceKey(persistenceScope,'layout'),'tabs',isTerminalLayout);
  const [error,setError] = useState('');
  const terminalRefs = useRef<Record<string,TerminalHandle | null>>({});
  // One-time connect passwords: never written to persistent session state.
  const connectPasswordsRef = useRef<Record<string,string>>({});
  const restoreSessions = useCallback((hosts: TerminalHost[]) => {
    const hostIds = new Set(hosts.map((host) => host.id));
    setSessions((items) => {
      const restored = items
        .filter((session) => hostIds.has(session.hostId))
        .map((session) => ({
          ...session,
          status: 'connecting' as SessionStatus,
          refresh: session.refresh + 1,
          resumeOnly: true,
        }));
      setActiveSessionId((id) => restored.some((session) => session.id === id) ? id : restored[0]?.id ?? '');
      return restored;
    });
  },[setActiveSessionId,setSessions]);

  async function openHost(host: TerminalHost) {
    let connectPassword = host.password?.trim() ? host.password : '';
    if (hostNeedsConnectPassword(host)) {
      const typed = await promptConnectPassword(host);
      // Cancel / empty password: silent — no toast banner.
      if (typed == null || typed === '') return;
      connectPassword = typed;
    }
    const session = createTerminalSession(host);
    if (connectPassword) {
      connectPasswordsRef.current[session.id] = connectPassword;
    }
    setSessions((items) => [...items,session]);
    setActiveSessionId(session.id);
    setError('');
  }

  function closeSession(id: string) {
    terminalRefs.current[id]?.close();
    delete terminalRefs.current[id];
    delete connectPasswordsRef.current[id];
    setSessions((items) => {
      const remainingSessions = items.filter((item) => item.id !== id);
      setActiveSessionId((currentId) => currentId === id ? remainingSessions[0]?.id ?? '' : currentId);
      return remainingSessions;
    });
  }

  function updateSession(id: string,patch: Partial<TerminalSession>) {
    setSessions((items) => items.map((item) => item.id === id ? { ...item,...patch } : item));
  }

  async function sendCommand(command: string) {
    // No toast when idle — operator picks a target first without noise.
    // Insert only (no trailing CR) so the operator can edit before Enter.
    const session = sessions.find((item) => item.id === activeSessionId);
    if (!session) return;
    const place = userScriptPlaceRequest(command, session, managedHostId);
    if (place) {
      try {
        await placeUserScript(place, { targetCoreId });
        setError('');
      } catch {
        setError('Could not place the script on this terminal.');
        onShowTerminal();
        return;
      }
    }
    terminalRefs.current[session.id]?.send(replaceTerminalInputLine(command));
    terminalRefs.current[session.id]?.focus();
    onShowTerminal();
  }

  function connectPasswordFor(sessionId: string) {
    return connectPasswordsRef.current[sessionId] ?? '';
  }

  return {
    sessions,
    activeSessionId,
    layout,
    error,
    terminalRefs,
    openHost,
    closeSession,
    updateSession,
    restoreSessions,
    sendCommand,
    connectPasswordFor,
    setActiveSessionId,
    setLayout,
    setError,
  };
}
