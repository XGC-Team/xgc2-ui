import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fileTarget } from '../src/features/projects/project-object-model'

// Zustand's actual store runs in the existing Node Vitest environment; only browser storage is stubbed.
vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
const { useWorkbench } = await import('../src/store')

beforeEach(() => {
  vi.clearAllMocks()
  useWorkbench.setState({ projectId: '', rightTabs: [], activeRightTab: '', sourceView: null, canvasProject: null, activeNav: 'chat' })
})
describe('project object tab identity', () => {
  it('binds a legacy file action once and retains it after switching projects', () => {
    const s = useWorkbench.getState()
    s.setProjectId('a'); const a = s.openRightTab({ kind: 'file' })
    s.setProjectId('b'); const b = s.openRightTab({ kind: 'file' })
    expect(a).not.toBe(b)
    const first = useWorkbench.getState().rightTabs.find(t => t.id === a)
    expect(first).toMatchObject({ kind: 'file', target: { projectId: 'a', workspace: 'a' } })
    s.activateRightTab(a)
    expect(useWorkbench.getState().projectId).toBe('b')
  })
  it('deduplicates a concrete file across object entry points', () => {
    const s = useWorkbench.getState()
    const a = s.openRightTab({ kind: 'file', target: fileTarget('a', 'repo', 'files', 'one.md') })
    const b = s.openRightTab({ kind: 'file', target: fileTarget('a', 'repo', 'notes', 'one.md') })
    expect(a).toBe(b); expect(useWorkbench.getState().rightTabs).toHaveLength(1)
  })
  it('keeps materials, notes and build explorers separate', () => {
    const s = useWorkbench.getState()
    for (const view of ['files', 'notes', 'builds'] as const) s.openRightTab({ kind: 'file', target: fileTarget('a', 'repo', view) })
    expect(useWorkbench.getState().rightTabs).toHaveLength(3)
  })
  it('reopens a closed file at exactly the same target', () => {
    const s = useWorkbench.getState(), target = fileTarget('a', 'repo', 'files', 'chapter/one.tex')
    const id = s.openRightTab({ kind: 'file', target }); s.closeRightTab(id)
    s.openRightTab({ kind: 'file', target })
    expect(useWorkbench.getState().rightTabs[0]).toMatchObject({ target })
  })
  it('a blank file tab does not silently acquire a project', () => {
    const s = useWorkbench.getState(); const blank = s.openRightTab({ kind: 'file' }); s.setProjectId('a')
    const owned = s.openRightTab({ kind: 'file' })
    expect(blank).not.toBe(owned)
    expect(useWorkbench.getState().rightTabs[0]).toMatchObject({ target: { projectId: '', workspace: '' } })
  })
  it('canvas navigation persists project selection and closes a source overlay', () => {
    useWorkbench.getState().openCanvas('a')
    expect(useWorkbench.getState()).toMatchObject({ projectId: 'a', canvasProject: 'a', sourceView: null, activeNav: 'chat' })
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-project', 'a')
  })
})
