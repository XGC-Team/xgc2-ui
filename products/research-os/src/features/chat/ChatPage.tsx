import {ConnectionStatus} from './ConnectionStatus'
import {t as tr} from '../../i18n'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { NativeConversation, NativeComposerControls } from '@xgc2/native-agent/react'
import { emptyStream } from '@xgc2/native-agent/state'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
import { type Project } from '../../lib/api'
import { looksLikeUrl, normalizeWebUrl } from '../../lib/web'
import { ResearchWorkspace } from '../projects/ResearchWorkspace'
import { submitIntake } from '../projects/intake-queue'
import { IntakePanel } from '../projects/IntakePanel'
import { ContextPanel } from '../projects/ContextPanel'
import { ContinueWriting } from '../workbench/ContinueWriting'
import { DesignReviewDock } from '../workbench/DesignReviewDock'
import { writingCopy } from '../workbench/writing-copy'
const rise={hidden:{opacity:0,y:10},show:{opacity:1,y:0,transition:{duration:0.45,ease:[0.2,0.8,0.2,1]}}}
const SUGGESTIONS=["总结一篇论文的贡献与证据","对比两条技术路线","起草手稿的相关工作段落","审查我的数学推导"]
export function ChatPage({projects}:{projects:Project[]}) {
  const s=useNativeAgentSession();const {activeNav,locale,projectId,chatSurface,enterWritingProject}=useWorkbench()
  const copy=writingCopy[locale]
  const empty=useMemo(()=>emptyStream('',s.selectedProfile?.provider||'codex'),[s.selectedProfile?.provider])
  const connected=Boolean(s.session)
  const providers=connected?(s.currentProvider?[s.currentProvider]:[]):(s.settings?.providers.filter(p=>p.enabled)||[])
  const date=new Date().toLocaleDateString(locale==='zh'?'zh-CN':'en-US',{year:'numeric',month:'long',day:'numeric',weekday:'long'})
  const [dragging,setDragging]=useState(false),[intakeNote,setIntakeNote]=useState('')
  const onDrop=(e:React.DragEvent)=>{e.preventDefault();setDragging(false);setIntakeNote('')
    const files=[...e.dataTransfer.files]
    const text=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain')
    if(!files.length&&text&&looksLikeUrl(text)){try{s.appendDraft(`[${new URL(normalizeWebUrl(text)).host}](${normalizeWebUrl(text)})`,projectId)}catch{setIntakeNote(tr('地址无效。'))}return}
    const targetProject=projectId
    for(const file of files){
      void submitIntake(file,{projectId:targetProject,workspace:targetProject||'academic'}).then(receipt=>{
        if(receipt.state==='accepted')s.appendDraft(`${receipt.kind==='pdf'?tr('已归档论文 PDF'):locale==='zh'?'已保存项目材料':'Saved project material'}《${receipt.name}》${receipt.source?`\n${receipt.source.workspace}/${receipt.source.path}\n${receipt.source.digest}`:''}`,targetProject)
      }).catch(reason=>setIntakeNote(reason instanceof Error?reason.message:String(reason)))
    }
  }
  return <ResearchWorkspace projects={projects}>{conversationVisible=><div className="relative flex h-full min-h-0 flex-col"
    onDragOver={e=>{e.preventDefault();if(!dragging)setDragging(true)}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}}
    onDrop={onDrop}>
    <ConnectionStatus/>
    {intakeNote&&<p role="status" className="mx-auto mt-2 w-full max-w-[48rem] px-5 text-caption text-ink-3">{intakeNote}</p>}
    <div className="max-h-40 shrink-0 overflow-y-auto px-3"><IntakePanel compact scope={{projectId,workspace:projectId||'academic'}}/></div>
    <div className="max-h-52 shrink-0 overflow-y-auto"><ContextPanel/></div>
    <DesignReviewDock/>
    {dragging&&<div aria-hidden className="pointer-events-none absolute inset-3 z-40 grid place-content-center rounded-xl border border-dashed border-line-strong bg-app/80">
      <p className="font-display text-[18px] tracking-tight text-ink-2">{tr("松开投入材料")}</p>
      <p className="mt-1 text-center text-secondary text-ink-3">{locale==='zh'?'PDF 归档；文本保存到所选项目；链接进入草稿':'PDF archive; text to selected project; links to draft'}</p>
    </div>}
    <div className="native-chat-host min-h-0 flex-1">
      {!connected||s.streamMatchesSelection?<NativeConversation active={activeNav==='chat'&&conversationVisible} state={connected?s.state:empty} locale={locale} onAnswer={s.respond} draft={s.draft} onDraftChange={s.setDraft}
        disabled={s.busy} sendDisabled={s.busy||(connected?!['ready','closed','disconnected'].includes(s.state.worker)||Boolean(s.session?.archived)||Boolean(s.streamError):!s.profileId)}
        onSend={connected?s.send:s.startAndSend} onInterrupt={connected?s.interrupt:undefined}
        emptyState={projectId?<div className="grid h-full place-content-center px-6" data-xgc-role="writing-empty" data-xgc-id={projectId}>
          <div className="w-full max-w-xl">
            <h1 className="font-display text-[28px] leading-[1.15] tracking-tight">{copy.writingEmpty}</h1>
            <p className="mt-3 text-body text-ink-2">{copy.writingEmptyBody}</p>
          </div>
        </div>:chatSurface!=='generic'?<ContinueWriting projects={projects} onOpen={enterWritingProject}/>:<motion.div initial="hidden" animate="show" variants={{hidden:{},show:{transition:{staggerChildren:0.06,delayChildren:0.08}}}} className="grid h-full place-content-center px-6">
          <div className="w-full max-w-xl">
            <motion.div variants={rise} className="flex items-center gap-3">
              <span className="text-caption font-medium uppercase tracking-[0.14em] text-ink-3">{date}</span>
              <span aria-hidden className="h-px w-12 bg-line-strong"/>
            </motion.div>
            <motion.h1 variants={rise} className="mt-5 font-display text-[36px] leading-[1.15] tracking-tight">{tr("有什么想研究的？")}</motion.h1>
            <motion.p variants={rise} className="mt-3 text-body text-ink-2">{tr("对话、研读、写作与验证，从一个问题开始。")}</motion.p>
            <motion.div variants={rise} className="mt-9">
              {SUGGESTIONS.map((label,i)=><button key={label} type="button" onClick={()=>s.setDraft(tr(label))} className="group flex w-full items-baseline gap-4 rounded-md px-1 py-2.5 text-left transition-colors duration-150 hover:bg-hover">
                <span aria-hidden className="w-6 shrink-0 text-caption tabular-nums text-ink-3">{String(i+1).padStart(2,'0')}</span>
                <span className="min-w-0 flex-1 text-body text-ink-2 transition-colors duration-150 group-hover:text-ink">{tr(label)}</span>
                <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} className="shrink-0 self-center text-ink-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"/>
              </button>)}
            </motion.div>
          </div>
        </motion.div>}
        composerControls={<NativeComposerControls identityId={s.selectedId||'new-thread'} locale={locale} providers={providers.map(p=>({...p,models:p.models.map(m=>({...m,efforts:m.efforts.map(e=>({...e,label:locale==='zh'?({low:'低',medium:'中',high:'高',xhigh:'极高',minimal:'最低',none:'关闭'}[e.id]||e.label):e.label}))}))}))} value={connected?s.turnSelection:{profileId:s.profileId,...s.createOptions}} disabled={s.busy||(connected&&!['ready','closed','disconnected'].includes(s.state.worker))}
          onChange={value=>{if(connected)s.setSelections(current=>({...current,[s.selectedId]:value}));else{s.setProfileId(value.profileId);s.setCreateOptions({model:value.model,effort:value.effort,permission:value.permission})}}}/>}/>:<p className="p-6 text-ink-3">{tr("正在读取对话…")}</p>}
    </div>
  </div>}</ResearchWorkspace>
}
