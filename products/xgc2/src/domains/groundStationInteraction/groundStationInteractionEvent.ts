import type { ExecutionEvent } from '../execution/executionPublic';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type { GroundStationInteraction } from './groundStationInteractionTypes';

const interactionEventType = /^ground-station\.interaction-(requested|updated|resolved|canceled|expired)$/;

export function groundStationInteractionFromEvent(
  event: ExecutionEvent,
  targetScope: string,
): GroundStationInteraction | undefined {
  if (event.entityType !== 'ground-station-interaction' || !interactionEventType.test(event.type)) {
    return undefined;
  }
  const interaction = decodeGroundStationInteraction(event.payload);
  if (!interaction || interaction.id !== event.entityId || interaction.targetScope !== targetScope) {
    return undefined;
  }
  return interaction;
}
