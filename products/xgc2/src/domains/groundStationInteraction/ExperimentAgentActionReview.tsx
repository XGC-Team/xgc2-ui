import './ExperimentAgentActionReview.css';
import { Stack } from '@xgc2/ui-react';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import { useExperimentAgentText } from './experimentAgentMessages';

export function ExperimentAgentActionReview({ interaction }: { interaction: GroundStationDecisionInteraction }) {
  const t = useExperimentAgentText();
  const action = interaction.payload.decision.agentAction;
  if (!action) return null;
  return <section className="experiment-agent-action-review" aria-label={t('Frozen Action review')} data-xgc-role="experiment-agent-action-review" data-xgc-id={interaction.id}>
    <Stack gap="compact">
      <dl>
        <dt>{t('Action')}</dt><dd>{action.actionLabel || action.actionId}</dd>
        {action.lifecycle ? <><dt>{t('Run mode')}</dt><dd>{action.lifecycle.runMode}</dd></> : null}
      </dl>
      {!action.lifecycle && Object.keys(action.parameters).length ? <><strong>{t('Parameters')}</strong><pre>{JSON.stringify(action.parameters,null,2)}</pre></> : null}
      {interaction.response?.admission ? <p>{t('Queued for execution')}</p> : null}
    </Stack>
  </section>;
}
