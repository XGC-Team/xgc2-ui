import { terminalPersistenceScope } from './terminalPersistenceModel';

/** UI session namespace, not an execution-host resolver or deployment record. */
export function terminalEmbeddedScope(
  targetCoreId?: string,
  managedHostId?: string,
  workspaceId = '',
): string {
  return `embedded:${encodeURIComponent(workspaceId)}:${terminalPersistenceScope(targetCoreId,managedHostId)}`;
}

export type TerminalEmbeddedTarget = {
  persistenceScope: string;
  targetCoreId?: string;
  managedHostId?: string;
  agentLabel?: string;
  initialDirectory?: string;
};

/** Preserve the original identity; revisiting it must reuse its mounted shell. */
export function retainTerminalTarget(
  targets: readonly TerminalEmbeddedTarget[],
  target: TerminalEmbeddedTarget,
): readonly TerminalEmbeddedTarget[] {
  return targets.some((item) => item.persistenceScope === target.persistenceScope)
    ? targets
    : [...targets,target];
}
