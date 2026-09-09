import { useEffect,useRef,useState,type ReactNode } from 'react';
import { NativeConversation,NativeComposerControls,NativePromptQueue } from '@xgc2/native-agent/react';
import '@xgc2/native-agent/styles.css';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { GroundStationActivityChat,type GroundStationActivityChatProps } from './GroundStationActivityChat';
import { useGroundStationNativeAgentRegistry,useGroundStationNativeStreamFocus,type GroundStationNativeBinding } from './GroundStationNativeAgentProvider';
import { useGroundStationNativeConnection } from './useGroundStationNativeConnection';
import { useGroundStationNativeConversation } from './useGroundStationNativeConversation';
import { useGroundStationActivityScope } from './groundStationActivityScope';
import { useGroundStationRemoteMessages,remoteMessagesForConversation,remoteConversationScope } from './groundStationRemoteMessages';
import { GroundStationRemoteDock } from './GroundStationRemoteDock';
import { GroundStationConversationManager } from './GroundStationConversationManager';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import { useGroundStationVisibleReceipts } from './useGroundStationVisibleReceipts';
import { useGroundStationPromptQueue } from './useGroundStationPromptQueue';
import './GroundStationNativeActivityChat.css';

export function GroundStationNativeActivityChat({ experimentId,workspaceId,...props }: GroundStationActivityChatProps & { experimentId: string; workspaceId?:string }) {
  const registry = useGroundStationNativeAgentRegistry();
  const binding = registry?.bindings.find((item) => item.experimentId === experimentId && item.sessionId === registry.selected[experimentId]);
  if (!registry || props.targetId !== 'local') return <GroundStationActivityChat {...props} />;
  const decisions = props.decisions.filter(item => !item.payload.decision.agentAction
    || item.payload.decision.agentAction.conversationId === binding?.sessionId);
  return <GroundStationActivityChat {...props} decisions={decisions} renderConversation={(entries) => <NativeExperimentConversation
    experimentId={experimentId} workspaceId={workspaceId} binding={binding} entries={entries} chat={props}
  />} />;
}

