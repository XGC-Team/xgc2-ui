import type { GraphCamera } from '../../lib/graph-camera'
import type { KnowledgeQuery } from './knowledge-snapshot'

export type KnowledgeViewState = {
  version: 1; query: string; unresolved: NonNullable<KnowledgeQuery['unresolved']>
  orphans: NonNullable<KnowledgeQuery['orphans']>; focus: string; depth: number
  direction: NonNullable<KnowledgeQuery['direction']>; camera?: GraphCamera
}
export const emptyKnowledgeView = (): KnowledgeViewState => ({ version: 1, query: '', unresolved: 'include', orphans: 'include', focus: '', depth: 1, direction: 'both' })
const key = (viewId: string) => `research.knowledge-view/v1:${viewId}`

export function decodeKnowledgeView(raw: string | null): KnowledgeViewState {
  try {
    if (!raw) return emptyKnowledgeView()
    const value = JSON.parse(raw)
    if (!value || value.version !== 1 || typeof value.query !== 'string' || [...value.query].length > 512 ||
      !['include', 'only', 'exclude'].includes(value.unresolved) || !['include', 'only', 'exclude'].includes(value.orphans) ||
      typeof value.focus !== 'string' || !Number.isSafeInteger(value.depth) || value.depth < 1 ||
      !['outbound', 'inbound', 'both'].includes(value.direction)) return emptyKnowledgeView()
    const camera = value.camera
    if (camera !== undefined && (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.y) || !Number.isFinite(camera.k) || camera.k < 0.08 || camera.k > 3.5)) return emptyKnowledgeView()
    // Whitelist preferences. Never persist cached nodes, source bytes, revisions
    // or permission decisions even if they appear in untrusted stored JSON.
    return { version: 1, query: value.query, unresolved: value.unresolved, orphans: value.orphans,
      focus: value.focus, depth: value.depth, direction: value.direction,
      ...(camera ? { camera: { x: camera.x, y: camera.y, k: camera.k } } : {}) }
  } catch { return emptyKnowledgeView() }
}

export function readKnowledgeView(viewId = 'academic'): KnowledgeViewState {
  try { return decodeKnowledgeView(sessionStorage.getItem(key(viewId))) } catch { return emptyKnowledgeView() }
}
export function saveKnowledgeView(value: KnowledgeViewState, viewId = 'academic') {
  try { sessionStorage.setItem(key(viewId), JSON.stringify(decodeKnowledgeView(JSON.stringify(value)))) } catch { /* Storage denial must not block research. */ }
}
export function clearKnowledgeView(viewId = 'academic') {
  try { sessionStorage.removeItem(key(viewId)) } catch { /* No data cache to recover. */ }
}
