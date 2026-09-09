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
    ]);
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
    expect(timeline).toHaveLength(3);
    expect(timeline.every(item => item.type === 'decision-request')).toBe(true);
    const groups = collapseGroundStationChatTimeline(timeline, now);
    expect(groups).toHaveLength(3);
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
