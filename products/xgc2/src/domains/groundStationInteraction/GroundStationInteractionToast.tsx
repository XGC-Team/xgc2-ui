import { Notice,NoticeRegion,StatusText } from '@xgc2/ui-react';
import { X } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import type { GroundStationInteraction } from './groundStationInteractionTypes';
import { useGroundStationText } from './groundStationMessages';
import { groundStationErrorMessage } from './groundStationInteractionPresentation';
import './GroundStationInteractionToast.css';

export function GroundStationToastStack({ items,queued,onDismissLocal,onDismiss,onView }: {
  items: GroundStationInteraction[];
  queued: number;
  onView?: (interaction: GroundStationInteraction) => void;
  onDismissLocal: (interaction: GroundStationInteraction) => void;
  onDismiss: (interaction: GroundStationInteraction) => Promise<unknown>;
}) {
  return (
    <NoticeRegion
      className="xgc-ground-station-toast-stack"
      aria-label="Ground station notifications"
      data-xgc-role="ground-station-interaction-toast-stack"
      data-xgc-id={items[0]?.targetScope}
      data-xgc-queued-count={queued}
      placement="top-end"
    >
      {items.map((interaction) => (
        <GroundStationToast
          key={interaction.id}
          interaction={interaction}
          onDismissLocal={onDismissLocal}
          onDismiss={onDismiss}
          onView={onView}
        />
      ))}
    </NoticeRegion>
  );
}

function GroundStationToast({ interaction,onDismissLocal,onDismiss,onView }: {
  interaction: GroundStationInteraction;
  onView?: (interaction: GroundStationInteraction) => void;
  onDismissLocal: (interaction: GroundStationInteraction) => void;
  onDismiss: (interaction: GroundStationInteraction) => Promise<unknown>;
}) {
  const t = useGroundStationText();
  const transient = interaction.kind === 'message' && interaction.severity !== 'critical' && interaction.severity !== 'error';
  const ref = useRef<HTMLElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = ref.current;
    if (!element || !transient) return undefined;
    const finish = (event: Event) => {
      if (event.target === element) onDismissLocal(interaction);
    };
    element.addEventListener('animationend', finish);
    return () => element.removeEventListener('animationend', finish);
  }, [interaction,onDismissLocal,transient]);
  return (
    <article
      ref={ref}
      aria-atomic="true"
      className="xgc-ground-station-toast"
      role={interaction.severity === 'critical' || interaction.severity === 'error' ? 'alert' : 'status'}
      style={transient && interaction.kind === 'message' ? { animationDuration: `${interaction.payload.message.durationMs}ms` } : { animation: 'none' }}
      data-xgc-role="ground-station-interaction-toast"
      data-xgc-id={interaction.id}
      data-xgc-severity={interaction.severity}
    >
      <Notice
        actions={<ControlButton
          size="compact"
          iconOnly
          aria-label={`${t('Hide notification')} · ${interaction.title}`}
          dataXgcRole="ground-station-interaction-dismiss"
          dataXgcId={interaction.id}
          onClick={() => {
            setError('');
            void onDismiss(interaction).catch((cause) => setError(groundStationErrorMessage(cause)));
          }}
        ><X size={14} /></ControlButton>}
        className="xgc-ground-station-toast-notice"
        density="compact"
        heading={interaction.title}
        role="presentation"
        tone={toastTone(interaction.severity)}
      >
        <div className="xgc-ground-station-toast-copy">
          <StatusText status={interaction.severity}>{severityLabel(interaction.severity)}</StatusText>
          <p>{interaction.message}</p>
          {onView && <ControlButton size="compact" dataXgcRole="ground-station-notification-view" dataXgcId={interaction.id}
            onClick={() => onView(interaction)}>{t(interaction.kind === 'decision' ? 'View and handle' : 'View details')}</ControlButton>}
          {error && <small role="alert">{error}</small>}
        </div>
      </Notice>
    </article>
  );
}

function severityLabel(severity: GroundStationInteraction['severity']) {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
}

function toastTone(severity: GroundStationInteraction['severity']) {
  if (severity === 'error' || severity === 'critical') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'neutral' as const;
}
