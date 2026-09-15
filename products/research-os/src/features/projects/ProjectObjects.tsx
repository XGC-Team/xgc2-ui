import { FileText, Folder } from 'lucide-react'
import { IconCanvas, IconKnowledge, IconWorkflow } from '../../components/icons'
import type { Project } from '../../lib/api'
import { useWorkbench } from '../../store'
import { fileTarget, type ProjectFileView } from './project-object-model'
import { projectObjectCopy } from './project-object-copy'

/** Reuse existing work surfaces; these actions neither create threads nor execute workflows. */
export function ProjectObjects({ project }: { project: Project }) {
  const { locale, setProjectId, setActiveNav, openCanvas, openRightTab, closeSourceView } = useWorkbench()
  const copy = projectObjectCopy[locale]
  // App's existing project loader maps each paper repository to a project record.
  // Keep that compatibility mapping here, not in an already-open tab's render path.
  const workspace = project.id
  const select = () => { setProjectId(project.id); closeSourceView() }
  const openFiles = (view: ProjectFileView) => { select(); openRightTab({ kind: 'file', target: fileTarget(project.id, workspace, view) }) }
  const actions = [
    { id: 'files', label: copy.files, icon: Folder, open: () => openFiles('files') },
    { id: 'notes', label: copy.notes, icon: IconKnowledge, open: () => openFiles('notes') },
    { id: 'canvas', label: copy.canvas, icon: IconCanvas, open: () => { select(); openCanvas(project.id) } },
    { id: 'workflow', label: copy.workflow, icon: IconWorkflow, open: () => { select(); setActiveNav('workflow') } },
    { id: 'builds', label: copy.builds, icon: FileText, open: () => openFiles('builds') },
  ]
  return <nav aria-label={`${copy.objects} · ${project.title}`} className="ml-[18px] border-l border-line py-1 pl-1.5">
    {actions.map(action => <button key={action.id} type="button" data-project-object={action.id}
      className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-secondary text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
      onClick={action.open}>
      <action.icon size={13} strokeWidth={1.75} className="shrink-0 text-ink-3"/>
      <span className="truncate">{action.label}</span>
    </button>)}
  </nav>
}
