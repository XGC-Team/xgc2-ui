import { UserRound } from 'lucide-react';
import { Stack,StatusText } from '@xgc2/ui-react';
import { DecisionCard,type DecisionCardState } from '@xgc2/native-agent/react';
import '@xgc2/native-agent/styles.css';
import { GroundStationChatEntry } from './GroundStationChatEntry';
import { ExperimentAgentActionReview } from './ExperimentAgentActionReview';
import { DecisionPolicyControl } from './DecisionPolicyControl';
import {
  GroundStationDecisionResponseControls,
} from './GroundStationDecisionResponse';
import {
  groundStationDecisionActionLabel,
  groundStationDecisionActionName,
  groundStationDecisionBodyMessage,
  groundStationDecisionSource,
} from './groundStationDecisionPresentation';
import { groundStationFormFieldLabel } from './groundStationDecisionFormState';
import { useGroundStationText } from './groundStationMessages';
import type {
  GroundStationDecisionInteraction,
  GroundStationDecisionResponse,
} from './groundStationInteractionTypes';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';
import './GroundStationChatDecision.css';

export function GroundStationDecisionChatCard({
  interaction,
  onRespond,
  presentation,
}: {
  interaction: GroundStationDecisionInteraction;
  onRespond: GroundStationDecisionResponder;
  presentation: 'overlay' | 'panel';
}) {
  const t = useGroundStationText();
  const agentAction = interaction.payload.decision.agentAction;
  const action = agentAction?.actionLabel || groundStationDecisionActionName(interaction.title);
  const source = groundStationDecisionSource(interaction);
  const message = groundStationDecisionBodyMessage(interaction);
  return (
    <DecisionCard
      identity={interaction.id}
      state={decisionCardState(interaction)}
      label={interaction.title}
      className="xgc-ground-station-decision-request"
      aria-label={interaction.title}
      data-xgc-role="ground-station-chat-decision-entry"
      data-xgc-id={interaction.id}
      data-xgc-presentation={presentation}
      title={<span data-xgc-role="ground-station-chat-decision-title" data-xgc-id={interaction.id}>{action}</span>}
      timestamp={interaction.createdAt}
      actions={<GroundStationDecisionResponseControls interaction={interaction} onRespond={onRespond} appearance="compact" />}
      detailsLabel={t('Details')}
      details={<>
        {source ? <p className="xgc-ground-station-decision-origin" data-xgc-role="ground-station-chat-decision-origin" data-xgc-id={interaction.id}>{source}</p> : null}
        {agentAction && message ? <p className="xgc-ground-station-decision-message" data-xgc-role="ground-station-chat-decision-message" data-xgc-id={interaction.id}>{message}</p> : null}
        <ExperimentAgentActionReview interaction={interaction} />
        {interaction.status === 'open' && !agentAction && !interaction.payload.decision.form && interaction.origin.experimentId ? <DecisionPolicyControl key={`${interaction.id}:${interaction.revision}`}
          experimentId={interaction.origin.experimentId} source={{kind:'gcs',interactionId:interaction.id}} /> : null}
      </>}
    >
      <div
        className="xgc-ground-station-decision-operation"
        data-xgc-role="ground-station-chat-decision"
        data-xgc-id={interaction.id}
      >
        {!agentAction && message ? <p className="xgc-ground-station-decision-message" data-xgc-role="ground-station-chat-decision-message" data-xgc-id={interaction.id}>{message}</p> : null}
        {agentAction?.lifecycle ? <p className="xgc-ground-station-decision-summary">{t('Run mode')}: {agentAction.lifecycle.runMode}</p> : null}
      </div>
    </DecisionCard>
  );
}

function decisionCardState(interaction:GroundStationDecisionInteraction):DecisionCardState {
  if (interaction.status === 'open') return 'pending';
  if (interaction.response?.action === 'approved') return 'allowed';
  if (interaction.response?.action === 'rejected') return 'denied';
  if (interaction.status === 'expired') return 'expired';
  if (interaction.status === 'canceled') return 'canceled';
  return 'resolved';
}

export function GroundStationOperatorResponseBubble({
  interaction,
  response,
}: {
  interaction: GroundStationDecisionInteraction;
  response: GroundStationDecisionResponse;
}) {
  const t = useGroundStationText();
  const responseAt = response.at || interaction.updatedAt;
  const submittedFields = response.action === 'approved' && response.values
    ? interaction.payload.decision.form?.fields.filter((field) => Object.hasOwn(response.values!, field.name)) ?? []
    : [];
  return (
    <GroundStationChatEntry
      entryId={interaction.id}
      dataXgcRole="ground-station-chat-operator-response"
      dataXgcId={interaction.id}
      speaker="operator"
      appearance="plain"
      avatar={<UserRound size={14} />}
      origin={response.actor || t('Operator')}
      timestamp={responseAt}
    >
      <Stack gap="compact">
        <StatusText status={response.action}>{groundStationDecisionActionLabel(response.action, t, interaction)}</StatusText>
        {response.reason && <p>{response.reason}</p>}
        {submittedFields.length > 0 && <dl
          className="xgc-ground-station-response-values"
          data-xgc-role="ground-station-chat-response-values"
          data-xgc-id={interaction.id}
        >
          {submittedFields.map((field) => {
            const value = response.values![field.name]!;
            const identity = `${interaction.id}:${field.name}`;
            return <div
              className="xgc-ground-station-response-field"
              key={field.name}
              data-xgc-role="ground-station-chat-response-field"
              data-xgc-id={identity}
            >
              <dt data-xgc-role="ground-station-chat-response-label" data-xgc-id={identity}>{groundStationFormFieldLabel(field)}</dt>
              <dd data-xgc-role="ground-station-chat-response-value" data-xgc-id={identity}>
                {typeof value === 'boolean' ? t(value ? 'Yes' : 'No') : String(value)}
              </dd>
            </div>;
          })}
        </dl>}
      </Stack>
    </GroundStationChatEntry>
  );
}
