/**
 * Terminal.LocalShell exclusive web leaf marker.
 * Product roots import this module only when LocalShell is enabled so absence
 * scans can prove the owner is out of the graph when the bool is false.
 */
export const TerminalLocalShellLeaf = true as const;
