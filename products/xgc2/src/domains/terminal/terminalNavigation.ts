export const terminalTabIds = ['terminal','hosts','usernode'] as const;

export type TerminalTab = typeof terminalTabIds[number];

export const validTerminalTabs = new Set<TerminalTab>(terminalTabIds);

/** Unknown sections, including leftover `commands`, are not User scripts aliases. */
export function resolveTerminalTab(section: string | undefined): TerminalTab {
  if (section === 'terminal' || section === 'hosts' || section === 'usernode') return section;
  return 'terminal';
}
