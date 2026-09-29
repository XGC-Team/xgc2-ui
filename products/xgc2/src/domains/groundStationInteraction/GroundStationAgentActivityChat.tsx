import { useCallback,useEffect,useMemo,useRef,type ReactNode } from 'react';
import { AgentConversation,AgentComposerControls,AgentPromptQueue,type AgentConversationProps } from '@xgc2/agent-runtime/react';
import '@xgc2/agent-runtime/styles.css';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { formatOperatorDateTime } from '../../shared/operatorTime';
import { useExperimentSurfaceVisible } from '../experiment/experimentPublic';
import { GroundStationActivityChat,type GroundStationActivityChatProps } from './GroundStationActivityChat';
import { GroundStationDecisionChatCard } from './GroundStationChatDecision';
import { useGroundStationNativeAgentRegistry,useGroundStationAgentStreamFocus,type GroundStationNativeBinding } from './GroundStationAgentProvider';
import { useGroundStationAgentConnection } from './useGroundStationAgentConnection';
import { useGroundStationAgentConversation } from './useGroundStationAgentConversation';
import { useGroundStationActivityScope } from './groundStationActivityScope';
import { useGroundStationRemoteMessages,remoteMessagesForConversation,remoteConversationScope,remoteControllerChatCopy } from './groundStationRemoteMessages';
import { agentConversationDecisions } from './agentConversationDecisions';
import { GroundStationRemoteDock } from './GroundStationRemoteDock';
import { GroundStationConversationManager } from './GroundStationConversationManager';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import { useGroundStationVisibleReceipts } from './useGroundStationVisibleReceipts';
import { useGroundStationPromptQueue } from './useGroundStationPromptQueue';
import { useGroundStationComposerDraft } from './useGroundStationComposerDraft';
import { GroundStationChatStore,useGroundStationChatStore,EMPTY_GROUND_STATION_CHAT_UI } from './GroundStationChatStore';
import { composerControlReason } from './nativeCompanionAvailability';
import './GroundStationAgentActivityChat.css';

const EMPTY_STATUSES: GroundStationActivityChatProps['statuses'] = [];
const EMPTY_CONTEXTS: GroundStationActivityChatProps['contexts'] = [];

export function GroundStationAgentActivityChat({ experimentId,workspaceId,...props }: GroundStationActivityChatProps & { experimentId: string; workspaceId?:string }) {
  const registry = useGroundStationNativeAgentRegistry();
  const selected = registry?.selected[experimentId];
  const binding = registry?.bindings.find((item) => item.experimentId === experimentId && item.sessionId === selected);
  const conversationScope = remoteConversationScope(experimentId,selected);
  const decisions = useMemo(() => agentConversationDecisions(experimentId,props.decisions,conversationScope),[experimentId,props.decisions,conversationScope]);
  if (!registry || props.targetId !== 'local') return <GroundStationActivityChat {...props} />;
  const chat = selected === null
    ? {...props,decisions,statuses: EMPTY_STATUSES,contexts: EMPTY_CONTEXTS}
    : {...props,decisions};
  return <GroundStationActivityChat {...chat} decisions={decisions.filter(item => item.status !== 'open')}
    renderConversation={(entries) => <AgentExperimentConversation
      experimentId={experimentId} workspaceId={workspaceId} binding={binding} entries={entries} chat={chat}
    />} />;
}

type ExperimentConversationProps = {
  experimentId: string;
  workspaceId?: string;
  binding?: GroundStationNativeBinding;
  entries: ReadonlyArray<{ id: string; at: string; content: ReactNode }>;
  chat: GroundStationActivityChatProps;
};
function AgentExperimentConversation(props: ExperimentConversationProps) {
  const { experimentId,workspaceId,binding,chat } = props;
  const draftId = binding?.sessionId ?? `new:${experimentId}`;
  const connection = useGroundStationAgentConnection(experimentId,binding,workspaceId);
  const conversation = useGroundStationAgentConversation(experimentId,binding,connection.options);
  const promptQueue = useGroundStationPromptQueue(experimentId,draftId,conversation.state.queue,connection.options,connection.prepareQueueSession,conversation.state.items);
  const pendingDecisions = useMemo(() => chat.decisions.filter(item => item.status === 'open'),[chat.decisions]);
  return <GroundStationChatStore canonicalMessages={conversation.state.items}
    optimisticMessages={promptQueue.optimisticMessages} pendingDecisions={pendingDecisions}>
    <AgentExperimentConversationView {...props} draftId={draftId} connection={connection} conversation={conversation} promptQueue={promptQueue} />
  </GroundStationChatStore>;
}

