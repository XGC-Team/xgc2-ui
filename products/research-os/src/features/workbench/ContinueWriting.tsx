import { writingCopy } from './writing-copy'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import { readRecentProjects } from './writing-session'
import './writing-workbench.css'

export function ContinueWriting({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const { locale, openChat } = useWorkbench()
  const copy = writingCopy[locale]
  const recentIds = readRecentProjects().filter(id => projects.some(project => project.id === id))
  const recent = recentIds.map(id => projects.find(project => project.id === id)! )
  const rest = projects.filter(project => !recentIds.includes(project.id))
  const last = recent[0]
  return <div className="writing-home" data-xgc-role="continue-writing" data-xgc-id="continue-writing">
    <div className="w-full max-w-xl">
      <h1 className="font-display text-display-sm leading-display tracking-tight">{copy.continueTitle}</h1>
      <p className="mt-3 text-body text-ink-2">{copy.continueBody}</p>
      {last && <div className="mt-6"><Button variant="solid" data-xgc-role="resume-last-project" data-xgc-id={last.id} onClick={() => onOpen(last.id)}>{copy.openLast} · {last.title}</Button></div>}
      {recent.length > 0 && <section className="writing-home__list" aria-label={copy.recent}>
        <p className="text-caption text-ink-3">{copy.recent}</p>
        {recent.map(project => <Button key={project.id} data-xgc-role="recent-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
      </section>}
      <section className="writing-home__list" aria-label={copy.allProjects}>
        <p className="text-caption text-ink-3">{copy.allProjects}</p>
        {rest.map(project => <Button key={project.id} data-xgc-role="all-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
        {!projects.length && <p className="text-secondary text-ink-3">{copy.noProjects}</p>}
      </section>
      <div className="mt-8"><Button data-xgc-role="generic-chat" data-xgc-id="generic-chat" onClick={openChat}>{copy.genericChat}</Button></div>
    </div>
  </div>
}
