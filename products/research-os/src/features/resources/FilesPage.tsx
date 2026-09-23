import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText, Folder, RotateCw } from 'lucide-react'
import { useWorkbench } from '../../store'
import { Button, IconBtn } from '../../components/ui'
import { listPDFVersions, type ManuscriptPDF } from './manuscript'
import { isTextMaterial, listProjectMaterials, type ProjectEntry } from './project-files'
import { fileTarget, fileTargetLocation, type ProjectFileTarget } from '../projects/project-object-model'
import { projectObjectCopy } from '../projects/project-object-copy'
import { SavedSourceEditor } from './SavedSourceEditor'
import { ManuscriptBuildStatus } from './ManuscriptBuildStatus'

type Props = {
  target: ProjectFileTarget
  active?: boolean
  manuscriptEntryPoint?: string
  onQuote: (text: string, targetProject?: string) => void
  onTitle?: (title: string) => void
}
type BuiltPDF = ManuscriptPDF & { completedAt: string }
export function FilesPage(props: Props) {
  // A late read/build from another target must never be relabelled with this one.
  const { projectId, workspace, path, view } = props.target
  return <FilesPageContent key={JSON.stringify([projectId, workspace, path, view])} {...props}/>
}
function FilesPageContent({ target, active = true, manuscriptEntryPoint, onQuote, onTitle }: Props) {
  const { locale, openPDF, openResource, setProjectId, setActiveNav, showConversation } = useWorkbench()
  const copy = projectObjectCopy[locale]
  const { projectId, workspace, path, view } = target
  const [directory, setDirectory] = useState(''), [entries, setEntries] = useState<ProjectEntry[]>([])
  const [builds, setBuilds] = useState<BuiltPDF[]>([])
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0)
  const scroll = useRef<HTMLDivElement>(null), position = useRef(0)
  const titleRef = useRef(onTitle); titleRef.current = onTitle
  useEffect(() => { titleRef.current?.(path.split('/').pop() || copy[view]) }, [path, view, copy])
  useEffect(() => {
    if (!active || !workspace || path) return
    const controller = new AbortController(), { signal } = controller
    setError(''); setLoading(true)
    void (async () => {
      if (view === 'builds') {
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
  useEffect(() => { if (active && scroll.current) scroll.current.scrollTop = position.current }, [active])
  const back = () => {
    if (path) openResource({ kind: 'file', target: fileTarget(projectId, workspace, view) })
    else { setEntries([]); position.current = 0; setDirectory(directory.split('/').slice(0, -1).join('/')) }
  }
  return <div className="flex h-full min-h-0 flex-col" data-object-workspace={workspace} data-object-path={path}>
    <div className="flex h-9 shrink-0 items-center gap-1 px-2">
      {(path || directory) && <IconBtn icon={ArrowLeft} label={path ? copy.backToFiles : copy.parent} onClick={back}/>}
      <span className="min-w-0 flex-1 truncate text-caption" title={fileTargetLocation(target)}>{path.split('/').pop() || directory.split('/').pop() || copy[view]}</span>
      {!path && <IconBtn icon={RotateCw} label={copy.refresh} disabled={loading || !workspace} onClick={() => setRevision(value => value + 1)}/>}
    </div>
    {!workspace ? <p className="p-4 text-secondary text-ink-3">{copy.selectProject}</p> : <>
      <div className="px-3 pb-2 text-caption text-ink-3">
        <button type="button" aria-label={`${copy.back} · ${projectId}`} className="text-ink-2 hover:underline" onClick={() => { setProjectId(projectId); setActiveNav('chat'); showConversation() }}>{copy.scope} · {projectId}</button>
        <p className="truncate" title={`${workspace}/${path || directory}`}>{copy.storage} · {workspace}/{path || directory}</p>
      </div>
      {path && /\.(tex|bib|sty|cls|bst|cfg|def)$/i.test(path) && <ManuscriptBuildStatus workspace={workspace} path={path} entryPoint={manuscriptEntryPoint} active={active} onOpenPDF={openPDF}/>}
      {error && <p role="alert" className="ui-error">{error}</p>}
      {loading && <p role="status" className="px-3 text-caption text-ink-3">{copy.loading}</p>}
      <div ref={scroll} className="min-h-0 flex-1 overflow-auto p-3" onScroll={event => { if (active) position.current = event.currentTarget.scrollTop }}>
        {path ? !isTextMaterial(path) ? <p className="text-secondary text-ink-3">{copy.unsupported}</p> : <SavedSourceEditor target={target} active={active} onQuote={onQuote}/>
          : view === 'builds' ? <>
            {builds.map(pdf => <div key={`${pdf.buildId}:${pdf.digest}`} className="mb-3 rounded-lg bg-elevated p-3">
              <button type="button" className="ui-list-row" onClick={() => openPDF(pdf)}><FileText size={14} strokeWidth={1.75}/>{pdf.path} · PDF</button>
              <p className="break-all text-caption">{copy.build} · {pdf.buildId}</p><p className="text-caption">{pdf.completedAt}</p>
              <Button size="xs" onClick={() => openResource({ kind: 'file', target: fileTarget(projectId, workspace, 'files', pdf.path) })}>{copy.source}</Button>
            </div>)}
            {!loading && !error && !builds.length && <p className="text-secondary text-ink-3">{copy.noBuilds}</p>}
          </> : <>
            {view === 'notes' && <p className="mb-3 text-caption text-ink-3">{copy.noteScope}</p>}
            {entries.map(entry => <button key={entry.path} type="button" className="ui-list-row" onClick={() => {
              if (entry.kind === 'directory') { setEntries([]); position.current = 0; setDirectory(entry.path) }
              else openResource({ kind: 'file', target: fileTarget(projectId, workspace, view, entry.path) })
            }}>{entry.kind === 'directory' ? <Folder size={14} strokeWidth={1.75}/> : <FileText size={14} strokeWidth={1.75}/>}<span className="truncate">{entry.path.split('/').pop()}</span></button>)}
            {!loading && !error && !entries.length && <p className="text-secondary text-ink-3">{view === 'notes' ? copy.noNotes : copy.noFiles}</p>}
          </>}
      </div>
    </>}
  </div>
}
