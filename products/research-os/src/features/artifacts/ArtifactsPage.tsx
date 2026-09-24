import { useEffect, useState } from 'react'
import { Clapperboard, FileText, Plus, Presentation, ScrollText } from 'lucide-react'
import { useWorkbench } from '../../store'
import { cn } from '../../lib/cn'
import { useProjectShelf } from './ArtifactShelf'
import { artifactPaths } from './artifact-model'
import { loadArtifactView } from './artifact-api'
import type { ArtifactView } from './artifact-record'
import { useRendererObservation } from './renderer-gate'
import { newDraft, type ResearchDraft } from '../projects/draft-model'
import { sharedContentSession } from '../content/useContentDocument'
import { revisionOutputDraft } from '../revision/revision-model'
import { editFailureCopy, editResearchContent } from '../revision/revision-actions'

/* 制品面板（资源管理器语法，与画布/对话并排）：PDF 是真的，点开即在原位阅读；
   幻灯片与视频是「槽位」——有草稿就显示它的渲染状态，没有就给一个起草动作。
   渲染状态只来自构建账本与本次会话观察到的拒绝，从不假装渲染成功。 */
type Slot = { kind: 'slides' | 'storyboard'; icon: typeof Presentation; zh: string; en: string; format: string }
const SLOTS: Slot[] = [
  { kind: 'slides', icon: Presentation, zh: '答辩幻灯片', en: 'Talk slides', format: 'PPTX' },
  { kind: 'storyboard', icon: Clapperboard, zh: '视频摘要', en: 'Video abstract', format: 'MP4' },
]

export function renderStateLabel(view: ArtifactView | null | 'error', renderer: ReturnType<typeof useRendererObservation>, zh: boolean): { text: string; tone: 'ok' | 'gate' | 'quiet' } {
  if (view === 'error') return { text: zh ? '构建账本读取失败' : 'Could not read the build ledger', tone: 'gate' }
  if (!view) return { text: zh ? '正在读取构建账本…' : 'Reading the build ledger…', tone: 'quiet' }
  if (view.successful) return { text: `${zh ? '已渲染' : 'Rendered'} · ${view.successful.files.map(f => f.extension.toUpperCase()).join(' / ') || view.successful.buildId.slice(0, 8)}${view.laterFailure ? (zh ? ' · 之后一次失败' : ' · a later attempt failed') : ''}`, tone: 'ok' }
  if (view.latest) return { text: `${zh ? '上次渲染' : 'Last render'} ${view.latest.status}`, tone: 'gate' }
  if (renderer.state === 'unavailable') return { text: zh ? '未渲染 · 渲染器不可用（已观察）' : 'Not rendered · renderer unavailable (observed)', tone: 'gate' }
  return { text: zh ? '未渲染' : 'Not rendered', tone: 'quiet' }
}

