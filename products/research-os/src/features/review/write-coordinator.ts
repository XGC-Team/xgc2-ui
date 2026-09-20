/** Coordinate proposal writes with the mounted autosave editors. Server CAS still protects other clients. */
type Editor = { blocked: () => boolean; reload: () => Promise<unknown> }
const editors = new Map<string, Set<Editor>>()
const held = new Set<string>()
const listeners = new Set<() => void>()
const key = (workspace: string, path: string) => JSON.stringify([workspace, path])
const emit = () => listeners.forEach(fn => {
  try { fn() } catch (cause) { console.error('Review lock observer failed.', cause) }
})
export const subscribeWrites = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export const isReviewLocked = (workspace: string, path: string) => held.has(key(workspace, path))
export function registerReviewEditor(workspace: string, path: string, editor: Editor): () => void {
  const k = key(workspace, path), set = editors.get(k) || new Set<Editor>()
  set.add(editor); editors.set(k, set)
  return () => { set.delete(editor); if (!set.size) editors.delete(k) }
}
export function assertEditorClean(workspace: string, path: string): void {
  const k = key(workspace, path)
  if (held.has(k) || [...(editors.get(k) || [])].some(e => e.blocked())) throw new Error('An editor has unsaved changes, a pending capture, a failed load, or an active write. Resolve it first.')
}
export function acquireReviewWrite(workspace: string, path: string): () => Promise<void> {
  assertEditorClean(workspace, path)
  const k = key(workspace, path); held.add(k); emit()
  let released = false
  return async () => {
    if (released) return; released = true
    // Reload all currently mounted editors before allowing another local edit, including editors mounted during the lease.
    try { await Promise.all([...(editors.get(k) || [])].map(editor => editor.reload())) }
    finally { held.delete(k); emit() }
  }
}
