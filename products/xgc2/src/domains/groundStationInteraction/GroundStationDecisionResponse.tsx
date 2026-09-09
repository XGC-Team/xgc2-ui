import { ExperimentAgentActionReview } from './ExperimentAgentActionReview';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import { Clock3 } from 'lucide-react';
import { useEffect,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { FormField } from '../../components/FormPrimitives';
import { TextareaControl } from '../../components/controls/TextControls';
import { Notice } from '@xgc2/ui-react';
import { useLatestAsyncRequest } from '../../hooks/useLatestAsyncRequest';
import { usePolling } from '../../hooks/usePolling';
import type { LocalizedText } from '../../shared/localization/localizedText';
import { useGroundStationText } from './groundStationMessages';
import type {
  GroundStationDecisionInteraction,
} from './groundStationInteractionTypes';
import type {
  GroundStationDecisionResponseAction,
  GroundStationDecisionResponseOptions,
  GroundStationDecisionResponder,
} from './groundStationInteractionActions';
import { isGroundStationDecisionLocallyExpired } from './groundStationChatTimeline';
import { GroundStationDecisionFormFields } from './GroundStationDecisionFormFields';
import { useGroundStationDecisionForm } from './groundStationDecisionFormState';
import { isRetiredGroundStationRecordingRequest } from './groundStationInteractionDecoder';
import {
  groundStationDecisionActionLabel,
  groundStationDecisionCompactApproveLabel,
  groundStationDecisionOutcomeLabel,
} from './groundStationDecisionPresentation';
import './GroundStationDecisionResponse.css';

export function GroundStationDecisionResponseControls({
  interaction,
  onRespond,
  appearance,
  onResponded,
}: {
  interaction: GroundStationDecisionInteraction;
  onRespond: GroundStationDecisionResponder;
  appearance: 'compact' | 'dialog';
  onResponded?: () => void;
}) {
  const t = useGroundStationText();
  const requiresReason = interaction.payload.decision.requireReason;
  const form = interaction.payload.decision.form;
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(appearance === 'dialog' && requiresReason);
  const [busy, setBusy] = useState<GroundStationDecisionResponseAction | ''>('');
  const [error, setError] = useState('');
  const interactionIdentity = `${interaction.id}:${interaction.revision}`;
  const formState = useGroundStationDecisionForm(form, interactionIdentity);
  const beginResponseRequest = useLatestAsyncRequest(interactionIdentity);
  const now = useExpiryClock(interaction);
  const locallyExpired = isGroundStationDecisionLocallyExpired(interaction, now);
  const retiredRecordingRequest = isRetiredGroundStationRecordingRequest(interaction);
  const open = interaction.status === 'open' && !locallyExpired;

  useEffect(() => {
    setReason('');
    setShowReason(appearance === 'dialog' && requiresReason);
    setBusy('');
    setError('');
  }, [appearance,interactionIdentity,requiresReason]);

  async function respond(action: GroundStationDecisionResponseAction) {
    if (busy || !open || retiredRecordingRequest) return;
    const note = reason.trim();
    if (requiresReason && !note) {
      setShowReason(true);
      setError(t('A response note is required.'));
      return;
    }
    // Only an approval submits the form; declining it is the operator refusing
    // to answer, so it must not be blocked by a required field.
    let values: GroundStationDecisionResponseOptions['values'];
    if (form && action === 'approved') {
      const collected = formState.collect();
      if ('error' in collected) {
        setError(collected.error);
        return;
      }
      values = collected.values;
    }
    setBusy(action);
    setError('');
    const isCurrent = beginResponseRequest();
    const options: GroundStationDecisionResponseOptions = {
      ...(note ? { reason: note } : {}),
      ...(values && Object.keys(values).length > 0 ? { values } : {}),
    };
    try {
      await onRespond(interaction, action, options);
      if (isCurrent()) onResponded?.();
    } catch (cause) {
      if (isCurrent()) setError(messageOf(cause));
    } finally {
      if (isCurrent()) setBusy('');
    }
  }

  if (retiredRecordingRequest) return null;

  if (!open) {
    if (appearance === 'compact') {
      return <div
        className="xgc-ground-station-decision-outcome"
        data-xgc-role="ground-station-decision-response-state"
        data-xgc-id={interaction.id}
      >{groundStationDecisionOutcomeLabel(interaction, locallyExpired, t)}</div>;
    }
    return <div className="xgc-ground-station-decision-closed"
      data-xgc-role="ground-station-decision-response-state" data-xgc-id={interaction.id}
    ><ExperimentAgentActionReview interaction={interaction} />{decisionStateLabel(interaction, locallyExpired, t)}</div>;
  }

  return (
    <div className="xgc-ground-station-decision-response" data-xgc-appearance={appearance} aria-busy={Boolean(busy)}
      data-xgc-role="ground-station-decision-response" data-xgc-id={interaction.id}>
      {appearance === 'dialog' ? <ExperimentAgentActionReview interaction={interaction} /> : null}
      <GroundStationDecisionDeadline interaction={interaction} now={now} waiting={appearance === 'dialog'} />
      {form && (
        <GroundStationDecisionFormFields
          interactionId={interaction.id}
          form={form}
          state={formState}
          disabled={Boolean(busy)}
        />
      )}
      {showReason ? (
        <FormField
          label={t('Operator note')}
          required={requiresReason}
          dataXgcRole="ground-station-decision-reason"
          dataXgcId={interaction.id}
        >
          <TextareaControl
            rows={appearance === 'dialog' ? 3 : 2}
            maxLength={2_000}
            value={reason}
            disabled={Boolean(busy)}
            aria-label={t('Operator note')}
            placeholder={t('Add context for this response')}
            onChange={setReason}
            dataXgcRole="ground-station-decision-reason-input"
            dataXgcId={interaction.id}
          />
        </FormField>
      ) : null}
      {error && <Notice tone="danger" density="compact">{error}</Notice>}
      <div className="xgc-ground-station-decision-actions"
        data-xgc-role="ground-station-decision-actions" data-xgc-id={interaction.id} aria-label={interaction.title}>
        <ControlButton
          size="compact"
          tone={appearance === 'compact' ? 'default' : 'primary'}
          appearance={appearance === 'compact' ? 'raised' : 'default'}
          disabled={Boolean(busy)}
          aria-busy={busy === 'approved' || undefined}
          dataXgcRole="ground-station-chat-decision-approve"
          dataXgcId={interaction.id}
          onClick={() => void respond('approved')}
        >{appearance === 'compact' ? groundStationDecisionCompactApproveLabel(interaction) : interaction.payload.decision.approveLabel}</ControlButton>
        <ControlButton
          size="compact"
          disabled={Boolean(busy)}
          aria-busy={busy === 'rejected' || undefined}
          dataXgcRole="ground-station-chat-decision-reject"
          dataXgcId={interaction.id}
          onClick={() => void respond('rejected')}
        >{interaction.payload.decision.rejectLabel}</ControlButton>
        {appearance === 'dialog' && !form && !interaction.payload.decision.agentAction && interaction.origin.experimentId ? <DecisionPolicyControl key={interactionIdentity}
          experimentId={interaction.origin.experimentId} source={{kind:'gcs',interactionId:interaction.id}} disabled={Boolean(busy)} /> : null}
        {!showReason && !requiresReason && (
          <ControlButton
            className="xgc-ground-station-decision-add-note"
            size="compact"
            appearance={appearance === 'compact' ? 'raised' : 'ghost'}
            disabled={Boolean(busy)}
            onClick={() => setShowReason(true)}
            dataXgcRole="ground-station-decision-add-note"
            dataXgcId={interaction.id}
          >{t('Add a note')}</ControlButton>
        )}
      </div>
    </div>
  );
}

export function GroundStationDecisionDeadline({
  interaction,
  now,
  waiting = true,
}: {
  interaction: GroundStationDecisionInteraction;
  now: number;
  waiting?: boolean;
}) {
  const t = useGroundStationText();
  if (interaction.status !== 'open') return null;
  if (!interaction.expiresAt) {
    if (!waiting) return null;
    return <small className="xgc-ground-station-decision-deadline"
      data-xgc-role="ground-station-decision-deadline" data-xgc-id={interaction.id}
    ><Clock3 size={13} aria-hidden="true" />{t('Waiting for confirmation')}</small>;
  }
  const remaining = Math.max(0, Date.parse(interaction.expiresAt) - now);
  return (
    <small className="xgc-ground-station-decision-deadline" data-xgc-expired={remaining === 0 || undefined}
      data-xgc-role="ground-station-decision-deadline" data-xgc-id={interaction.id}>
      <Clock3 size={13} aria-hidden="true" />
      {remaining === 0 ? t('Confirmation wait expired') : t('Expires in {time}', { time: formatRemaining(remaining) })}
    </small>
  );
}

function useExpiryClock(interaction: GroundStationDecisionInteraction) {
  const [now, setNow] = useState(Date.now);
  const expiry = interaction.expiresAt ? Date.parse(interaction.expiresAt) : Number.NaN;
  usePolling({
    enabled: interaction.status === 'open' && Number.isFinite(expiry) && expiry > now,
    intervalMs: 1_000,
    immediate: false,
    pollKey: `${interaction.id}:${interaction.revision}:${interaction.expiresAt ?? ''}`,
    task: async () => setNow(Date.now()),
  });
  return now;
}

function decisionStateLabel(
  interaction: GroundStationDecisionInteraction,
  locallyExpired: boolean,
  t: LocalizedText,
) {
  if (locallyExpired || interaction.status === 'expired') return t('Expired');
  if (interaction.status === 'canceled') return t('Canceled');
  if (interaction.response) return groundStationDecisionActionLabel(interaction.response.action, t, interaction);
  return t('Closed');
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
