import { isGroundStationInteractionOpen } from './groundStationInteractionDecoder';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

type GroundStationInteractionEntry = {
  interaction: GroundStationInteraction;
  sequence: number;
};

export type GroundStationInteractionState = {
  targetId: string;
  targetScope: string;
  targetEpoch: number;
  entries: Map<string,GroundStationInteractionEntry>;
  dismissed: Map<string,number>;
  sequence: number;
  loading: boolean;
  inventoryError: string;
};

export type GroundStationInteractionStateAction =
  | { type: 'reset';targetId: string;targetScope: string;targetEpoch: number }
  | { type: 'loading' }
  | {
    type: 'inventory';
    openInteractions: GroundStationInteraction[];
    recentInteractions: GroundStationInteraction[];
    sinceSequence: number;
    recentPending?: boolean;
  }
  | { type: 'inventory-error';message: string }
  | { type: 'merge';interaction: GroundStationInteraction }
  | { type: 'dismiss';id: string;revision: number }
  | { type: 'expiry-tick' };

const MAX_INTERACTIONS = 256;
const MAX_DISMISSED_INTERACTIONS = 512;

export function createGroundStationInteractionState(
  targetId: string,
  targetScope: string,
  targetEpoch: number,
): GroundStationInteractionState {
  return {
    targetId,
    targetScope,
    targetEpoch,
    entries: new Map(),
    dismissed: new Map(),
    sequence: 0,
    loading: true,
    inventoryError: '',
  };
}

export function reduceGroundStationInteractions(
  state: GroundStationInteractionState,
  action: GroundStationInteractionStateAction,
): GroundStationInteractionState {
  switch (action.type) {
    case 'reset':
      return state.targetId === action.targetId
        && state.targetScope === action.targetScope
        && state.targetEpoch === action.targetEpoch
        ? state
        : createGroundStationInteractionState(action.targetId, action.targetScope, action.targetEpoch);
    case 'loading':
      return { ...state,loading: true,inventoryError: '' };
    case 'inventory-error':
      return { ...state,loading: false,inventoryError: action.message };
    case 'inventory': {
      let next: GroundStationInteractionState = {
        ...state,
        entries: new Map(Array.from(state.entries).filter(([,entry]) => (
          entry.sequence > action.sinceSequence || !isGroundStationInteractionOpen(entry.interaction)
        ))),
        loading: action.recentPending === true,
        inventoryError: '',
      };
      action.recentInteractions.forEach((interaction) => {
        next = mergeInteraction(next, interaction);
      });
      action.openInteractions.forEach((interaction) => {
        next = mergeInteraction(next, interaction);
      });
      return next;
    }
    case 'merge':
      return mergeInteraction(state, action.interaction);
    case 'dismiss': {
      const dismissed = new Map(state.dismissed);
      dismissed.set(action.id, action.revision);
      if (dismissed.size > MAX_DISMISSED_INTERACTIONS) {
        const oldest = dismissed.keys().next().value;
        if (typeof oldest === 'string') dismissed.delete(oldest);
      }
      return { ...state,dismissed };
    }
    case 'expiry-tick':
      return { ...state,sequence: state.sequence + 1 };
  }
}

export function mergeGroundStationInteractionSnapshots(
  ...inventories: GroundStationInteraction[][]
) {
  const snapshots = new Map<string,GroundStationInteraction>();
  inventories.forEach((interactions) => interactions.forEach((interaction) => {
    const current = snapshots.get(interaction.id);
    if (!current || shouldReplaceInteraction(current, interaction)) {
      snapshots.set(interaction.id, interaction);
    }
  }));
  return Array.from(snapshots.values());
}

function mergeInteraction(
  state: GroundStationInteractionState,
  interaction: GroundStationInteraction,
): GroundStationInteractionState {
  if (interaction.targetScope !== state.targetScope) return state;
  const current = state.entries.get(interaction.id)?.interaction;
  if (current && !shouldReplaceInteraction(current, interaction)) return state;
  const sequence = state.sequence + 1;
  const entries = new Map(state.entries);
  entries.set(interaction.id, { interaction,sequence });
  const dismissed = new Map(state.dismissed);
  const dismissedRevision = dismissed.get(interaction.id);
  if (dismissedRevision !== undefined && interaction.revision > dismissedRevision) {
    dismissed.delete(interaction.id);
  }
  pruneEntries(entries);
  return { ...state,entries,dismissed,sequence };
}

function shouldReplaceInteraction(
  current: GroundStationInteraction,
  incoming: GroundStationInteraction,
) {
  if (incoming.revision !== current.revision) return incoming.revision > current.revision;
  const statusDifference = statusRank(incoming.status) - statusRank(current.status);
  if (statusDifference !== 0) return statusDifference > 0;
  return incoming.updatedAt > current.updatedAt;
}

function statusRank(status: GroundStationInteraction['status']) {
  return status === 'open' ? 0 : 1;
}

function pruneEntries(entries: Map<string,GroundStationInteractionEntry>) {
  if (entries.size <= MAX_INTERACTIONS) return;
  const ordered = Array.from(entries.entries()).sort((left, right) => (
    Number(isGroundStationInteractionOpen(left[1].interaction))
      - Number(isGroundStationInteractionOpen(right[1].interaction))
    || left[1].interaction.updatedAt.localeCompare(right[1].interaction.updatedAt)
  ));
  ordered.slice(0, entries.size - MAX_INTERACTIONS).forEach(([id]) => entries.delete(id));
}
