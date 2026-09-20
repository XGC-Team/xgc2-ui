import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { useNativeAgentSession } from '../chat/Session'
import { contextCopy } from './context-copy'
import { fileTarget } from './project-object-model'
import { openResearchSource } from './research-navigation'
import { requestDesignFocus } from './design-focus'
import { readWritingContext } from './design-context-api'
import { writingContextToPrompt } from './design-context'
import {
  adoptContextVersion, assessContextItem, canvasContextNodeId, checkContextForSend, contextManifest,
  contextRecordExists, keepStaleSnapshot, type ContextItem, type ContextIssue, type ContextRecord,
} from './context-model'

/** Adding and checking never sends. Writing context is assembled from saved design/source ranges;
 * discussion snapshots are a separate explicit action and are never application receipts. */
export function ContextPanel() {
  const { locale, projectId, contextItems, removeContextItem, patchContextItem, openRightTab, openCanvas } = useWorkbench()
  const copy = contextCopy[locale], zh = locale === 'zh'
  const native = useNativeAgentSession(), session = native.session
  const scopeKind = session?.scope.context.kind ?? ''
  const sessionProject = session && ['research-repository', 'research-project', 'research-project-discussion'].includes(scopeKind) ? session.scope.context.id : ''
  // A selected global/engineering session must not silently inherit the UI's project.
  const effectiveProject = session ? sessionProject : projectId
  const [issues, setIssues] = useState<ContextIssue[] | null>(null)
  const [note, setNote] = useState(''), [refreshing, setRefreshing] = useState(''), [inserting, setInserting] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const identity = JSON.stringify([projectId, effectiveProject, native.selectedId, contextItems])
  const liveIdentity = useRef(identity); liveIdentity.current = identity
  useEffect(() => {
    operation.current?.abort(); setRefreshing(''); setInserting(false); setIssues(null); setNote('')
    return () => operation.current?.abort()
  }, [identity])
  if (!contextItems.length) return null
  const stateLabel = (item: ContextItem) => ({
    current: copy.stateCurrent, unverifiable: copy.stateUnverifiable, 'update-available': copy.stateUpdate,
    'stale-snapshot': copy.stateStale, missing: copy.stateMissing,
  } as const)[item.state]
  const issueLabel = (reason: ContextIssue['reason']) => ({
    'foreign-project': copy.issueForeign, missing: copy.issueMissing, 'stale-snapshot': copy.issueStale,
    'update-available': copy.issueUpdate, unverifiable: copy.issueUnverifiable,
  } as const)[reason]
  const locate = (item: ContextItem) => {
    try {
      if (item.kind === 'draft') openRightTab({ kind: 'file', target: fileTarget(item.project, item.source?.workspace || item.project, 'files', item.ref) })
      else if (item.kind === 'canvas-node') { requestDesignFocus({ project: item.project, nodeId: canvasContextNodeId(item) }); openCanvas(item.project) }
      else if (item.source) openResearchSource(item.source, { projectId: item.project, workspace: item.source.workspace || item.project })
    } catch (error) { setNote(error instanceof Error ? error.message : String(error)) }
  }
  const refresh = async (item: ContextItem, adopt = false) => {
    if (!item.source || refreshing || inserting) return
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller
    const stillCurrent = () => !controller.signal.aborted && liveIdentity.current === identity
    setRefreshing(item.id); setNote('')
    try {
      const workspace = item.source.workspace || item.project
      const record = await request<ContextRecord>(`/workspaces/${encodeURIComponent(workspace)}/files/${item.source.path.split('/').map(encodeURIComponent).join('/')}`, { signal: controller.signal })
      if (!stillCurrent()) return
      if (!contextRecordExists(item, record)) patchContextItem(item.id, assessContextItem(item, null))
      else patchContextItem(item.id, adopt ? adoptContextVersion(item, record) : assessContextItem(item, record))
    } catch (error) {
      if (!stillCurrent()) return
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) patchContextItem(item.id, assessContextItem(item, null))
      else setNote(`${copy.refreshFailed} ${error instanceof Error ? error.message : String(error)}`)
    } finally { if (stillCurrent()) setRefreshing('') }
  }
  const runCheck = () => setIssues(checkContextForSend(contextItems, effectiveProject).issues)
  const insert = async () => {
    if (inserting || refreshing) return
    const { include, issues: found } = checkContextForSend(contextItems, effectiveProject)
    setIssues(found)
    if (!include.length) return
    const controller = new AbortController(); operation.current?.abort(); operation.current = controller
    setInserting(true); setNote('')
    try {
      const designs = include.filter(item => item.kind === 'canvas-node')
      const parts: string[] = []
      if (designs.length) {
        if (designs.some(item => item.state !== 'current' || !item.digest || item.digest !== designs[0].digest)) throw new Error(zh ? '所选设计不是同一当前版本；请核对并采用实际新版，或仅以旧快照讨论。' : 'Selected designs do not share one current revision. Refresh/adopt current content or use discussion-only snapshots.')
        const nodeIds = [...new Set(designs.map(canvasContextNodeId))]
        const context = await readWritingContext({ projectId: effectiveProject, workspace: effectiveProject }, { nodeIds }, { expectedCanvasDigest: designs[0].digest, signal: controller.signal })
        parts.push(writingContextToPrompt(context))
      }
      const other = include.filter(item => item.kind !== 'canvas-node')
      if (other.length) parts.push(contextManifest(other, effectiveProject))
      if (controller.signal.aborted || liveIdentity.current !== identity) return
      native.appendDraft(parts.join('\n\n'), effectiveProject); setNote(copy.inserted)
    } catch (error) { if (!controller.signal.aborted) setNote(error instanceof Error ? error.message : String(error)) }
    finally { if (!controller.signal.aborted) setInserting(false) }
  }
  const requestSuggestions = () => {
    const { include, issues: found } = checkContextForSend(contextItems, effectiveProject)
    setIssues(found)
    if (!include.length) return
    try {
      const instruction = zh ? '请基于以上明确标注版本的设计快照，提出画布与大纲整理建议。仅讨论，不批准修改；任何写入都须重新检查当前基线并经用户确认。' : 'Suggest canvas and outline improvements using the version-labeled design snapshots. Discussion only: any write requires a fresh baseline check and user confirmation.'
      native.appendDraft(`${contextManifest(include, effectiveProject)}\n${instruction}\n`, effectiveProject)
      setNote(copy.organizeNote)
    } catch (error) { setNote(error instanceof Error ? error.message : String(error)) }
  }
  return <section aria-label={copy.title} className="mx-auto w-full max-w-[48rem] px-5 pb-2" data-context-panel={effectiveProject || 'global'}>
    <details className="rounded-lg border border-line bg-panel px-3 py-2">
      <summary className="cursor-pointer text-secondary text-ink-2">{copy.title} · {contextItems.length}</summary>
      <p className="mt-1 text-caption text-ink-3">{copy.addHint}</p>
      <p className="mt-1 text-caption text-ink-3">{copy.uiProject} · {projectId || '—'} · {copy.sessionScope} · {session ? (sessionProject || 'global') : copy.noSession}</p>
      {sessionProject && projectId && sessionProject !== projectId && <p role="status" className="mt-1 text-caption text-warn">{copy.scopeMismatch}</p>}
      <ul className="mt-2 space-y-2">
        {contextItems.map(item => <li key={item.id} className="rounded-md bg-elevated p-2" data-context-item={item.id} data-context-state={item.state}>
          <div className="flex flex-wrap items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-secondary text-ink-2" title={item.ref}>{item.label}</span>
            <span className="text-caption text-ink-3">{copy.kinds[item.kind]} · {item.project}</span>
          </div>
          <p className="mt-0.5 text-caption text-ink-3">{stateLabel(item)}{item.digest ? ` · ${item.digest}` : ''}{item.state === 'update-available' && item.latestDigest ? ` → ${item.latestDigest}` : ''}</p>
          {item.excerpt && <details className="mt-0.5 text-caption text-ink-3"><summary>{zh ? '查看实际快照' : 'Inspect captured snapshot'}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{item.excerpt}</pre></details>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Button size="xs" onClick={() => locate(item)}>{copy.locate}</Button>
            {item.source && <Button size="xs" disabled={Boolean(refreshing) || inserting} onClick={() => void refresh(item)}>{copy.refresh}</Button>}
            {item.state === 'update-available' && <>
              <Button size="xs" disabled={Boolean(refreshing) || inserting} onClick={() => void refresh(item, true)}>{copy.adopt}</Button>
              <Button size="xs" onClick={() => patchContextItem(item.id, keepStaleSnapshot(item))}>{copy.keepStale}</Button>
            </>}
            <Button size="xs" onClick={() => removeContextItem(item.id)}>{copy.remove}</Button>
          </div>
        </li>)}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="xs" onClick={runCheck}>{copy.checkSend}</Button>
        <Button size="xs" variant="outline" disabled={inserting || Boolean(refreshing)} onClick={() => void insert()}>{inserting ? (zh ? '正在核对…' : 'Checking…') : copy.insert}</Button>
        <Button size="xs" disabled={inserting} onClick={requestSuggestions} title={copy.organizeNote}>{copy.organize}</Button>
      </div>
      <p className="mt-1 text-caption text-ink-3">{copy.notSent} · {zh ? '写作输入只读取所选设计及其当前关联正文；不是修改批准。' : 'Writing input reads only selected design and current linked source; it is not approval.'}</p>
      {issues !== null && <ul className="mt-2 space-y-0.5" data-context-issues="">
        {!issues.length && <li className="text-caption text-ink-3">✓</li>}
        {issues.map(issue => <li key={issue.id} role="status" className="text-caption text-warn">{issue.label} · {issueLabel(issue.reason)}</li>)}
      </ul>}
      {note && <p role="status" className="mt-1 text-caption text-ink-3">{note}</p>}
    </details>
  </section>
}
