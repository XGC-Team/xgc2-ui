import { isGroundStationInteractionOpen } from './groundStationInteractionDecoder';
import type { GroundStationInteractionState } from './groundStationInteractionState';
import type {
  GroundStationContextInteraction,
  GroundStationDecisionInteraction,
  GroundStationInteraction,
  GroundStationMessageInteraction,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';

export type GroundStationInteractionSelection = {
  toasts: GroundStationMessageInteraction[];
  chatDecisions: GroundStationDecisionInteraction[];
  statusCards: GroundStationStatusInteraction[];
  contextOffers: GroundStationContextInteraction[];
};

export function selectGroundStationInteractions(
  state: GroundStationInteractionState,
  targetId: string,
  targetScope: string,
  targetEpoch: number,
): GroundStationInteractionSelection {
  if (state.targetId !== targetId || state.targetScope !== targetScope || state.targetEpoch !== targetEpoch) {
    return emptySelection();
  }
  const visibleInteractions = Array.from(state.entries.values())
    .map((entry) => entry.interaction)
    .filter((interaction) => state.dismissed.get(interaction.id) !== interaction.revision);
  const openInteractions = visibleInteractions.filter((interaction) => (
    isGroundStationInteractionOpen(interaction)
  ));
  const toasts = openInteractions
    .filter((interaction): interaction is GroundStationMessageInteraction => (
      interaction.kind === 'message'
    ))
    .sort(compareOldestFirst);
  const chatDecisions = visibleInteractions
    .filter((interaction): interaction is GroundStationDecisionInteraction => (
      interaction.kind === 'decision'
    ))
    .sort(compareOldestFirst);
  const statusCards = coalescedStatusCards(openInteractions);
  const contextOffers = openInteractions
    .filter((interaction): interaction is GroundStationContextInteraction => (
      interaction.kind === 'context'
    ))
    .sort(compareNewestFirst);
  return { toasts,chatDecisions,statusCards,contextOffers };
}

export function selectGroundStationInteractionExpiry(
  state: GroundStationInteractionState,
  targetId: string,
  targetScope: string,
  targetEpoch: number,
) {
  if (state.targetId !== targetId || state.targetScope !== targetScope || state.targetEpoch !== targetEpoch) return undefined;
  const now = Date.now();
  let nearest: number | undefined;
  state.entries.forEach(({ interaction }) => {
    if (interaction.status !== 'open' || !interaction.expiresAt) return;
    const expiry = Date.parse(interaction.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return;
    nearest = nearest === undefined ? expiry : Math.min(nearest, expiry);
  });
  return nearest;
}

function emptySelection(): GroundStationInteractionSelection {
  return { toasts: [],chatDecisions: [],statusCards: [],contextOffers: [] };
}

function compareOldestFirst(
  left: GroundStationInteraction,
  right: GroundStationInteraction,
) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function compareNewestFirst(
  left: GroundStationInteraction,
  right: GroundStationInteraction,
) {
  return right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}

function coalescedStatusCards(interactions: GroundStationInteraction[]) {
  const statuses = interactions.filter((interaction): interaction is GroundStationStatusInteraction => (
    interaction.kind === 'status'
  ));
  const byKey = new Map<string,GroundStationStatusInteraction>();
  statuses.forEach((interaction) => {
    const current = byKey.get(interaction.payload.status.statusKey);
    if (!current || compareNewestFirst(interaction, current) < 0) {
      byKey.set(interaction.payload.status.statusKey, interaction);
    }
  });
  return Array.from(byKey.values()).sort(compareNewestFirst);
}
