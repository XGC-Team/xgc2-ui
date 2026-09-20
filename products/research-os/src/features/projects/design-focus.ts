/** In-session design-card focus. A may wrap this as a store action; C does not write store.ts.
 * Empty cardIds opens the project's canvas without auto-picking a card. */
export type DesignFocus = { project: string; cardIds: readonly string[]; nonce: number }
type Listener = (focus: DesignFocus) => void
const listeners = new Set<Listener>()
let current: DesignFocus | null = null

export function requestDesignFocus(project: string, cardIds: readonly string[] = []): DesignFocus {
  current = { project, cardIds: [...cardIds], nonce: Date.now() }
  listeners.forEach(listener => listener(current!))
  return current
}

export function readDesignFocus(): DesignFocus | null {
  return current
}

export function subscribeDesignFocus(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
