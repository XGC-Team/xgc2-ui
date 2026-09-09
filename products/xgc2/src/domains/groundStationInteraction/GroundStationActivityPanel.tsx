import { useLayoutEffect } from 'react';
import { GroundStationActivityChat } from './GroundStationActivityChat';
import { GroundStationNativeActivityChat } from './GroundStationNativeActivityChat';
import { registerGroundStationActivityPanel } from './groundStationActivityPanelPresence';
import { useGroundStationInteractionScope } from './GroundStationInteractionContext';
import { GroundStationInteractionProvider } from './GroundStationInteractionProvider';
import { useGroundStationActivityScope } from './groundStationActivityScope';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

export function GroundStationActivityPanel({ targetId,workspaceId }: { targetId: string; workspaceId?:string }) {
  const scope = useGroundStationInteractionScope(targetId);
  const activityScope = useGroundStationActivityScope();
  // Presence is a property of the mounted panel itself, not of the interaction
  // scope it happens to find: a panel rendered outside any provider still
  // suppresses the fallback decision dialog — but only for its own target.
  useLayoutEffect(() => activityScope.visible ? registerGroundStationActivityPanel(targetId) : undefined,
    [targetId,activityScope.visible]);
  if (scope) return <GroundStationActivityPanelContent targetId={targetId} workspaceId={workspaceId} />;
  return (
    <GroundStationInteractionProvider targetId={targetId}>
      <GroundStationActivityPanelContent targetId={targetId} workspaceId={workspaceId} />
    </GroundStationInteractionProvider>
  );
}

function GroundStationActivityPanelContent({ targetId,workspaceId }: { targetId: string; workspaceId?:string }) {
  const scope = useGroundStationInteractionScope(targetId);
  const activityScope = useGroundStationActivityScope();
  if (!scope) return null;
  const { interactions,onOpenContext } = scope;
  const matchesExperiment = (item: GroundStationInteraction) => !activityScope.experimentId
    || item.origin.experimentId === activityScope.experimentId;
  const props = {
    enabled: true,
    presentation: 'panel' as const,
    targetId: interactions.targetId,
    decisions: interactions.chatDecisions.filter(matchesExperiment),
    statuses: interactions.statusCards.filter(matchesExperiment),
    contexts: interactions.contextOffers.filter(item => matchesExperiment(item) && !item.payload.context.remoteController),
    streamState: interactions.streamState,
    inventoryError: interactions.inventoryError,
    onDismiss: interactions.dismiss,
    onRespond: interactions.respond,
    onOpenContext,
  };
  const identity = `${targetId}:${activityScope.experimentId ?? ''}`;
  return activityScope.experimentId ? <GroundStationNativeActivityChat key={identity}
    {...props} experimentId={activityScope.experimentId} workspaceId={workspaceId} /> : <GroundStationActivityChat key={identity} {...props} />;
}
