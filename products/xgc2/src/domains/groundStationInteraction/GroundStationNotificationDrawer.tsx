import { ExternalLink } from 'lucide-react';
import { Notice,Stack } from '@xgc2/ui-react';
import { DecisionCard,AgentInput } from '@xgc2/agent-runtime/react';
import '@xgc2/agent-runtime/styles.css';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { GroundStationDecisionChatCard,GroundStationDecisionResultLog,GroundStationOperatorResponseBubble } from './GroundStationChatDecision';
import { GroundStationContextOffer,GroundStationStatusCard } from './GroundStationActivityViews';
import type { useGroundStationInteractionScope } from './GroundStationInteractionContext';
import { groundStationRead,markGroundStationRead,type useGroundStationAttention } from './groundStationAttention';
import { groundStationInteractionOrigin,formatGroundStationTimestamp } from './groundStationInteractionPresentation';
import { useGroundStationText } from './groundStationMessages';
import type { GroundStationInteraction } from './groundStationInteractionTypes';
import {
  useGroundStationNativeAgentRegistry,
  type GroundStationNativeAttentionItem,
  type useGroundStationNativeAttention,
} from './GroundStationAgentProvider';

export type GroundStationNotificationSourceError = { id: string; message: string };

/**
 * The open notification inventory. It renders the agent input and decision
 * cards (the chat runtime), so the notification center loads it on first open
 * instead of carrying it in the startup bundle.
 */
