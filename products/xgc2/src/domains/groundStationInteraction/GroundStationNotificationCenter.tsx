import { isGroundStationInteractionOpen } from './groundStationInteractionDecoder';
import { Bell } from 'lucide-react';
import { lazy,Suspense,useState } from 'react';
import { createPortal } from 'react-dom';
import { ControlButton } from '../../components/controls/ControlButton';
import { useGroundStationInteractionScope } from './GroundStationInteractionContext';
import { groundStationAttentionPriority,groundStationRead,useGroundStationAttention } from './groundStationAttention';
import { useAllLocalGroundStationNotifications } from './localGroundStationNotifications';
import { useGroundStationText } from './groundStationMessages';
import { useGroundStationNativeAttention } from './GroundStationAgentProvider';
import type { GroundStationNotificationSourceError } from './GroundStationNotificationDrawer';
import './GroundStationNotificationCenter.css';

// The drawer renders the agent chat runtime. Load it when the operator reaches
// for the trigger instead of in the startup bundle.
const loadNotificationDrawer = () => import('./GroundStationNotificationDrawer');
const GroundStationNotificationDrawer = lazy(() => loadNotificationDrawer()
  .then((module) => ({ default: module.GroundStationNotificationDrawer })));

function preloadNotificationDrawer() {
  // A failed load surfaces when the drawer opens; the preload stays silent.
  loadNotificationDrawer().catch(() => undefined);
}

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
  const [sourceError,setSourceError] = useState<GroundStationNotificationSourceError>();
  const open = controlledOpen ?? scope?.notificationCenterOpen ?? localOpen;
  const setOpen = onOpenChange ?? scope?.setNotificationCenterOpen ?? setLocalOpen;
  const native = useGroundStationNativeAttention();
  const t = useGroundStationText();
  const items = [...(scope?.interactions.inventory ?? []),...local]
    .sort((a,b) => groundStationAttentionPriority(b) - groundStationAttentionPriority(a)
      || b.updatedAt.localeCompare(a.updatedAt));
  const pending = items.filter((item) => item.kind === 'decision' && isGroundStationInteractionOpen(item));
  const recent = items.filter((item) => item.kind !== 'decision' || !isGroundStationInteractionOpen(item));
  const unread = items.filter((item) => !groundStationRead(item, receipts, targetId)).length;
  const pendingCount = pending.length + native.items.length;
  return <>
    <ControlButton
      size="compact"
      iconOnly={pendingCount === 0 && unread === 0}
      aria-label={`${t('Notifications')}${pendingCount ? ` · ${t('Pending')} ${pendingCount}` : unread ? ` · ${unread}` : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      dataXgcRole="ground-station-notifications-trigger"
      dataXgcId={targetId}
      onPointerEnter={preloadNotificationDrawer}
      onFocus={preloadNotificationDrawer}
      onClick={() => setOpen(true)}
    ><Bell size={16} />{pendingCount || unread || null}</ControlButton>
    {open && createPortal(<Suspense fallback={null}>
      <GroundStationNotificationDrawer
        targetId={targetId}
        scope={scope}
        receipts={receipts}
        pending={pending}
        recent={recent}
        native={native}
        sourceError={sourceError}
        onSourceError={setSourceError}
        onClose={() => setOpen(false)}
        onOpenNativeSource={onOpenNativeSource}
      />
    </Suspense>, document.body)}
  </>;
}