export function ArtifactsPage({ project }: { project: string }) {
  const { locale, openResource, selectResearchDraft } = useWorkbench()
  const zh = locale === 'zh'
  const shelf = useProjectShelf(project)
  const [drafts, setDrafts] = useState<ResearchDraft[] | null>(null)
  const [note, setNote] = useState(''), [busy, setBusy] = useState('')
  const scope = { projectId: project, workspace: project }
  useEffect(() => {
    let live = true
    try {
      const session = sharedContentSession({ projectId: project, workspace: project })
      const read = () => { if (live) setDrafts((session.snapshot().value?.artifacts ?? []).filter(d => !d.archivedAt)) }
      const off = session.subscribe(read)
      if (session.snapshot().status === 'loading') void session.load().then(read).catch(() => { if (live) setDrafts([]) }); else read()
      return () => { live = false; off() }
    } catch { setDrafts([]) }
    return () => { live = false }
  }, [project])

  // A stub becomes a real draft object in research content; nothing is rendered by drafting.
  const draft = async (slot: Slot) => {
    setBusy(slot.kind); setNote('')
    let created: ResearchDraft | null = null
    const result = await editResearchContent(scope, d => {
      created = slot.kind === 'slides' && d.objects.length
        ? revisionOutputDraft({ document: d, kind: 'slides', locale, at: new Date() })
        : newDraft(slot.kind, zh ? slot.zh : slot.en)
      return { ...d, artifacts: [...d.artifacts, created] }
    }, true)
    setBusy('')
    if (result.ok && created) selectResearchDraft(scope, (created as ResearchDraft).id, slot.kind)
    else if (!result.ok) setNote(editFailureCopy(result, locale))
  }

  const letters = (drafts ?? []).filter(d => d.kind === 'paper')
  return <div className="h-full min-h-0 overflow-y-auto" data-xgc-role="artifacts-page" data-xgc-id={project}>
    <div className="mx-auto w-full max-w-[34rem] px-4 pb-10 pt-4">
      <Group title="PDF">
        {shelf === null ? <Quiet>{zh ? '正在查找项目里的 PDF…' : 'Looking for PDFs in the project…'}</Quiet>
          : shelf.pdfs.length ? shelf.pdfs.map(path => <Row key={path} icon={FileText} title={path.split('/').pop() || path} meta={path.split('/').slice(0, -1).join('/') || '/'} onOpen={() => openResource({ kind: 'original', workspace: project, path }, 'secondary')}/>)
          : <Quiet>{zh ? '项目里还没有 PDF。拖入 Chat 即可归档。' : 'No PDF in this project yet. Drop one into Chat to archive it.'}</Quiet>}
      </Group>
      {letters.length > 0 && <Group title={zh ? '文稿' : 'Documents'}>
        {letters.map(d => <Row key={d.id} icon={ScrollText} title={d.title || d.id} meta={zh ? '草稿' : 'draft'} onOpen={() => selectResearchDraft(scope, d.id, d.kind)}/>)}
      </Group>}
      <Group title={zh ? '演示与视频' : 'Slides & video'}>
        {SLOTS.map(slot => {
          const existing = (drafts ?? []).filter(d => d.kind === slot.kind)
          if (!existing.length) return <div key={slot.kind} className="flex h-10 items-center gap-2.5 rounded-md border border-dashed border-line px-2.5 text-secondary text-ink-3" data-artifact-slot={slot.kind} data-slot-state="empty">
            <slot.icon size={14} strokeWidth={1.5} className="shrink-0"/><span className="min-w-0 flex-1 truncate">{zh ? slot.zh : slot.en} · {slot.format}</span>
            <button type="button" disabled={drafts === null || busy === slot.kind} onClick={() => void draft(slot)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-caption text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50"><Plus size={12}/>{zh ? '起草' : 'Draft'}</button>
          </div>
          return existing.map(d => <DraftRow key={d.id} scope={scope} draft={d} slot={slot} onOpen={() => selectResearchDraft(scope, d.id, d.kind)}/>)
        })}
      </Group>
      {note && <p role="alert" className="mt-2 text-caption text-ink-2">{note}</p>}
    </div>
  </div>
}

function DraftRow({ scope, draft, slot, onOpen }: { scope: { projectId: string; workspace: string }; draft: ResearchDraft; slot: Slot; onOpen: () => void }) {
  const { locale } = useWorkbench(), zh = locale === 'zh'
  const renderer = useRendererObservation()
  const [view, setView] = useState<ArtifactView | null | 'error'>(null)
  const { projectId, workspace } = scope
  useEffect(() => {
    const c = new AbortController()
    loadArtifactView({ projectId, workspace, artifactId: draft.id, entryPoint: artifactPaths(draft.id).definition }, c.signal)
      .then(v => { if (!c.signal.aborted) setView(v) }).catch(() => { if (!c.signal.aborted) setView('error') })
    return () => c.abort()
  }, [projectId, workspace, draft.id, renderer])
  const state = renderStateLabel(view, renderer, zh)
  return <button type="button" onClick={onOpen} data-artifact-slot={slot.kind} data-slot-state={state.tone} title={zh ? '打开草稿与渲染设置' : 'Open the draft and render settings'}
    className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-hover">
    <slot.icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-2"/>
    <span className="min-w-0 flex-1"><span className="block truncate text-secondary text-ink">{draft.title || draft.id}</span>
      <span className={cn('block truncate text-caption', state.tone === 'ok' ? 'text-ink-2' : 'text-ink-3')}>{slot.format} · {state.text}</span></span>
  </button>
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-5"><p className="mb-1.5 flex items-center gap-2 text-caption text-ink-3">{title}<span className="h-px flex-1 bg-line"/></p><div className="flex flex-col gap-0.5">{children}</div></section>
}
function Row({ icon: Icon, title, meta, onOpen }: { icon: typeof FileText; title: string; meta: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors hover:bg-hover">
    <Icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-2"/><span className="min-w-0 flex-1 truncate text-secondary text-ink">{title}</span><span className="max-w-[40%] shrink-0 truncate text-caption text-ink-3">{meta}</span>
  </button>
}
const Quiet = ({ children }: { children: React.ReactNode }) => <p className="px-2.5 py-1.5 text-caption text-ink-3">{children}</p>
