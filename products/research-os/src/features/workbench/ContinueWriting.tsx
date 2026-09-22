import { motion } from 'framer-motion'
import { writingCopy } from './writing-copy'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import { readRecentProjects } from './writing-session'
import './writing-workbench.css'

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }

export function ContinueWriting({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const { locale, openChat } = useWorkbench()
  const copy = writingCopy[locale]
  const recentIds = readRecentProjects().filter(id => projects.some(project => project.id === id))
  const recent = recentIds.map(id => projects.find(project => project.id === id)!)
  const rest = projects.filter(project => !recentIds.includes(project.id))
  const last = recent[0]
  return <motion.div className="writing-home" data-xgc-role="continue-writing" data-xgc-id="continue-writing" initial="hidden" animate="show" variants={stagger}>
    <div className="w-full max-w-xl">
      <motion.h1 variants={rise} className="font-display text-display-sm leading-display tracking-tight">{copy.continueTitle}</motion.h1>
      <motion.p variants={rise} className="mt-3 text-body text-ink-2">{copy.continueBody}</motion.p>
      {last && <motion.div variants={rise} className="mt-6"><Button variant="solid" data-xgc-role="resume-last-project" data-xgc-id={last.id} onClick={() => onOpen(last.id)}>{copy.openLast} · {last.title}</Button></motion.div>}
      {recent.length > 0 && <motion.section variants={rise} className="writing-home__list" aria-label={copy.recent}>
        <p className="text-caption text-ink-3">{copy.recent}</p>
        {recent.map(project => <Button key={project.id} data-xgc-role="recent-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
      </motion.section>}
      <motion.section variants={rise} className="writing-home__list" aria-label={copy.allProjects}>
        <p className="text-caption text-ink-3">{copy.allProjects}</p>
        {rest.map(project => <Button key={project.id} data-xgc-role="all-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
        {!projects.length && <p className="text-secondary text-ink-3">{copy.noProjects}</p>}
      </motion.section>
      <motion.div variants={rise} className="mt-8"><Button data-xgc-role="generic-chat" data-xgc-id="generic-chat" onClick={openChat}>{copy.genericChat}</Button></motion.div>
    </div>
  </motion.div>
}
