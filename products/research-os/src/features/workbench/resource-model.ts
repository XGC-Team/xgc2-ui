import type { DraftScope } from '../projects/draft-model'
import { fileTarget, type ProjectFileTarget } from '../projects/project-object-model'
import type { Scope } from '../review/review-model'
import type { ManuscriptPDF } from '../resources/manuscript'

export type WorkArea = 'primary' | 'secondary'
export type ContentView = 'table' | 'outline' | 'canvas' | 'revision'
export type SourceLocation = { workspace: string; path: string; line: number; buildId: string; pdf: ManuscriptPDF }
export type ResourceInput =
  | { kind: 'chat' }
  | { kind: 'research'; workspace: string; ownerProjectId?: string; view: ContentView; objectId?: string; artifactId?:string; digest?:string }
  | { kind: 'source'; source: SourceLocation }
  | { kind: 'original'; workspace: string; path: string; digest?: string; page?: number; quote?: string }
  | { kind: 'reviews'; scope: Scope }
  | { kind: 'drafts'; scope: DraftScope }
  | { kind: 'web'; url?: string }
  | { kind: 'file'; target?: ProjectFileTarget }
  | { kind: 'pdf'; pdf: ManuscriptPDF; followCurrent?: boolean }
  | { kind: 'note'; doc?: { workspace: string; path: string; title: string } }

/** Placement belongs to the workspace. Resource identity never contains a panel name. */
export type ResourceTab = ResourceInput & {
  id: string; title: string; projectId: string; area: WorkArea
}
export type ResourceLayout = {
  version: 1; tabs: ResourceTab[]; active: Record<string, Partial<Record<WorkArea, string>>>
  previous?: Record<string, Partial<Record<WorkArea, string[]>>>
}
export const EMPTY_LAYOUT: ResourceLayout = { version: 1, tabs: [], active: {} }
export const LAYOUT_PREFERENCE = 'research-ui-resources-v1'

export function resourceKey(input: ResourceInput, projectId: string): string {
  const scope = (s: Scope) => [s.projectId, s.workspace]
  let identity: unknown[]
  switch (input.kind) {
    case 'chat': identity = ['chat']; break
    case 'research': identity = ['research', input.workspace, input.ownerProjectId ?? projectId, input.digest]; break
    case 'source': identity = ['source', input.source.workspace, input.source.path, input.source.buildId]; break
    case 'original': identity = ['original', input.workspace, input.path, input.digest]; break
    case 'reviews': case 'drafts': identity = [input.kind, ...scope(input.scope)]; break
    case 'pdf': identity = ['pdf', input.pdf.workspace, input.pdf.buildId]; break
    case 'note': identity = ['note', input.doc?.workspace, input.doc?.path]; break
    case 'web': identity = ['web', input.url || '']; break
    case 'file': {
      const target = input.target ?? fileTarget(projectId, projectId)
      identity = ['file', target.workspace, target.path || target.view]
      break
    }
  }
  return JSON.stringify([projectId, ...identity])
}

export function resourceTitle(input: ResourceInput, locale: 'zh' | 'en'): string {
  switch (input.kind) {
    case 'chat': return locale === 'zh' ? '讨论' : 'Discussion'
    case 'research': return locale === 'zh' ? '研究内容' : 'Research content'
    case 'source': return input.source.path.split('/').pop() || 'Source'
    case 'original': return input.path.split('/').pop() || 'Source'
    case 'reviews': return locale === 'zh' ? '修改审阅' : 'Changes'
    case 'drafts': return locale === 'zh' ? '项目内容' : 'Project content'
    case 'pdf': return input.pdf.path.split('/').pop() || 'PDF'
    case 'note': return input.doc?.title || (locale === 'zh' ? '笔记' : 'Notes')
    case 'file': return input.target?.path.split('/').pop() || (locale === 'zh' ? '项目文件' : 'Files')
    case 'web': try { return input.url ? new URL(input.url).host : (locale === 'zh' ? '网页' : 'Web') } catch { return 'Web' }
  }
}

export function openResourceInLayout(layout: ResourceLayout, input: ResourceInput, projectId: string, area: WorkArea, locale: 'zh' | 'en'): { layout: ResourceLayout; id: string } {
  const bound: ResourceInput = input.kind === 'file' ? { ...input, target: input.target ?? fileTarget(projectId, projectId) } : input
  const key = resourceKey(bound, projectId)
  const existing = layout.tabs.find(tab => resourceKey(tab, tab.projectId) === key)
  const id = existing?.id ?? crypto.randomUUID()
  // Reopening reveals the existing instance; moving is a separate user action.
  const destination = existing?.area ?? area
  const tab = { ...existing, ...structuredClone(bound), id, projectId, area: destination, title: resourceTitle(bound, locale) } as ResourceTab
  return { id, layout: activateResourceInLayout({ ...layout, tabs: existing ? layout.tabs.map(t => t.id === id ? tab : t) : [...layout.tabs, tab] },id) }
}

export function activateResourceInLayout(layout: ResourceLayout, id: string): ResourceLayout {
  const tab = layout.tabs.find(t => t.id === id)
  if(!tab)return layout
  const prior=layout.active[tab.projectId]?.[tab.area]
  const previous=prior&&prior!==id?{...layout.previous,[tab.projectId]:{...layout.previous?.[tab.projectId],[tab.area]:[...(layout.previous?.[tab.projectId]?.[tab.area]??[]),prior].slice(-100)}}:layout.previous
  return { ...layout, ...(previous?{previous}:{}), active: { ...layout.active, [tab.projectId]: { ...layout.active[tab.projectId], [tab.area]: id } } }
}

