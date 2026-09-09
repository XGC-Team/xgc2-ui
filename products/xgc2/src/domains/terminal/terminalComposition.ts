import type { ComponentType } from 'react';
import type { TerminalHostsViewProps } from './TerminalHostsView';

export type TerminalUserScriptsLeafProps = {
  onSendCommand: (command: string) => void | Promise<void>;
  onInserted?: () => void;
  surface?: 'rail' | 'page';
  targetCoreId?: string;
};

/**
 * Build-time Terminal leaf graph. Generated roots import and fill only enabled
 * slots; the generic route never discovers concrete leaves at runtime.
 *
 * - LocalShell: admits the interactive session workspace tab
 * - RemoteSSH: custom SSH Hosts management leaf (exclusive import root)
 * - UserScripts: User scripts rail + Terminal subpage (exclusive import root)
 */
export type TerminalComposition = Readonly<{
  LocalShell?: true;
  RemoteSSH?: ComponentType<TerminalHostsViewProps>;
  UserScripts?: ComponentType<TerminalUserScriptsLeafProps>;
}>;

export const EMPTY_TERMINAL_COMPOSITION: TerminalComposition = Object.freeze({});

export function defineTerminalComposition(
  leaves: TerminalComposition,
): TerminalComposition {
  return Object.freeze({ ...leaves });
}
