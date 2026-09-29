import type { LocalizedText } from '../../shared/localization/localizedText';
import { formatOperatorDateTime,sameOperatorDay } from '../../shared/operatorTime';
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
  if (isGenericRobotConfirmPrompt(message)) return '';
  return interaction.message;
}

export function groundStationDecisionVerb(interaction: GroundStationDecisionInteraction) {
  const name = groundStationDecisionActionName(interaction.title);
  const named = new Set(groundStationDecisionTargetNames(interaction));
  const verb = name
    .split(/[,\s]+/)
    .filter((token) => token.length > 0 && !named.has(token) && !NAMED_ROBOT_ID.test(token))
    .join(' ')
    .trim();
  return verb || name;
}

export function groundStationDecisionRequestCopy(
  interaction: GroundStationDecisionInteraction,
  t: LocalizedText,
) {
  const verb = t(groundStationDecisionVerb(interaction));
  const targets = formatGroundStationDecisionTargets(groundStationDecisionTargetNames(interaction));
  if (targets) return t('Confirm {verb} for {targets}?', { verb, targets });
  return t('Confirm {verb}?', { verb });
}

export function groundStationDecisionRequestLogCopy(
  interaction: GroundStationDecisionInteraction,
  t: LocalizedText,
) {
  return groundStationDecisionBodyMessage(interaction) || groundStationDecisionRequestCopy(interaction, t);
}

export function groundStationDecisionResultCopy(
  interaction: GroundStationDecisionInteraction,
  t: LocalizedText,
) {
  if (interaction.response?.action !== 'approved' || interaction.status !== 'resolved') {
    return t('Not executed');
  }
  const results = interaction.response.results;
  if (!results) return t('Awaiting execution receipt');
  if (results.state === 'not-executed') return t('Not executed');
  const verb = t(groundStationDecisionVerb(interaction));
  const succeeded = formatGroundStationDecisionTargets(results.succeeded ?? []);
  const failed = formatGroundStationDecisionTargets(results.failed ?? []);
  const uncertain = formatGroundStationDecisionTargets(results.uncertain ?? []);
  if (succeeded && !failed && !uncertain) return t('All succeeded');
  const outcome = succeeded && failed
    ? t('{succeeded} {verb} succeeded, {failed} failed', { succeeded, verb, failed })
    : succeeded ? t('{succeeded} {verb} succeeded', { succeeded, verb })
      : failed ? t('{failed} failed', { failed }) : '';
  return [outcome, uncertain ? t('{uncertain} outcome unknown', { uncertain }) : ''].filter(Boolean).join('; ');

}

export function groundStationDecisionCompactApproveLabel(interaction: GroundStationDecisionInteraction) {
  const label = interaction.payload.decision.approveLabel.trim();
  if (/^(confirm|确认)$/i.test(label)) {
    return groundStationDecisionActionName(interaction.title) || label;
  }
  return interaction.payload.decision.approveLabel;
}

const ROBOT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const NAMED_ROBOT_ID = /^[A-Za-z][A-Za-z0-9]*-\d[A-Za-z0-9_.-]*$/;

export function groundStationDecisionTargetNames(interaction: GroundStationDecisionInteraction) {
  const fromAction = robotIdsFromUnknown(interaction.payload.decision.agentAction?.parameters.robotIds);
  if (fromAction.length > 0) return fromAction;
  const fromMessage = robotIdsFromMessage(interaction.message);
  if (fromMessage.length > 0) return fromMessage;
  return robotIdsFromTitle(interaction.title);
}

export function formatGroundStationDecisionTargets(names: readonly string[]) {
  return names.join(', ');
}

function robotIdsFromMessage(message: string) {
  const matches = message.match(/\[[^[\]]*]/g) ?? [];
  for (const candidate of matches) {
    try {
      const ids = robotIdsFromUnknown(JSON.parse(candidate) as unknown);
      if (ids.length > 0) return ids;
    } catch {
      continue;
    }
  }
  const listed = message.match(/\brobots?\s+(.+?)(?:\s+to\s+|\?|$)/i);
  if (!listed) return [];
  const ids = listed[1]
    .split(/[,\s]+/)
    .map((value) => value.replace(/^["'[\]]+|["'\]]+$/g, ''))
    .filter((id) => NAMED_ROBOT_ID.test(id));
  if (ids.length === 0 || new Set(ids).size !== ids.length) return [];
  return ids;
}

function robotIdsFromTitle(title: string) {
  const ids = title
    .split(/[,\s]+/)
    .map((value) => value.replace(/^["'[\]]+|["'\]]+$/g, ''))
    .filter((id) => NAMED_ROBOT_ID.test(id));
  if (ids.length === 0 || new Set(ids).size !== ids.length) return [];
  return ids;
}

function robotIdsFromUnknown(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && ROBOT_ID.test(id));
  if (ids.length !== value.length || new Set(ids).size !== ids.length) return [];
  return ids;
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
  const sameDay = sameOperatorDay(timestamp, new Date(nowMs));
  return formatOperatorDateTime(timestamp, undefined, sameDay
    ? { hour: 'numeric',minute: '2-digit' }
    : { month: 'short',day: 'numeric',hour: 'numeric',minute: '2-digit' });
}

function normalizeDecisionCopy(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isGenericRobotConfirmPrompt(message: string) {
  if (!/^confirm\b/i.test(message) || /;/.test(message)) return false;
  return /\bthe selected\b.+\brobots?\b/i.test(message)
    || /\bthe selected PX4\b/i.test(message)
    || /\[[^[\]]*\]/.test(message)
    || /\brobots?\s+[A-Za-z][A-Za-z0-9]*-\d/i.test(message)
    || /\bfor\b[\s\S]*\brobots?\b/i.test(message);
}