function AgentExperimentConversationView({ experimentId,binding,entries,chat,draftId,connection,conversation,promptQueue }: ExperimentConversationProps & {
  draftId: string;
  connection: ReturnType<typeof useGroundStationAgentConnection>;
  conversation: ReturnType<typeof useGroundStationAgentConversation>;
  promptQueue: ReturnType<typeof useGroundStationPromptQueue>;
}) {
  const language = useAppLanguage();
  const { state: store,dispatch } = useGroundStationChatStore();
  const draft = useGroundStationComposerDraft(experimentId,draftId);
  const ui = store.uiState[draftId] ?? EMPTY_GROUND_STATION_CHAT_UI;
  const allRemoteMessages = useGroundStationRemoteMessages(experimentId);
  const registry = useGroundStationNativeAgentRegistry();
  const remoteScope = remoteConversationScope(experimentId,registry?.selected[experimentId]);
  const remoteMessages = useMemo(() => remoteMessagesForConversation(allRemoteMessages,remoteScope),[allRemoteMessages,remoteScope]);
  const activity = useGroundStationActivityScope();
  const feedRef = useRef<HTMLElement>(null);
  // All scrolling, including remote domain cards, is owned by the shared LegendList.
  const keepComposerFocus = useRef(false);
  useEffect(() => {
    if (!keepComposerFocus.current) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) feedRef.current?.querySelector<HTMLElement>('[data-xgc-role="agent-composer-input-editor"]')?.focus();
      keepComposerFocus.current = false;
    });
    return () => cancelAnimationFrame(frame);
  },[draftId]);
  const surfaceVisible = useExperimentSurfaceVisible();
  const active = chat.enabled && activity.visible && surfaceVisible;
  const currentDecision = store.pendingDecisions[0];
  const queuedDecisions = store.pendingDecisions.slice(1);
  const locale = language === 'zh-CN' ? 'zh' : 'en';
  const hasEnabledProvider = connection.providers.some(provider => provider.enabled && provider.available);
  const companionUnavailable = connection.unavailable || connection.capabilities?.available === false;
  const composerBlocked = companionUnavailable || (connection.providersLoaded && !hasEnabledProvider);
  const composerReason = composerControlReason({ locale,companionUnavailable,providersLoaded: connection.providersLoaded,hasEnabledProvider });
  useGroundStationAgentStreamFocus(experimentId,active);
  useGroundStationVisibleReceipts(feedRef,[...chat.decisions,...chat.statuses,...chat.contexts],active,chat.targetId);
  const additionalItems = useMemo<AgentConversationProps['additionalItems']>(() => ([
    ...entries.map((entry) => ({kind:'custom' as const,id:`experiment:${experimentId}:${entry.id}`,createdAt:entry.at,content:entry.content})),
    ...remoteMessages.map(message => ({kind:'custom' as const,id:`remote:${message.id}`,createdAt:message.createdAt,keepMounted:!message.closedAt,
      content:<GroundStationRemoteChatMessage experimentId={experimentId} language={language} message={message} />})),
  ]),[entries,experimentId,language,remoteMessages]);
  const staleNativeRequestIds = useMemo(() => binding?.session?.runtimeId && conversation.state.runtimeId
    && binding.session.runtimeId !== conversation.state.runtimeId ? Object.keys(conversation.state.pending) : [],
  [binding?.session?.runtimeId,conversation.state.runtimeId,conversation.state.pending]);
  const refreshNativeRequests = useCallback(async () => {
    if (!registry || !binding) throw new Error('No native conversation is connected.');
    // These read the actual session and pending-input inventories. Reload only
    // replays the canonical journal; it never re-submits a prompt or an approval.
    await Promise.all([registry.refresh(experimentId),registry.readInputs(experimentId,binding.sessionId)]);
    registry.reload(experimentId);
  },[registry,experimentId,binding]);
  const retry = async (id: string) => {
    const snapshot = draft.snapshot;
    const message = store.optimisticMessages.find(item => item.id === id);
    await promptQueue.retry(id);
    if (message?.text === snapshot.text) draft.clearIfUnchanged(snapshot);
    dispatch({type:'ui',draftId,patch:{sendError:undefined}});
  };
  if (!chat.enabled || !conversation.available) return null;
  return <aside ref={feedRef} className="xgc-ground-station-chat-panel ground-station-agent-chat"
    data-xgc-role="ground-station-chat-panel" data-xgc-id={chat.targetId} data-xgc-presentation="panel"
    aria-label={language === 'zh-CN' ? '地面站对话' : 'Ground station conversation'}
    onKeyDownCapture={suppressChatArrowKey}>
    <GroundStationConversationManager experimentId={experimentId} binding={binding} connection={connection} active={active} />
    <AgentConversation state={conversation.state} active={active} locale={locale}
      disabled={conversation.disabled && binding?.session?.state !== 'disconnected' && binding?.session?.state !== 'closed'}
      emptyState={null}
      draft={draft.text} clearDraftOnSend={false}
      onDraftChange={value => {draft.setText(value); dispatch({type:'ui',draftId,patch:{sendError:undefined}});}}
      optimisticMessages={store.optimisticMessages} onRetryOptimisticMessage={retry}
      timelineState={ui} onTimelineStateChange={next => dispatch({type:'ui',draftId,patch:next})}
      onRefreshRequests={refreshNativeRequests} staleRequestIds={staleNativeRequestIds}
      queueEnabled
      additionalPendingRequests={currentDecision ? <div className="ground-station-pending-decisions">
          <GroundStationDecisionChatCard
            key={currentDecision.id} interaction={currentDecision} onRespond={chat.onRespond} presentation="panel" />
          {queuedDecisions.length > 0 ? <p className="ground-station-pending-decisions-queue">
            {language === 'zh-CN' ? `另有 ${queuedDecisions.length} 条待处理` : `${queuedDecisions.length} more pending`}
          </p> : null}
        </div> : undefined}
      renderApprovalControls={binding ? requestId => <div className="ground-station-pending-decisions">
        <DecisionPolicyControl key={requestId} experimentId={experimentId}
          source={{kind:'native',sessionId:binding.sessionId,requestId}} disabled={!active} />
      </div> : undefined}
      dock={<AgentPromptQueue key={draftId} items={promptQueue.items} paused={promptQueue.paused} locale={locale} disabled={!active} onEdit={promptQueue.edit} onRemove={promptQueue.remove} onReorder={promptQueue.reorder} onPause={promptQueue.pause} onRetry={retry}/>}
      sendDisabled={composerBlocked || Boolean(binding?.session?.archived) || Boolean(binding && !binding.session)
        || registry?.selected[experimentId] === undefined || Boolean(registry?.inventories[experimentId]?.error)}
      sendDisabledReason={composerReason || undefined}
      error={ui.sendError || ui.draftStorageError || promptQueue.storageError}
      composerControls={<AgentComposerControls providers={connection.providers} value={connection.selection}
        onChange={connection.select} locale={locale} active={active}
        disabled={composerBlocked || connection.busy || conversation.disabled} disabledReason={composerReason} />}
      additionalItems={additionalItems}
      onSend={async message => {
        const snapshot = draft.snapshot;
        draft.flush();
        try {
          if (draftId.startsWith('new:')) keepComposerFocus.current = feedRef.current?.querySelector('[data-xgc-role="agent-composer-input-editor"]') === document.activeElement;
          await promptQueue.enqueue(message, async () => {
            const sessionId = await connection.prepareQueueSession();
            draft.promoteTo(sessionId);
            return sessionId;
          });
          draft.clearIfUnchanged(snapshot);
          dispatch({type:'ui',draftId,patch:{sendError:undefined}});
        } catch (cause) {
          dispatch({type:'ui',draftId,patch:{sendError:cause instanceof Error ? cause.message : String(cause)}});
          throw cause;
        }
      }}
      onInterrupt={conversation.onInterrupt}
      onAnswer={conversation.onAnswer} />
  </aside>;
}

