import { useState } from 'react'
import { Button } from '../../components/ui'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { useNativeAgentSession } from '../chat/Session'
import { contextCopy } from './context-copy'
import { workspaceCopy } from './workspace-copy'
import { fileTarget } from './project-object-model'
import { openResearchSource } from './research-navigation'
import { inspectLiveCanvas } from './useCanvasDocument'
import { captureSelectedContext } from './design-context'
import { CONTENT_PATH, parseContentDocument } from '../content/content-model'
import { requestDesignFocus } from './design-focus'
import {
  adoptContextVersion, assessContextItem, checkContextForSend, contextManifest, keepStaleSnapshot,
  type ContextItem, type ContextIssue,
} from './context-model'

/** The visible context set for Chat. Adding, refreshing and checking never sends a message;
 * the only way content reaches the draft is the explicit insert action. */
export function ContextPanel({ open = false }: { open?: boolean } = {}) {
  const { locale, projectId, contextItems, removeContextItem, patchContextItem, openResource, openCanvas } = useWorkbench()
  const copy = contextCopy[locale]
  const workspace = workspaceCopy[locale]
  const native = useNativeAgentSession()
  const session = native.session
  const scopeKind = session?.scope.context.kind ?? ''
  const sessionProject = session && ['research-repository', 'research-project', 'research-project-discussion'].includes(scopeKind) ? session.scope.context.id : ''
  const effectiveProject = sessionProject || projectId
  const [issues, setIssues] = useState<ContextIssue[] | null>(null)
  const [note, setNote] = useState('')
  const [refreshing, setRefreshing] = useState('')
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
    if (item.kind === 'draft') openResource({ kind: 'file', target: fileTarget(item.project, item.source?.workspace || item.project, 'files', item.ref) })
    else if (item.kind === 'canvas-node') { openCanvas(item.project); requestDesignFocus(item.project, [item.ref.split('#object/')[1]].filter(Boolean)) }
    else if (item.source) openResearchSource(item.source, { projectId: item.project, workspace: item.source.workspace || item.project })
  }
  const refresh = async (item: ContextItem) => {
    if (!item.source || refreshing) return
    setRefreshing(item.id); setNote('')
    try {
      const workspace = item.source.workspace || item.project
      const record = await request<{ content: string; digest: string }>(`/workspaces/${encodeURIComponent(workspace)}/files/${item.source.path.split('/').map(encodeURIComponent).join('/')}`)
      let excerpt: string | undefined
      if(item.source.path===CONTENT_PATH){
        const content=parseContentDocument(record.content)
        if(item.kind==='canvas-node'){
          const object=content.objects.find(o=>o.id===item.ref.split('#object/')[1])
          if(!object){patchContextItem(item.id,assessContextItem(item,null));return}
          excerpt=object.body?.slice(0,200)??''
        }else if(item.kind==='draft'){
          const artifact=content.artifacts.find(o=>o.id===item.ref.split('#artifact/')[1])
          if(!artifact){patchContextItem(item.id,assessContextItem(item,null));return}
          excerpt=artifact.title
        }
      }
      patchContextItem(item.id, assessContextItem(item, { digest: typeof record?.digest === 'string' && record.digest ? record.digest : undefined, excerpt }))
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) patchContextItem(item.id, assessContextItem(item, null))
      else setNote(`${copy.refreshFailed} ${error instanceof Error ? error.message : String(error)}`)
    } finally { setRefreshing('') }
  }
  const runCheck = () => setIssues(checkContextForSend(contextItems, effectiveProject).issues)
  const insert = () => {
    const { include, issues: found } = checkContextForSend(contextItems, effectiveProject)
    setIssues(found)
    if (!include.length) return
    native.appendDraft(contextManifest(include, effectiveProject))
    setNote(copy.inserted)
  }
  const insertWriting = () => {
    const cards = contextItems.filter(item => item.kind === 'canvas-node' && item.project === effectiveProject)
      .map(item => item.ref.split('#object/')[1]).filter(Boolean)
    const gate = inspectLiveCanvas(effectiveProject)
    if (!gate || !cards.length) { setNote(workspace.captureBlocked); return }
    const captured = captureSelectedContext(gate, cards)
    if (!captured.ok) { setNote(workspace.captureBlocked); return }
    native.appendDraft(captured.context.context)
    setNote(copy.inserted)
  }
  const requestSuggestions = () => {
    const { include } = checkContextForSend(contextItems, effectiveProject)
    native.appendDraft(`${contextManifest(include, effectiveProject)}\n请基于以上上下文，为研究画布与大纲提出整理建议（仅建议；回复不会被当作已写回画布，需经审查后人工应用）。\n`)
    setNote(copy.organizeNote)
  }
  return <section aria-label={copy.title} className="mx-auto w-full max-w-[48rem] px-5 pb-2" data-context-panel={effectiveProject || 'global'}>
    <details open={open || undefined} className="rounded-lg border border-line bg-panel px-3 py-2">
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
          {item.excerpt && <p className="mt-0.5 line-clamp-2 text-caption text-ink-3">{item.excerpt}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            <Button size="xs" onClick={() => locate(item)}>{copy.locate}</Button>
            {item.source && <Button size="xs" disabled={refreshing === item.id} onClick={() => void refresh(item)}>{copy.refresh}</Button>}
            {item.state === 'update-available' && <>
              <Button size="xs" onClick={() => patchContextItem(item.id, adoptContextVersion(item))}>{copy.adopt}</Button>
              <Button size="xs" onClick={() => patchContextItem(item.id, keepStaleSnapshot(item))}>{copy.keepStale}</Button>
            </>}
            <Button size="xs" onClick={() => removeContextItem(item.id)}>{copy.remove}</Button>
          </div>
        </li>)}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="xs" onClick={runCheck}>{copy.checkSend}</Button>
        <Button size="xs" variant="outline" onClick={insert}>{copy.insert}</Button>
        <Button size="xs" onClick={insertWriting}>{workspace.insertWritingContext}</Button>
        <Button size="xs" onClick={requestSuggestions} title={copy.organizeNote}>{copy.organize}</Button>
      </div>
      <p className="mt-1 text-caption text-ink-3">{copy.notSent}</p>
      {issues !== null && <ul className="mt-2 space-y-0.5" data-context-issues="">
        {!issues.length && <li className="text-caption text-ink-3">✓</li>}
        {issues.map(issue => <li key={issue.id} role="status" className="text-caption text-warn">{issue.label} · {issueLabel(issue.reason)}</li>)}
      </ul>}
      {note && <p role="status" className="mt-1 text-caption text-ink-3">{note}</p>}
    </details>
  </section>
}
