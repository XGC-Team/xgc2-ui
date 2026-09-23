import { draftCopy } from './draft-copy'
import { FileText, Folder } from 'lucide-react'
import { IconCanvas, IconKnowledge, IconWorkflow } from '../../components/icons'
import type { Project } from '../../lib/api'
import { useWorkbench } from '../../store'
import { fileTarget, type ProjectFileView } from './project-object-model'
import { projectObjectCopy } from './project-object-copy'

/** Reuse existing work surfaces; these actions neither create threads nor execute workflows. */
export function ProjectObjects({ project }: { project: Project }) {
  const { locale, setActiveNav, enterWritingProject, setReviewDockOpen, openCanvas, openResource, selectResearchDraft } = useWorkbench()
  const copy = projectObjectCopy[locale]
  // App's existing project loader maps each paper repository to a project record.
  // Keep that compatibility mapping here, not in an already-open tab's render path.
  const workspace = project.id
  const select = () => { enterWritingProject(project.id) }
  const openFiles = (view: ProjectFileView) => { select(); openResource({ kind: 'file', target: fileTarget(project.id, workspace, view) }) }
  const actions = [
    { id: 'reviews', label: locale === 'zh' ? '设计审阅' : 'Design review', icon: FileText, open: () => { select(); setReviewDockOpen(true) } },
    { id: 'files', label: copy.files, icon: Folder, open: () => openFiles('files') },
    { id: 'notes', label: locale === 'zh' ? '来源笔记' : 'Source notes', icon: IconKnowledge, open: () => { select(); selectResearchDraft({ projectId: project.id, workspace }, '', 'note') } },
    { id: 'markdown', label: copy.notes, icon: IconKnowledge, open: () => openFiles('notes') },
    { id: 'canvas', label: copy.canvas, icon: IconCanvas, open: () => { select(); openCanvas(project.id) } },
    { id: 'workflow', label: copy.workflow, icon: IconWorkflow, open: () => { select(); setActiveNav('workflow') } },
    { id: 'drafts', label: draftCopy[locale].title, icon: IconCanvas, open: () => { select(); selectResearchDraft({ projectId: project.id, workspace }, '') } },
    { id: 'builds', label: copy.builds, icon: FileText, open: () => openFiles('builds') },
  ]
  return <nav data-project-objects={project.id} aria-label={`${copy.objects} · ${project.title}`} className="ml-sidebar-indent border-l border-line py-1 pl-1.5">
    {actions.map(action => <button key={action.id} type="button" data-project-object={action.id}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-secondary text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
      onClick={action.open}>
      <action.icon size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>
      <span className="truncate">{action.label}</span>
    </button>)}
  </nav>
}