function GroundStationRemoteChatMessage({ experimentId, language, message }: {
  experimentId: string;
  language: string;
  message: { id: string; names: readonly string[]; createdAt: string; closedAt?: string };
}) {
  const closed = Boolean(message.closedAt);
  return <article className="ground-station-remote-message" data-xgc-role="ground-station-remote-message" data-xgc-id={message.id}>
    <div className="ground-station-remote-message-source">
      <span>{language === 'zh-CN' ? '地面站' : 'Ground station'}</span>
      <time dateTime={message.createdAt} title={formatOperatorDateTime(message.createdAt, language)}
        data-xgc-role="ground-station-remote-message-time" data-xgc-id={message.id}>
        {formatOperatorDateTime(message.createdAt, language, { hour:'numeric',minute:'2-digit' })}
      </time>
    </div>
    <div className="ground-station-remote-message-copy"
      data-xgc-role={closed ? 'robot-remote-control-closed' : 'robot-remote-control-title'}
      data-xgc-id={message.id}>
      {remoteControllerChatCopy(message.names,closed,language)}
    </div>
    {closed ? null : <GroundStationRemoteDock experimentId={`${experimentId}:${message.id}`} />}
  </article>;
}

function suppressChatArrowKey(event: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; target: EventTarget | null; preventDefault: () => void }) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.target instanceof HTMLElement && event.target.closest('[role="listbox"], [role="menu"], [role="option"], [role="combobox"][aria-expanded="true"]')) return;
  event.preventDefault();
}
