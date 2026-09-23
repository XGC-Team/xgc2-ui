import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newContextItem } from '../src/features/projects/context-model'

vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
const { useWorkbench } = await import('../src/store')

const item = (over: Partial<Parameters<typeof newContextItem>[0]> = {}) => newContextItem({
  project: 'paper-a', kind: 'canvas-node', label: 'Card', ref: 'research-content.json#object/n1', digest: 'rev-1', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  useWorkbench.setState({ projectId: '', contextItems: [] })
})

describe('chat context set in the real Zustand store', () => {
  it('adding an item touches neither the project selection nor any session', () => {
    useWorkbench.getState().addContextItem(item())
    expect(useWorkbench.getState().contextItems).toHaveLength(1)
    expect(useWorkbench.getState().projectId).toBe('')
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-pinned-context-v1',expect.any(String))
    expect(localStorage.setItem).not.toHaveBeenCalledWith('research-ui-project',expect.anything())
  })
  it('deduplicates by project, kind and reference, keeping the stable item id', () => {
    const first = item()
    useWorkbench.getState().addContextItem(first)
    useWorkbench.getState().addContextItem({ ...item(), label: 'Renamed' })
    const items = useWorkbench.getState().contextItems
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(first.id)
    expect(items[0].label).toBe('Renamed')
  })
  it('the same reference in another project is a separate item', () => {
    useWorkbench.getState().addContextItem(item())
    useWorkbench.getState().addContextItem(item({ project: 'paper-b' }))
    expect(useWorkbench.getState().contextItems).toHaveLength(2)
  })
  it('switching the UI project never clears or reroutes the set', () => {
    useWorkbench.getState().addContextItem(item())
    useWorkbench.getState().setProjectId('paper-b')
    const items = useWorkbench.getState().contextItems
    expect(items).toHaveLength(1)
    expect(items[0].project).toBe('paper-a')
  })
  it('patch cannot rewrite the item identity; remove only drops that item', () => {
    const a = item(), b = item({ ref: 'research-content.json#artifact/d1', kind: 'draft' })
    useWorkbench.getState().addContextItem(a)
    useWorkbench.getState().addContextItem(b)
    useWorkbench.getState().patchContextItem(a.id, { id: b.id, state: 'stale-snapshot' })
    const items = useWorkbench.getState().contextItems
    expect(items[0].id).toBe(a.id)
    expect(items[0].state).toBe('stale-snapshot')
    useWorkbench.getState().removeContextItem(a.id)
    expect(useWorkbench.getState().contextItems.map(i => i.id)).toEqual([b.id])
  })
})
