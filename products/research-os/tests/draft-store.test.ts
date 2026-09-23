import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTabCloseGuard } from '../src/features/projects/tab-close-guards'

let store: typeof import('../src/store')['useWorkbench']
const cleanup: (() => void)[] = []
beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  store = (await import('../src/store')).useWorkbench
})
beforeEach(() => { store.setState({ resourceLayout: { version:1,tabs:[],active:{} }, projectId: 'selected-b', locale: 'en', secondaryOpen: true, draftIntents: [], draftSelection: null, canvasReferences: [] }) })
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()) })
afterAll(() => vi.unstubAllGlobals())

describe('project draft tab integration with the real Zustand store', () => {
  it('deduplicates one project/workspace book without changing the selected project', () => {
    const scope = { projectId: 'project-a', workspace: 'paper-a' }
    const id = store.getState().openResource({ kind: 'drafts', scope })
    expect(store.getState().openResource({ kind: 'drafts', scope: { ...scope } })).toBe(id)
    expect(store.getState().resourceLayout.tabs).toHaveLength(1)
    expect(store.getState().projectId).toBe('selected-b')
  })
  it('keeps same-name books in different scopes separate', () => {
    const a = store.getState().openResource({ kind: 'drafts', scope: { projectId: 'a', workspace: 'a' } })
    const b = store.getState().openResource({ kind: 'drafts', scope: { projectId: 'b', workspace: 'b' } })
    expect(a).not.toBe(b)
    expect(store.getState().resourceLayout.tabs).toHaveLength(2)
  })
  it('captures scope independently of later mutation by the caller', () => {
    const scope = { projectId: 'a', workspace: 'a' }
    store.getState().openResource({ kind: 'drafts', scope })
    scope.workspace = 'changed'
    const tab = store.getState().resourceLayout.tabs[0]
    expect(tab.kind === 'drafts' && tab.scope.workspace).toBe('a')
  })
  it('a refused close retains and reveals the guarded tab', () => {
    const id = store.getState().openResource({ kind: 'drafts', scope: { projectId: 'a', workspace: 'a' } })
    cleanup.push(registerTabCloseGuard(id, () => false))
    store.setState({ secondaryOpen: false })
    store.getState().closeResource(id)
    expect(store.getState().resourceLayout.tabs).toHaveLength(1)
    expect(store.getState().resourceLayout.active['selected-b']?.secondary).toBe(id)
    expect(store.getState().secondaryOpen).toBe(true)
  })
  it('an accepted close removes the draft tab while normal tabs retain their behavior', () => {
    const web = store.getState().openResource({ kind: 'web', url: 'https://example.org' })
    const id = store.getState().openResource({ kind: 'drafts', scope: { projectId: 'a', workspace: 'a' } })
    cleanup.push(registerTabCloseGuard(id, () => true))
    store.getState().closeResource(id)
    expect(store.getState().resourceLayout.active['selected-b']?.secondary).toBe(web)
    store.getState().closeResource(web)
    expect(store.getState().resourceLayout.tabs).toHaveLength(0)
  })
  it('closing a nonexistent tab never invokes a stale guard', () => {
    const guard = vi.fn(() => false)
    cleanup.push(registerTabCloseGuard('missing', guard))
    store.getState().closeResource('missing')
    expect(guard).not.toHaveBeenCalled()
  })
})

describe('F1 source, structure and canvas navigation', () => {
  it('captures a source into the selected project without changing the active project', () => {
    const intent = { id: 'capture', scope: { projectId: 'a', workspace: 'wa' }, kind: 'note' as const, source: { id: 'source', workspace: 'academic', path: 'note.md', digest: 'v1', excerpt: 'quoted' } }
    store.getState().requestDraftCapture(intent)
    intent.scope.workspace = 'changed'; intent.source.digest = 'changed'
    expect(store.getState().draftIntents[0].scope.workspace).toBe('wa')
    expect(store.getState().draftIntents[0].source.digest).toBe('v1')
    expect(store.getState().projectId).toBe('selected-b')
  })
  it('deduplicates a queued capture and consumes only that capture', () => {
    const intent = { id: 'one', scope: { projectId: 'a', workspace: 'a' }, kind: 'material' as const, source: { id: 'source', path: 'file.md' } }
    store.getState().requestDraftCapture(intent); store.getState().requestDraftCapture(intent)
    store.getState().requestDraftCapture({ ...intent, id: 'two' })
    expect(store.getState().draftIntents).toHaveLength(2)
    store.getState().consumeDraftIntent('one')
    expect(store.getState().draftIntents.map(item => item.id)).toEqual(['two'])
  })
  it('routes a canvas object anchor to its original book and object', () => {
    store.getState().openResource({ kind: 'file', target: { projectId: 'a', workspace: 'wa', path: 'research-content.json#artifact/note-1', view: 'files' } })
    expect(store.getState().resourceLayout.tabs[0].kind).toBe('drafts')
    expect(store.getState().draftSelection?.id).toBe('note-1')
    expect(store.getState().draftSelection?.scope.workspace).toBe('wa')
  })
  it('opens a notes filter in the same book rather than making a second writer', () => {
    const scope = { projectId: 'a', workspace: 'a' }
    store.getState().selectResearchDraft(scope, '', 'note')
    store.getState().selectResearchDraft(scope, 'paper-1')
    expect(store.getState().resourceLayout.tabs).toHaveLength(1)
    expect(store.getState().draftSelection?.id).toBe('paper-1')
  })
  it('queues one project-scoped canvas reference without writing or creating a conversation', () => {
    store.getState().requestCanvasReference('a', 'note-1', 'A')
    store.getState().requestCanvasReference('a', 'note-1', 'A')
    expect(store.getState().canvasReferences).toHaveLength(1)
    expect(store.getState().resourceLayout.tabs.some(t=>t.kind==='research'&&t.workspace==='a')).toBe(true)
    store.getState().consumeCanvasReference('a:note-1')
    expect(store.getState().canvasReferences).toHaveLength(0)
  })
})
