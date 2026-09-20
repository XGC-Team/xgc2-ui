/** Transient navigation only. Design content and mappings live exclusively in thinking.canvas.json. */
export type DesignFocus = { project: string; nodeId: string; bindingId?: string }
let pending: DesignFocus | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
export function requestDesignFocus(focus: DesignFocus): void {
  if (!focus.project.trim() || !focus.nodeId.trim()) throw new Error('A design focus needs a project and card identity.')
  pending = { ...focus }; emit()
}
export const getDesignFocus = (project: string): DesignFocus | null => pending?.project === project ? pending : null
export function consumeDesignFocus(focus: DesignFocus): void {
  if (pending !== focus) return
  pending = null; emit()
}
export function subscribeDesignFocus(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
