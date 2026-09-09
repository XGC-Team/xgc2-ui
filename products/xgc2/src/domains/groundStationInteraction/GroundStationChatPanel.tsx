import { MessageCircle,SendHorizontal,X } from 'lucide-react';
import { useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { ConversationComposer,ConversationRegion,Panel } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { useGroundStationText } from './groundStationMessages';
import type { ExecutionStreamState } from '../execution/executionPublic';
import type { GroundStationInteraction,GroundStationInteractionSeverity } from './groundStationInteractionTypes';
import { useGroundStationVisibleReceipts } from './useGroundStationVisibleReceipts';
import { useGroundStationActivityScope } from './groundStationActivityScope';
import './GroundStationChatPanel.css';

export type GroundStationChatMessageInput = {
  targetId: string;
  message: string;
};
export type GroundStationChatPanelProps = {
  enabled: boolean;
  presentation?: 'overlay' | 'panel';
  targetId: string;
  activityCount: number;
  activityVersion?: string;
  attentionSeverity?: GroundStationInteractionSeverity;
  streamState: ExecutionStreamState;
  inventoryError?: string;
  children?: ReactNode;
  receiptItems?: readonly GroundStationInteraction[];
  onSendMessage?: (input: GroundStationChatMessageInput) => void | Promise<void>;
};

type VisibilityState = {
  targetId: string;
  mode: 'open' | 'closed';
  lastReadVersion: string;
};

type ComposerState = {
  targetId: string;
  draft: string;
  busy: boolean;
  error: string;
};
export function GroundStationChatPanel({
  enabled,
  presentation = 'overlay',
  targetId,
  activityCount,
  activityVersion = '',
  attentionSeverity = 'info',
  streamState,
  inventoryError: _inventoryError = '',
  children,
  onSendMessage,
  receiptItems = emptyReceiptItems,
}: GroundStationChatPanelProps) {
  const t = useGroundStationText();
  const panelId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const focusPanelAfterOpen = useRef(false);
  const followLatest = useRef(true);
  const restoreLauncherFocus = useRef(false);
  const [visibility, setVisibility] = useState<VisibilityState>({
    targetId,mode: 'closed',lastReadVersion: '',
  });
  const [composer, setComposer] = useState<ComposerState>({ targetId,draft: '',busy: false,error: '' });
  const beginSendRequest = useLatestAsyncRequest(targetId);
  const embedded = presentation === 'panel';
  const visibilityMode = visibility.targetId === targetId ? visibility.mode : 'closed';
  const currentComposer = composer.targetId === targetId
    ? composer
    : { targetId,draft: '',busy: false,error: '' };
  const expanded = embedded || visibilityMode === 'open';
  const activityScope = useGroundStationActivityScope();
  useGroundStationVisibleReceipts(feedRef, receiptItems, enabled && expanded && activityScope.visible, targetId);
  const lastReadVersion = visibility.targetId === targetId ? visibility.lastReadVersion : '';
  const hasUnread = !expanded && Boolean(activityVersion) && activityVersion !== lastReadVersion;

  useLayoutEffect(() => {
    setComposer({ targetId,draft: '',busy: false,error: '' });
    setVisibility({ targetId,mode: 'closed',lastReadVersion: '' });
  }, [targetId]);

  useEffect(() => {
    if (!enabled || !expanded || embedded) return;
    setVisibility((current) => {
      if (current.targetId !== targetId) {
        return { targetId,mode: 'closed',lastReadVersion: '' };
      }
      return current.lastReadVersion === activityVersion
        ? current
        : { ...current,lastReadVersion: activityVersion };
    });
  }, [activityVersion,embedded,enabled,expanded,targetId]);

  useEffect(() => {
    if (!enabled || !expanded || embedded || !focusPanelAfterOpen.current) return;
    focusPanelAfterOpen.current = false;
    panelRef.current?.focus();
  }, [embedded,enabled,expanded,targetId]);

  useEffect(() => {
    if (!enabled || expanded || embedded || !restoreLauncherFocus.current) return;
    restoreLauncherFocus.current = false;
    launcherRef.current?.focus();
  }, [embedded,enabled,expanded,targetId]);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!enabled || !expanded || !feed || !followLatest.current) return;
    feed.scrollTop = feed.scrollHeight;
  }, [activityVersion,enabled,expanded,targetId]);

  if (!enabled) return null;

  const countedOpenLabel = activityCount > 0
    ? t('Open ground station chat, {count} updates', { count: activityCount })
    : t('Open ground station chat');
  const openLabel = hasUnread ? `${countedOpenLabel}. ${t('New activity')}` : countedOpenLabel;

  function open() {
    focusPanelAfterOpen.current = true;
    followLatest.current = true;
    setVisibility({ targetId,mode: 'open',lastReadVersion: activityVersion });
  }

  function close() {
    restoreLauncherFocus.current = true;
    setVisibility({ targetId,mode: 'closed',lastReadVersion: activityVersion });
  }

  function updateDraft(draft: string) {
    setComposer({ ...currentComposer,draft,error: '' });
  }

  async function send() {
    const message = currentComposer.draft.trim();
    if (!onSendMessage || currentComposer.busy || !message) return;
    const sendingTarget = targetId;
    const isCurrent = beginSendRequest();
    setComposer({ ...currentComposer,busy: true,error: '' });
    try {
      await onSendMessage({ targetId: sendingTarget,message });
      if (!isCurrent()) return;
      setComposer((current) => current.targetId === sendingTarget
        ? { ...current,draft: '',busy: false,error: '' }
        : current);
    } catch (cause) {
      if (!isCurrent()) return;
      const error = cause instanceof Error ? cause.message : String(cause);
      setComposer((current) => current.targetId === sendingTarget
        ? { ...current,busy: false,error }
        : current);
    }
  }

  if (!expanded) {
    return (
      <ControlButton
        ref={launcherRef}
        className="xgc-ground-station-chat-launcher"
        iconOnly
        tone="primary"
        aria-label={openLabel}
        aria-controls={panelId}
        aria-expanded="false"
        dataXgcRole="ground-station-chat-launcher"
        dataXgcId={targetId}
        data-xgc-unread={hasUnread || undefined}
        data-xgc-severity={hasUnread ? attentionSeverity : undefined}
        onClick={open}
      >
        <MessageCircle size={21} aria-hidden="true" />
      </ControlButton>
    );
  }

  const conversation = <>
      <ConversationRegion
        ref={feedRef}
        density="compact"
        label={t('Current ground station activity')}
        onScroll={(event) => {
          const feed = event.currentTarget;
          followLatest.current = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 24;
        }}
      >
        {activityCount > 0 ? children : null}
      </ConversationRegion>

      {/* Footer is a single grid track so the composer is never clipped by the feed. */}
      {onSendMessage && <footer className="xgc-ground-station-chat-footer" data-xgc-role="ground-station-chat-footer" data-xgc-id="ground-station-chat-footer">
        <ConversationComposer
          busy={currentComposer.busy}
          density="compact"
          error={currentComposer.error || undefined}
          label={t('Ground station message composer')}
          onSubmitMessage={() => send()}
          onValueChange={updateDraft}
          placeholder={t('Message the ground station')}
          submitIcon={<SendHorizontal size={16} />}
          submitLabel={t('Send message')}
          submitButtonProps={{
            'data-xgc-role': 'ground-station-chat-send',
            'data-xgc-id': targetId,
          }}
          textareaProps={{
            'aria-label': t('Message the ground station'),
            maxLength: 2_000,
          }}
          value={currentComposer.draft}
          data-xgc-role="ground-station-chat-composer"
          data-xgc-id={targetId}
        />
      </footer>}
  </>;

  return (
    <aside
      ref={panelRef}
      id={panelId}
      className="xgc-ground-station-chat-panel"
      tabIndex={-1}
      aria-label={t('Ground station chat')}
      data-xgc-role="ground-station-chat-panel"
      data-xgc-id={targetId}
      data-xgc-presentation={presentation}
      data-xgc-stream-state={streamState}
      onKeyDownCapture={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target instanceof HTMLElement && event.target.closest('[role="listbox"], [role="menu"], [role="option"], [role="combobox"][aria-expanded="true"]')) return;
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (!embedded && event.key === 'Escape' && !event.nativeEvent.isComposing) close();
      }}
    >
      {/* Dashboard embedding already lives inside WorkspacePanel chrome. */}
      {embedded ? conversation : (
        <Panel
          actions={<ControlButton
            iconOnly
            size="compact"
            aria-label={t('Close ground station chat')}
            aria-controls={panelId}
            aria-expanded="true"
            dataXgcRole="ground-station-chat-close" dataXgcId="ground-station-chat-close"
            onClick={close}
          ><X size={15} /></ControlButton>}
          bodyLayout="column"
          className="xgc-ground-station-chat-surface"
          fill
          padding="none"
          title={t('Ground station chat')}
        >
          {conversation}
        </Panel>
      )}
    </aside>
  );
}

const emptyReceiptItems: readonly GroundStationInteraction[] = [];
