import { ExternalLink,X } from 'lucide-react';
import { useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { AgentActivity,Notice,ProgressBar } from '@xgc2/ui-react';
import { useGroundStationText } from './groundStationMessages';
import { hideGroundStationNotification,markGroundStationRead } from './groundStationAttention';
import type {
  GroundStationContextDestination,
  GroundStationContextInteraction,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';

export type GroundStationOpenContext = (
  context: GroundStationContextDestination,
  interaction: GroundStationContextInteraction,
) => boolean | Promise<boolean>;

export function GroundStationStatusCard({ interaction,placement = 'overlay' }: {
  interaction: GroundStationStatusInteraction;
  placement?: 'overlay' | 'panel';
}) {
  const status = interaction.payload.status;
  return (
    <AgentActivity
      data-xgc-role="ground-station-interaction-status-card"
      data-xgc-id={interaction.id}
      data-xgc-placement={placement}
      description={<p title={status.detail || interaction.message}>{status.detail || interaction.message}</p>}
      status={status.state}
      statusLabel={status.state}
      statusTone={interaction.severity === 'error' || interaction.severity === 'critical' ? 'danger' : undefined}
      title={interaction.title}
    >
      {status.progress !== undefined && (
        <ProgressBar
          percent={status.progress * 100}
          value={status.progress * 100}
          label={`${interaction.title} progress`}
          size="medium"
          tone="neutral"
        />
      )}
    </AgentActivity>
  );
}

export function GroundStationContextOffer({
  interaction,
  onOpenContext,
  placement = 'overlay',
  targetId,
}: {
  targetId: string;
  interaction: GroundStationContextInteraction;
  onDismiss: (interaction: GroundStationContextInteraction) => Promise<unknown>;
  onOpenContext?: GroundStationOpenContext;
  placement?: 'overlay' | 'panel';
}) {
  const [busy, setBusy] = useState(false);
  const t = useGroundStationText();
  const [error, setError] = useState('');
  async function open() {
    if (busy || !onOpenContext) return;
    setBusy(true);
    setError('');
    try {
      const opened = await onOpenContext(interaction.payload.context, interaction);
      if (!opened) throw new Error(t('Notification source is unavailable'));
      markGroundStationRead(interaction, targetId);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  async function dismiss() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      hideGroundStationNotification(interaction, targetId);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AgentActivity
      actions={<>
        <ControlButton
          iconOnly
          size="compact"
          aria-label={`Dismiss ${interaction.title}`}
          disabled={busy}
          dataXgcRole="ground-station-interaction-context-dismiss"
          dataXgcId={interaction.id}
          onClick={() => void dismiss()}
        ><X size={14} /></ControlButton>
        <ControlButton
          disabled={!onOpenContext || busy}
          dataXgcRole="ground-station-interaction-open-context"
          dataXgcId={interaction.id}
          onClick={() => void open()}
        ><ExternalLink size={14} />{interaction.payload.context.actionLabel}</ControlButton>
      </>}
      data-xgc-role="ground-station-interaction-context-offer"
      data-xgc-id={interaction.id}
      data-xgc-placement={placement}
      description={<p title={interaction.message}>{interaction.message}</p>}
      title={interaction.title}
    >
      {error && <Notice tone="danger" density="compact">{error}</Notice>}
    </AgentActivity>
  );
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
