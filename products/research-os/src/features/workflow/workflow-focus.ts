export type WorkflowFocus = { project: string; version: number; runId: string; nodeId?: string; nonce: string }
const key = 'research-workflow-focus-v1'
const listeners = new Set<(focus: WorkflowFocus) => void>()
let current: WorkflowFocus | null = null
export function readWorkflowFocus(): WorkflowFocus | null {
  if (current) return current
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (value && typeof value.project === 'string' && Number.isSafeInteger(value.version) && value.version > 0 && typeof value.runId === 'string' && typeof value.nonce === 'string') current = value
  } catch { /* Focus history is optional; no research data is stored here. */ }
  return current
}
export function requestWorkflowFocus(input: Omit<WorkflowFocus, 'nonce'>): WorkflowFocus {
  if (!input.project || !Number.isSafeInteger(input.version) || input.version < 1 || !input.runId) throw new Error('A run needs its project, plan version and run identity.')
  current = { ...input, nonce: crypto.randomUUID() }
  try { localStorage.setItem(key, JSON.stringify(current)) } catch { /* Current navigation still works without preferences storage. */ }
  listeners.forEach(listener => listener(current!)); return current
}
export function subscribeWorkflowFocus(listener: (focus: WorkflowFocus) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
