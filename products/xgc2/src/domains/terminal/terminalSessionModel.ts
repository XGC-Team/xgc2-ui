import type { TerminalHost } from './terminalModel';

export type SessionStatus = 'connecting' | 'online' | 'closed';
export type TerminalLayout = 'tabs' | 'grid';

export type TerminalSession = {
  id: string;
  title: string;
  hostId: string;
  status: SessionStatus;
  refresh: number;
  resumeOnly?: boolean;
};

export type TerminalHandle = {
  send: (value: string) => void;
  focus: () => void;
  clear: () => void;
  reconnect: () => void;
  close: () => void;
};

/** connecting / closed only. online is not painted — it is not remote health. */
export function terminalSessionAttention(session: Pick<TerminalSession, 'status'>): {
  status: Exclude<SessionStatus, 'online'>;
} | null {
  if (session.status === 'connecting' || session.status === 'closed') {
    return { status: session.status };
  }
  return null;
}

export function createTerminalSession(host: TerminalHost): TerminalSession {
  return {
    id: `ssh-${host.id}-${Date.now()}`,
    title: host.name || `${host.user}@${host.address}`,
    hostId: host.id,
    status: 'connecting',
    refresh: 0,
  };
}

export function isTerminalLayout(value: unknown): value is TerminalLayout {
  return value === 'tabs' || value === 'grid';
}

export function isTerminalSessions(value: unknown): value is TerminalSession[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const session = item as Partial<TerminalSession>;
    return typeof session.id === 'string'
      && typeof session.title === 'string'
      && typeof session.hostId === 'string'
      && (session.status === 'connecting' || session.status === 'online' || session.status === 'closed')
      && typeof session.refresh === 'number'
      && Number.isFinite(session.refresh)
      && (session.resumeOnly === undefined || typeof session.resumeOnly === 'boolean');
  });
}
