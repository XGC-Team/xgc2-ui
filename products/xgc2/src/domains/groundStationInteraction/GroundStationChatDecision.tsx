import { useContext } from 'react';
import { Stack,StatusText } from '@xgc2/ui-react';
import { DecisionCard,StaleApprovalNotice,type DecisionCardState } from '@xgc2/agent-runtime/react';
import '@xgc2/agent-runtime/styles.css';
import { useAppLanguage } from '../../shared/localization/localizedText';
import { GroundStationInteractionContext } from './GroundStationInteractionContext';
import { GroundStationChatEntry } from './GroundStationChatEntry';
import { ExperimentAgentActionReview } from './ExperimentAgentActionReview';
import {
  GroundStationDecisionResponseControls,
} from './GroundStationDecisionResponse';
import {
  formatGroundStationDecisionTargets,
  groundStationDecisionActionLabel,
  groundStationDecisionActionName,
  groundStationDecisionBodyMessage,
  groundStationDecisionRequestCopy,
  groundStationDecisionRequestLogCopy,
  groundStationDecisionResultCopy,
  groundStationDecisionTargetNames,
} from './groundStationDecisionPresentation';
import { groundStationFormFieldLabel } from './groundStationDecisionFormState';
import { useGroundStationText } from './groundStationMessages';
import type {
  GroundStationDecisionInteraction,
  GroundStationDecisionResponse,
} from './groundStationInteractionTypes';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';
import './GroundStationChatDecision.css';

/** One pending decision enters once per identity; remounts of the same id stay put. */
const arrivedDecisionIds = new Set<string>();

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
  const language = useAppLanguage();
  const scope = useContext(GroundStationInteractionContext);
  const refresh = scope?.interactions.targetScope === interaction.targetScope ? scope.interactions.refresh : undefined;
  const agentAction = interaction.payload.decision.agentAction;
  const action = agentAction?.actionLabel || groundStationDecisionActionName(interaction.title);
  const message = groundStationDecisionBodyMessage(interaction);
  const requestCopy = groundStationDecisionRequestCopy(interaction, t);
  const targets = formatGroundStationDecisionTargets(groundStationDecisionTargetNames(interaction));
  const state = decisionCardState(interaction);
  const shouldEnter = state === 'pending' && !arrivedDecisionIds.has(interaction.id);
  if (state !== 'pending') {
    return (
      <GroundStationChatEntry
        entryId={interaction.id}
        dataXgcRole="ground-station-chat-decision-entry"
        dataXgcId={interaction.id}
        speaker="system"
        appearance="plain"
        density={presentation === 'panel' ? 'full' : 'summary'}
        avatar={null}
        origin={t('Ground station')}
        timestamp={interaction.createdAt}
        className="xgc-ground-station-chat-entry-base"
        metaClassName="xgc-ground-station-chat-entry-meta"
      >
        <p
          className="xgc-ground-station-decision-resolved-summary"
          data-xgc-role="ground-station-chat-decision-resolved"
          data-xgc-id={interaction.id}
        >
          {groundStationDecisionRequestLogCopy(interaction, t)}
        </p>
      </GroundStationChatEntry>
    );
  }

  return (
    <DecisionCard
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) arrivedDecisionIds.add(interaction.id);
      }}
      identity={interaction.id}
      state={state}
      label={interaction.title}
      className="xgc-ground-station-decision-request"
      data-xgc-arrive={shouldEnter ? 'true' : 'false'}
      aria-label={interaction.title}
      data-xgc-role="ground-station-chat-decision-entry"
      data-xgc-id={interaction.id}
      data-xgc-presentation={presentation}
      title={<span data-xgc-role="ground-station-chat-decision-title" data-xgc-id={interaction.id}>{action}</span>}
      timestamp={interaction.createdAt}
      actions={<GroundStationDecisionResponseControls interaction={interaction} onRespond={onRespond} appearance="compact" />}
      detailsLabel={agentAction ? t('Details') : undefined}
      details={agentAction ? <>
        {message ? <p className="xgc-ground-station-decision-message" data-xgc-role="ground-station-chat-decision-message" data-xgc-id={interaction.id}>{message}</p> : null}
        <ExperimentAgentActionReview interaction={interaction} />
      </> : undefined}
    >
      <StaleApprovalNotice identity={interaction.id} open={interaction.status === 'open'}
        createdAt={interaction.createdAt} locale={language === 'zh-CN' ? 'zh' : 'en'} onRefresh={refresh} />
      <div
        className="xgc-ground-station-decision-operation"
        data-xgc-role="ground-station-chat-decision"
        data-xgc-id={interaction.id}
      >
        {!agentAction && (message || requestCopy) ? <p className="xgc-ground-station-decision-message" data-xgc-role="ground-station-chat-decision-message" data-xgc-id={interaction.id}>{message || requestCopy}</p> : null}
        {targets ? <p className="xgc-ground-station-decision-origin" data-xgc-role="ground-station-chat-decision-targets" data-xgc-id={interaction.id}>{targets}</p> : null}
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

export function GroundStationDecisionResultLog({
  interaction,
  presentation,
}: {
  interaction: GroundStationDecisionInteraction;
  presentation: 'overlay' | 'panel';
}) {
  const t = useGroundStationText();
  return (
    <GroundStationChatEntry
      entryId={`${interaction.id}:result`}
      dataXgcRole="ground-station-chat-decision-result-entry"
      dataXgcId={interaction.id}
      speaker="system"
      appearance="plain"
      density={presentation === 'panel' ? 'full' : 'summary'}
      avatar={null}
      origin={t('Ground station')}
      timestamp={interaction.response?.results?.at || interaction.response?.at || interaction.updatedAt}
      className="xgc-ground-station-chat-entry-base"
      metaClassName="xgc-ground-station-chat-entry-meta"
    >
      <p
        className="xgc-ground-station-decision-resolved-summary"
        data-xgc-role="ground-station-chat-decision-result"
        data-xgc-id={interaction.id}
      >
        {groundStationDecisionResultCopy(interaction, t)}
      </p>
    </GroundStationChatEntry>
  );
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
      avatar={null}
      origin={response.actor || t('Operator')}
      timestamp={responseAt}
      className="xgc-ground-station-chat-entry-base"
      metaClassName="xgc-ground-station-chat-entry-meta"
    >
      <Stack gap="compact">
        <StatusText status={response.action} className="xgc-ground-station-response-action">{groundStationDecisionActionLabel(response.action, t, interaction)}</StatusText>
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