function NativeExperimentConversation({ experimentId,workspaceId,binding,entries,chat }: {
  experimentId: string;
  workspaceId?:string;
  binding?: GroundStationNativeBinding;
  entries: ReadonlyArray<{ id: string; at: string; content: ReactNode }>;
  chat: GroundStationActivityChatProps;
}) {
  const language = useAppLanguage();
  const allRemoteMessages = useGroundStationRemoteMessages(experimentId);
  const registry = useGroundStationNativeAgentRegistry();
  const remoteScope = remoteConversationScope(experimentId,registry?.selected[experimentId]);
  const remoteMessages = remoteMessagesForConversation(allRemoteMessages,remoteScope);
  const activity = useGroundStationActivityScope();
  const feedRef = useRef<HTMLElement>(null);
  const previousRemoteCount = useRef(remoteMessages.length);
  useEffect(() => {
    const added = remoteMessages.length > previousRemoteCount.current;
    previousRemoteCount.current = remoteMessages.length;
    if (!added) return;
    // Opening a controller is an explicit request to interact with the newest message.
    const frame = requestAnimationFrame(() => {
      let node = feedRef.current?.querySelector('[data-xgc-role="native-agent-item"]')?.parentElement;
      while (node && node !== feedRef.current) {
        if (/auto|scroll/.test(getComputedStyle(node).overflowY)) {
          node.scrollTop = node.scrollHeight;
          break;
        }
        node = node.parentElement;
      }
    });
    return () => cancelAnimationFrame(frame);
  },[remoteMessages.length]);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const draftId = binding?.sessionId ?? `new:${experimentId}`;
  const keepComposerFocus=useRef(false);
  useEffect(()=>{
    if(!keepComposerFocus.current)return;
    const frame=requestAnimationFrame(()=>{if(document.activeElement===document.body)feedRef.current?.querySelector<HTMLElement>('[data-xgc-role="native-agent-composer-input-editor"]')?.focus();keepComposerFocus.current=false});
    return ()=>cancelAnimationFrame(frame);
  },[draftId]);
  const [sendError,setSendError] = useState<{sessionId:string; message:string}>();
  const connection = useGroundStationNativeConnection(experimentId,binding,workspaceId);
  const conversation = useGroundStationNativeConversation(experimentId,binding,connection.options);
  const promptQueue=useGroundStationPromptQueue(experimentId,draftId,conversation.state.queue,connection.options,connection.prepareQueueSession);
  const active = chat.enabled && activity.visible;
  useGroundStationNativeStreamFocus(experimentId,active);
  useGroundStationVisibleReceipts(feedRef,[...chat.decisions,...chat.statuses,...chat.contexts],active,chat.targetId);
  if (!chat.enabled || !conversation.available) return null;
  return <aside ref={feedRef} className="xgc-ground-station-chat-panel ground-station-native-chat"
    data-xgc-role="ground-station-chat-panel" data-xgc-id={chat.targetId} data-xgc-presentation="panel"
    aria-label={language === 'zh-CN' ? '地面站对话' : 'Ground station conversation'}
    onKeyDownCapture={suppressChatArrowKey}>
    <GroundStationConversationManager experimentId={experimentId} binding={binding} connection={connection} active={active} />
    <NativeConversation state={conversation.state} active={active} locale={language === 'zh-CN' ? 'zh' : 'en'}
      disabled={conversation.disabled && binding?.session?.state !== 'disconnected' && binding?.session?.state !== 'closed'}
      emptyState={null}
      draft={drafts[draftId] ?? ''}
      onDraftChange={value => {setDrafts(current => ({...current,[draftId]:value})); setSendError(undefined);}}
      queueEnabled
      dock={<NativePromptQueue key={draftId} items={promptQueue.items} paused={promptQueue.paused} locale={language==='zh-CN'?'zh':'en'} disabled={!active} onEdit={promptQueue.edit} onRemove={promptQueue.remove} onReorder={promptQueue.reorder} onPause={promptQueue.pause} onRetry={promptQueue.retry}/>}
      sendDisabled={Boolean(binding?.session?.archived) || Boolean(binding && !binding.session)
        || registry?.selected[experimentId] === undefined || Boolean(registry?.inventories[experimentId]?.error)}
      error={sendError?.sessionId === draftId ? sendError.message : undefined}
      renderApprovalControls={binding ? requestId => <DecisionPolicyControl key={requestId} experimentId={experimentId}
        source={{kind:'native',sessionId:binding.sessionId,requestId}} disabled={!active} /> : undefined}
      composerControls={<NativeComposerControls providers={connection.providers} value={connection.selection}
        onChange={connection.select} locale={language === 'zh-CN' ? 'zh' : 'en'} active={active}
        disabled={connection.busy || conversation.disabled} />}
      additionalItems={[
        ...entries.map((entry) => ({kind:'custom' as const,id:`experiment:${experimentId}:${entry.id}`,createdAt:entry.at,content:entry.content})),
        ...remoteMessages.map(message => ({kind:'custom' as const,id:`remote:${message.id}`,createdAt:message.createdAt,
          content:<article className="ground-station-remote-message" data-xgc-role="ground-station-remote-message" data-xgc-id={message.id}>
            <div className="ground-station-remote-message-source">
              <span>{language === 'zh-CN' ? '地面站' : 'Ground station'}</span>
              <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString(language)}
                data-xgc-role="ground-station-remote-message-time" data-xgc-id={message.id}>
                {new Date(message.createdAt).toLocaleTimeString(language,{hour:'numeric',minute:'2-digit'})}
              </time>
            </div>
            {message.closedAt ? <div className="ground-station-remote-message-closed" data-xgc-role="robot-remote-control-closed" data-xgc-id={message.id}>
              {language === 'zh-CN' ? `${message.names.join('、')} 的遥控器关闭` : `Remote controller for ${message.names.join(', ')} closed`}
            </div> : <GroundStationRemoteDock experimentId={`${experimentId}:${message.id}`} />}
          </article>})),
      ]}
      onSend={async message => {
        try {if(draftId.startsWith('new:'))keepComposerFocus.current=feedRef.current?.querySelector('[data-xgc-role="native-agent-composer-input-editor"]')===document.activeElement;promptQueue.enqueue(message);setDrafts(current=>({...current,[draftId]:''}));setSendError(undefined)}
        catch(cause){setSendError({sessionId:draftId,message:cause instanceof Error?cause.message:String(cause)});throw cause}
      }}
      onInterrupt={conversation.onInterrupt}
      onAnswer={conversation.onAnswer} />
  </aside>;
}

function suppressChatArrowKey(event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget | null; preventDefault: () => void }) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.target instanceof HTMLElement && event.target.closest('[role="listbox"], [role="menu"], [role="option"], [role="combobox"][aria-expanded="true"]')) return;
  event.preventDefault();
}
