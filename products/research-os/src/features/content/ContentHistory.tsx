import { useEffect, useState } from 'react'
import { ArrowLeft, History } from 'lucide-react'
import { Input, Select } from '../../components/forms'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { DraftScope } from '../projects/draft-model'
import type { OutlineItem } from '../projects/canvas-model'
import { listContentRevisions, readContentRevision } from './content-client'
import type { ContentRevision, ContentSnapshot } from './content-model'
import { SourceReferenceLink } from './SourceReferenceLink'

export function ContentHistory({ scope, digest }: { scope: DraftScope; digest?: string }) {
  const zh = useWorkbench(state => state.locale) === 'zh'
  const [open, setOpen] = useState(false), [revisions, setRevisions] = useState<ContentRevision[] | null>(null), [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const abort = new AbortController(); setRevisions(null); setError('')
    void listContentRevisions(scope, abort.signal).then(result => setRevisions(result.revisions)).catch(error => { if (!abort.signal.aborted) setError(String(error.message || error)) })
    return () => abort.abort()
  }, [open, scope.projectId, scope.workspace])
  return <div className="relative">
    <Button size="xs" icon={History} aria-expanded={open} onClick={() => setOpen(value => !value)}>{zh ? '版本' : 'Versions'}</Button>
    {open && <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-line bg-panel p-2 shadow-pop" data-content-history>
      <p className="mb-2 text-caption text-ink-3">{zh ? '查看已归档版本，只读打开。' : 'Open an archived version for reading.'}</p>
      {error ? <p role="alert" className="text-caption">{error}</p> : revisions === null ? <p role="status" className="text-caption">{zh ? '正在读取…' : 'Loading…'}</p> : revisions.length === 0 ? <p className="text-caption">{zh ? '尚无归档版本。' : 'No archived versions yet.'}</p> : revisions.map(revision => <button key={revision.digest} className="block w-full rounded p-2 text-left text-caption hover:bg-hover" onClick={() => { useWorkbench.getState().openResource({ kind: 'research', workspace: revision.workspace, ownerProjectId: revision.projectId, digest: revision.digest, view: 'table' }); setOpen(false) }}>
        <span className="block">{new Date(revision.observedAt).toLocaleString()}{revision.digest === digest ? (zh ? ' · 当前' : ' · Current') : ''}</span><span className="font-mono text-ink-3">{revision.digest.replace(/^sha256:/, '').slice(0, 16)}</span>
      </button>)}
    </div>}
  </div>
}

