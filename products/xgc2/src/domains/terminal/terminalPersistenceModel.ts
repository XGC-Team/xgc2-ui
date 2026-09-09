/**
 * Persistence is scoped to the login identity (Core federation target + selected
 * managed host). Switching Core↔Agent must not restore the other identity's sessions.
 */
export function terminalPersistenceScope(targetCoreId?: string, managedHostId?: string): string {
  const core = encodeURIComponent(targetCoreId?.trim() || 'local');
  const host = encodeURIComponent(managedHostId?.trim() || 'local');
  return `${core}__${host}`;
}

export function terminalPersistenceKey(scope: string,state: string): string {
  return `xgc.terminal.${scope}.${state}`;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
