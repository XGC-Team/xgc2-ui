import type { GroundStationInteraction } from './groundStationInteractionTypes';
import { isGroundStationInteractionOpen } from './groundStationInteractionDecoder';
import { createPortal } from 'react-dom';
import { GroundStationDecisionDialogHost } from './GroundStationDecisionDialogHost';
import { GroundStationToastStack } from './GroundStationInteractionToast';
import {
  useAllLocalGroundStationNotifications,
} from './localGroundStationNotifications';
import { GroundStationInteractionProvider } from './GroundStationInteractionProvider';
import { groundStationAttentionPriority,groundStationNotificationHidden,groundStationRead,hideGroundStationNotification,useGroundStationAttention } from './groundStationAttention';
import { useGroundStationInteractionScope } from './GroundStationInteractionContext';

export type GroundStationInteractionHostProps = {
  targetId: string;
  showDecisionDialog?: boolean;
};

export function GroundStationInteractionHost({
  targetId,
  showDecisionDialog = true,
}: GroundStationInteractionHostProps) {
  const scope = useGroundStationInteractionScope(targetId);
  if (!scope) {
    return (
      <GroundStationInteractionProvider targetId={targetId}>
        <GroundStationInteractionHostContent targetId={targetId} showDecisionDialog={showDecisionDialog} />
      </GroundStationInteractionProvider>
    );
  }
  return <GroundStationInteractionHostContent targetId={targetId} showDecisionDialog={showDecisionDialog} />;
}

function GroundStationInteractionHostContent({
  targetId,
  showDecisionDialog = true,
}: GroundStationInteractionHostProps) {
  const scope = useGroundStationInteractionScope(targetId);
  const localToasts = useAllLocalGroundStationNotifications();
  const receipts = useGroundStationAttention();
  if (!scope || typeof document === 'undefined') return null;
  const { interactions } = scope;
  const showFallbackDecisionDialog = showDecisionDialog && scope.activityPanelCount === 0;
  const allToasts = [...localToasts,...interactions.inventory].filter((item) => (
    isGroundStationInteractionOpen(item) && !groundStationNotificationHidden(item, receipts, targetId)
    && !groundStationRead(item, receipts, targetId)
    && notificationIsCurrent(item)
    && (item.kind === 'message' || (item.kind === 'decision' && !showFallbackDecisionDialog)
      || item.severity === 'error' || item.severity === 'critical')
  )).sort((a,b) => groundStationAttentionPriority(b) - groundStationAttentionPriority(a)
    || b.updatedAt.localeCompare(a.updatedAt));
  const visibleToasts = allToasts.slice(0, 4);

  return createPortal(
    <div data-xgc-role="ground-station-interaction-host" data-xgc-id={interactions.targetId}>
      {!scope.notificationCenterOpen && visibleToasts.length > 0 && (
        <GroundStationToastStack
          items={visibleToasts}
          queued={allToasts.length}
          onDismissLocal={(item) => hideGroundStationNotification(item, targetId)}
          onDismiss={(interaction) => {
            hideGroundStationNotification(interaction, targetId);
            return Promise.resolve(interaction);
          }}
          onView={() => scope.setNotificationCenterOpen(true)}
        />
      )}
      <GroundStationDecisionDialogHost
        enabled={showFallbackDecisionDialog && !scope.notificationCenterOpen}
        decisions={interactions.chatDecisions}
        onRespond={interactions.respond}
      />
    </div>,
    document.body,
  );
}

/** Local-only host does not open an execution subscription when no target is available. */
export function GroundStationLocalNotificationHost({ notificationCenterOpen = false,onViewNotifications }: {
  notificationCenterOpen?: boolean;
  onViewNotifications?: () => void;
}) {
  const items = useAllLocalGroundStationNotifications();
  const receipts = useGroundStationAttention();
  const visible = items.filter((item) => !groundStationNotificationHidden(item, receipts, item.targetScope)
    && !groundStationRead(item, receipts, item.targetScope) && notificationIsCurrent(item));
  if (notificationCenterOpen || !visible.length) return null;
  return createPortal(<GroundStationToastStack items={visible.slice(0, 4)} queued={visible.length}
    onDismissLocal={(item) => hideGroundStationNotification(item, item.targetScope)}
    onDismiss={(item) => { hideGroundStationNotification(item, item.targetScope); return Promise.resolve(item); }}
    onView={onViewNotifications} />, document.body);
}

function notificationIsCurrent(item: GroundStationInteraction) {
  if (item.kind !== 'message' || item.severity === 'error' || item.severity === 'critical') return true;
  // A toast has an absolute delivery window: remounting or a long queue never replays stale success.
  return Date.now() < Date.parse(item.updatedAt) + item.payload.message.durationMs;
}