/** Immutable revision reader deliberately has no shared writer or editable canvas hook. */
export function ArchivedContentWorkbench({ project, workspace, digest, objectId, artifactId }: { project: string; workspace: string; digest: string; objectId?: string; artifactId?: string }) {
  const zh = useWorkbench(state => state.locale) === 'zh'
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [outline, setOutline] = useState('')
  const [selected, setSelected] = useState<{ kind: 'object' | 'artifact'; id: string } | null>(artifactId ? { kind: 'artifact', id: artifactId } : objectId ? { kind: 'object', id: objectId } : null)
  useEffect(() => { setSelected(artifactId ? { kind: 'artifact', id: artifactId } : objectId ? { kind: 'object', id: objectId } : null) }, [objectId, artifactId, digest])
  useEffect(() => {
    const abort = new AbortController(); setSnapshot(null); setError('')
    void readContentRevision({ projectId: project, workspace }, digest, abort.signal).then(setSnapshot).catch(error => { if (!abort.signal.aborted) setError(String(error.message || error)) })
    return () => abort.abort()
  }, [project, workspace, digest])
  const document = snapshot?.document, scope = { projectId: document?.projectId ?? project, workspace: document?.workspace ?? workspace }
  const object = selected?.kind === 'object' ? document?.objects.find(object => object.id === selected.id) : undefined
  const artifact = selected?.kind === 'artifact' ? document?.artifacts.find(artifact => artifact.id === selected.id) : undefined
  const matches = (title: string, body = '') => `${title}\n${body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  const outlineRows = (items: OutlineItem[], depth = 0): React.ReactNode => items.map(item => {
    const row = document?.objects.find(object => object.id === item.node)
    return <div key={item.node}>
      {row && <button className="block w-full border-b border-line py-2 pr-2 text-left text-secondary hover:bg-hover" style={{ paddingLeft: 12 + depth * 16 }} onClick={() => setSelected({ kind: 'object', id: row.id })}>{row.title || row.id}</button>}
      {item.children && outlineRows(item.children, depth + 1)}
    </div>
  })
  return <section className="flex h-full min-h-0 min-w-0 flex-col" data-content-revision={digest}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line p-3">
      <span className="mr-auto text-secondary font-medium">{zh ? '研究内容 · 只读版本' : 'Research content · Read-only revision'}</span>
      <Button size="xs" onClick={() => { const store = useWorkbench.getState(); if (artifact) store.selectResearchDraft(scope, artifact.id); else store.openResource({ kind: 'research', workspace: scope.workspace, ownerProjectId: scope.projectId, view: 'table', objectId: object?.id }) }}>{zh ? '打开当前版本' : 'Open current version'}</Button>
      <p className="w-full break-all font-mono text-caption text-ink-3">{digest}</p>
    </header>
    {error ? <div className="space-y-2 p-4" role="alert"><p>{zh ? '无法读取指定的归档版本。' : 'The requested archived version is unavailable.'}</p><p className="break-words text-caption text-ink-3">{error}</p></div> : !document ? <p className="p-4 text-secondary" role="status">{zh ? '正在读取指定版本…' : 'Loading the requested revision…'}</p> : selected ? <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
      <Button size="xs" icon={ArrowLeft} onClick={() => setSelected(null)}>{zh ? '返回版本内容' : 'Back to revision contents'}</Button>
      {!object && !artifact && <p role="alert">{zh ? '这个版本中没有指定的对象或产物。' : 'This revision does not contain the requested object or artifact.'}</p>}
      {object && <><h2 className="text-body font-medium">{object.title}</h2><p className="text-caption text-ink-3">{object.kind} · {object.status || '—'}</p><p className="whitespace-pre-wrap text-secondary">{object.body}</p>{object.definition && <pre className="overflow-auto whitespace-pre-wrap rounded border border-line p-3 text-caption">{JSON.stringify(object.definition, null, 2)}</pre>}{object.sources.map((source, index) => <SourceReferenceLink key={index} source={source} scope={scope}/>)}</>}
      {artifact && <><h2 className="text-body font-medium">{artifact.title}</h2><p className="text-caption text-ink-3">{artifact.kind} · {artifact.status}</p>{artifact.blocks.map(block => <section key={block.id} className="space-y-2 border-t border-line pt-3"><h3 className="text-secondary font-medium">{block.title}</h3>{Object.entries(block.fields).map(([field, value]) => <div key={field}><p className="text-caption text-ink-3">{field}</p><p className="whitespace-pre-wrap text-secondary">{value}</p></div>)}</section>)}{artifact.sources.map(source => <SourceReferenceLink key={source.id} source={{ ...source, kind: source.url ? 'literature' : 'file', selector: { quote: source.excerpt, page: source.page, buildId: source.buildId } }} scope={scope}/>)}</>}
    </div> : <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-2 border-b border-line p-2"><div className="min-w-0 flex-1"><Input aria-label={zh ? '查找版本内容' : 'Find revision content'} placeholder={zh ? '标题或内容' : 'Title or content'} value={query} onChange={event => setQuery(event.target.value)}/></div><div className="w-48 max-w-[55%] shrink-0"><Select aria-label={zh ? '版本视图' : 'Revision view'} value={outline} onChange={event => setOutline(event.target.value)}><option value="">{zh ? '全部内容' : 'All content'}</option>{document.views.outlines.map(item => <option key={item.artifact} value={item.artifact}>{item.title || item.artifact}</option>)}</Select></div></div>
      <div className="min-h-0 flex-1 overflow-auto">{outline ? outlineRows(document.views.outlines.find(item => item.artifact === outline)?.items ?? []) : <>
        {document.objects.filter(object => matches(object.title, object.body)).map(object => <button key={`object-${object.id}`} className="flex w-full items-center gap-2 border-b border-line p-3 text-left text-secondary hover:bg-hover" onClick={() => setSelected({ kind: 'object', id: object.id })}><span className="min-w-0 flex-1">{object.title || object.id}</span><span className="text-caption text-ink-3">{object.kind}</span></button>)}
        {document.artifacts.length > 0 && <p className="px-3 pt-4 text-caption font-medium text-ink-3">{zh ? '产物' : 'Artifacts'}</p>}{document.artifacts.filter(artifact => matches(artifact.title)).map(artifact => <button key={`artifact-${artifact.id}`} className="block w-full border-b border-line p-3 text-left text-secondary hover:bg-hover" onClick={() => setSelected({ kind: 'artifact', id: artifact.id })}>{artifact.title || artifact.id}</button>)}
      </>}</div>
    </div>}
  </section>
}
