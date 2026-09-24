import { useEffect, useState } from 'react'
import { FileText, Presentation } from 'lucide-react'
import { request } from '../../lib/api'
import { useWorkbench } from '../../store'
import { sharedContentSession } from '../content/useContentDocument'
import type { ResearchDraft } from '../projects/draft-model'

/* 项目制品架（资源管理器语法）：同一项目下的 PDF 与草稿制品（回复信、幻灯片、分镜）并列，点开即在原位打开。
   PDF 由文件签名 %PDF- 经工作区搜索找到，不猜路径；编译产物在构建可用时由预览自动打开。 */
export type Shelf = { pdfs: string[]; drafts: ResearchDraft[]; error: string }

/** The project's PDFs (by %PDF- signature) and its letter/slides/storyboard drafts; refreshed on window focus. */
export function useProjectShelf(project: string): Shelf | null {
  const [shelf, setShelf] = useState<Shelf | null>(null)
  useEffect(() => {
    if (!project) return
    const c = new AbortController()
    const read = async (): Promise<Shelf> => {
      const [hits, drafts] = await Promise.all([
        request<{ path: string; line: number }[]>(`/workspaces/${encodeURIComponent(project)}/search?q=${encodeURIComponent('%PDF-')}&limit=50`, { signal: c.signal }).catch(() => []),
        (async () => { const session = sharedContentSession({ projectId: project, workspace: project }); if (session.snapshot().status === 'loading') await session.load(); return session.snapshot().value?.artifacts ?? [] })().catch(() => []),
      ])
      const pdfs = [...new Set(hits.filter(hit => hit.line === 1 && /\.pdf$/i.test(hit.path)).map(hit => hit.path))]
      return { pdfs, drafts: drafts.filter(d => !d.archivedAt && ['paper', 'slides', 'storyboard'].includes(d.kind)), error: '' }
    }
    read().then(value => { if (!c.signal.aborted) setShelf(value) }).catch(error => { if (!c.signal.aborted) setShelf({ pdfs: [], drafts: [], error: String(error) }) })
    const refresh = () => void read().then(value => { if (!c.signal.aborted) setShelf(value) }).catch(() => {})
    window.addEventListener('focus', refresh)
    // Drafts come from the shared content session: a new slides/letter draft shows up without a refocus.
    let off = () => {}
    try {
      const session = sharedContentSession({ projectId: project, workspace: project })
      off = session.subscribe(() => { const drafts = session.snapshot().value?.artifacts; if (drafts && !c.signal.aborted) setShelf(prev => prev && { ...prev, drafts: drafts.filter(d => !d.archivedAt && ['paper', 'slides', 'storyboard'].includes(d.kind)) }) })
    } catch { /* The workspace is bound to another project; the focus refresh still applies. */ }
    return () => { c.abort(); off(); window.removeEventListener('focus', refresh) }
  }, [project])
  return shelf
}

export function ArtifactShelf({ project }: { project: string }) {
  const { locale, openResource, selectResearchDraft } = useWorkbench()
  const zh = locale === 'zh'
  const shelf = useProjectShelf(project)
  if (!shelf || (!shelf.pdfs.length && !shelf.drafts.length)) return null
  const row = 'flex w-full items-center gap-2 rounded-md px-2 h-7 text-secondary text-ink-2 transition-colors hover:bg-hover hover:text-ink'
  return <div className="ml-sidebar-indent border-l border-line pl-1.5" data-xgc-role="artifact-shelf" data-xgc-id={project}>
    <button type="button" data-xgc-role="open-artifacts" title={zh ? '打开制品面板' : 'Open the artifacts pane'} onClick={() => openResource({ kind: 'artifacts' }, 'secondary')} className="w-full px-2 pb-0.5 pt-1.5 text-left text-caption text-ink-3 hover:text-ink-2">{zh ? '制品' : 'Artifacts'}</button>
    {shelf.pdfs.map(path => <button key={path} type="button" className={row} title={path} onClick={() => openResource({ kind: 'original', workspace: project, path }, 'secondary')}>
      <FileText size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{path.split('/').pop()}</span>
    </button>)}
    {shelf.drafts.map(draft => <button key={draft.id} type="button" className={row} title={draft.kind} onClick={() => selectResearchDraft({ projectId: project, workspace: project }, draft.id, draft.kind)}>
      <Presentation size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/><span className="truncate">{draft.title || draft.id}</span>
    </button>)}
  </div>
}
