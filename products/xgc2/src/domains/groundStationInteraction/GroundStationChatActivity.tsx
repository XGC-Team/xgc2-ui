import { Bot } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  GroundStationChatEntry,
  type GroundStationChatEntryDensity,
} from './GroundStationChatEntry';
import type {
  GroundStationContextInteraction,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';
import {
  groundStationActivitySummary,
  groundStationInteractionOrigin,
} from './groundStationInteractionPresentation';

/**
 * A passive activity row.
 *
 * At `summary` density a status card collapses to its one-line summary: a
 * status is a live value that keeps re-rendering, and the bubble surface is an
 * awareness feed rather than a dashboard. A context offer keeps its card at
 * every density because it carries the operator action that retires it — a
 * summary line would leave the offer unanswerable wherever no panel is mounted.
 */
export function GroundStationChatActivity({
  interaction,
  density = 'compact',
  children,
}: {
  interaction: GroundStationStatusInteraction | GroundStationContextInteraction;
  density?: GroundStationChatEntryDensity;
  children?: ReactNode;
}) {
  return (
    <GroundStationChatEntry
      entryId={interaction.id}
      dataXgcRole="ground-station-chat-entry"
      dataXgcId={interaction.id}
      density={density}
      avatar={<Bot size={14} />}
      origin={groundStationInteractionOrigin(interaction)}
      timestamp={interaction.updatedAt}
    >
      {density === 'summary' && interaction.kind === 'status' ? (
        <p
          data-xgc-role="ground-station-chat-entry-summary"
          data-xgc-id={interaction.id}
        >{groundStationActivitySummary(interaction)}</p>
      ) : children}
    </GroundStationChatEntry>
  );
}
