import { useState } from 'react';
import type { ReactNode } from 'react';
import { Inline,Stack } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import type { ExecutionStreamState } from '../execution/executionPublic';
import {
  GroundStationContextOffer,
  GroundStationStatusCard,
  type GroundStationOpenContext,
} from './GroundStationActivityViews';
import { GroundStationChatActivity } from './GroundStationChatActivity';
import type { GroundStationChatEntryDensity } from './GroundStationChatEntry';
import {
  GroundStationDecisionChatCard,
  GroundStationOperatorResponseBubble,
} from './GroundStationChatDecision';
import {
  GroundStationChatPanel,
  type GroundStationChatMessageInput,
} from './GroundStationChatPanel';
import { useGroundStationText } from './groundStationMessages';
import type {
  GroundStationContextInteraction,
  GroundStationDecisionInteraction,
  GroundStationInteractionSeverity,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';
import {
  collapseGroundStationChatTimeline,
  projectGroundStationDecisionTimeline,
  type GroundStationChatTimelineGroup,
  type GroundStationChatTimelineItem,
} from './groundStationChatTimeline';

export function GroundStationActivityChat({
  enabled,
  presentation = 'overlay',
  targetId,
  decisions,
  statuses,
  contexts,
  streamState,
  inventoryError,
  onDismiss,
  onRespond,
  onOpenContext,
  onSendMessage,
  renderConversation,
}: {
  enabled: boolean;
  renderConversation?: (entries: ReadonlyArray<{ id: string; at: string; content: ReactNode }>) => ReactNode;
  presentation?: 'overlay' | 'panel';
  targetId: string;
  decisions: GroundStationDecisionInteraction[];
  statuses: GroundStationStatusInteraction[];
  contexts: GroundStationContextInteraction[];
  streamState: ExecutionStreamState;
  inventoryError: string;
  onDismiss: (interaction: GroundStationContextInteraction) => Promise<unknown>;
  onRespond: GroundStationDecisionResponder;
  onOpenContext?: GroundStationOpenContext;
  onSendMessage?: (input: GroundStationChatMessageInput) => void | Promise<void>;
}) {
  const passiveItems: GroundStationChatTimelineItem[] = [...statuses,...contexts].map((interaction) => ({
    id: `interaction:${interaction.id}`,
    type: 'interaction',
    at: interaction.createdAt,
    interaction,
  }));
  const items: GroundStationChatTimelineItem[] = [
    ...passiveItems,
    ...projectGroundStationDecisionTimeline(decisions),
  ].sort(compareTimelineItems);
  const groups = collapseGroundStationChatTimeline(items);
  const activityVersion = items
    .map((item) => `${item.type}:${item.id}:${item.interaction.revision}:${item.interaction.updatedAt}`)
    .join('|');
  const attentionSeverity = items.reduce<GroundStationInteractionSeverity>(
    (current, item) => severityRank(item.interaction.severity) > severityRank(current) ? item.interaction.severity : current,
    'info',
  );
  const renderItem = (item: GroundStationChatTimelineItem, density: GroundStationChatEntryDensity) => (
    <GroundStationChatTimelineEntry
      item={item}
      targetId={targetId}
      presentation={presentation}
      density={density}
      onDismiss={onDismiss}
      onRespond={onRespond}
      onOpenContext={onOpenContext}
    />
  );
  if (renderConversation) return renderConversation(groups.map((group) => ({
    id: groupKey(group),
    at: group.latest.at,
    content: <GroundStationChatTimelineGroupView group={group}
      density={presentation === 'panel' ? 'full' : 'summary'} renderItem={renderItem} />,
  })));
  return (
    <GroundStationChatPanel
      enabled={enabled}
      presentation={presentation}
      targetId={targetId}
      activityCount={groups.length}
      activityVersion={activityVersion}
      attentionSeverity={attentionSeverity}
      streamState={streamState}
      inventoryError={inventoryError}
      onSendMessage={onSendMessage}
      receiptItems={[...decisions,...statuses,...contexts]}
    >
      {groups.map((group) => (
        <GroundStationChatTimelineGroupView
          key={groupKey(group)}
          group={group}
          // The panel is the full card and the bubble is the collapsed one.
          // Panel density used to be 'compact', which dropped the origin and
          // timestamp meta row from the one surface that has room for it and
          // is where an operator goes to find out which node said this.
          density={presentation === 'panel' ? 'full' : 'summary'}
          renderItem={renderItem}
        />
      ))}
    </GroundStationChatPanel>
  );
}

/**
 * Renders one collapsed group: its newest entry, plus a disclosure standing for
 * the older run behind it. The count is what the operator uses to decide the
 * history is worth opening, so it is text rather than a bare chevron.
 */
function GroundStationChatTimelineGroupView({
  group,
  density,
  renderItem,
}: {
  group: GroundStationChatTimelineGroup;
  density: GroundStationChatEntryDensity;
  renderItem: (item: GroundStationChatTimelineItem, density: GroundStationChatEntryDensity) => ReactNode;
}) {
  const t = useGroundStationText();
  const [expanded, setExpanded] = useState(false);
  if (group.history.length === 0) return <>{renderItem(group.latest, density)}</>;
  return (
    <Stack
      gap="compact"
      data-xgc-role="ground-station-chat-entry-group"
      data-xgc-id={group.id}
      data-xgc-expanded={expanded ? 'true' : 'false'}
    >
      {expanded && group.history.map((item) => (
        <div key={itemKey(item)}>{renderItem(item, density)}</div>
      ))}
      {renderItem(group.latest, density)}
      <Inline gap="compact">
        <ControlButton
          size="compact"
          aria-expanded={expanded}
          dataXgcRole="ground-station-chat-entry-more"
          dataXgcId={group.id}
          onClick={() => setExpanded((current) => !current)}
        >{expanded ? t('Hide earlier') : t('{count} more', { count: group.history.length })}</ControlButton>
      </Inline>
    </Stack>
  );
}

function GroundStationChatTimelineEntry({
  item,
  targetId,
  presentation,
  density,
  onDismiss,
  onRespond,
  onOpenContext,
}: {
  item: GroundStationChatTimelineItem;
  targetId: string;
  presentation: 'overlay' | 'panel';
  density: GroundStationChatEntryDensity;
  onDismiss: (interaction: GroundStationContextInteraction) => Promise<unknown>;
  onRespond: GroundStationDecisionResponder;
  onOpenContext?: GroundStationOpenContext;
}) {
  if (item.type === 'decision-request') {
    return <GroundStationDecisionChatCard
      interaction={item.interaction}
      onRespond={onRespond}
      presentation={presentation}
    />;
  }
  if (item.type === 'operator-response') {
    return <GroundStationOperatorResponseBubble interaction={item.interaction} response={item.response} />;
  }
  const interaction = item.interaction;
  return (
    <GroundStationChatActivity interaction={interaction} density={density}>
      {interaction.kind === 'status' && <GroundStationStatusCard interaction={interaction} placement={presentation} />}
      {interaction.kind === 'context' && (
        <GroundStationContextOffer
          targetId={targetId}
          interaction={interaction}
          placement={presentation}
          onDismiss={onDismiss}
          onOpenContext={onOpenContext}
        />
      )}
    </GroundStationChatActivity>
  );
}

function groupKey(group: GroundStationChatTimelineGroup) {
  return `${group.key}:${itemKey(group.latest)}`;
}

function itemKey(item: GroundStationChatTimelineItem) {
  return item.type === 'interaction' && item.interaction.kind === 'status'
    ? `status:${item.interaction.payload.status.statusKey}`
    : item.id;
}

function compareTimelineItems(left: GroundStationChatTimelineItem, right: GroundStationChatTimelineItem) {
  return timestamp(left.at) - timestamp(right.at) || left.id.localeCompare(right.id);
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function severityRank(severity: GroundStationInteractionSeverity) {
  switch (severity) {
    case 'critical': return 4;
    case 'error': return 3;
    case 'warning': return 2;
    case 'success': return 1;
    case 'info': return 0;
  }
}

export type GroundStationActivityChatProps = Parameters<typeof GroundStationActivityChat>[0];
