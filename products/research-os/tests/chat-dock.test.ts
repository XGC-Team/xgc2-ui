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
