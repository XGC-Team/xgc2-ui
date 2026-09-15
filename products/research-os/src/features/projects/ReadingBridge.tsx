import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { DraftSource } from './draft-model'

/** Selection is captured only inside this reader and tied to the version actually rendered. */
export function ReadingBridge({ source, projectId, projectWorkspace, fill = false, active = true, children }: {
  source: DraftSource; projectId?: string; projectWorkspace?: string; fill?: boolean; active?: boolean; children: ReactNode
}) {
  const { locale, projectId: selectedProject, requestDraftCapture, readingAnchor } = useWorkbench()
  const root = useRef<HTMLDivElement>(null)
  const located = useRef<{ nonce: number; digest?: string } | null>(null)
  const [excerpt, setExcerpt] = useState(''), [notice, setNotice] = useState('')
  const zh = locale === 'zh', target = projectId || selectedProject
  useEffect(() => {
    if (!active) return
    setExcerpt(''); setNotice('')
    const capture = () => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) { setExcerpt(''); return }
      const range = selection.getRangeAt(0)
      const surface = source.buildId ? root.current?.querySelector('[data-xgc-role="pdf-page"]') : root.current
      if (surface?.contains(range.startContainer) && surface.contains(range.endContainer)) setExcerpt(selection.toString().trim())
      else if (!selection.isCollapsed) setExcerpt('')
    }
    document.addEventListener('selectionchange', capture)
    return () => document.removeEventListener('selectionchange', capture)
  }, [active, source.workspace, source.path, source.digest, source.buildId])
  useEffect(() => {
    if (!active || !readingAnchor || readingAnchor.workspace !== source.workspace || readingAnchor.path !== source.path) return
    if (readingAnchor.digest && source.digest !== readingAnchor.digest) {
      setNotice(zh ? '来源版本已变化；显示的是当前文件，未将旧摘录重新定位到新版本。' : 'Source revision changed. This is the current file; the old excerpt was not repinned.')
      return
    }
    if (located.current?.nonce === readingAnchor.nonce && located.current.digest === source.digest) return
    located.current = { nonce: readingAnchor.nonce, digest: source.digest }
    const text = readingAnchor.excerpt
    if (!text || !root.current) return
    const all = root.current.textContent || '', start = all.indexOf(text)
    if (start < 0 || all.indexOf(text, start + 1) >= 0) {
      setNotice(zh ? '摘录无法唯一定位，请依据保存的摘录核对来源。' : 'Excerpt cannot be located uniquely. Check it against the saved quotation.'); return
    }
    const walker = document.createTreeWalker(root.current, NodeFilter.SHOW_TEXT)
    let node: Node | null, offset = 0, begin: [Node, number] | undefined, end: [Node, number] | undefined
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length || 0
      if (!begin && start < offset + length) begin = [node, start - offset]
      if (begin && start + text.length <= offset + length) { end = [node, start + text.length - offset]; break }
      offset += length
    }
    if (begin && end) {
      const range = document.createRange(); range.setStart(...begin); range.setEnd(...end)
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
      begin[0].parentElement?.scrollIntoView({ block: 'nearest' })
      setNotice(zh ? '已定位保存版本中的摘录。' : 'Located the excerpt in the recorded revision.')
    }
  }, [active, readingAnchor, source.workspace, source.path, source.digest, zh])
  const record = (kind: 'note' | 'material') => {
    if (!target || (kind === 'note' && (!excerpt || !source.digest))) return
    const pageId = root.current?.querySelector<HTMLElement>('[data-xgc-role="pdf-page"]')?.dataset.xgcId
    const page = source.page || (pageId ? Number(pageId.match(/:page:(\d+)$/)?.[1]) : undefined)
    requestDraftCapture({ id: crypto.randomUUID(), scope: { projectId: target, workspace: projectWorkspace || target }, kind,
      source: { ...source, ...(page ? { page } : {}), id: crypto.randomUUID(), ...(kind === 'note' ? { excerpt } : {}) } })
  }
  return <div className={fill ? 'flex h-full min-h-0 flex-col' : 'min-h-0'}>
    <div className="mb-3 flex flex-wrap gap-1">
      <Button size="xs" title={excerpt} disabled={!target || !excerpt || !source.digest} onPointerDown={event => event.preventDefault()} onClick={() => record('note')}>{zh ? '选区形成来源笔记' : 'Create note from selection'}</Button>
      <Button size="xs" disabled={!target} onClick={() => record('material')}>{zh ? '收入项目材料引用' : 'Add project material reference'}</Button>
      <span className="text-caption text-ink-3">{target ? `${zh ? '目标项目' : 'Target project'} · ${target}` : zh ? '先选择目标项目' : 'Select a target project first'}</span>
    </div>
    {notice && <p role="status" className="mb-2 text-caption text-ink-3">{notice}</p>}
    <div ref={root} className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}>{children}</div>
  </div>
}
