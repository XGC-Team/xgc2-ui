import { TerminalHostsView } from '../TerminalHostsView';

/**
 * Terminal.RemoteSSH exclusive web leaf. Product roots that set RemoteSSH false
 * must not import this module (or TerminalHostsView through any other composition path).
 */
export const TerminalRemoteSSHLeaf = TerminalHostsView;
