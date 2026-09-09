import { terminalPersistenceScope } from './terminalPersistenceModel';

export type TerminalRobotLoginTarget = { targetCoreId?: string; managedHostId?: string };
export type TerminalRobotLoginIntent = { robotAssetId: string; scope: string };
let pending: TerminalRobotLoginIntent | undefined;
const listeners = new Set<() => void>();

export function requestTerminalRobotLogin(robotAssetId: string, target: TerminalRobotLoginTarget) {
  const id = robotAssetId.trim();
  pending = id ? { robotAssetId: id,scope: terminalPersistenceScope(target.targetCoreId,target.managedHostId) } : undefined;
  listeners.forEach((listener) => listener());
}

export function subscribeTerminalRobotLogin(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function peekTerminalRobotLogin() { return pending; }

/** A stale consumer cannot consume a newer operator intent. */
export function takeTerminalRobotLogin(expected: TerminalRobotLoginIntent) {
  if (pending !== expected) return undefined;
  const intent = pending;
  pending = undefined;
  listeners.forEach((listener) => listener());
  return intent;
}