export function backResourceInLayout(layout:ResourceLayout,projectId:string,area:WorkArea):ResourceLayout {
  const previous=[...(layout.previous?.[projectId]?.[area]??[])]
  let id:string|undefined
  while(previous.length){
    const candidate=previous.pop()!
    if(candidate!==layout.active[projectId]?.[area]&&layout.tabs.some(t=>t.id===candidate&&t.projectId===projectId&&t.area===area)){id=candidate;break}
  }
  if(!id)return layout
  return {...layout,active:{...layout.active,[projectId]:{...layout.active[projectId],[area]:id}},previous:{...layout.previous,[projectId]:{...layout.previous?.[projectId],[area]:previous}}}
}

export function closeResourceInLayout(layout: ResourceLayout, id: string): ResourceLayout {
  const tab = layout.tabs.find(t => t.id === id)
  if (!tab) return layout
  const tabs = layout.tabs.filter(t => t.id !== id)
  const current = layout.active[tab.projectId] || {}
  const next = current[tab.area] === id ? tabs.filter(t => t.projectId === tab.projectId && t.area === tab.area).at(-1)?.id : current[tab.area]
  return { ...layout, tabs, active: { ...layout.active, [tab.projectId]: { ...current, [tab.area]: next } } }
}

export function moveResourceInLayout(layout: ResourceLayout, id: string, area: WorkArea): ResourceLayout {
  const tab = layout.tabs.find(t => t.id === id)
  if (!tab || tab.area === area) return activateResourceInLayout(layout, id)
  const remaining = closeResourceInLayout(layout, id)
  return activateResourceInLayout({ ...remaining, tabs: layout.tabs.map(t => t.id === id ? { ...t, area } : t) }, id)
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const pathOK = (value: unknown): value is string => string(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(p => p === '..' || p === '.')
const scopeOK = (v: unknown) => object(v) && string(v.projectId) && string(v.workspace)
function resourceOK(t: Record<string, unknown>): boolean {
  switch (t.kind) {
    case 'chat': return true
    case 'research': return string(t.workspace) && ['table', 'outline', 'canvas', 'revision'].includes(String(t.view)) && (t.objectId === undefined || string(t.objectId))
    case 'reviews': case 'drafts': return scopeOK(t.scope)
    case 'file': return scopeOK(t.target) && object(t.target) && pathOK(t.target.path) && ['files', 'notes', 'builds'].includes(String(t.target.view))
    case 'source': return object(t.source) && string(t.source.workspace) && pathOK(t.source.path) && Number.isInteger(t.source.line) && string(t.source.buildId) && pdfOK(t.source.pdf)
    case 'original': return string(t.workspace) && pathOK(t.path) && (t.digest === undefined || string(t.digest)) && (t.page === undefined || Number.isInteger(t.page) && Number(t.page) > 0)
    case 'pdf': return pdfOK(t.pdf)
    case 'note': return t.doc === undefined || (object(t.doc) && string(t.doc.workspace) && pathOK(t.doc.path) && string(t.doc.title))
    case 'web': try { return t.url === undefined || (string(t.url) && ['http:', 'https:'].includes(new URL(t.url).protocol)) } catch { return false }
    default: return false
  }
}
function pdfOK(v: unknown): boolean {
  return object(v) && string(v.workspace) && pathOK(v.path) && string(v.buildId) && string(v.digest) && string(v.url) && v.url.startsWith('/api/v1/manuscripts/build-records/')
}

/** Preferences contain references and layout only. Damaged storage never blocks content access. */
export function restoreResourceLayout(text: string | null): ResourceLayout {
  if (!text) return structuredClone(EMPTY_LAYOUT)
  try {
    const raw: unknown = JSON.parse(text)
    if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.tabs) || !object(raw.active)) return structuredClone(EMPTY_LAYOUT)
    const ids = new Set<string>(), identities = new Set<string>()
    const tabs = raw.tabs.filter((t): t is ResourceTab => {
      if (!object(t) || !string(t.id) || !t.id || ids.has(t.id) || !string(t.title) || !string(t.projectId) || !['primary', 'secondary'].includes(String(t.area)) || !resourceOK(t)) return false
      const key = resourceKey(t as ResourceTab, t.projectId)
      if (identities.has(key)) return false
      ids.add(t.id); identities.add(key); return true
    })
    const active: ResourceLayout['active'] = {}
    for (const tab of tabs) {
      const selected = raw.active[tab.projectId]
      active[tab.projectId] ??= {}
      if (!active[tab.projectId][tab.area] || (object(selected) && selected[tab.area] === tab.id)) active[tab.projectId][tab.area] = tab.id
    }
    const previous:NonNullable<ResourceLayout['previous']>={}
    if(object(raw.previous))for(const [projectId,areas] of Object.entries(raw.previous)){
      if(!object(areas))continue
      for(const area of ['primary','secondary'] as const){
        const entries=areas[area]
        if(!Array.isArray(entries))continue
        previous[projectId]??={}
        previous[projectId][area]=entries.filter((id):id is string=>typeof id==='string'&&tabs.some(t=>t.id===id&&t.projectId===projectId&&t.area===area)).slice(-100)
      }
    }
    return { version: 1, tabs, active,...(Object.keys(previous).length?{previous}:{}) }
  } catch { return structuredClone(EMPTY_LAYOUT) }
}
