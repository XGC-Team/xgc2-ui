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
import { ContextPanel } from '../projects/ContextPanel'
import { NoAgentNotice, ResearchDesk } from './ResearchDesk'
import { agentStartBlockedReason } from './agent-readiness'
import { DesignReviewDock } from '../workbench/DesignReviewDock'
import { writingCopy } from '../workbench/writing-copy'
import { nativeConnectFailureCopy, nativeInventoryWorker, nativeUnsignedHint } from './nativeSendGate'
export function ChatPage({projects,active=true}:{projects:Project[];active?:boolean}) {
  const s=useNativeAgentSession();const {activeNav,locale,projectId,enterWritingProject,pendingPersistenceError}=useWorkbench()
  const copy=writingCopy[locale]
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
    {intakeNote&&<p role="status" className="mx-auto mt-2 w-full max-w-[48rem] px-5 text-caption text-ink-3">{intakeNote}</p>}
    <div className="max-h-40 shrink-0 overflow-y-auto px-3"><IntakePanel compact scope={{projectId,workspace:projectId||'academic'}}/></div>
    <div className="max-h-52 shrink-0 overflow-y-auto"><ContextPanel/></div>
    <DesignReviewDock/>
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
        onSend={connected?s.send:s.startAndSend} onInterrupt={connected?s.interrupt:undefined}
        emptyState={projectId?<div className="grid h-full place-content-center px-6" data-xgc-role="writing-empty" data-xgc-id={projectId}>
          <div className="w-full max-w-xl">
            <h1 className="font-display text-display-sm leading-display tracking-tight">{copy.writingEmpty}</h1>
            <p className="mt-3 text-body text-ink-2">{copy.writingEmptyBody}</p>
            {startBlocked&&s.settings&&<NoAgentNotice/>}
          </div>
        </div>:<ResearchDesk projects={projects} onOpen={enterWritingProject} onStarter={s.setDraft}/>}
        composerControls={<AgentComposerControls identityId={s.selectedId||'new-thread'} locale={locale} providers={providers.map(p=>({...p,models:p.models.map(m=>({...m,efforts:m.efforts.map(e=>({...e,label:locale==='zh'?({low:'低',medium:'中',high:'高',xhigh:'极高',minimal:'最低',none:'关闭'}[e.id]||e.label):e.label}))}))}))} value={connected?s.turnSelection:{profileId:s.profileId,...s.createOptions}} disabled={s.busy||(connected&&!['ready','closed','disconnected'].includes(s.state.worker))}
          onChange={value=>{if(connected)s.setSelections(current=>({...current,[s.selectedId]:value}));else{s.setProfileId(value.profileId);s.setCreateOptions({model:value.model,effort:value.effort,permission:value.permission})}}}/>}/>:<p className="p-6 text-ink-3">{tr("正在读取对话…")}</p>}
    </div>
  </div>
}
