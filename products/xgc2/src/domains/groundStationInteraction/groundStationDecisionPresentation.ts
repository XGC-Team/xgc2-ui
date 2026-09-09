import type { LocalizedText } from '../../shared/localization/localizedText';
import type {
  GroundStationDecisionAction,
  GroundStationDecisionInteraction,
  GroundStationInteraction,
} from './groundStationInteractionTypes';

export function groundStationDecisionActionLabel(
  action: GroundStationDecisionAction,
  t: LocalizedText,
  interaction?: GroundStationDecisionInteraction,
) {
  switch (action) {
    case 'approved': return interaction?.payload.decision.approveLabel || t('Confirmed');
    case 'rejected': return interaction?.payload.decision.rejectLabel || t('Rejected');
    case 'canceled': return t('Canceled');
  }
}

export function groundStationDecisionActionName(title: string) {
  const trimmed = title.trim();
  return trimmed.replace(/^(confirm|确认)\s+/i, '').trim() || trimmed;
}

export function groundStationDecisionSource(interaction: GroundStationInteraction) {
  return (interaction.origin.displayName || interaction.origin.ref || '').trim();
}

export function groundStationDecisionBodyMessage(interaction: GroundStationDecisionInteraction) {
  const message = interaction.message.trim();
  if (!message) return '';
  const title = normalizeDecisionCopy(interaction.title);
  const action = normalizeDecisionCopy(groundStationDecisionActionName(interaction.title));
  const body = normalizeDecisionCopy(message);
  if (body === title || body === action) return '';
  return interaction.message;
}

export function groundStationDecisionCompactApproveLabel(interaction: GroundStationDecisionInteraction) {
  const label = interaction.payload.decision.approveLabel.trim();
  if (/^(confirm|确认)$/i.test(label)) {
    return groundStationDecisionActionName(interaction.title) || label;
  }
  return interaction.payload.decision.approveLabel;
}

export function groundStationDecisionOutcomeLabel(
  interaction: GroundStationDecisionInteraction,
  locallyExpired: boolean,
  t: LocalizedText,
) {
  if (locallyExpired || interaction.status === 'expired') return t('Expired');
  if (interaction.status === 'canceled') return t('Canceled');
  if (interaction.response?.action === 'approved') return t('Authorized');
  if (interaction.response?.action === 'rejected') return t('Rejected');
  return t('Closed');
}

export function formatGroundStationClock(value: string, nowMs = Date.now()) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  const now = new Date(nowMs);
  const sameDay = timestamp.getFullYear() === now.getFullYear()
    && timestamp.getMonth() === now.getMonth()
    && timestamp.getDate() === now.getDate();
  return timestamp.toLocaleString(undefined, sameDay
    ? { hour: 'numeric',minute: '2-digit' }
    : { month: 'short',day: 'numeric',hour: 'numeric',minute: '2-digit' });
}

function normalizeDecisionCopy(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
