import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { useNativeAgentSession } from '../chat/Session'
import { useWorkbench } from '../../store'
import { APIError } from '../../lib/api'
import type { DraftScope } from '../projects/draft-model'
import { archivedDocumentURL } from './archive'
import { appendReadingNote, createReadingSession, latestExtraction, projectReadingPage, promoteReadingNote, runExtraction } from './api'
import { excerptOnPage, readingSelection, selectionToContextItem } from './selection'
import { sendLiteratureStudy, type StudyPort } from './study'
import type { ArchiveIdentity, ExtractionResult, KnowledgeProjection, PageProjection, ReadingSession, ReadingTurn, StudyReceipt } from './types'

function classify(error: unknown): string {
  if (error instanceof APIError && error.status >= 500) return `uncertain: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

/** Domain surface for A: archived PDF identity, original bytes URL, extraction/reading receipts, citation and notes.
 * Does not own the viewer shell, Chat chrome, or knowledge graph writes. */
export function LiteratureWorkbench({
  scope, archive, title = '', onStudy,
}: {
  scope: DraftScope
  archive: ArchiveIdentity
  title?: string
  onStudy?: (input: { selection: ReturnType<typeof readingSelection>; question: string }, signal?: AbortSignal) => Promise<StudyReceipt>
}) {
  const { locale, addContextItem, projectId } = useWorkbench()
  const zh = locale === 'zh'
  const native = useNativeAgentSession()
  const generation = useRef(0)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [session, setSession] = useState<ReadingSession | null>(null)
  const [page, setPage] = useState(1)
  const [projection, setProjection] = useState<PageProjection | null>(null)
  const [excerpt, setExcerpt] = useState('')
  const [note, setNote] = useState('')
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ReadingTurn[]>([])
  const [promotion, setPromotion] = useState<KnowledgeProjection | null>(null)
  const [study, setStudy] = useState<StudyReceipt | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const originalURL = archivedDocumentURL(archive.sourceSha256)
  const load = async (token: number) => {
    setBusy('extraction'); setError('')
    try {
      let latest: ExtractionResult | null = null
      try { latest = await latestExtraction(archive.manifestId) } catch (error) {
        if (!(error instanceof APIError) || error.status !== 404) throw error
      }
      if (latest?.state !== 'succeeded') {
        latest = await runExtraction(archive.manifestId, `${archive.manifestId}:extract`)
      }
      if (token !== generation.current) return
      setExtraction(latest)
      if (latest.state !== 'succeeded') {
        setSession(null); setProjection(null)
        return
      }
      const created = await createReadingSession(archive.acquisitionId, `${archive.acquisitionId}:read`, title || archive.workId)
      if (token !== generation.current) return
      if (created.sourceSha256 && created.sourceSha256 !== archive.sourceSha256) throw new Error('Reading session source drifted from the archive receipt.')
      setSession(created)
      const projected = await projectReadingPage(created.id, 1)
      if (token !== generation.current) return
      if (projected.sourceSha256 !== archive.sourceSha256) throw new Error('Page projection source drifted from the archive receipt.')
      setPage(1); setProjection(projected)
    } catch (cause) {
      if (token !== generation.current) return
      setError(classify(cause))
    } finally {
      if (token === generation.current) setBusy('')
    }
  }
  useEffect(() => {
    const token = ++generation.current
    void load(token)
    return () => { generation.current += 1 }
  }, [archive.manifestId, archive.acquisitionId, archive.sourceSha256, scope.projectId])
  const changePage = async (next: number) => {
    if (!session || next < 1 || (projection && next > projection.unitCount) || busy) return
    setBusy('page'); setError('')
    const token = generation.current
    try {
      const projected = await projectReadingPage(session.id, next)
      if (token !== generation.current) return
      if (projected.sourceSha256 !== archive.sourceSha256 || projected.sessionId !== session.id) throw new Error('Page projection identity drifted.')
      setPage(next); setProjection(projected); setExcerpt('')
    } catch (cause) {
      if (token === generation.current) setError(classify(cause))
    } finally {
      if (token === generation.current) setBusy('')
    }
  }
  const currentSelection = () => readingSelection({
    scope, archive, projection: projection || undefined, page, excerpt,
  })
  const saveNote = async () => {
    if (!session || !projection || !note.trim() || busy) return
    const selection = currentSelection()
    const cite = excerptOnPage(projection, excerpt)
    setBusy('note'); setError('')
    try {
      const turn = await appendReadingNote(session.id, {
        expectedRevision: session.revision || 1,
        idempotencyKey: `${session.id}:note:${page}:${excerpt.slice(0, 24) || 'none'}`,
        body: note.trim(),
        ...(cite ? { page: selection.page, quote: selection.excerpt } : {}),
      })
      setTurns(current => [...current, turn])
      setSession(current => current ? { ...current, revision: (current.revision || 1) + (turn.replayed ? 0 : 1) } : current)
    } catch (cause) {
      setError(classify(cause))
    } finally { setBusy('') }
  }
  const promote = async (turn: ReadingTurn) => {
    if (!session || busy) return
    setBusy('promote'); setError('')
    try {
      const result = await promoteReadingNote(session.id, turn.id, {
        expectedRevision: session.revision || 1,
        idempotencyKey: `${session.id}:promote:${turn.id}`,
        kind: 'reading-note',
        title: (note.trim() || excerpt || title || 'Reading note').slice(0, 80),
        note: turn.body,
      })
      setPromotion(result)
    } catch (cause) {
      setError(classify(cause))
    } finally { setBusy('') }
  }
  const addSelection = () => {
    if (!excerpt.trim()) return
    addContextItem(selectionToContextItem(currentSelection()))
  }
  const studyNow = async () => {
    if (!excerpt.trim() || !question.trim() || busy) return
    const selection = currentSelection()
    if (selection.projectId !== projectId) { setError(zh ? '当前项目已切换，未发送。' : 'Project changed; the study prompt was not sent.'); return }
    setBusy('study'); setError(''); setStudy(null)
    const controller = new AbortController()
    try {
      const port: StudyPort = { projectId: native.projectId, requireCurrentSession: native.requireCurrentSession }
      const receipt = onStudy
        ? await onStudy({ selection, question: question.trim() }, controller.signal)
        : await sendLiteratureStudy(port, { selection, question: question.trim() }, controller.signal)
      setStudy(receipt)
    } catch (cause) {
      setStudy({ outcome: 'uncertain', reason: classify(cause) })
    } finally { setBusy('') }
  }
  const extractionBlocked = extraction && extraction.state !== 'succeeded'
  return <section aria-label={zh ? '文献研读' : 'Literature reading'} className="space-y-3">
    <p className="text-caption text-ink-3">
      {zh ? '外部论文是阅读证据，不是可改源码。' : 'External papers are reading evidence, not editable source.'}
      {' · '}work {archive.workId} · acquisition {archive.acquisitionId} · sha256 {archive.sourceSha256.slice(0, 12)}
      {archive.replayed ? (zh ? ' · 重放已有归档' : ' · replayed archive') : ''}
    </p>
    <p><a className="text-secondary underline" href={originalURL}>{zh ? '打开归档原件 PDF' : 'Open archived original PDF'}</a></p>
    {extractionBlocked && <p role="status" className="text-caption">
      {zh ? '解析未成功，原文仍可打开。' : 'Extraction did not succeed; the original remains available.'}
      {extraction?.failure?.message ? ` ${extraction.failure.message}` : ''}
      {extraction?.contract?.blockedReason ? ` ${extraction.contract.blockedReason}` : ` state=${extraction?.state}`}
    </p>}
    {projection && <>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="xs" disabled={page <= 1 || Boolean(busy)} onClick={() => void changePage(page - 1)}>{zh ? '上一页' : 'Previous'}</Button>
        <span className="text-caption tabular-nums">{page} / {projection.unitCount}</span>
        <Button size="xs" disabled={page >= projection.unitCount || Boolean(busy)} onClick={() => void changePage(page + 1)}>{zh ? '下一页' : 'Next'}</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <article>
          <h3 className="text-secondary">{zh ? '研读页文本' : 'Reading page text'}</h3>
          <pre className="whitespace-pre-wrap text-secondary">{projection.unit.text || (zh ? '（本页无文本）' : '(no page text)')}</pre>
        </article>
        <article>
          <h3 className="text-secondary">{zh ? '解析块（对照原文）' : 'Parsed blocks (original compare)'}</h3>
          {projection.blocks.length ? projection.blocks.map(block => <p key={block.textSha256} className="text-secondary"><span className="text-caption text-ink-3">{block.kind} · </span>{block.text}</p>) : <p className="text-caption text-ink-3">{zh ? '本页没有解析块。' : 'No parsed blocks on this page.'}</p>}
        </article>
      </div>
      <label className="block text-secondary">{zh ? '摘录' : 'Excerpt'}
        <textarea className="ui-input mt-1 w-full" value={excerpt} onChange={event => setExcerpt(event.target.value)} rows={3}/>
      </label>
      <p className="text-caption text-ink-3">{excerpt.trim() ? (excerptOnPage(projection, excerpt) ? (zh ? '摘录能在本页原文中核到字面位置。这不是论证成立。' : 'Excerpt has a literal page match. That is not a scientific claim.') : (zh ? '摘录未在本页核到，保存笔记时不会冒充已核验引用。' : 'Excerpt is not on this page; a note will not claim a verified citation.')) : (zh ? '未保存选区视为未核验。' : 'An unsaved selection stays unverified.')}</p>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" disabled={!excerpt.trim()} onClick={addSelection}>{zh ? '加入讨论上下文（不发送）' : 'Add to discussion context (does not send)'}</Button>
      </div>
      <label className="block text-secondary">{zh ? '学习笔记' : 'Study note'}
        <textarea className="ui-input mt-1 w-full" value={note} onChange={event => setNote(event.target.value)} rows={3}/>
      </label>
      <Button size="xs" disabled={!note.trim() || Boolean(busy)} onClick={() => void saveNote()}>{zh ? '保存到研读会话' : 'Save to reading session'}</Button>
      {turns.map(turn => <div key={turn.id} className="space-y-1">
        <p className="text-secondary">{turn.body}</p>
        <p className="text-caption text-ink-3">{turn.groundingState}{turn.citations?.[0] ? ` · p${turn.citations[0].resolvedPage}` : ''}</p>
        <Button size="xs" disabled={Boolean(busy)} onClick={() => void promote(turn)}>{zh ? '沉淀为阅读笔记回执' : 'Promote reading-note receipt'}</Button>
      </div>)}
      {promotion && <p role="status" className="text-caption">{zh ? '知识回执' : 'Knowledge receipt'} · {promotion.item.id} / {promotion.revision.id} / {promotion.promotion.id}</p>}
      <label className="block text-secondary">{zh ? '辅助提问（需已有原生会话）' : 'Guided question (requires a native session)'}
        <textarea className="ui-input mt-1 w-full" value={question} onChange={event => setQuestion(event.target.value)} rows={2}/>
      </label>
      <Button size="xs" disabled={!excerpt.trim() || !question.trim() || Boolean(busy)} onClick={() => void studyNow()}>{zh ? '发送研读问题' : 'Send study question'}</Button>
      {study && <p role="status" className="text-caption">{study.outcome === 'sent' ? `${zh ? '已交给原生会话' : 'Sent to native session'} ${study.nativeSessionId} · ${study.requestKey}` : `${study.outcome}: ${study.reason}`}</p>}
    </>}
    {busy && <p className="text-caption text-ink-3">{busy}</p>}
    {error && <p role="alert" className="text-caption">{error}</p>}
  </section>
}
