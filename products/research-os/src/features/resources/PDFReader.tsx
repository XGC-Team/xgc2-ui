import { decodeAnnotation, encodeAnnotation, relativeRect, type PDFAnchor, type PDFRect } from './pdf-annotations'
import { listPDFVersions, type ManuscriptPDF } from './manuscript'
import {
  clampPdfZoom,
  dominantPdfPage,
  layoutPdfPages,
  pageFromPdfId,
  PDF_SCROLL_GAP,
  PDF_SCROLL_PAD,
  pdfPageId,
  pdfPagesToPaint,
  pdfWheelZoom,
  samePageSet,
  scrollToHoldPoint,
  type PageBox,
  type PdfPointHold,
} from './pdf-scroll'
import { t as tr } from '../../i18n'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useWorkbench } from '../../store'
import { collection, post, request } from '../../lib/api'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { ChevronLeft, ChevronRight, FileCode2, Minus, Plus, Scan, MousePointer2, X, MessageSquare } from 'lucide-react'
import { pdfFeedbackAnchor } from '../workbench/annotation-discussion'
import { readReadingPlace, writeReadingPlace } from '../workbench/writing-session'

GlobalWorkerOptions.workerSrc = worker

type StoredNote = { id: string; page: number; body: string }
type ParsedNote = StoredNote & { anchor: PDFAnchor | null; comment: string }
type FlashMark = { page: number; rect: PDFRect }

function boxesFromDom(viewport: HTMLElement): PageBox[] {
  const origin = viewport.getBoundingClientRect().top
  const boxes: PageBox[] = []
  for (const el of viewport.querySelectorAll<HTMLElement>('[data-xgc-role="pdf-page"]')) {
    const page = pageFromPdfId(el.dataset.xgcId)
    if (!page) continue
    const rect = el.getBoundingClientRect()
    boxes.push({ page, top: rect.top - origin + viewport.scrollTop, width: rect.width, height: rect.height })
  }
  return boxes
}

function renderFailed(error: unknown): string | null {
  if (error instanceof Error && error.name === 'RenderingCancelledException') return null
  return error instanceof Error ? error.message : String(error)
}

function pageNode(viewport: HTMLElement, digest: string, page: number): HTMLElement | null {
  return viewport.querySelector(`[data-xgc-id="${pdfPageId(digest, page)}"]`)
}

function scrollTopFor(viewport: HTMLElement, target: HTMLElement): number {
  return Math.max(0, target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - PDF_SCROLL_PAD)
}

