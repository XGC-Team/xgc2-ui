import { describe,expect,it } from 'vitest';
import {
  collapseGroundStationChatTimeline,
  type GroundStationChatTimelineItem,
} from './groundStationChatTimeline';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type {
  GroundStationContextInteraction,
  GroundStationDecisionInteraction,
  GroundStationStatusInteraction,
} from './groundStationInteractionTypes';

describe('collapseGroundStationChatTimeline', () => {
  it('collapses a consecutive same-origin run to its newest entry', () => {
    const items = [
      contextItem('context-1', '2026-07-15T09:00:00Z'),
      contextItem('context-2', '2026-07-15T09:01:00Z'),
      contextItem('context-3', '2026-07-15T09:02:00Z'),
    ];

    const groups = collapseGroundStationChatTimeline(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.latest.id).toBe('interaction:context-3');
    expect(groups[0]!.history.map((item) => item.id))
      .toEqual(['interaction:context-1','interaction:context-2']);
  });

  it('keeps a different origin in its own group and does not merge across it', () => {
    const items = [
      contextItem('context-1', '2026-07-15T09:00:00Z'),
      contextItem('context-2', '2026-07-15T09:01:00Z', 'other-node'),
      contextItem('context-3', '2026-07-15T09:02:00Z'),
    ];

    const groups = collapseGroundStationChatTimeline(items);
    expect(groups.map((group) => group.latest.id))
      .toEqual(['interaction:context-1','interaction:context-2','interaction:context-3']);
    expect(groups.every((group) => group.history.length === 0)).toBe(true);
  });

  it('keeps only the newest revision of a statusKey and files the rest as history', () => {
    const items = [
      statusItem('status-1', 'mission', 'running', '2026-07-15T09:00:00Z'),
      statusItem('status-2', 'mission', 'tracking', '2026-07-15T09:01:00Z'),
      statusItem('status-3', 'battery', 'ok', '2026-07-15T09:02:00Z'),
    ];

    const groups = collapseGroundStationChatTimeline(items);
    expect(groups.map((group) => group.latest.id)).toEqual(['interaction:status-2','interaction:status-3']);
    expect(groups[0]!.history.map((item) => item.id)).toEqual(['interaction:status-1']);
  });

  it('never collapses an open decision behind a count', () => {
    const items = [
      decisionItem('decision-1', '2026-07-15T09:00:00Z'),
      decisionItem('decision-2', '2026-07-15T09:01:00Z'),
    ];

    const groups = collapseGroundStationChatTimeline(items, Date.parse('2026-07-15T09:02:00Z'));
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.history.length === 0)).toBe(true);
  });

  it('keeps expired decisions separate so their operation identities remain visible', () => {
    const items = [
      decisionItem('decision-1', '2026-07-15T09:00:00Z'),
      decisionItem('decision-2', '2026-07-15T09:01:00Z'),
    ];

    // Past every expiry: neither decision is waiting on the operator any more.
    const groups = collapseGroundStationChatTimeline(items, Date.parse('2026-07-15T10:00:00Z'));
    expect(groups).toHaveLength(2);
    expect(groups.every(group => group.history.length === 0)).toBe(true);
  });
});

function contextItem(id: string, at: string, nodeId = 'offer'): GroundStationChatTimelineItem {
  return { id: `interaction:${id}`,type: 'interaction',at,interaction: contextFixture(id, at, nodeId) };
}

function statusItem(id: string, statusKey: string, state: string, at: string): GroundStationChatTimelineItem {
  return { id: `interaction:${id}`,type: 'interaction',at,interaction: statusFixture(id, statusKey, state, at) };
}

function decisionItem(id: string, at: string): GroundStationChatTimelineItem {
  return { id: `${id}:request`,type: 'decision-request',at,interaction: decisionFixture(id, at) };
}

function contextFixture(id: string, at: string, nodeId: string): GroundStationContextInteraction {
  const interaction = decode({
    id,kind: 'context',presentation: 'panel',responseMode: 'none',createdAt: at,updatedAt: at,
    payload: { context: { kind: 'robot',id: 'uav-1',actionLabel: 'View' } },
    origin: { type: 'automation',ref: 'mission',nodeId },
  });
  if (interaction.kind !== 'context') throw new Error('invalid context fixture');
  return interaction;
}

function statusFixture(id: string, statusKey: string, state: string, at: string): GroundStationStatusInteraction {
  const interaction = decode({
    id,kind: 'status',presentation: 'panel',responseMode: 'none',createdAt: at,updatedAt: at,
    payload: { status: { statusKey,state } },
    origin: { type: 'automation',ref: 'mission',nodeId: 'status' },
  });
  if (interaction.kind !== 'status') throw new Error('invalid status fixture');
  return interaction;
}

function decisionFixture(id: string, at: string): GroundStationDecisionInteraction {
  const interaction = decode({
    id,kind: 'decision',presentation: 'panel',responseMode: 'decision',createdAt: at,updatedAt: at,
    payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel' } },
    origin: { type: 'automation',ref: 'mission',nodeId: 'confirm' },
    expiresAt: '2026-07-15T09:05:00Z',
  });
  if (interaction.kind !== 'decision') throw new Error('invalid decision fixture');
  return interaction;
}

function decode(patch: Record<string,unknown>) {
  const interaction = decodeGroundStationInteraction({
    schemaVersion: 1,
    targetScope: 'local',
    revision: 1,
    status: 'open',
    severity: 'info',
    title: 'Activity',
    message: 'Ground station activity',
    audience: { scope: 'all' },
    ...patch,
  });
  if (!interaction) throw new Error('invalid interaction fixture');
  return interaction;
}
