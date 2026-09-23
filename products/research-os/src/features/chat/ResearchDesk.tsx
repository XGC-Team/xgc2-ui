import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { t as tr } from '../../i18n'
import { writingCopy } from '../workbench/writing-copy'
import { readRecentProjects } from '../workbench/writing-session'
import { Button } from '../../components/ui'
import { useWorkbench } from '../../store'
import type { Project } from '../../lib/api'
import { AgentRoster, useAgentRoster } from './AgentRoster'
import '../workbench/writing-workbench.css'

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }
const STARTERS = ['总结一篇论文的贡献与证据', '对比两条技术路线', '起草手稿的相关工作段落', '审查我的数学推导']

function Rule({ children }: { children: string }) {
  return <div className="mb-2 flex items-center gap-3"><h2 className="shrink-0 text-caption font-medium uppercase tracking-[0.08em] text-ink-3">{children}</h2><span aria-hidden className="h-px flex-1 bg-line"/></div>
}

/** Shown wherever a thread could start but no native agent can take it; the send button alone is not an explanation. */
export function NoAgentNotice({ className = 'mt-6' }: { className?: string }) {
  const { locale, openSettings } = useWorkbench()
  const zh = locale === 'zh'
  return <div role="status" data-xgc-role="no-agent-notice" className={`${className} flex flex-wrap items-center gap-3 rounded-lg border border-line bg-elevated px-4 py-3 shadow-soft`}>
    <p className="min-w-0 flex-1 text-secondary text-ink-2">{zh ? '还没有可用的原生 Agent，消息不会发出。启用一个已安装的客户端后即可开始。' : 'No native agent is available yet, so messages will not be sent. Enable an installed client to begin.'}</p>
    <Button size="sm" variant="outline" onClick={() => openSettings('connections')}>{zh ? '连接与模型' : 'Connections & models'}</Button>
  </div>
}

/* 注：本页渲染在 .native-chat-host 内，共享 T3 样式把 --accent 重定义为淡色，实底 solid 钮会发白——这里只用 outline/ghost。 */
/** 研究台扉页：Agent 原生的起点——问题、可用的原生 Agent、要绑定的项目，三者同屏。
    无项目 = 通用对话；选项目 = 讨论绑定该仓库工作树。名册只陈述宿主报告的状态。 */
export function ResearchDesk({ projects, onOpen, onStarter }: { projects: Project[]; onOpen: (id: string) => void; onStarter: (text: string) => void }) {
  const { locale, openChat, chatSurface } = useWorkbench()
  const { summary, loading } = useAgentRoster()
  const copy = writingCopy[locale], zh = locale === 'zh'
  const recentIds = readRecentProjects().filter(id => projects.some(project => project.id === id))
  const recent = recentIds.map(id => projects.find(project => project.id === id)!)
  const rest = projects.filter(project => !recentIds.includes(project.id))
  const last = recent[0]
  const date = new Date().toLocaleDateString(zh ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const noAgent = !loading && summary.usable === 0
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
      {noAgent && <motion.div variants={rise}><NoAgentNotice/></motion.div>}
      <motion.div variants={rise} className="mt-7">
        {STARTERS.map((label, i) => <button key={label} type="button" onClick={() => onStarter(tr(label))} className="group flex w-full items-baseline gap-4 rounded-md px-1 py-2.5 text-left transition-colors duration-150 hover:bg-hover">
          <span aria-hidden className="w-6 shrink-0 text-caption tabular-nums text-ink-3">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 text-body text-ink-2 transition-colors duration-150 group-hover:text-ink">{tr(label)}</span>
          <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 self-center text-ink-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"/>
        </button>)}
      </motion.div>
      <div className="mt-9 grid gap-10 sm:grid-cols-2">
        <motion.section variants={rise} aria-label={zh ? '原生 Agent' : 'Native agents'}>
          <Rule>{zh ? '原生 Agent' : 'Native agents'}</Rule>
          <AgentRoster className="-mx-2"/>
        </motion.section>
        <motion.section variants={rise} aria-label={copy.allProjects} className="flex flex-col">
          <Rule>{zh ? '项目' : 'Projects'}</Rule>
          {last && <Button className="mb-2 self-start" variant="outline" size="sm" data-xgc-role="resume-last-project" data-xgc-id={last.id} onClick={() => onOpen(last.id)}>{copy.openLast} · {last.title}</Button>}
          <div className="writing-home__list !mt-0">
            {recent.map(project => <Button key={project.id} size="sm" variant="ghost" data-xgc-role="recent-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
            {rest.map(project => <Button key={project.id} size="sm" variant="ghost" data-xgc-role="all-project" data-xgc-id={project.id} onClick={() => onOpen(project.id)}>{project.title}</Button>)}
          </div>
          {!projects.length && <p className="px-2 text-secondary text-ink-3">{zh ? '还没有研究项目。在左栏「项目」旁新建。' : 'No research projects yet. Create one next to Projects in the sidebar.'}</p>}
          {chatSurface !== 'generic' && <button type="button" className="mt-3 self-start px-2 text-caption text-ink-3 transition-colors hover:text-ink-2" data-xgc-role="generic-chat" data-xgc-id="generic-chat" onClick={openChat}>{copy.genericChat}</button>}
        </motion.section>
      </div>
    </div>
  </motion.div>
}
