import { describe, expect, it } from 'vitest'
import { EMPTY_LAYOUT, openResourceInLayout, moveResourceInLayout, closeResourceInLayout, restoreResourceLayout, backResourceInLayout } from '../src/features/workbench/resource-model'

describe('resource identity and workspace placement', () => {
  it('returns through surviving resources after moving, closing, and reloading', () => {
    const a=openResourceInLayout(EMPTY_LAYOUT,{kind:'chat'},'p','primary','zh')
    const b=openResourceInLayout(a.layout,{kind:'research',workspace:'p',view:'table'},'p','primary','zh')
    const c=openResourceInLayout(b.layout,{kind:'web',url:'https://example.org'},'p','primary','zh')
    const moved=moveResourceInLayout(c.layout,b.id,'secondary')
    const restored=restoreResourceLayout(JSON.stringify(moved))
    const back=backResourceInLayout(restored,'p','primary')
    expect(back.active.p.primary).toBe(a.id)
    expect(back.active.p.secondary).toBe(b.id)
    expect(backResourceInLayout(closeResourceInLayout(restored,a.id),'p','primary').active.p.primary).toBe(c.id)
  })
  it('keeps current, archived, and distinct owner project content independent', () => {
    const a=openResourceInLayout(EMPTY_LAYOUT,{kind:'research',workspace:'shared',ownerProjectId:'a',view:'table'},'host','primary','en')
    const b=openResourceInLayout(a.layout,{kind:'research',workspace:'shared',ownerProjectId:'b',view:'table'},'host','primary','en')
    const pinned=openResourceInLayout(b.layout,{kind:'research',workspace:'shared',ownerProjectId:'a',view:'table',digest:'sha256:'+ 'a'.repeat(64)},'host','secondary','en')
    expect(new Set(pinned.layout.tabs.map(tab=>tab.id)).size).toBe(3)
  })
  it('moves a resource without replacing its identity and reopens its existing pane', () => {
    const opened = openResourceInLayout(EMPTY_LAYOUT, { kind: 'research', workspace: 'paper-a', view: 'table' }, 'project-a', 'primary', 'zh')
    const moved = moveResourceInLayout(opened.layout, opened.id, 'secondary')
    const reopened = openResourceInLayout(moved, { kind: 'research', workspace: 'paper-a', view: 'outline', objectId: 'claim-1' }, 'project-a', 'primary', 'zh')
    expect(reopened.id).toBe(opened.id)
    expect(reopened.layout.tabs).toHaveLength(1)
    expect(reopened.layout.tabs[0]).toMatchObject({ area: 'secondary', view: 'outline', objectId: 'claim-1' })
    expect(reopened.layout.active['project-a'].primary).toBeUndefined()
    expect(reopened.layout.active['project-a'].secondary).toBe(opened.id)
  })
  it('retains independent project contexts for the same knowledge document across reload', () => {
    const resource = { kind: 'note' as const, doc: { workspace: 'academic', path: 'memory/method.md', title: 'Method' } }
    const a = openResourceInLayout(EMPTY_LAYOUT, resource, 'a', 'primary', 'zh')
    const b = openResourceInLayout(a.layout, resource, 'b', 'secondary', 'zh')
    const restored = restoreResourceLayout(JSON.stringify(b.layout))
    expect(restored.tabs).toHaveLength(2)
    expect(restored.active.a.primary).toBe(a.id)
    expect(restored.active.b.secondary).toBe(b.id)
    expect(closeResourceInLayout(restored, a.id).active.b.secondary).toBe(b.id)
  })
  it('isolates damaged references and rejects unsafe persisted paths without losing valid tabs', () => {
    const valid = openResourceInLayout(EMPTY_LAYOUT, { kind: 'file', target: { projectId: 'a', workspace: 'a', path: 'main.tex', view: 'files' } }, 'a', 'primary', 'en')
    const bad = { ...valid.layout.tabs[0], id: 'bad', target: { projectId: 'a', workspace: 'a', path: '../secret', view: 'files' } }
    const restored = restoreResourceLayout(JSON.stringify({ ...valid.layout, tabs: [...valid.layout.tabs, bad, { kind: 'pdf' }] }))
    expect(restored.tabs.map(t => t.id)).toEqual([valid.id])
    expect(restoreResourceLayout('{invalid')).toEqual(EMPTY_LAYOUT)
  })
})
