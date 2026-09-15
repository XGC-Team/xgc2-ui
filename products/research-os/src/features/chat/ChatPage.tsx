import {ConnectionStatus} from './ConnectionStatus'
import {t as tr} from '../../i18n'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { NativeConversation, NativeComposerControls } from '@xgc2/native-agent/react'
import { emptyStream } from '@xgc2/native-agent/state'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
import { intakePDF, type Project } from '../../lib/api'
import { looksLikeUrl, normalizeWebUrl } from '../../lib/web'
import { ThinkingCanvas } from '../projects/ThinkingCanvas'
import { IconBtn } from '../../components/ui'
/* 空态 = 书刊扉页：日期刊头 + 衬线问候 + 编号起手式目录，逐行 stagger 入场 */
const rise={hidden:{opacity:0,y:10},show:{opacity:1,y:0,transition:{duration:0.45,ease:[0.2,0.8,0.2,1]}}}
const SUGGESTIONS=["总结一篇论文的贡献与证据","对比两条技术路线","起草手稿的相关工作段落","审查我的数学推导"]
export function ChatPage({projects}:{projects:Project[]}) {
  const s=useNativeAgentSession();const {activeNav,locale,canvasProject,closeCanvas}=useWorkbench()
  const empty=useMemo(()=>emptyStream('',s.selectedProfile?.provider||'codex'),[s.selectedProfile?.provider])
  const connected=Boolean(s.session)
  const providers=connected?(s.currentProvider?[s.currentProvider]:[]):(s.settings?.providers.filter(p=>p.enabled)||[])
  const date=new Date().toLocaleDateString(locale==='zh'?'zh-CN':'en-US',{year:'numeric',month:'long',day:'numeric',weekday:'long'})
  /* 材料投入口：拖入论文 PDF 走 intake 归档管线，拖入链接进草稿；其余类型如实提示 */
  const [dragging,setDragging]=useState(false),[intakeNote,setIntakeNote]=useState('')
  const onDrop=(e:React.DragEvent)=>{e.preventDefault();setDragging(false);setIntakeNote('')
    const files=[...e.dataTransfer.files]
    const text=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain')
    if(!files.length&&text&&looksLikeUrl(text)){try{s.appendDraft(`[${new URL(normalizeWebUrl(text)).host}](${normalizeWebUrl(text)})`)}catch{setIntakeNote(tr('地址无效。'))}return}
    if(!files.length)return
    for(const file of files){
      if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
        const title=file.name.replace(/\.pdf$/i,'')
        setIntakeNote(tr('正在归档')+`《${title}》…`)
        void intakePDF(file,title).then(()=>{s.appendDraft(tr('已归档论文 PDF')+`《${title}》`);setIntakeNote('')}).catch(err=>setIntakeNote(err instanceof Error?err.message:String(err)))
      }else setIntakeNote(tr('暂支持论文 PDF 与链接；图片、视频归档在路上。'))
    }}
  /* 思维白板模式：项目作用域的画布占据主区，入口在侧栏项目行 */
  if(canvasProject)return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
      <IconBtn icon={ArrowLeft} label={tr("返回对话")} onClick={closeCanvas}/>
      <span className="text-body font-medium text-ink">{projects.find(p=>p.id===canvasProject)?.title??canvasProject}</span>
      <span className="text-caption text-ink-3">{tr("思维白板")}</span>
    </div>
    <div className="min-h-0 flex-1"><ThinkingCanvas project={canvasProject}/></div>
  </div>
  return <div className="relative flex h-full min-h-0 flex-col"
    onDragOver={e=>{e.preventDefault();if(!dragging)setDragging(true)}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}}
    onDrop={onDrop}>
    <ConnectionStatus/>
    {intakeNote&&<p role="status" className="mx-auto mt-2 w-full max-w-[48rem] px-5 text-caption text-ink-3">{intakeNote}</p>}
    {dragging&&<div aria-hidden className="pointer-events-none absolute inset-3 z-40 grid place-content-center rounded-xl border border-dashed border-line-strong bg-app/80">
      <p className="font-display text-[18px] tracking-tight text-ink-2">{tr("松开投入材料")}</p>
      <p className="mt-1 text-center text-secondary text-ink-3">{tr("论文 PDF 归档入库，链接进入草稿")}</p>
    </div>}
    <div className="native-chat-host min-h-0 flex-1">
      {!connected||s.streamMatchesSelection?<NativeConversation active={activeNav==='chat'} state={connected?s.state:empty} locale={locale} onAnswer={s.respond} draft={s.draft} onDraftChange={s.setDraft}
        disabled={s.busy} sendDisabled={s.busy||(connected?!['ready','closed','disconnected'].includes(s.state.worker)||Boolean(s.session?.archived)||Boolean(s.streamError):!s.profileId)}
        onSend={connected?s.send:s.startAndSend} onInterrupt={connected?s.interrupt:undefined}
        emptyState={<motion.div initial="hidden" animate="show" variants={{hidden:{},show:{transition:{staggerChildren:0.06,delayChildren:0.08}}}} className="grid h-full place-content-center px-6">
          <div className="w-full max-w-xl">
            <motion.div variants={rise} className="flex items-center gap-3">
              <span className="text-caption font-medium uppercase tracking-[0.14em] text-ink-3">{date}</span>
              <span aria-hidden className="h-px w-12 bg-line-strong"/>
            </motion.div>
            <motion.h1 variants={rise} className="mt-5 font-display text-[36px] leading-[1.15] tracking-tight text-balance">{tr("有什么想研究的？")}</motion.h1>
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
  </div>
}
