import {ConnectionStatus} from './ConnectionStatus'
import {t as tr} from '../../i18n'
import { useMemo } from 'react'
import { NativeConversation, NativeComposerControls } from '@xgc2/native-agent/react'
import { emptyStream } from '@xgc2/native-agent/state'
import { useNativeAgentSession } from './Session'
import { useWorkbench } from '../../store'
export function ChatPage() {
  const s=useNativeAgentSession();const {activeNav,locale}=useWorkbench()
  const empty=useMemo(()=>emptyStream('',s.selectedProfile?.provider||'codex'),[s.selectedProfile?.provider])
  const connected=Boolean(s.session)
  const providers=connected?(s.currentProvider?[s.currentProvider]:[]):(s.settings?.providers.filter(p=>p.enabled)||[])
  return <div className="flex h-full min-h-0 flex-col bg-panel">
    <ConnectionStatus/>
    <div className="native-chat-host min-h-0 flex-1">
      {!connected||s.streamMatchesSelection?<NativeConversation active={activeNav==='chat'} state={connected?s.state:empty} locale={locale} onAnswer={s.respond} draft={s.draft} onDraftChange={s.setDraft}
        disabled={s.busy} sendDisabled={s.busy||(connected?!['ready','closed','disconnected'].includes(s.state.worker)||Boolean(s.session?.archived)||Boolean(s.streamError):!s.profileId)}
        onSend={connected?s.send:s.startAndSend} onInterrupt={connected?s.interrupt:undefined}
        emptyState={<div className="grid h-full place-content-center px-6 text-center"><h1 className="text-xl font-semibold">{tr("有什么想研究的？")}</h1></div>}
        composerControls={<NativeComposerControls identityId={s.selectedId||'new-thread'} locale={locale} providers={providers.map(p=>({...p,models:p.models.map(m=>({...m,efforts:m.efforts.map(e=>({...e,label:locale==='zh'?({low:'低',medium:'中',high:'高',xhigh:'极高',minimal:'最低',none:'关闭'}[e.id]||e.label):e.label}))}))}))} value={connected?s.turnSelection:{profileId:s.profileId,...s.createOptions}} disabled={s.busy||(connected&&!['ready','closed','disconnected'].includes(s.state.worker))}
          onChange={value=>{if(connected)s.setSelections(current=>({...current,[s.selectedId]:value}));else{s.setProfileId(value.profileId);s.setCreateOptions({model:value.model,effort:value.effort,permission:value.permission})}}}/>}/>:<p className="p-6 text-ink-3">{tr("正在读取对话…")}</p>}
    </div>
  </div>
}
