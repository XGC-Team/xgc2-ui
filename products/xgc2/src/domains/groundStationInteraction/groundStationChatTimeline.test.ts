import { describe,expect,it } from 'vitest';
import { decodeGroundStationInteraction } from './groundStationInteractionDecoder';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import {
  isGroundStationDecisionLocallyExpired,
  collapseGroundStationChatTimeline,
  projectGroundStationDecisionTimeline,
} from './groundStationChatTimeline';

describe('projectGroundStationDecisionTimeline', () => {
  it('projects an open request without inventing an operator response', () => {
    const decision = fixture();

    expect(projectGroundStationDecisionTimeline([decision], Date.parse('2026-07-15T09:00:30Z'))).toMatchObject([{
      id: 'decision-1:request',type: 'decision-request',interaction: { id: 'decision-1' },
    }]);
  });

  it('projects the authoritative actor, action, and timestamp as an operator response', () => {
    const decision = fixture({
      status: 'resolved',revision: 2,updatedAt: '2026-07-15T09:01:00Z',resolvedAt: '2026-07-15T09:01:00Z',
      response: { action: 'approved',actor: 'station-a',reason: 'Area clear',at: '2026-07-15T09:01:00Z' },
    });

    expect(projectGroundStationDecisionTimeline([decision])).toMatchObject([
      { type: 'decision-request' },
      { type: 'operator-response',response: { action: 'approved',actor: 'station-a',reason: 'Area clear' } },
      { type: 'decision-result' },
    ]);
  });

  it('updates the execution receipt without changing the operator record identity or time', () => {
    const response = { action: 'approved', actor: 'station-a', at: '2026-07-15T09:01:00Z' };
    const approved = fixture({ status: 'resolved', revision: 2, response });
    const completed = fixture({ status: 'resolved', revision: 3, updatedAt: '2026-07-15T09:02:00Z',
      response: { ...response, results: { invocationId: 'action-1', attempt: 1, state: 'completed',
        succeeded: ['px4-01'], failed: ['px4-02'], at: '2026-07-15T09:02:00Z' } },
    });
    const before = projectGroundStationDecisionTimeline([approved]);
    const after = projectGroundStationDecisionTimeline([completed]);
    expect(after.map(item => item.id)).toEqual(before.map(item => item.id));
    expect(after.find(item => item.type === 'operator-response')).toMatchObject({
      at: response.at, response,
    });
    expect(after.find(item => item.type === 'decision-result')?.at).toBe('2026-07-15T09:02:00Z');
  });

  it('keeps expiry and cancellation on each original decision without synthetic messages or folding', () => {
    const canceled = fixture({
      id: 'decision-canceled',status: 'canceled',revision: 2,updatedAt: '2026-07-15T09:01:00Z',
      response: { action: 'canceled',actor: 'automation',reason: 'Automation run stopped',at: '2026-07-15T09:01:00Z' },
    });
    const expired = fixture({ id: 'decision-expired',status: 'expired',revision: 2,updatedAt: '2026-07-15T09:02:00Z' });
    const locallyExpired = fixture({ id: 'decision-local',expiresAt: '2026-07-15T09:00:30Z' });
    const now = Date.parse('2026-07-15T09:01:00Z');

    const timeline = projectGroundStationDecisionTimeline([canceled,expired,locallyExpired], now);
    expect(timeline.filter((item) => item.interaction.id === 'decision-canceled').map((item) => item.type))
      .toEqual(['decision-request','decision-result']);
    expect(timeline.filter((item) => item.interaction.id === 'decision-expired').map((item) => item.type))
      .toEqual(['decision-request','decision-result']);
    expect(timeline.filter((item) => item.interaction.id === 'decision-local').map((item) => item.type))
      .toEqual(['decision-request']);
    expect(timeline.some((item) => item.type === 'operator-response')).toBe(false);
    const groups = collapseGroundStationChatTimeline(timeline, now);
    expect(groups).toHaveLength(5);
    expect(groups.every(group => group.history.length === 0)).toBe(true);
    expect(isGroundStationDecisionLocallyExpired(locallyExpired, now)).toBe(true);
    expect(projectGroundStationDecisionTimeline([canceled], now).some((item) => item.type === 'operator-response')).toBe(false);
  });
});

function fixture(patch: Record<string,unknown> = {}): GroundStationDecisionInteraction {
  const interaction = decodeGroundStationInteraction({
    schemaVersion: 1,
    id: 'decision-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'decision',
    presentation: 'panel',
    responseMode: 'decision',
    severity: 'warning',
    title: 'Confirm operation',
    message: 'Continue with the selected operation?',
    payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },
    origin: { type: 'automation',displayName: 'PX4 controls',nodeId: 'confirm' },
    audience: { scope: 'all' },
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: '2026-07-15T09:00:00Z',
    expiresAt: '2026-07-15T09:05:00Z',
    ...patch,
  });
  if (!interaction || interaction.kind !== 'decision') throw new Error('invalid decision fixture');
  return interaction;
}
