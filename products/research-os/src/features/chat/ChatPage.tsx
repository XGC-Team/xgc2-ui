import {ConnectionStatus} from './ConnectionStatus'
import {t as tr} from '../../i18n'
import { useMemo, useState } from 'react'
import { AgentConversation, AgentComposerControls } from '@xgc2/agent-runtime/react'
import { emptyStream } from '@xgc2/agent-runtime/state'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
import { type Project } from '../../lib/api'
import { looksLikeUrl, normalizeWebUrl } from '../../lib/web'
import { submitIntake } from '../projects/intake-queue'
import { IntakePanel } from '../projects/IntakePanel'
import { ResearchDesk } from './ResearchDesk'
import { ContextTray } from './ContextTray'
import { agentStartBlockedReason } from './agent-readiness'
import { DesignReviewDock } from '../workbench/DesignReviewDock'
import { withThreadBrief } from '../revision/revision-model'
import { nativeConnectFailureCopy, nativeInventoryWorker, nativeUnsignedHint } from './nativeSendGate'
export function ChatPage({projects,active=true}:{projects:Project[];active?:boolean}) {
  const s=useNativeAgentSession();const {activeNav,locale,projectId,enterWritingProject,pendingPersistenceError,threadBriefs,setThreadBrief}=useWorkbench()
  const empty=useMemo(()=>emptyStream('',s.selectedProfile?.provider||'codex'),[s.selectedProfile?.provider])
  const connected=Boolean(s.session)
  const providers=connected?(s.currentProvider?[s.currentProvider]:[]):(s.settings?.providers.filter(p=>p.enabled)||[])
  const [dragging,setDragging]=useState(false),[intakeNote,setIntakeNote]=useState('')
  const provider=connected?s.currentProvider:s.connectionProvider
  // Before a thread exists, an empty roster is an explicit block with a reason, never a silent grey send button.
  const startBlocked=connected?'':agentStartBlockedReason(s.settings,locale,s.settingsError)
  const worker=nativeInventoryWorker(s.session?.state,s.state.worker)
  const connectError=nativeConnectFailureCopy({
    locale, login:provider?.login, notices:s.state.notices, worker, attempted:connected, provider:provider?.provider,
  })
  // A thread brief (e.g. the revision contract) travels with the first message and is then detached.
  const brief=threadBriefs[projectId]
  const sendWithBrief=async(text:string)=>{await (connected?s.send:s.startAndSend)(withThreadBrief(brief?.text,text));if(brief)setThreadBrief(projectId,null)}
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
  return <div className="relative flex h-full min-h-0 flex-col"
    onDragOver={e=>{e.preventDefault();if(!dragging)setDragging(true)}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}}
    onDrop={onDrop}>
    <ConnectionStatus/>
    {pendingPersistenceError&&<p role="alert" className="ui-error">{pendingPersistenceError}</p>}
    {/* 浮层区：投入回执与设计审阅浮在对话顶部，不参与列内布局——输入框的高度永远只属于输入框 */}
    <div className="pointer-events-none absolute inset-x-3 top-2 z-30 flex max-h-[62%] flex-col gap-2" data-xgc-role="chat-overlays">
      {intakeNote&&<p role="status" className="pointer-events-auto self-center rounded-md border border-line bg-panel px-2 py-1 text-caption text-ink-3 shadow-soft">{intakeNote}</p>}
      <div className="pointer-events-auto max-h-40 shrink-0 overflow-y-auto empty:hidden"><IntakePanel compact scope={{projectId,workspace:projectId||'academic'}}/></div>
      <DesignReviewDock/>
    </div>
    {dragging&&<div aria-hidden className="pointer-events-none absolute inset-3 z-40 grid place-content-center rounded-xl border border-dashed border-line-strong bg-app/80">
      <p className="font-display text-[18px] tracking-tight text-ink-2">{tr("松开投入材料")}</p>
      <p className="mt-1 text-center text-secondary text-ink-3">{locale==='zh'?'PDF 归档；文本保存到所选项目；链接进入草稿':'PDF archive; text to selected project; links to draft'}</p>
    </div>}
    <div className="native-chat-host min-h-0 flex-1">
      {!connected||s.streamMatchesSelection?<AgentConversation active={activeNav==='chat'&&active} state={connected?s.state:empty} locale={locale} onAnswer={s.respond} draft={s.draft} onDraftChange={s.setDraft}
        disabled={s.busy} clearDraftOnSend={false}
        sendDisabled={s.busy||Boolean(startBlocked)||(connected?!['ready','closed','disconnected'].includes(worker||'')||Boolean(s.session?.archived)||Boolean(s.streamError):!s.profileId)}
        sendDisabledReason={startBlocked||nativeUnsignedHint(locale,provider?.login,provider?.provider)||undefined}
        error={s.error||connectError}
        onSend={sendWithBrief} onInterrupt={connected?s.interrupt:undefined}
        emptyState={projectId?<div className="grid h-full place-content-center px-6" data-xgc-role="writing-empty" data-xgc-id={projectId}>
          <div className="w-full max-w-xl">
            {/* 项目空态：项目名 + 一句话；从哪里开始一眼可知（输入框 + 上方的上下文托盘） */}
            <p className="text-caption font-medium uppercase tracking-[0.14em] text-ink-3">{locale==='zh'?'项目讨论':'Project discussion'}</p>
            <h1 className="mt-3 font-display text-display-sm leading-display tracking-tight">{projects.find(p=>p.id===projectId)?.title||projectId}</h1>
            <p className="mt-3 text-body text-ink-2">{locale==='zh'?'在这里让 Agent 讨论、提议与修改；把画布卡片、PDF 批注或笔记附到输入框上方。':'Discuss, propose and revise with the agent here; attach canvas cards, PDF annotations or notes above the composer.'}</p>
          </div>
        </div>:<ResearchDesk projects={projects} onOpen={enterWritingProject} onStarter={s.setDraft}/>}
        dock={<ContextTray/>}
        composerControls={<AgentComposerControls identityId={s.selectedId||'new-thread'} locale={locale} providers={providers.map(p=>({...p,models:p.models.map(m=>({...m,efforts:m.efforts.map(e=>({...e,label:locale==='zh'?({low:'低',medium:'中',high:'高',xhigh:'极高',minimal:'最低',none:'关闭'}[e.id]||e.label):e.label}))}))}))} value={connected?s.turnSelection:{profileId:s.profileId,...s.createOptions}} disabled={s.busy||(connected&&!['ready','closed','disconnected'].includes(s.state.worker))}
          onChange={value=>{if(connected)s.setSelections(current=>({...current,[s.selectedId]:value}));else{s.setProfileId(value.profileId);s.setCreateOptions({model:value.model,effort:value.effort,permission:value.permission})}}}/>}/>:<p className="p-6 text-ink-3">{tr("正在读取对话…")}</p>}
    </div>
  </div>
}
