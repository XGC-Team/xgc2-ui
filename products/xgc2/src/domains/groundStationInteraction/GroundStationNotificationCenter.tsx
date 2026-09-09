import '@xgc2/native-agent/styles.css';
import { isGroundStationInteractionOpen } from './groundStationInteractionDecoder';
import { Bell,ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Notice,Stack } from '@xgc2/ui-react';
import { DecisionCard,NativeInput } from '@xgc2/native-agent/react';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { ControlButton } from '../../components/controls/ControlButton';
import { GroundStationDecisionChatCard,GroundStationOperatorResponseBubble } from './GroundStationChatDecision';
import { GroundStationContextOffer,GroundStationStatusCard } from './GroundStationActivityViews';
import { useGroundStationInteractionScope } from './GroundStationInteractionContext';
import { groundStationAttentionPriority,groundStationRead,markGroundStationRead,useGroundStationAttention } from './groundStationAttention';
import { groundStationInteractionOrigin,formatGroundStationTimestamp } from './groundStationInteractionPresentation';
import { useAllLocalGroundStationNotifications } from './localGroundStationNotifications';
import { useGroundStationText } from './groundStationMessages';
import type { GroundStationInteraction } from './groundStationInteractionTypes';
import { useGroundStationNativeAgentRegistry,useGroundStationNativeAttention,type GroundStationNativeAttentionItem } from './GroundStationNativeAgentProvider';
import './GroundStationNotificationCenter.css';

/** One entry into the existing interaction inventory, independent of the active page. */
export function GroundStationNotificationCenter({ targetId,open: controlledOpen,onOpenChange,onOpenNativeSource }: {
  targetId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenNativeSource?: (experimentId: string) => Promise<boolean>;
}) {
  const scope = useGroundStationInteractionScope(targetId);
  const local = useAllLocalGroundStationNotifications();
  const receipts = useGroundStationAttention();
  const [localOpen,setLocalOpen] = useState(false);
  const [sourceError,setSourceError] = useState<{ id: string; message: string }>();
  const open = controlledOpen ?? scope?.notificationCenterOpen ?? localOpen;
  const setOpen = onOpenChange ?? scope?.setNotificationCenterOpen ?? setLocalOpen;
  const native = useGroundStationNativeAttention();
  const nativeRegistry = useGroundStationNativeAgentRegistry();
  const language = useAppLanguage();
  const t = useGroundStationText();
  const items = [...(scope?.interactions.inventory ?? []),...local]
    .sort((a,b) => groundStationAttentionPriority(b) - groundStationAttentionPriority(a)
      || b.updatedAt.localeCompare(a.updatedAt));
  const pending = items.filter((item) => item.kind === 'decision' && isGroundStationInteractionOpen(item));
  const recent = items.filter((item) => item.kind !== 'decision' || !isGroundStationInteractionOpen(item));
  const unread = items.filter((item) => !groundStationRead(item, receipts, targetId)).length;
  // Submission acknowledges delivery, not provider resolution. The registry
  // retains unresolved requests; keep their disabled controls and source reachable.
  const nativePending = native.items;
  const pendingCount = pending.length + nativePending.length;
  return <>
    <ControlButton
      size="compact"
      iconOnly={pendingCount === 0 && unread === 0}
      aria-label={`${t('Notifications')}${pendingCount ? ` · ${t('Pending')} ${pendingCount}` : unread ? ` · ${unread}` : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      dataXgcRole="ground-station-notifications-trigger"
      dataXgcId={targetId}
      onClick={() => setOpen(true)}
    ><Bell size={16} />{pendingCount || unread || null}</ControlButton>
    {open && createPortal(<ConfigDrawer
      title={t('Notifications')}
      onClose={() => setOpen(false)}
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
    </ConfigDrawer>, document.body)}
  </>;

  function renderNativeItem(item: GroundStationNativeAttentionItem) {
    return <article key={item.id} className="xgc-ground-station-notification-entry"
      data-xgc-role="ground-station-native-notification" data-xgc-id={item.id}>
      <div className="xgc-ground-station-notification-meta"><span>{t('Local AI')}</span></div>
      {item.summaryOnly ? <DecisionCard identity={item.id} title={item.request.title} state={item.submitted ? 'submitted' : 'pending'}
        actions={<ControlButton dataXgcRole="ground-station-native-review" dataXgcId={item.id} onClick={() => {
          setSourceError(undefined);
          void native.readInputs?.(item.experimentId,item.sessionId).catch((cause:unknown) => setSourceError({id:item.id,message:cause instanceof Error ? cause.message : t('Notification source is unavailable')}));
        }}>{t('Review request')}</ControlButton>} /> : <NativeInput request={item.request} sessionId={item.sessionId} submitted={item.submitted}
          renderApprovalControls={requestId => <DecisionPolicyControl key={requestId} experimentId={item.experimentId}
            source={{kind:'native',sessionId:item.sessionId,requestId}} />}
        locale={language === 'zh-CN' ? 'zh' : 'en'} onAnswer={(answer) => native.answer(item,answer)} />}
      {onOpenNativeSource && <div className="xgc-ground-station-notification-actions">
        <ControlButton size="compact" dataXgcRole="ground-station-native-notification-source" dataXgcId={item.id}
          onClick={() => {
            setSourceError(undefined);
            void (async () => {
              await nativeRegistry?.open(item.experimentId,item.sessionId);
              return onOpenNativeSource(item.experimentId);
            })().then((opened) => {
              if (opened) setOpen(false);
              else setSourceError({ id: item.id,message: t('Notification source is unavailable') });
            }).catch((cause: unknown) => setSourceError({ id: item.id,
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
        {item.response && <GroundStationOperatorResponseBubble interaction={item} response={item.response} />}
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
            setSourceError(undefined);
            void scope.onOpenSource?.(item).then((opened) => {
              if (opened) { markGroundStationRead(item, targetId); setOpen(false); }
              else setSourceError({ id: item.id,message: t('Notification source is unavailable') });
            }).catch((cause: unknown) => setSourceError({ id: item.id,
              message: cause instanceof Error ? cause.message : t('Notification source is unavailable') }));
          }}><ExternalLink size={13} />{t('View source')}</ControlButton>}
      </div>
      {sourceError?.id === item.id && <Notice tone="danger" density="compact">{sourceError.message}</Notice>}
    </article>;
  }
}
