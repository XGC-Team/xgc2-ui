import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_LAYOUT } from '../src/features/workbench/resource-model'

vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() })
const { useWorkbench } = await import('../src/store')

const state = () => useWorkbench.getState()
const primaryActive = () => state().resourceLayout.active['paper-a']?.primary
const kindOf = (id?: string) => state().resourceLayout.tabs.find(tab => tab.id === id)?.kind

beforeEach(() => {
  vi.clearAllMocks()
  useWorkbench.setState({ projectId: 'paper-a', chatDock: false, activeNav: 'chat', resourceLayout: structuredClone(EMPTY_LAYOUT) })
})

describe('docked discussion (Chat | canvas | artifact)', () => {
  it('docking reveals the last content tab instead of leaving the primary area on the moved conversation', () => {
    state().openResource({ kind: 'research', workspace: 'paper-a', view: 'canvas' }, 'primary')
    state().showConversation()
    expect(kindOf(primaryActive())).toBe('chat')
    state().setChatDock(true)
    expect(state().chatDock).toBe(true)
    expect(kindOf(primaryActive())).toBe('research')
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-chat-dock', 'docked')
  })

  it('while docked, showing the conversation never replaces the primary content tab', () => {
    state().openResource({ kind: 'research', workspace: 'paper-a', view: 'canvas' }, 'primary')
    state().setChatDock(true)
    state().setActiveNav('workflow')
    state().showConversation()
    expect(state().activeNav).toBe('chat')
    expect(kindOf(primaryActive())).toBe('research')
    expect(state().resourceLayout.tabs.filter(tab => tab.kind === 'chat')).toHaveLength(1)
  })

  it('undocking keeps every tab and persists the choice', () => {
    state().openResource({ kind: 'research', workspace: 'paper-a', view: 'canvas' }, 'primary')
    state().setChatDock(true)
    const tabs = state().resourceLayout.tabs.length
    state().setChatDock(false)
    expect(state().chatDock).toBe(false)
    expect(state().resourceLayout.tabs).toHaveLength(tabs)
    expect(localStorage.setItem).toHaveBeenCalledWith('research-ui-chat-dock', 'tabbed')
  })

  it('settings deep links switch to Settings and carry a fresh nonce each time', () => {
    state().openSettings('connections')
    const first = state().settingsFocus
    expect(state().activeNav).toBe('settings')
    expect(first?.section).toBe('connections')
    state().openSettings('appearance')
    expect(state().settingsFocus?.section).toBe('appearance')
  })
})

describe('detachable panels', () => {
  it('floating the discussion frees its tab slot without closing any tab, and docking clears floating', () => {
    useWorkbench.setState({ chatFloat: false, sideFloat: false })
    state().openResource({ kind: 'research', workspace: 'paper-a', view: 'canvas' }, 'primary')
    state().showConversation()
    const tabs = state().resourceLayout.tabs.length
    state().setChatFloat(true)
    expect(state().chatFloat).toBe(true)
    expect(kindOf(primaryActive())).toBe('research')
    expect(state().resourceLayout.tabs).toHaveLength(tabs)
    state().showConversation()
    expect(kindOf(primaryActive())).toBe('research')
    state().setChatDock(true)
    expect(state()).toMatchObject({ chatDock: true, chatFloat: false })
  })

  it('floating the side pane opens it', () => {
    useWorkbench.setState({ secondaryOpen: false, sideFloat: false })
    state().setSideFloat(true)
    expect(state()).toMatchObject({ sideFloat: true, secondaryOpen: true })
  })

  it('keeps floating windows inside the viewport at a usable size', async () => {
    const { clampRect } = await import('../src/components/FloatingPanel')
    expect(clampRect({ x: 5000, y: -40, w: 100, h: 5000 }, { w: 1200, h: 800 })).toEqual({ x: 872, y: 8, w: 320, h: 784 })
  })
})
