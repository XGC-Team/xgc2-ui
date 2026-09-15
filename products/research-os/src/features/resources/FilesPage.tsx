import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, Folder, RotateCw } from 'lucide-react'
import { useWorkbench } from '../../store'
import { request } from '../../lib/api'
import { Button, IconBtn, RightMore } from '../../components/ui'
import { MarkdownView } from './Reader'
import { compilePDF, latestPDF, listPDFVersions, type ManuscriptPDF } from './manuscript'
import { isTextMaterial, listProjectMaterials, type ProjectEntry } from './project-files'
import { fileTarget, fileTargetLocation, type ProjectFileTarget } from '../projects/project-object-model'
import { projectObjectCopy } from '../projects/project-object-copy'

type SourceFile = { content: string; digest: string }
type BuiltPDF = ManuscriptPDF & { completedAt: string }

/** Every instance owns an immutable target; selecting a different project must not retarget it. */
export function FilesPage({ target, active = true, onQuote, onTitle }: {
  target: ProjectFileTarget
  active?: boolean
  onQuote: (text: string, targetProject?: string) => void
  onTitle?: (title: string) => void
}) {
  const { locale, openPDF, openRightTab, setProjectId, setActiveNav, closeSourceView } = useWorkbench()
  const copy = projectObjectCopy[locale]
  const { projectId, workspace, path, view } = target
  const [directory, setDirectory] = useState('')
  const [entries, setEntries] = useState<ProjectEntry[]>([])
  const [document, setDocument] = useState<SourceFile | null>(null)
  const [builds, setBuilds] = useState<BuiltPDF[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const [revision, setRevision] = useState(0)
  const mounted = useRef(false)
  const titleRef = useRef(onTitle)
  titleRef.current = onTitle
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { titleRef.current?.(path.split('/').pop() || copy[view]) }, [path, view, locale, copy])

  useEffect(() => {
    if (!active) return
    const refresh = () => { if (window.document.visibilityState === 'visible') setRevision(n => n + 1) }
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 30000)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [active])

  useEffect(() => {
    if (!active || !workspace) return
    const controller = new AbortController()
    const { signal } = controller
    setError(''); setLoading(true)
    setEntries([]); setDocument(null); setBuilds([])
    void (async () => {
      if (path) {
        if (!isTextMaterial(path)) return
        const source = await request<SourceFile>(`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { signal })
        if (typeof source?.content !== 'string' || typeof source.digest !== 'string') throw new Error('Invalid file response.')
        if (!signal.aborted) setDocument(source)
      } else if (view === 'builds') {
        const versions = await listPDFVersions(workspace, undefined, signal)
        if (!signal.aborted) setBuilds(versions)
      } else {
        const files = await listProjectMaterials(workspace, directory, signal)
        if (!signal.aborted) setEntries(files.filter(entry => view !== 'notes' || entry.kind === 'directory' || /\.mdx?$/i.test(entry.path)))
      }
    })().catch(reason => { if (!signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [workspace, path, view, directory, revision, active])

  const returnToProject = () => { setProjectId(projectId); setActiveNav('chat'); closeSourceView() }
  const back = () => {
    if (path) openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, view) })
    else setDirectory(directory.split('/').slice(0, -1).join('/'))
  }
  const compile = async () => {
    if (!document || compiling) return
    setCompiling(true); setError('')
    try { const pdf = await compilePDF(workspace, path, document.digest); if (mounted.current) openPDF(pdf) }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { if (mounted.current) setCompiling(false) }
  }
  const showPDF = async () => {
    setError('')
    try {
      const pdf = await latestPDF(workspace, path)
      if (!mounted.current) return
      if (pdf) openPDF(pdf); else setError(copy.noPDF)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <div className="flex h-full min-h-0 flex-col" data-object-workspace={workspace} data-object-path={path}>
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      {(path || directory) && <IconBtn icon={ArrowLeft} label={path ? copy.backToFiles : copy.parent} onClick={back}/>}
      <span className="min-w-0 flex-1 truncate pl-1 text-caption text-ink-2" title={fileTargetLocation(target)}>
        {path.split('/').pop() || directory.split('/').pop() || copy[view]}
      </span>
      <IconBtn icon={RotateCw} label={copy.refresh} disabled={loading || !workspace} onClick={() => setRevision(n => n + 1)}/>
      {document && /\.tex$/i.test(path) && <Button disabled={loading || compiling} loading={compiling} onClick={() => void compile()}>{copy.compile}</Button>}
      {document && <RightMore label={copy.files}>
        {/\.tex$/i.test(path) && <Button onClick={() => void showPDF()}>{copy.showPDF}</Button>}
        <Button disabled={loading} onClick={() => onQuote(`${copy.storage}: ${fileTargetLocation(target)}\n${copy.version}: ${document.digest}\n\n${document.content}`, projectId)}>{copy.quote}</Button>
      </RightMore>}
    </div>
    {!workspace ? <p className="p-4 text-secondary text-ink-3">{copy.selectProject}</p> : <>
      <div className="px-3 pb-2 text-caption text-ink-3">
        <button type="button" title={copy.back} aria-label={`${copy.back} · ${projectId}`} className="rounded-md text-ink-2 hover:underline" onClick={returnToProject}>
          {copy.scope} · {projectId}
        </button>
        <p className="truncate" title={`${workspace}/${path || directory}`}>{copy.storage} · {workspace}/{path || directory}</p>
        {document && <p className="truncate" title={document.digest}>{copy.readOnly} · {document.digest}</p>}
      </div>
      {error && <p role="alert" className="ui-error">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? <p role="status" className="text-secondary text-ink-3">{copy.loading}</p> : error ? null : path ? (
          !isTextMaterial(path) ? <p className="text-secondary text-ink-3">{copy.unsupported}</p> : document && (
            /\.mdx?$/i.test(path) ? <article className="research-document break-words text-secondary leading-relaxed"><MarkdownView content={document.content}/></article>
              : <pre className="whitespace-pre-wrap break-words font-mono text-secondary leading-relaxed">{document.content}</pre>
          )
        ) : view === 'builds' ? <>
          {builds.map(pdf => <div key={`${pdf.buildId}:${pdf.digest}`} className="mb-3 rounded-lg bg-elevated p-3">
            <button type="button" className="ui-list-row" onClick={() => openPDF(pdf)}>
              <FileText size={14} strokeWidth={1.75} className="shrink-0"/>
              <span className="min-w-0 truncate">{pdf.path} · PDF</span>
            </button>
            <p className="break-all text-caption text-ink-3">{copy.build} · {pdf.buildId}</p>
            <p className="text-caption text-ink-3">{pdf.completedAt}</p>
            <Button size="xs" onClick={() => openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, 'files', pdf.path) })}>{copy.source}</Button>
          </div>)}
          {!builds.length && <p className="text-secondary text-ink-3">{copy.noBuilds}</p>}
        </> : <>
          {view === 'notes' && <p className="mb-3 text-caption text-ink-3">{copy.noteScope}</p>}
          {entries.map(entry => <button key={entry.path} type="button" className="ui-list-row" onClick={() => {
            if (entry.kind === 'directory') setDirectory(entry.path)
            else openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, view, entry.path) })
          }}>
            {entry.kind === 'directory' ? <Folder size={14} strokeWidth={1.75} className="shrink-0 text-ink-3"/> : <FileText size={14} strokeWidth={1.75} className="shrink-0 text-ink-3"/>}
            <span className="truncate">{entry.path.split('/').pop()}</span>
          </button>)}
          {!entries.length && <p className="text-secondary text-ink-3">{view === 'notes' ? copy.noNotes : copy.noFiles}</p>}
        </>}
      </div>
    </>}
  </div>
}
