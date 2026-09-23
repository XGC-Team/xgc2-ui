import { FeedbackButton } from '../review/FeedbackButton'
import type { Anchor, Rect } from '../review/review-model'
import { pageFromPdfId, pdfPageNumber } from '../resources/pdf-scroll'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { DraftSource } from './draft-model'

function pageHolding(root: HTMLElement | null, range: Range): HTMLElement | null {
  if (!root) return null
  for (const page of root.querySelectorAll<HTMLElement>('[data-xgc-role="pdf-page"]')) {
    if (page.contains(range.startContainer) && page.contains(range.endContainer)) return page
  }
  return null
}

/** Selection is captured only inside this reader and tied to the version actually rendered. */
export function ReadingBridge({ source, projectId, projectWorkspace, fill = false, active = true, children }: {
  source: DraftSource; projectId?: string; projectWorkspace?: string; fill?: boolean; active?: boolean; children: ReactNode
}) {
  const { locale, projectId: selectedProject, requestDraftCapture, readingAnchor } = useWorkbench()
  const root = useRef<HTMLDivElement>(null)
  const regionStart = useRef<{x:number;y:number}|null>(null)
  const [reviewRegion, setReviewRegion] = useState<{page:number;rects:Rect[]}|null>(null)
  const [annotationText, setAnnotationText] = useState('')
  const located = useRef<{ nonce: number; digest?: string } | null>(null)
  const [excerpt, setExcerpt] = useState(''), [notice, setNotice] = useState('')
  const zh = locale === 'zh', target = projectId || selectedProject
  useEffect(() => {
    if (!active) return
    setExcerpt(''); setNotice(''); setReviewRegion(null); setAnnotationText('')
    const capture = () => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) { setExcerpt(''); return }
      const range = selection.getRangeAt(0)
      const surface = source.buildId ? pageHolding(root.current, range) : root.current
      if (surface?.contains(range.startContainer) && surface.contains(range.endContainer)) {
        setExcerpt(selection.toString().trim())
        if (source.buildId && surface instanceof HTMLElement) {
          const bounds = surface.getBoundingClientRect(), page = pageFromPdfId(surface.dataset.xgcId)
          if (page && bounds.width && bounds.height) setReviewRegion({page, rects:[...range.getClientRects()].map(r=>({x:Math.max(0,(r.left-bounds.left)/bounds.width),y:Math.max(0,(r.top-bounds.top)/bounds.height),width:Math.min(1,r.width/bounds.width),height:Math.min(1,r.height/bounds.height)})).filter(r=>r.width>0&&r.height>0)})
        }
      }
      else if (!selection.isCollapsed) setExcerpt('')
    }
    const pages = new MutationObserver(changes => {
      if(changes.some(change => change.target instanceof Element && change.target.matches('[data-xgc-role="pdf-page"]'))){setReviewRegion(null);setExcerpt('');setAnnotationText('')}
    })
    if(source.buildId&&root.current)pages.observe(root.current,{subtree:true,attributes:true,attributeFilter:['data-xgc-id']})
    document.addEventListener('selectionchange', capture)
    return () => {pages.disconnect();document.removeEventListener('selectionchange', capture)}
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
    const visible = pdfPageNumber(root.current?.querySelector<HTMLElement>('[data-xgc-role="pdf-viewport"]')?.getAttribute('data-xgc-current-page'))
    const page = reviewRegion?.page || visible || pdfPageNumber(source.page) || undefined
    requestDraftCapture({ id: crypto.randomUUID(), scope: { projectId: target, workspace: projectWorkspace || target }, kind,
      source: { ...source, ...(page ? { page } : {}), id: crypto.randomUUID(), ...(kind === 'note' ? { excerpt } : {}) } })
  }
  const feedbackAnchor: Anchor | undefined = source.workspace && source.digest && (excerpt || reviewRegion) ? {
    kind: source.buildId ? 'pdf' : 'text', workspace:source.workspace, path:source.path, digest:source.digest, quote:excerpt,
    ...(source.buildId ? {origin:'project-build' as const,buildId:source.buildId,page:reviewRegion?.page || source.page || 1,rects:reviewRegion?.rects || []} : {}),
  } : undefined
  const acting = Boolean(excerpt || reviewRegion)
  return <div className={fill ? 'flex h-full min-h-0 flex-col' : 'min-h-0'}>
    {/* A filled PDF reader keeps its action row in the layout while selecting.
        Inserting it during pointer/selection events would move the page under
        the cursor before its normalized annotation geometry is captured. */}
    {(fill || acting) && <div className={fill ? 'flex h-9 shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap [&>button]:shrink-0' : 'mb-3 flex flex-wrap gap-1'}>
      <Button size="xs" title={excerpt} disabled={!target || !excerpt || !source.digest} onPointerDown={event => event.preventDefault()} onClick={() => record('note')}>{zh ? '选区形成来源笔记' : 'Create note from selection'}</Button>
      <Button size="xs" disabled={!target} onClick={() => record('material')}>{zh ? '收入项目材料引用' : 'Add project material reference'}</Button>
      {feedbackAnchor && <FeedbackButton scope={{projectId:target,workspace:projectWorkspace||target}} anchor={feedbackAnchor} body={annotationText} disabled={!active}/> }
      {!target && <span className="text-caption text-ink-3">{zh ? '先选择目标项目' : 'Select a target project first'}</span>}
    </div>}
    {notice && <p role="status" className="mb-2 text-caption text-ink-3">{notice}</p>}
    <div ref={root} className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}
      onInputCapture={event=>{const el=event.target;if(el instanceof HTMLTextAreaElement&&el.closest('[data-xgc-role="pdf-annotation-editor"]'))setAnnotationText(el.value)}}
      onPointerDownCapture={event=>{if(!active||!source.buildId)return;const el=event.target;if(el instanceof Element&&el.closest('[data-xgc-role="pdf-region-selector"]'))regionStart.current={x:event.clientX,y:event.clientY}}}
      onPointerCancelCapture={()=>{regionStart.current=null}}
      onPointerUp={event=>{
        const start=regionStart.current;regionStart.current=null;if(!start||!active)return
        const pageEl = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-xgc-role="pdf-page"]') : null
        if (!pageEl || !root.current?.contains(pageEl)) return
        const box = pageEl.getBoundingClientRect()
        const page = pageFromPdfId(pageEl.dataset.xgcId)
        if (!box.width || !box.height || !page) return
        const clamp=(v:number)=>Math.max(0,Math.min(1,v)),left=clamp((Math.min(start.x,event.clientX)-box.left)/box.width),right=clamp((Math.max(start.x,event.clientX)-box.left)/box.width),top=clamp((Math.min(start.y,event.clientY)-box.top)/box.height),bottom=clamp((Math.max(start.y,event.clientY)-box.top)/box.height)
        if(right-left>.005&&bottom-top>.005){setExcerpt('');setReviewRegion({page,rects:[{x:left,y:top,width:right-left,height:bottom-top}]})}
      }}>{children}</div>
  </div>
}
