import { WriteBoundary } from '../review/WriteBoundary'
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconBtn } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import { cn } from '../../lib/cn'
import { ThinkingCanvas } from './ThinkingCanvas'
import { workspaceCopy } from './workspace-copy'
import { activeCanvasProject, rememberCanvas } from './workspace-layout'
import './research-workspace.css'

const ThinkingCanvasM = memo(ThinkingCanvas)

/** Existing Chat + existing project canvas; the existing BrowserPanel remains the third work surface. */
export function ResearchWorkspace({ projects, children }: {
  projects: Project[]
  children: (conversationVisible: boolean) => ReactNode
}) {
  const { projectId, canvasProject, closeCanvas, locale, activeNav, sourceView } = useWorkbench()
  const copy = workspaceCopy[locale]
  const currentCanvas = activeCanvasProject(canvasProject, projectId)
  const projectTitle = projects.find(project => project.id === projectId)?.title
  const chat = useRef<HTMLElement>(null)
  const focusFrame = useRef(0)
  const [active, setActive] = useState<'chat' | 'canvas'>('chat')
  const [opened, setOpened] = useState<readonly string[]>([])
  // A canvas tab exists only after that canvas is opened. Chat is not a preset tab.
  const mountedCanvases = rememberCanvas(opened, currentCanvas)
  useEffect(() => {
    setOpened(previous => rememberCanvas(previous, currentCanvas))
    if (currentCanvas) setActive('canvas')
    else setActive('chat')
  }, [currentCanvas])

  useEffect(() => () => cancelAnimationFrame(focusFrame.current), [])

  const canvasVisible = Boolean(currentCanvas) && active === 'canvas'
  const chatVisible = !canvasVisible
  const requestConversation = useCallback(() => {
    // This only reveals/focuses the draft. It must never send a message or start a workflow.
    setActive('chat')
    cancelAnimationFrame(focusFrame.current)
    focusFrame.current = requestAnimationFrame(() => {
      const editor = chat.current?.querySelector<HTMLElement>('textarea:not([disabled]), [contenteditable="true"]')
      ;(editor ?? chat.current)?.focus({ preventScroll: true })
    })
  }, [])
  const hideCanvas = () => {
    closeCanvas()
    cancelAnimationFrame(focusFrame.current)
    focusFrame.current = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-xgc-role="research-middle-chat-tab"]')?.focus({ preventScroll: true })
    })
  }

  return <div className="research-workspace" data-layout={canvasVisible ? 'canvas' : 'chat'}>
    {currentCanvas && <div className="flex h-panel-header shrink-0 items-center gap-1 pl-2 pr-1.5" data-xgc-role="research-middle-tabs" data-xgc-id={projectId}>
      <div role="tablist" aria-label={projectTitle ? `${copy.layout} · ${projectTitle}` : copy.layout} className="ui-rtabs flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <button type="button" role="tab" data-xgc-role="research-middle-chat-tab" aria-selected={chatVisible} className={cn('ui-rtab', chatVisible && 'is-active')}
          onClick={() => setActive('chat')}>{copy.chat}</button>
        <button type="button" role="tab" aria-selected={canvasVisible} className={cn('ui-rtab', canvasVisible && 'is-active')}
          onClick={() => setActive('canvas')}>{copy.canvas}</button>
      </div>
      <IconBtn icon={X} label={copy.close} onClick={hideCanvas}/>
    </div>}
    <div className="research-workspace__panes">
      {/* Never conditionally mount Chat: native stream, draft and editor selection belong to the session. */}
      <section ref={chat} aria-label={copy.chat} tabIndex={-1} hidden={!chatVisible} className="research-workspace__chat">
        {children(chatVisible)}
      </section>
      <section aria-label={copy.canvas} hidden={!canvasVisible} className="research-workspace__canvas">
        {mountedCanvases.map(project => <div key={project} hidden={!canvasVisible || project !== currentCanvas}
          className="research-workspace__canvas-instance" data-canvas-project={project}>
          <WriteBoundary workspace={project} path="thinking.canvas.json"><ThinkingCanvasM project={project} active={activeNav === 'chat' && !sourceView && canvasVisible && project === currentCanvas}
            onRequestConversation={requestConversation}/></WriteBoundary>
        </div>)}
      </section>
    </div>
  </div>
}
