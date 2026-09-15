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
import { ReadingBridge } from '../projects/ReadingBridge'

type SourceFile = { content: string; digest: string }
type BuiltPDF = ManuscriptPDF & { completedAt: string }
export function FilesPage({ target, active = true, onQuote, onTitle }: {
  target: ProjectFileTarget; active?: boolean; onQuote: (text: string, targetProject?: string) => void; onTitle?: (title: string) => void
}) {
  const { locale, openPDF, openRightTab, setProjectId, setActiveNav, closeSourceView } = useWorkbench()
  const copy = projectObjectCopy[locale]
  const { projectId, workspace, path, view } = target
  const [directory, setDirectory] = useState(''), [entries, setEntries] = useState<ProjectEntry[]>([])
  const [document, setDocument] = useState<SourceFile | null>(null), [builds, setBuilds] = useState<BuiltPDF[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [compiling, setCompiling] = useState(false), [revision, setRevision] = useState(0)
  const mounted = useRef(false), scroll = useRef<HTMLDivElement>(null), position = useRef(0)
  const titleRef = useRef(onTitle); titleRef.current = onTitle
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { titleRef.current?.(path.split('/').pop() || copy[view]) }, [path, view, copy])
  useEffect(() => {
    if (!active || path) return // Do not replace a selected text passage by polling its file.
    const refresh = () => { if (window.document.visibilityState === 'visible') setRevision(n => n + 1) }
    window.addEventListener('focus', refresh); const timer = setInterval(refresh, 30000)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [active, path])
  useEffect(() => {
    if (!active || !workspace) return
    const controller = new AbortController(), { signal } = controller
    position.current = scroll.current?.scrollTop || position.current
    setError(''); setLoading(true)
    void (async () => {
      if (path && isTextMaterial(path)) {
        const source = await request<SourceFile>(`/workspaces/${encodeURIComponent(workspace)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { signal })
        if (typeof source?.content !== 'string' || typeof source.digest !== 'string' || !source.digest) throw new Error('Invalid file response.')
        if (!signal.aborted) setDocument(source)
      } else if (!path && view === 'builds') {
        const versions = await listPDFVersions(workspace, undefined, signal); if (!signal.aborted) setBuilds(versions)
      } else if (!path) {
        const files = await listProjectMaterials(workspace, directory, signal)
        if (!signal.aborted) setEntries(files.filter(entry => view !== 'notes' || entry.kind === 'directory' || /\.mdx?$/i.test(entry.path)))
      }
    })().catch(reason => { if (!signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [workspace, path, view, directory, revision, active])
  useEffect(() => { if (active && scroll.current) scroll.current.scrollTop = position.current }, [active, document])
  const back = () => {
    if (path) openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, view) })
    else { setEntries([]); position.current = 0; setDirectory(directory.split('/').slice(0, -1).join('/')) }
  }
  const pdfAction = async (compile: boolean) => {
    if (!document || compiling) return
    setCompiling(true); setError('')
    try {
      const pdf = compile ? await compilePDF(workspace, path, document.digest) : await latestPDF(workspace, path)
      if (mounted.current) { if (pdf) openPDF(pdf); else setError(copy.noPDF) }
    } catch (reason) { if (mounted.current) setError(String(reason instanceof Error ? reason.message : reason)) }
    finally { if (mounted.current) setCompiling(false) }
  }
  return <div className="flex h-full min-h-0 flex-col" data-object-workspace={workspace} data-object-path={path}>
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      {(path || directory) && <IconBtn icon={ArrowLeft} label={path ? copy.backToFiles : copy.parent} onClick={back}/>} 
      <span className="min-w-0 flex-1 truncate text-caption" title={fileTargetLocation(target)}>{path.split('/').pop() || directory.split('/').pop() || copy[view]}</span>
      <IconBtn icon={RotateCw} label={copy.refresh} disabled={loading || !workspace} onClick={() => setRevision(n => n + 1)}/>
      {document && /\.tex$/i.test(path) && <Button loading={compiling} disabled={loading} onClick={() => void pdfAction(true)}>{copy.compile}</Button>}
      {document && <RightMore label={copy.files}>
        {/\.tex$/i.test(path) && <Button onClick={() => void pdfAction(false)}>{copy.showPDF}</Button>}
        <Button onClick={() => onQuote(`${copy.storage}: ${fileTargetLocation(target)}\n${copy.version}: ${document.digest}\n\n${document.content}`, projectId)}>{copy.quote}</Button>
      </RightMore>}
    </div>
    {!workspace ? <p className="p-4 text-secondary text-ink-3">{copy.selectProject}</p> : <>
      <div className="px-3 pb-2 text-caption text-ink-3">
        <button type="button" aria-label={`${copy.back} · ${projectId}`} className="text-ink-2 hover:underline" onClick={() => { setProjectId(projectId); setActiveNav('chat'); closeSourceView() }}>{copy.scope} · {projectId}</button>
        <p className="truncate" title={`${workspace}/${path || directory}`}>{copy.storage} · {workspace}/{path || directory}</p>
        {document && <p className="truncate" title={document.digest}>{copy.readOnly} · {document.digest}</p>}
      </div>
      {error && <p role="alert" className="ui-error">{error}{document ? locale === 'zh' ? '（保留上次读取的版本）' : ' (last loaded revision retained)' : ''}</p>}
      {loading && <p role="status" className="px-3 text-caption text-ink-3">{copy.loading}</p>}
      <div ref={scroll} className="min-h-0 flex-1 overflow-auto p-3" onScroll={event => { if (active) position.current = event.currentTarget.scrollTop }}>
        {path ? !isTextMaterial(path) ? <p className="text-secondary text-ink-3">{copy.unsupported}</p> : document && <ReadingBridge active={active} source={{ id: 'reader', workspace, path, digest: document.digest }} projectId={projectId} projectWorkspace={target.projectWorkspace || workspace}>
          {/\.mdx?$/i.test(path) ? <article className="research-document break-words text-secondary leading-relaxed"><MarkdownView content={document.content}/></article> : <pre className="whitespace-pre-wrap break-words font-mono text-secondary leading-relaxed">{document.content}</pre>}
        </ReadingBridge> : view === 'builds' ? <>
          {builds.map(pdf => <div key={`${pdf.buildId}:${pdf.digest}`} className="mb-3 rounded-lg bg-elevated p-3">
            <button type="button" className="ui-list-row" onClick={() => openPDF(pdf)}><FileText size={14} strokeWidth={1.75}/>{pdf.path} · PDF</button>
            <p className="break-all text-caption">{copy.build} · {pdf.buildId}</p><p className="text-caption">{pdf.completedAt}</p>
            <Button size="xs" onClick={() => openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, 'files', pdf.path) })}>{copy.source}</Button>
          </div>)}
          {!loading && !error && !builds.length && <p className="text-secondary text-ink-3">{copy.noBuilds}</p>}
        </> : <>
          {view === 'notes' && <p className="mb-3 text-caption text-ink-3">{copy.noteScope}</p>}
          {entries.map(entry => <button key={entry.path} type="button" className="ui-list-row" onClick={() => {
            if (entry.kind === 'directory') { setEntries([]); position.current = 0; setDirectory(entry.path) }
            else openRightTab({ kind: 'file', target: fileTarget(projectId, workspace, view, entry.path) })
          }}>{entry.kind === 'directory' ? <Folder size={14} strokeWidth={1.75}/> : <FileText size={14} strokeWidth={1.75}/>}<span className="truncate">{entry.path.split('/').pop()}</span></button>)}
          {!loading && !error && !entries.length && <p className="text-secondary text-ink-3">{view === 'notes' ? copy.noNotes : copy.noFiles}</p>}
        </>}
      </div>
    </>}
  </div>
}
