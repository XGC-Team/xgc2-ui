import { CanvasReviewTools } from '../review/CanvasReviewTools'
import { WriteBoundary } from '../review/WriteBoundary'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button, IconBtn } from '../../components/ui'
import { PageActions } from '../../components/PageActions'
import { ResizeHandle } from '../../components/ResizeHandle'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import { ThinkingCanvas } from './ThinkingCanvas'
import { workspaceCopy } from './workspace-copy'
import {
  activeCanvasProject, canSplitWorkspace, chatWidthForRatio, ratioForChatWidth,
  rememberCanvas, resolveWorkspaceMode, WORKSPACE_LAYOUT,
  type CompactPane, type WorkspaceMode,
} from './workspace-layout'
import './research-workspace.css'

const ThinkingCanvasM = memo(ThinkingCanvas)

/** Existing Chat + existing project canvas; the existing BrowserPanel remains the third work surface. */
export function ResearchWorkspace({ projects, children }: {
  projects: Project[]
  children: (conversationVisible: boolean) => ReactNode
}) {
  const { projectId, canvasProject, openCanvas, closeCanvas, openRightTab, locale, activeNav, sourceView } = useWorkbench()
  const copy = workspaceCopy[locale]
  const currentCanvas = activeCanvasProject(canvasProject, projectId)
  const root = useRef<HTMLDivElement>(null)
  const chat = useRef<HTMLElement>(null)
  const focusFrame = useRef(0)
  const [width, setWidth] = useState(0)
  const [requested, setRequested] = useState<WorkspaceMode>('split')
  const [compact, setCompact] = useState<CompactPane>('canvas')
  const [ratio, setRatio] = useState<number>(WORKSPACE_LAYOUT.defaultRatio)
  const [opened, setOpened] = useState<readonly string[]>([])
  // Include a newly opened canvas immediately; stable project keys retain the same instance afterwards.
  const mountedCanvases = rememberCanvas(opened, currentCanvas)
  useEffect(() => {
    setOpened(previous => rememberCanvas(previous, currentCanvas))
    if (currentCanvas) { setRequested('split'); setCompact('canvas') }
  }, [currentCanvas])

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width)
      // A hidden workbench page reports zero; do not replace the user's visible layout with that value.
      if (next > 0) setWidth(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => cancelAnimationFrame(focusFrame.current), [])

  const mode = resolveWorkspaceMode(width, requested, compact, Boolean(currentCanvas))
  const canSplit = canSplitWorkspace(width)
  const chatVisible = mode !== 'canvas'
  const canvasVisible = Boolean(currentCanvas) && mode !== 'chat'
  const chatWidth = chatWidthForRatio(width, ratio)
  const requestConversation = useCallback(() => {
    // This only reveals/focuses the draft. It must never send a message or start a workflow.
    setRequested('split')
    setCompact('chat')
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
      document.querySelector<HTMLElement>('[data-open-research-canvas]')?.focus({ preventScroll: true })
    })
  }

  return <div ref={root} className="research-workspace" data-layout={mode}>
    <PageActions page="chat">
      {projectId && <Button size="xs" data-open-research-canvas aria-pressed={Boolean(currentCanvas)}
        variant={currentCanvas ? 'outline' : 'ghost'} onClick={() => currentCanvas ? hideCanvas() : openCanvas(projectId)}>
        {copy.canvas}
      </Button>}
    </PageActions>
    {currentCanvas && <div className="research-workspace__toolbar">
      <span className="min-w-0 flex-1 truncate font-display text-[13px]" title={currentCanvas}>
        {projects.find(project => project.id === currentCanvas)?.title ?? currentCanvas}
      </span>
      <div role="group" aria-label={copy.layout} className="flex shrink-0 items-center gap-0.5">
        <Button size="xs" aria-pressed={mode === 'chat'} variant={mode === 'chat' ? 'outline' : 'ghost'}
          onClick={() => { setRequested('chat'); setCompact('chat') }}>{copy.chat}</Button>
        <Button size="xs" aria-pressed={mode === 'split'} variant={mode === 'split' ? 'outline' : 'ghost'}
          disabled={!canSplit} title={!canSplit ? copy.narrow : undefined} onClick={() => setRequested('split')}>{copy.split}</Button>
        <Button size="xs" aria-pressed={mode === 'canvas'} variant={mode === 'canvas' ? 'outline' : 'ghost'}
          onClick={() => { setRequested('canvas'); setCompact('canvas') }}>{copy.focusCanvas}</Button>
      </div>
      <CanvasReviewTools project={currentCanvas}/>
      <Button size="xs" onClick={() => openRightTab({ kind: 'file' })}>{copy.files}</Button>
      <IconBtn icon={X} label={copy.close} onClick={hideCanvas}/>
    </div>}
    <div className="research-workspace__panes">
      {/* Never conditionally mount Chat: native stream, draft and editor selection belong to the session. */}
      <section ref={chat} aria-label={copy.chat} tabIndex={-1} hidden={!chatVisible}
        className="research-workspace__chat" style={mode === 'split' ? { width: chatWidth, flex: '0 0 auto' } : undefined}>
        {children(chatVisible)}
      </section>
      {mode === 'split' && <ResizeHandle orientation="v" label={copy.divider}
        value={Math.round(chatWidth)} min={WORKSPACE_LAYOUT.minChat} max={Math.floor(width - WORKSPACE_LAYOUT.divider - WORKSPACE_LAYOUT.minCanvas)}
        onValueChange={pixels => setRatio(ratioForChatWidth(width, pixels))}
        onDelta={delta => setRatio(previous => ratioForChatWidth(width, chatWidthForRatio(width, previous) + delta))}
        onDoubleClick={() => setRatio(WORKSPACE_LAYOUT.defaultRatio)}/>}
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
