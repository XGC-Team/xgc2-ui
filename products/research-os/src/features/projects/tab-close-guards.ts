/** Guard registry lives outside persisted tab metadata. Cleanup cannot remove a replacement guard. */
const guards = new Map<string, () => boolean>()
export function registerTabCloseGuard(id: string, guard: () => boolean): () => void {
  guards.set(id, guard)
  return () => { if (guards.get(id) === guard) guards.delete(id) }
}
export function canCloseTab(id: string): boolean { return guards.get(id)?.() ?? true }

/** Closing a file tab is not a promise to flush it. In-flight saves must finish first. */
export function confirmFileTabClose(session: {
  snapshot: () => { status: string; dirty: boolean }; dispose: () => void
}, dialogs: { confirmDiscard: () => boolean; notifySaving: () => void }): boolean {
  const state = session.snapshot()
  if (state.status === 'saving') { dialogs.notifySaving(); return false }
  if (state.dirty && !dialogs.confirmDiscard()) return false
  session.dispose()
  return true
}
