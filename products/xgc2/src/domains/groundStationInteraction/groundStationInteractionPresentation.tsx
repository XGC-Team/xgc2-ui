import type { GroundStationInteraction } from './groundStationInteractionTypes';

export function groundStationInteractionOrigin(interaction: GroundStationInteraction) {
  const source = interaction.origin.displayName || interaction.origin.ref || interaction.origin.type;
  return interaction.origin.nodeId ? `${source} · ${interaction.origin.nodeId}` : source;
}

/**
 * The one-line form of a passive activity entry. It is what the bubble density
 * shows in place of a full card: enough to recognize the activity, never a
 * control the operator could act on without opening the panel.
 */
export function groundStationActivitySummary(interaction: GroundStationInteraction) {
  if (interaction.kind === 'status') {
    const status = interaction.payload.status;
    const progress = status.progress === undefined ? '' : ` ${Math.round(status.progress * 100)}%`;
    return `${interaction.title} · ${status.state}${progress}`;
  }
  if (interaction.kind === 'context') {
    return `${interaction.title} · ${interaction.payload.context.kind}`;
  }
  return interaction.title || interaction.message;
}

export function formatGroundStationTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

export function groundStationErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