function PdfPage({
  doc, digest, pageNumber, width, height, paint, mode, busy, notes, selectedNote, outline, showEditor, activeAnchor, activeNote, flashRect, comment, quote, gapBelow,
  onComment, onText, onRegion, onSelectNote, onClose, onJump, onSubmit, onDiscuss, onError,
}: {
  doc: PDFDocumentProxy
  digest: string
  pageNumber: number
  width: number
  height: number
  paint: boolean
  mode: 'text' | 'region'
  busy: boolean
  notes: ParsedNote[]
  selectedNote: string | null
  outline: PDFRect[]
  showEditor: boolean
  activeAnchor: PDFAnchor | null
  activeNote: ParsedNote | null
  flashRect: PDFRect | null
  comment: string
  quote: string
  gapBelow: boolean
  onComment: (value: string) => void
  onText: (page: number, rects: PDFRect[], quote: string, context: string) => void
  onRegion: (page: number, rect: PDFRect, quote: string, context: string) => void
  onSelectNote: (note: ParsedNote) => void
  onClose: () => void
  onJump: () => void
  onSubmit: () => void
  onDiscuss: () => void
  onError: (message: string) => void
}) {
  const paper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const regionStart = useRef<{ x: number; y: number } | null>(null)
  const [draftRect, setDraftRect] = useState<PDFRect | null>(null)
  const reportError = useRef(onError)
  reportError.current = onError
  const rectangleStyle = (rect: PDFRect) => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` })
  useEffect(() => { if (mode !== 'region') setDraftRect(null) }, [mode])
  useEffect(() => {
    const text = layer.current
    if (!text || width < 1 || height < 1) return
    let alive = true
    let cancel = () => {}
    void doc.getPage(pageNumber).then(async page => {
      if (!alive) return
      text.innerHTML = ''
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      text.style.setProperty('--scale-factor', String(viewport.scale))
      const textLayer = new TextLayer({ container: text, viewport, textContentSource: page.streamTextContent() })
      cancel = () => textLayer.cancel()
      await textLayer.render()
    }).catch(error => {
      const message = renderFailed(error)
      if (alive && message) reportError.current(message)
    })
    return () => { alive = false; cancel(); if (text) text.innerHTML = '' }
  }, [doc, pageNumber, width, height])
  useEffect(() => {
    const el = canvas.current
    if (!paint || !el || width < 1 || height < 1) return
    let alive = true
    let cancel = () => {}
    void doc.getPage(pageNumber).then(async page => {
      if (!alive) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const ratio = Math.min(2, devicePixelRatio || 1)
      el.width = viewport.width * ratio
      el.height = viewport.height * ratio
      el.style.width = `${viewport.width}px`
      el.style.height = `${viewport.height}px`
      const render = page.render({ canvasContext: el.getContext('2d')!, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      cancel = () => render.cancel()
      await render.promise
    }).catch(error => {
      const message = renderFailed(error)
      if (alive && message) reportError.current(message)
    })
    return () => { alive = false; cancel(); if (el) { el.width = 0; el.height = 0 } }
  }, [doc, pageNumber, width, height, paint])
  function selectText() {
    if (mode !== 'text' || busy || !paper.current || !layer.current) return
    const selection = window.getSelection()
    if (!selection?.rangeCount || !selection.toString().trim()) return
    const range = selection.getRangeAt(0)
    if (!layer.current.contains(range.startContainer) || !layer.current.contains(range.endContainer)) return
    const bounds = paper.current.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).map(rect => relativeRect(rect, bounds)).filter(rect => rect.width > .001 && rect.height > .001)
    if (!rects.length) return
    onText(pageNumber, rects, selection.toString().trim(), layer.current.textContent?.slice(0, 6000) || '')
  }
  function finishRegion(event: ReactPointerEvent<HTMLDivElement>) {
    const start = regionStart.current
    regionStart.current = null
    if (!start || !paper.current) return
    const bounds = paper.current.getBoundingClientRect()
    const rect = relativeRect({ left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY), right: Math.max(start.x, event.clientX), bottom: Math.max(start.y, event.clientY) }, bounds)
    setDraftRect(null)
    if (rect.width < .005 || rect.height < .005) return
    const quote = Array.from(layer.current?.querySelectorAll('span') || []).filter(el => {
      const mark = relativeRect(el.getBoundingClientRect(), bounds)
      return mark.x < rect.x + rect.width && mark.x + mark.width > rect.x && mark.y < rect.y + rect.height && mark.y + mark.height > rect.y
    }).map(el => el.textContent).join(' ')
    onRegion(pageNumber, rect, quote, layer.current?.textContent?.slice(0, 6000) || '')
  }
  const lastRect = activeAnchor?.rects.at(-1)
  const marks = draftRect ? [draftRect] : outline
  return <div
    ref={paper}
    data-xgc-role="pdf-page"
    data-xgc-id={pdfPageId(digest, pageNumber)}
    className="relative bg-white"
    style={{ width, height, marginBottom: gapBelow ? PDF_SCROLL_GAP : 0 }}
    onMouseUp={selectText}
  >
    {paint && <canvas ref={canvas} />}
    <div ref={layer} className="research-pdf-text absolute inset-0" />
    {mode === 'region' && <div
      data-xgc-role="pdf-region-selector"
      className="absolute inset-0 z-10 cursor-crosshair"
      style={{ touchAction: 'none' }}
      onPointerDown={event => { if (event.button !== 0 || busy) return; regionStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { const start = regionStart.current; if (start && paper.current) setDraftRect(relativeRect({ left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY), right: Math.max(start.x, event.clientX), bottom: Math.max(start.y, event.clientY) }, paper.current.getBoundingClientRect())) }}
      onPointerUp={finishRegion}
      onPointerCancel={() => { regionStart.current = null; setDraftRect(null) }}
    />}
    {notes.filter(note => note.anchor).map((note, noteIndex) => <div key={note.id}>{note.anchor!.rects.map((rect, index) => <button key={index} aria-label={`${tr('查看批注')} ${noteIndex + 1}`} data-xgc-role="pdf-annotation-mark" data-xgc-id={`${note.id}:${index}`} title={note.comment} className={`absolute z-20 border transition-colors duration-150 ${selectedNote === note.id ? 'border-ink bg-ink/20' : 'border-ink/40 bg-ink/10 hover:bg-ink/15'}`} style={rectangleStyle(rect)} onClick={() => onSelectNote(note)} />)}</div>)}
    {marks.map((rect, index) => <div key={index} className="pointer-events-none absolute z-20 border border-dashed border-ink/70 bg-ink/5" style={rectangleStyle(rect)} />)}
    {flashRect && <div data-xgc-role="pdf-flash" className="pdf-flash pointer-events-none absolute z-30" style={rectangleStyle(flashRect)} />}
    {showEditor && <div data-xgc-role="pdf-annotation-editor" data-xgc-id="pdf-annotation-editor" className="absolute z-30 w-72 max-w-full rounded-lg border border-line bg-panel p-3 text-ink shadow-pop" style={{ left: `${Math.min(lastRect?.x || 0, Math.max(0, 1 - 288 / (width || 380))) * 100}%`, ...(lastRect && lastRect.y > .55 ? { bottom: `${(1 - lastRect.y) * 100}%` } : { top: `${Math.min(.75, (lastRect?.y || 0) + (lastRect?.height || 0)) * 100}%` }) }} onMouseUp={event => event.stopPropagation()}>
      <div className="mb-2 flex items-center gap-2 text-caption"><MessageSquare size={12} /><span className="flex-1">{tr(activeAnchor?.kind === 'region' ? '区域批注' : '原文批注')}</span>{activeAnchor && <span data-xgc-role="pdf-jump-source"><IconBtn icon={FileCode2} label={tr('跳到源码')} disabled={busy} onClick={onJump} /></span>}<IconBtn icon={X} label={tr('关闭批注')} disabled={busy} onClick={onClose} /></div>
      {(activeAnchor?.quote || quote) && <blockquote className="mb-2 max-h-20 overflow-auto border-l-2 border-line pl-2 text-caption text-ink-2">{activeAnchor?.quote || quote}</blockquote>}
      {activeNote
        ? <><p className="whitespace-pre-wrap text-secondary">{activeNote.comment}</p><Button className="mt-2" data-xgc-role="pdf-annotation-discuss" data-xgc-id={activeNote.id} onClick={onDiscuss}>{tr('加入这次讨论')}</Button></>
        : <><textarea autoFocus data-xgc-role="pdf-annotation-comment" data-xgc-id="pdf-annotation-comment" aria-label={tr('PDF 批注')} placeholder={tr('写下对这一处的设计意见…')} className="ui-input" rows={3} disabled={busy} value={comment} onChange={event => onComment(event.target.value)} /><div className="mt-2 flex gap-2"><Button variant="solid" data-xgc-role="pdf-annotation-submit" data-xgc-id="pdf-annotation-submit" loading={busy} disabled={!comment.trim()} onClick={onSubmit}>{tr('提交批注并讨论')}</Button></div></>}
    </div>}
  </div>
}

export default function PDFReader({ pdf, onPDF, onTitle, onDraftChange }: {
  pdf: ManuscriptPDF
  onPDF: (pdf: ManuscriptPDF) => void
  onQuote: (text: string, targetProject?: string) => void
  onTitle?: (title: string) => void
  onDraftChange?: (dirty: boolean) => void
}) {
  const { locale, openSourceView, pdfFlash, requestReviewFeedback } = useWorkbench()
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([])
  const [page, setPage] = useState(1)
  const [painted, setPainted] = useState<number[]>([1])
  const [scale, setScale] = useState(1)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [mode, setMode] = useState<'text' | 'region'>('text')
  const [anchor, setAnchor] = useState<PDFAnchor | null>(null)
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const [flash, setFlash] = useState<FlashMark | null>(null)
  const [versions, setVersions] = useState<(ManuscriptPDF & { completedAt: string })[]>([])
  const [availableWidth, setAvailableWidth] = useState(0)
  const [scrollSettled, setScrollSettled] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageDims = useRef(new Map<number, { w: number; h: number }>())
  const restorePage = useRef<number | null>(null)
  const zoomAnchor = useRef<({ page: number; ratio: number } | PdfPointHold) | null>(null)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const draftChangeRef = useRef(onDraftChange)
  draftChangeRef.current = onDraftChange
  const titleRef = useRef(onTitle)
  titleRef.current = onTitle
  const onError = useRef((message: string) => setError(message))
  useEffect(() => { draftChangeRef.current?.(!!comment.trim() || busy) }, [comment, busy])
  useEffect(() => () => { draftChangeRef.current?.(false) }, [])
  useEffect(() => { titleRef.current?.(pdf.path.split('/').pop() || 'PDF') }, [pdf])
  useEffect(() => {
    if (!pdf) return
    const controller = new AbortController()
    listPDFVersions(pdf.workspace, pdf.path, controller.signal).then(data => { if (!controller.signal.aborted) setVersions(data) }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [pdf])
  useEffect(() => {
    setDocument(null)
    setPageSizes([])
    setError('')
    setQuote('')
    setComment('')
    setAnchor(null)
    setSelectedNote(null)
    setFlash(null)
    attempt.current = null
    setNotes([])
    pageDims.current.clear()
    const place = readReadingPlace(pdf.workspace)
    const initial = place && place.buildId === pdf.buildId && place.digest === pdf.digest && place.path === pdf.path ? place.page : 1
    setPage(initial)
    setPainted([initial])
    restorePage.current = initial
    zoomAnchor.current = null
    if (!pdf) return
    const task = getDocument(pdf.url)
    let alive = true
    task.promise.then(doc => { if (alive) setDocument(doc) }).catch(reason => { if (alive) setError(reason.message) })
    return () => { alive = false; void task.destroy() }
  }, [pdf])
  useEffect(() => {
    if (!document) return
    let alive = true
    void Promise.all(Array.from({ length: document.numPages }, (_, index) => document.getPage(index + 1))).then(pages => {
      if (!alive) return
      setPageSizes(pages.map(item => {
        const base = item.getViewport({ scale: 1 })
        pageDims.current.set(item.pageNumber, { w: base.width, h: base.height })
        return { w: base.width, h: base.height }
      }))
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { alive = false }
  }, [document])
  useEffect(() => {
    setNotes([])
    if (!pdf) return
    const controller = new AbortController()
    void collection<{ id: string; title: string }>('/knowledge/items', controller.signal).then(async items => {
      const found: StoredNote[] = []
      for (const item of items.filter(entry => entry.title.startsWith('PDF 批注 · '))) {
        const record = await request<{ revisions: { body: string; authorRef: string }[] }>(`/knowledge/items/${item.id}`, { signal: controller.signal })
        for (const revision of record.revisions) {
          const prefix = `pdf:${pdf.workspace}:${pdf.digest}:`
          if (revision.authorRef?.startsWith(prefix)) found.push({ id: item.id, page: Number(revision.authorRef.slice(prefix.length)), body: revision.body })
        }
      }
      if (!controller.signal.aborted) setNotes(found)
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [pdf, reload])
  const layout = useMemo(() => layoutPdfPages(pageSizes, availableWidth, scale), [pageSizes, availableWidth, scale])
  const parsed = useMemo(() => notes.map(note => ({ ...note, ...decodeAnnotation(note.body) })), [notes])
  const activeNote = parsed.find(note => note.id === selectedNote) || null
  const activeAnchor = activeNote?.anchor || anchor
  const editorPage = activeNote ? (activeNote.anchor?.page || activeNote.page) : anchor?.page ?? null
  const count = layout.length
  function publishScroll(viewport: HTMLElement) {
    const boxes = boxesFromDom(viewport)
    if (!boxes.length) return
    const nextPage = dominantPdfPage(boxes, viewport.scrollTop, viewport.clientHeight)
    const nextPaint = pdfPagesToPaint(boxes, viewport.scrollTop, viewport.clientHeight)
    setPage(previous => previous === nextPage ? previous : nextPage)
    setPainted(previous => samePageSet(previous, nextPaint) ? previous : nextPaint)
  }
  function rememberViewport() {
    const viewport = viewportRef.current
    if (!viewport) return
    const boxes = boxesFromDom(viewport)
    if (!boxes.length) return
    const current = dominantPdfPage(boxes, viewport.scrollTop, viewport.clientHeight)
    const el = pageNode(viewport, pdf.digest, current)
    if (!el) return
    const top = el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
    zoomAnchor.current = { page: current, ratio: el.clientHeight ? (viewport.scrollTop - top) / el.clientHeight : 0 }
  }
  function scrollToPage(next: number) {
    const viewport = viewportRef.current
    if (!viewport || next < 1 || next > count) return
    const el = pageNode(viewport, pdf.digest, next)
    if (!el) return
    viewport.scrollTo({ top: scrollTopFor(viewport, el) })
    publishScroll(viewport)
  }
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const width = viewport.clientWidth
    if (width && width !== availableWidth) { setAvailableWidth(width); return }
    if (!layout.length) return
    if (restorePage.current) {
      const target = Math.min(restorePage.current, layout.length)
      const el = pageNode(viewport, pdf.digest, target)
      if (el) viewport.scrollTop = scrollTopFor(viewport, el)
      restorePage.current = null
      zoomAnchor.current = null
      setScrollSettled(value => value + 1)
    } else if (zoomAnchor.current) {
      const held = zoomAnchor.current
      zoomAnchor.current = null
      const el = pageNode(viewport, pdf.digest, held.page)
      if (el && 'fractionX' in held) {
        const view = viewport.getBoundingClientRect()
        const box = el.getBoundingClientRect()
        const next = scrollToHoldPoint({
          pageLeft: box.left - view.left + viewport.scrollLeft,
          pageTop: box.top - view.top + viewport.scrollTop,
          pageWidth: box.width,
          pageHeight: box.height,
          fractionX: held.fractionX,
          fractionY: held.fractionY,
          viewportX: held.viewportX,
          viewportY: held.viewportY,
        })
        viewport.scrollLeft = Math.max(0, next.left)
        viewport.scrollTop = Math.max(0, next.top)
      } else if (el && 'ratio' in held) {
        const top = el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
        viewport.scrollTop = Math.max(0, top + held.ratio * el.clientHeight)
      }
    }
    publishScroll(viewport)
  }, [layout, availableWidth, pdf.digest])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => { frame = 0; publishScroll(viewport) })
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => { viewport.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame) }
  }, [pdf.digest, count])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let timer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const next = viewport.clientWidth
        if (!next || next === availableWidth) return
        rememberViewport()
        setAvailableWidth(next)
      }, 160)
    })
    observer.observe(viewport)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [pdf.digest, availableWidth, count])
  useEffect(() => {
    if (!pdf?.workspace || !Number.isInteger(page) || page < 1 || restorePage.current) return
    writeReadingPlace(pdf.workspace, { path: pdf.path, buildId: pdf.buildId, digest: pdf.digest, page })
  }, [pdf, page, scrollSettled])
  useEffect(() => {
    if (!pdfFlash || !pdf || pdfFlash.buildId !== pdf.buildId || count < 1) return
    const dims = pageDims.current.get(pdfFlash.page)
    const box = pdfFlash.box
    const rect = pdfFlash.rects?.[0] || (box && dims ? { x: box.x / dims.w, y: box.y / dims.h, width: box.width / dims.w, height: box.height / dims.h } : null)
    const viewport = viewportRef.current
    const el = viewport ? pageNode(viewport, pdf.digest, pdfFlash.page) : null
    if (viewport && el) viewport.scrollTop = scrollTopFor(viewport, el)
    setAnchor(null)
    setSelectedNote(null)
    setComment('')
    setQuote('')
    if (!rect || rect.width <= 0 || rect.height <= 0) { setFlash(null); return }
    setFlash({ page: pdfFlash.page, rect })
    const timer = window.setTimeout(() => setFlash(current => current?.page === pdfFlash.page ? null : current), 1950)
    return () => window.clearTimeout(timer)
  }, [pdfFlash, pdf, count])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { setAnchor(null); setSelectedNote(null); setComment(''); setQuote('') } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = pdfWheelZoom(scaleRef.current, event)
      if (next == null) return
      const hit = window.document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-xgc-role="pdf-page"]')
      const pageNumber = hit && viewport.contains(hit) ? pageFromPdfId(hit.dataset.xgcId) : null
      const pageBox = hit?.getBoundingClientRect()
      const viewBox = viewport.getBoundingClientRect()
      if (hit && pageNumber && pageBox && pageBox.width > 0 && pageBox.height > 0) {
        zoomAnchor.current = {
          page: pageNumber,
          fractionX: (event.clientX - pageBox.left) / pageBox.width,
          fractionY: (event.clientY - pageBox.top) / pageBox.height,
          viewportX: event.clientX - viewBox.left,
          viewportY: event.clientY - viewBox.top,
        }
      } else rememberViewport()
      scaleRef.current = next
      setScale(next)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '0' || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return
      if (!viewport.matches(':hover')) return
      event.preventDefault()
      if (scaleRef.current === 1) return
      rememberViewport()
      scaleRef.current = 1
      setScale(1)
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey, true)
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [pdf.digest, count])
  function resetSelection() { setAnchor(null); setSelectedNote(null); setComment(''); setQuote(''); window.getSelection()?.removeAllRanges() }
  function chooseText(notePage: number, rects: PDFRect[], text: string, context: string) {
    setSelectedNote(null)
    setComment('')
    setQuote(text)
    setAnchor({ schema: 'research.pdf-anchor/v1', kind: 'text', page: notePage, rects, quote: text, context })
  }
  function chooseRegion(notePage: number, rect: PDFRect, text: string, context: string) {
    setSelectedNote(null)
    setComment('')
    setQuote(text)
    setAnchor({ schema: 'research.pdf-anchor/v1', kind: 'region', page: notePage, rects: [rect], quote: text, context })
  }
  async function annotate() {
    if (!pdf || !anchor || !comment.trim()) return
    const notePage = anchor.page
    setBusy(true)
    setError('')
    const submitted = comment.trim()
    const submittedAnchor = anchor
    const body = encodeAnnotation({ ...submittedAnchor, pdf: { workspace: pdf.workspace, path: pdf.path, digest: pdf.digest } }, submitted)
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() }
    try {
      const saved = await post<{ knowledge: { item: { id: string } } }>(`/research/threads/${pdf.workspace}/knowledge-items`, { kind: 'reading-note', title: `PDF 批注 · ${pdf.path} · ${notePage}`, body, authorKind: 'human', authorRef: `pdf:${pdf.workspace}:${pdf.digest}:${notePage}` }, attempt.current.key)
      if (!saved?.knowledge?.item?.id) throw Error(tr('批注保存回执缺少标识，请用同一次请求核对保存结果。'))
      setComment('')
      setAnchor(null)
      setQuote('')
      setReload(value => value + 1)
      attempt.current = null
      requestReviewFeedback({ id: crypto.randomUUID(), annotationId: saved.knowledge.item.id, designDiscussion: true, scope: { projectId: pdf.workspace, workspace: pdf.workspace }, anchor: pdfFeedbackAnchor(pdf, submittedAnchor), body: submitted, at: new Date().toISOString() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  function discuss(target: PDFAnchor, text: string, annotationId: string) {
    if (!pdf) return
    requestReviewFeedback({ id: crypto.randomUUID(), annotationId, designDiscussion: true, scope: { projectId: pdf.workspace, workspace: pdf.workspace }, anchor: pdfFeedbackAnchor(pdf, target), body: text, at: new Date().toISOString() })
  }
  async function jumpToSource() {
    if (!pdf || !activeAnchor || busy) return
    const dims = pageDims.current.get(activeAnchor.page)
    if (!dims) return
    setBusy(true)
    setError('')
    try {
      const rect = activeAnchor.rects[0] || { x: .5, y: .5, width: 0, height: 0 }
      const result = await post<{ file: string; line: number; external: boolean }>(`/manuscripts/build-records/${encodeURIComponent(pdf.buildId)}/synctex`, { mode: 'edit', page: activeAnchor.page, x: +(((rect.x + rect.width / 2) * dims.w).toFixed(2)), y: +(((rect.y + rect.height / 2) * dims.h).toFixed(2)) })
      if (result.external || !result.file) throw Error(tr('这个位置不在稿件源码内（可能是宏包或构建中间文件）。'))
      openSourceView({ workspace: pdf.workspace, path: result.file, line: Math.max(1, result.line || 1), buildId: pdf.buildId, pdf })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  function zoom(delta: number) {
    rememberViewport()
    const next = clampPdfZoom(scaleRef.current + delta)
    scaleRef.current = next
    setScale(next)
  }
  if (!pdf) return <div className="grid flex-1 place-content-center p-6 text-secondary text-ink-3">{tr('打开稿件并编译，即可阅读 PDF 和添加批注。')}</div>
  const legacy = parsed.filter(note => note.page === page && !note.anchor)
  return <section aria-label={tr('PDF 阅读与批注')} data-xgc-role="pdf-reader" data-xgc-id={`${pdf.workspace}:${pdf.digest}`} className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      <span className="min-w-0 flex-1 truncate pl-1 text-caption text-ink-2" title={pdf.path}>{pdf.path.split('/').pop()}</span>
      <IconBtn icon={ChevronLeft} label={tr('上一页')} disabled={busy || page <= 1} onClick={() => scrollToPage(page - 1)} />
      <span className="shrink-0 text-caption tabular-nums">{page}/{count || document?.numPages || '…'}</span>
      <IconBtn icon={ChevronRight} label={tr('下一页')} disabled={busy || !count || page >= count} onClick={() => scrollToPage(page + 1)} />
      <IconBtn icon={mode === 'region' ? MousePointer2 : Scan} label={tr(mode === 'region' ? '文字批注' : '框选批注')} onClick={() => { resetSelection(); setMode(current => current === 'text' ? 'region' : 'text') }} />
      <RightMore label={tr('PDF 操作')}>
        <label className="text-caption">{tr('PDF 版本')}<select aria-label={tr('PDF 版本')} className="ui-input mt-1" disabled={busy || !!comment.trim()} value={pdf.buildId} onChange={event => { const version = versions.find(item => item.buildId === event.target.value); if (version) onPDF(version) }}>{versions.length ? versions.map(item => <option key={item.buildId} value={item.buildId}>{new Date(item.completedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</option>) : <option value={pdf.buildId}>{tr('当前版本')}</option>}</select></label>
        <div className="flex items-center gap-2"><IconBtn icon={Minus} label={tr('缩小 PDF')} onClick={() => zoom(-.2)} /><span className="text-caption">{Math.round(scale * 100)}%</span><IconBtn icon={Plus} label={tr('放大 PDF')} onClick={() => zoom(.2)} /></div>
        <a href={pdf.url} target="_blank" rel="noreferrer" className="text-caption">{tr('打开原件')}</a>
        {legacy.map(note => <button key={note.id} className="ui-list-row" onClick={() => { setSelectedNote(note.id); setAnchor({ schema: 'research.pdf-anchor/v1', kind: 'page', page: note.page, rects: [], quote: '', context: '' }); scrollToPage(note.page) }}>{tr('页面批注')} · {note.comment.slice(0, 40)}</button>)}
      </RightMore>
    </div>
    {error && <p role="alert" className="ui-error">{error}</p>}
    <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-inset p-3" data-xgc-role="pdf-viewport" data-xgc-flow="scroll" data-xgc-current-page={page} data-xgc-zoom={scale}>
      <div className="flex w-max min-w-full flex-col items-center">
        {document && layout.map((box, index) => {
          const pageNotes = parsed.filter(note => note.page === box.page)
          const showEditor = editorPage === box.page
          return <PdfPage
            key={box.page}
            doc={document}
            digest={pdf.digest}
            pageNumber={box.page}
            width={box.width}
            height={box.height}
            paint={painted.includes(box.page) || flash?.page === box.page || activeAnchor?.page === box.page}
            mode={mode}
            busy={busy}
            notes={pageNotes}
            selectedNote={selectedNote}
            outline={activeAnchor?.page === box.page ? activeAnchor.rects : []}
            showEditor={showEditor}
            activeAnchor={showEditor ? activeAnchor : null}
            activeNote={showEditor ? activeNote : null}
            flashRect={flash?.page === box.page ? flash.rect : null}
            comment={comment}
            quote={quote}
            gapBelow={index !== layout.length - 1}
            onComment={setComment}
            onText={chooseText}
            onRegion={chooseRegion}
            onSelectNote={note => { setAnchor(null); setSelectedNote(note.id) }}
            onClose={resetSelection}
            onJump={() => void jumpToSource()}
            onSubmit={() => void annotate()}
            onDiscuss={() => { if (activeNote) discuss(activeNote.anchor || { schema: 'research.pdf-anchor/v1', kind: 'page', page: activeNote.page, rects: [], quote: '', context: '' }, activeNote.comment, activeNote.id) }}
            onError={message => onError.current(message)}
          />
        })}
      </div>
    </div>
  </section>
}
