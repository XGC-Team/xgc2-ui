import { ConversationMessage,type ConversationMessageDensity } from '@xgc2/ui-react';
import type { ReactNode } from 'react';
import { formatGroundStationTimestamp } from './groundStationInteractionPresentation';

/**
 * How much of an entry a surface shows.
 *
 * `full` is the panel card. `compact` drops the origin/timestamp meta row but
 * keeps the entry body. `summary` is the bubble density: meta hidden and the
 * body held to a single line, so a background activity feed never grows into a
 * floating wall of cards.
 */
export type GroundStationChatEntryDensity = 'full' | 'compact' | 'summary';

export function GroundStationChatEntry({
  entryId,
  dataXgcRole,
  dataXgcId,
  speaker = 'system',
  appearance,
  density = 'full',
  avatar,
  origin,
  timestamp,
  children,
}: {
  entryId: string;
  dataXgcRole: string;
  dataXgcId: string;
  speaker?: 'system' | 'operator';
  appearance?: 'plain' | 'surface';
  density?: GroundStationChatEntryDensity;
  avatar: ReactNode;
  origin: string;
  timestamp: string;
  children: ReactNode;
}) {
  return <ConversationMessage
    appearance={appearance ?? (speaker === 'operator' ? 'surface' : 'plain')}
    author={origin}
    avatar={avatar}
    data-xgc-role={dataXgcRole}
    data-xgc-id={dataXgcId || entryId}
    data-xgc-density={density === 'full' ? undefined : density}
    dateTime={timestamp}
    density={(density === 'full' ? 'default' : density) satisfies ConversationMessageDensity}
    speaker={speaker}
    timestamp={formatGroundStationTimestamp(timestamp)}
  >{children}</ConversationMessage>;
}
