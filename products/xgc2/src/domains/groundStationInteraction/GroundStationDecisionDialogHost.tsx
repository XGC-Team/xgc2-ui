import { useEffect,useMemo,useState } from 'react';
import { GroundStationDecisionDialog } from './GroundStationDecisionDialog';
import { isGroundStationDecisionLocallyExpired } from './groundStationChatTimeline';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';

export function GroundStationDecisionDialogHost({
  enabled,
  decisions,
  onRespond,
}: {
  enabled: boolean;
  decisions: GroundStationDecisionInteraction[];
  onRespond: GroundStationDecisionResponder;
}) {
  const [deferred, setDeferred] = useState<readonly string[]>([]);
  const pending = useMemo(() => decisions.filter(isPendingDecision), [decisions]);
  const pendingKeys = pending.map(decisionKey).join('|');

  useEffect(() => {
    const available = new Set(pending.map(decisionKey));
    setDeferred((current) => {
      const next = current.filter((key) => available.has(key));
      return next.length === current.length ? current : next;
    });
  }, [pending,pendingKeys]);

  const active = pending.find((interaction) => !deferred.includes(decisionKey(interaction)));
  if (!enabled || !active) return null;
  return (
    <GroundStationDecisionDialog
      interaction={active}
      onRespond={onRespond}
      onClose={() => setDeferred((current) => [...current,decisionKey(active)])}
    />
  );
}

function isPendingDecision(interaction: GroundStationDecisionInteraction) {
  return interaction.status === 'open' && !isGroundStationDecisionLocallyExpired(interaction);
}

function decisionKey(interaction: GroundStationDecisionInteraction) {
  return `${interaction.id}:${interaction.revision}`;
}
