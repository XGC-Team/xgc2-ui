import type {
  GroundStationContextInteraction,
  GroundStationDecisionInteraction,
  GroundStationDecisionResponse,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';

export type GroundStationDecisionRequestTimelineItem = {
  id: string;
  type: 'decision-request';
  at: string;
  interaction: GroundStationDecisionInteraction;
};

export type GroundStationOperatorResponseTimelineItem = {
  id: string;
  type: 'operator-response';
  at: string;
  interaction: GroundStationDecisionInteraction;
  response: GroundStationDecisionResponse;
};

export type GroundStationDecisionTimelineItem =
  | GroundStationDecisionRequestTimelineItem
  | GroundStationOperatorResponseTimelineItem;

export function projectGroundStationDecisionTimeline(
  interactions: GroundStationDecisionInteraction[],
  _now = Date.now(),
): GroundStationDecisionTimelineItem[] {
  const items = interactions.flatMap<GroundStationDecisionTimelineItem>((interaction) => {
    const projected: GroundStationDecisionTimelineItem[] = [{
      id: `${interaction.id}:request`,
      type: 'decision-request',
      at: interaction.createdAt,
      interaction,
    }];
    // Lifecycle termination updates the original card, not a synthetic chat
    // message or an operator response.
    if (interaction.status === 'canceled') return projected;
    if (interaction.response) {
      projected.push({
        id: `${interaction.id}:response:${interaction.revision}`,
        type: 'operator-response',
        at: interaction.response.at || interaction.updatedAt,
        interaction,
        response: interaction.response,
      });
      return projected;
    }
    return projected;
  });
  return items.sort(compareTimelineItems);
}

export type GroundStationPassiveTimelineItem = {
  id: string;
  type: 'interaction';
  at: string;
  interaction: GroundStationStatusInteraction | GroundStationContextInteraction;
};

export type GroundStationChatTimelineItem =
  | GroundStationPassiveTimelineItem
  | GroundStationDecisionTimelineItem;

/**
 * One rendered timeline row. `latest` is what the chat shows; `history` is the
 * older run of same-origin entries it stands for, oldest first, revealed only
 * when the operator expands the group.
 */
export type GroundStationChatTimelineGroup = {
  id: string;
  key: string;
  latest: GroundStationChatTimelineItem;
  history: GroundStationChatTimelineItem[];
};

/**
 * Collapses a chat timeline to the density an operator can actually read.
 *
 * Two rules, both about repetition rather than importance:
 *  - a status card is a live value, so only its newest revision per statusKey
 *    stays on the timeline and superseded ones move into that group's history;
 *  - a consecutive run of entries with the same origin and the same timeline
 *    kind collapses to its newest entry.
 *
 * Decisions and operator responses retain their individual identities. Their
 * terminal state does not turn distinct operations into repeated updates.
 */
export function collapseGroundStationChatTimeline(
  items: GroundStationChatTimelineItem[],
  _now = Date.now(),
): GroundStationChatTimelineGroup[] {
  const supersededStatuses = new Map<string,GroundStationChatTimelineItem[]>();
  const latestStatusIds = latestStatusItemIds(items);
  const retained = items.filter((item) => {
    const statusKey = statusKeyOf(item);
    if (!statusKey || latestStatusIds.get(statusKey) === item.id) return true;
    supersededStatuses.set(statusKey, [...supersededStatuses.get(statusKey) ?? [],item]);
    return false;
  });

  const groups: GroundStationChatTimelineGroup[] = [];
  for (const item of retained) {
    const key = timelineGroupKey(item);
    const open = groups.at(-1);
    if (key && open && open.key === key) {
      open.history.push(open.latest);
      open.latest = item;
      open.id = item.id;
      continue;
    }
    groups.push({ id: item.id,key: key ?? `ungrouped:${item.id}`,latest: item,history: [] });
  }
  return groups.map((group) => {
    const statusKey = statusKeyOf(group.latest);
    const superseded = statusKey ? supersededStatuses.get(statusKey) ?? [] : [];
    if (superseded.length === 0) return group;
    return { ...group,history: [...superseded,...group.history].sort(compareTimelineItems) };
  });
}

export function isGroundStationDecisionLocallyExpired(
  interaction: GroundStationDecisionInteraction,
  now = Date.now(),
) {
  if (interaction.status === 'expired') return true;
  if (interaction.status !== 'open' || !interaction.expiresAt) return false;
  const expiry = Date.parse(interaction.expiresAt);
  return Number.isFinite(expiry) && expiry <= now;
}

function compareTimelineItems(left: GroundStationChatTimelineItem, right: GroundStationChatTimelineItem) {
  return timestamp(left.at) - timestamp(right.at) || left.id.localeCompare(right.id);
}

function statusKeyOf(item: GroundStationChatTimelineItem) {
  return item.type === 'interaction' && item.interaction.kind === 'status'
    ? item.interaction.payload.status.statusKey
    : '';
}

function latestStatusItemIds(items: GroundStationChatTimelineItem[]) {
  const latest = new Map<string,GroundStationChatTimelineItem>();
  for (const item of items) {
    const statusKey = statusKeyOf(item);
    if (!statusKey) continue;
    const current = latest.get(statusKey);
    if (!current || compareTimelineItems(current, item) <= 0) latest.set(statusKey, item);
  }
  return new Map([...latest].map(([statusKey, item]) => [statusKey,item.id]));
}

// Decisions retain their own identities, including after expiry or response.
function timelineGroupKey(item: GroundStationChatTimelineItem) {
  if (item.type !== 'interaction') return '';
  const origin = item.interaction.origin;
  const originKey = [origin.type,origin.ref ?? '',origin.runId ?? '',origin.nodeId ?? ''].join('|');
  const kind = item.interaction.kind;
  // Two status cards from one origin are two different live values, so the
  // statusKey is part of the identity: only the same key ever collapses.
  const statusKey = statusKeyOf(item);
  return statusKey ? `status:${statusKey}@${originKey}` : `${kind}@${originKey}`;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
