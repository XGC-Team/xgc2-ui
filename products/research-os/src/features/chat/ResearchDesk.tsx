import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { t as tr } from '../../i18n'
import { writingCopy } from '../workbench/writing-copy'
import { readRecentProjects } from '../workbench/writing-session'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import '../workbench/writing-workbench.css'

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }
const STARTERS = ['总结一篇论文的贡献与证据', '对比两条技术路线', '起草手稿的相关工作段落', '审查我的数学推导']

function Rule({ children }: { children: string }) {
  return <div className="mb-2 flex items-center gap-3"><h2 className="shrink-0 text-caption font-medium uppercase tracking-[0.08em] text-ink-3">{children}</h2><span aria-hidden className="h-px flex-1 bg-line"/></div>
}

/* 注：本页渲染在 .native-chat-host 内，共享 T3 样式把 --accent 重定义为淡色，实底 solid 钮会发白——这里只用 outline/ghost。 */
/** 研究台扉页：Agent 原生的起点——问题、可用的原生 Agent、要绑定的项目，三者同屏。
    无项目 = 通用对话；选项目 = 讨论绑定该仓库工作树。名册只陈述宿主报告的状态。 */
export function ResearchDesk({ projects, onOpen, onStarter }: { projects: Project[]; onOpen: (id: string) => void; onStarter: (text: string) => void }) {
  const { locale, openChat, chatSurface } = useWorkbench()
  const copy = writingCopy[locale], zh = locale === 'zh'
  const recentIds = readRecentProjects().filter(id => projects.some(project => project.id === id))
  const recent = recentIds.map(id => projects.find(project => project.id === id)!)
  const rest = projects.filter(project => !recentIds.includes(project.id))
  const last = recent[0]
  const date = new Date().toLocaleDateString(zh ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  return <motion.div className="h-full overflow-y-auto px-6" data-xgc-role="research-desk" data-xgc-id="research-desk" initial="hidden" animate="show" variants={stagger}>
    <div className="mx-auto w-full max-w-2xl pb-10 pt-[6vh]">
      <motion.div variants={rise} className="flex items-center gap-3">
        <span className="text-caption font-medium uppercase tracking-[0.14em] text-ink-3">{date}</span>
        <span aria-hidden className="h-px w-12 bg-line-strong"/>
      </motion.div>
      <motion.h1 variants={rise} className="mt-5 font-display text-display-lg leading-display tracking-tight">{tr('有什么想研究的？')}</motion.h1>
      <motion.p variants={rise} className="mt-3 text-body text-ink-2">{chatSurface === 'generic'
        ? (zh ? '通用对话：不绑定项目，Agent 只看到你显式加入的上下文。' : 'General chat: no project bound; the agent only sees context you add explicitly.')
        : (zh ? '把问题交给原生 Agent，或先选一个项目，让讨论绑定它的工作树。' : 'Hand a question to a native agent, or pick a project so the discussion binds to its working tree.')}</motion.p>
      <motion.div variants={rise} className="mt-7">
        {STARTERS.map((label, i) => <button key={label} type="button" onClick={() => onStarter(tr(label))} className="group flex w-full items-baseline gap-4 rounded-md px-1 py-2.5 text-left transition-colors duration-150 hover:bg-hover">
          <span aria-hidden className="w-6 shrink-0 text-caption tabular-nums text-ink-3">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 text-body text-ink-2 transition-colors duration-150 group-hover:text-ink">{tr(label)}</span>
          <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 self-center text-ink-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"/>
        </button>)}
      </motion.div>
      <motion.section variants={rise} aria-label={copy.allProjects} className="mt-10 flex flex-col">
        <Rule>{zh ? '项目' : 'Projects'}</Rule>
        <div className="writing-home__list !mt-0">
          {[...recent, ...rest].map(project => <button key={project.id} type="button" data-xgc-role={recent.includes(project) ? (project === last ? 'resume-last-project' : 'recent-project') : 'all-project'} data-xgc-id={project.id} onClick={() => onOpen(project.id)}
            className="group flex w-full items-baseline gap-3 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-hover">
            <span className="min-w-0 flex-1 truncate text-body text-ink-2 group-hover:text-ink">{project.title}</span>
            {project === last && <span className="shrink-0 text-caption text-ink-3">{zh ? '上次' : 'last'}</span>}
          </button>)}
        </div>
        {!projects.length && <p className="px-1 text-secondary text-ink-3">{zh ? '还没有研究项目，在左栏「项目」旁新建。' : 'No research projects yet; create one next to Projects in the sidebar.'}</p>}
        {chatSurface !== 'generic' && <button type="button" className="mt-2 self-start px-1 text-caption text-ink-3 transition-colors hover:text-ink-2" data-xgc-role="generic-chat" data-xgc-id="generic-chat" onClick={openChat}>{copy.genericChat}</button>}
      </motion.section>
    </div>
  </motion.div>
}