export function GroundStationNotificationDrawer({
  targetId,scope,receipts,pending,recent,native,sourceError,onSourceError,onClose,onOpenNativeSource,
}: {
  targetId: string;
  scope: ReturnType<typeof useGroundStationInteractionScope>;
  receipts: ReturnType<typeof useGroundStationAttention>;
  pending: readonly GroundStationInteraction[];
  recent: readonly GroundStationInteraction[];
  native: ReturnType<typeof useGroundStationNativeAttention>;
  sourceError: GroundStationNotificationSourceError | undefined;
  onSourceError: (error: GroundStationNotificationSourceError | undefined) => void;
  onClose: () => void;
  onOpenNativeSource?: (experimentId: string) => Promise<boolean>;
}) {
  const nativeRegistry = useGroundStationNativeAgentRegistry();
  const language = useAppLanguage();
  const t = useGroundStationText();
  // Submission acknowledges delivery, not provider resolution. The registry
  // retains unresolved requests; keep their disabled controls and source reachable.
  const nativePending = native.items;
  const pendingCount = pending.length + nativePending.length;
  return <ConfigDrawer
    title={t('Notifications')}
    onClose={onClose}
    dataXgcRole="ground-station-notifications"
    dataXgcId={targetId}
    bodyClassName="xgc-ground-station-notifications"
  >
    <section aria-label={t('Pending')}>
      <h3>{t('Pending')}</h3>
      {pendingCount === 0 && !native.error && <p>{t('No pending requests')}</p>}
      {native.error ? <Notice tone="warning" density="compact">{t('Pending requests could not be refreshed.')}</Notice> : null}
      <Stack gap="compact">{pending.map(renderItem)}{nativePending.map(renderNativeItem)}</Stack>
    </section>
    <section aria-label={t('Recent activity')}>
      <h3>{t('Recent activity')}</h3>
      <Stack gap="compact">{recent.map(renderItem)}</Stack>
    </section>
  </ConfigDrawer>;

  function renderNativeItem(item: GroundStationNativeAttentionItem) {
    return <article key={item.id} className="xgc-ground-station-notification-entry"
      data-xgc-role="ground-station-agent-notification" data-xgc-id={item.id}>
      <div className="xgc-ground-station-notification-meta"><span>{t('Local AI')}</span></div>
      {item.summaryOnly ? <DecisionCard identity={item.id} title={item.request.title} state={item.submitted ? 'submitted' : 'pending'}
        actions={<ControlButton dataXgcRole="ground-station-agent-review" dataXgcId={item.id} onClick={() => {
          onSourceError(undefined);
          void native.readInputs?.(item.experimentId,item.sessionId).catch((cause:unknown) => onSourceError({id:item.id,message:cause instanceof Error ? cause.message : t('Notification source is unavailable')}));
        }}>{t('Review request')}</ControlButton>} /> : <AgentInput request={item.request} sessionId={item.sessionId} submitted={item.submitted}
          renderApprovalControls={requestId => <DecisionPolicyControl key={requestId} experimentId={item.experimentId}
            source={{kind:'native',sessionId:item.sessionId,requestId}} />}
        locale={language === 'zh-CN' ? 'zh' : 'en'} onAnswer={(answer) => native.answer(item,answer)} />}
      {onOpenNativeSource && <div className="xgc-ground-station-notification-actions">
        <ControlButton size="compact" dataXgcRole="ground-station-agent-notification-source" dataXgcId={item.id}
          onClick={() => {
            onSourceError(undefined);
            void (async () => {
              await nativeRegistry?.open(item.experimentId,item.sessionId);
              return onOpenNativeSource(item.experimentId);
            })().then((opened) => {
              if (opened) onClose();
              else onSourceError({ id: item.id,message: t('Notification source is unavailable') });
            }).catch((cause: unknown) => onSourceError({ id: item.id,
              message: cause instanceof Error ? cause.message : t('Notification source is unavailable') }));
          }}><ExternalLink size={13} />{t('View source')}</ControlButton>
      </div>}
      {sourceError?.id === item.id && <Notice tone="danger" density="compact">{sourceError.message}</Notice>}
    </article>;
  }

  function renderItem(item: GroundStationInteraction) {
    return <article key={`${item.targetScope}:${item.id}`}
      className="xgc-ground-station-notification-entry"
      data-xgc-role="ground-station-notification-entry" data-xgc-id={item.id}
      data-xgc-unread={!groundStationRead(item, receipts, targetId) || undefined}
    >
      {item.kind === 'decision' && scope ? <>
        <GroundStationDecisionChatCard interaction={item} onRespond={scope.interactions.respond} presentation="panel" />
        {item.response && item.status !== 'canceled' ? <GroundStationOperatorResponseBubble interaction={item} response={item.response} /> : null}
        {item.status !== 'open' ? <GroundStationDecisionResultLog interaction={item} presentation="panel" /> : null}
      </> : item.kind === 'status' ? <GroundStationStatusCard interaction={item} placement="panel" />
        : item.kind === 'context' && scope ? <GroundStationContextOffer targetId={targetId} interaction={item}
          placement="panel" onDismiss={scope.interactions.dismiss} onOpenContext={scope.onOpenContext} />
          : <><strong>{item.title}</strong><p>{item.message}</p></>}
      {!(item.kind === 'decision' && scope) && <div className="xgc-ground-station-notification-meta">
        <span>{groundStationInteractionOrigin(item)}</span>
        {item.origin.type === 'web-panel' && item.targetScope !== targetId && <span>{t('Another execution target')}</span>}
        <time dateTime={item.updatedAt}>{formatGroundStationTimestamp(item.updatedAt)}</time>
      </div>}
      <div className="xgc-ground-station-notification-actions">
        {!groundStationRead(item, receipts, targetId) && <ControlButton size="compact"
          dataXgcRole="ground-station-notification-read" dataXgcId={item.id}
          onClick={() => markGroundStationRead(item, targetId)}>{t('Mark as read')}</ControlButton>}
        {scope?.onOpenSource && item.origin.type !== 'web-panel' && <ControlButton size="compact"
          dataXgcRole="ground-station-notification-source" dataXgcId={item.id}
          onClick={() => {
            onSourceError(undefined);
            void scope.onOpenSource?.(item).then((opened) => {
              if (opened) { markGroundStationRead(item, targetId); onClose(); }
              else onSourceError({ id: item.id,message: t('Notification source is unavailable') });
            }).catch((cause: unknown) => onSourceError({ id: item.id,
              message: cause instanceof Error ? cause.message : t('Notification source is unavailable') }));
          }}><ExternalLink size={13} />{t('View source')}</ControlButton>}
      </div>
      {sourceError?.id === item.id && <Notice tone="danger" density="compact">{sourceError.message}</Notice>}
    </article>;
  }
}
