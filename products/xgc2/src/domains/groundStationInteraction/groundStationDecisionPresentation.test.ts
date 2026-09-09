import { describe,expect,it } from 'vitest';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import {
  formatGroundStationClock,
  groundStationDecisionActionName,
  groundStationDecisionBodyMessage,
  groundStationDecisionCompactApproveLabel,
  groundStationDecisionOutcomeLabel,
  groundStationDecisionSource,
} from './groundStationDecisionPresentation';

function decision(overrides: Partial<GroundStationDecisionInteraction> = {}): GroundStationDecisionInteraction {
  return {
    schemaVersion: 1,id: 'decision-1',targetScope: 'local',revision: 1,status: 'open',
    kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
    title: 'Confirm Set mode',
    message: 'Confirm Set mode for the selected PX4 robots?',
    origin: { type: 'automation',ref: 'px4-control',displayName: 'PX4 panel control executor',nodeId: 'confirmation-request' },
    audience: { scope: 'all' },
    createdAt: '2026-09-06T07:29:16Z',updatedAt: '2026-09-06T07:29:16Z',
    payload: { decision: { approveLabel: 'Confirm',rejectLabel: 'Cancel',requireReason: false } },
    ...overrides,
  };
}

describe('ground station decision copy', () => {
  it('strips Confirm from the action name and preserves additional scope', () => {
    const interaction = decision();
    expect(groundStationDecisionActionName(interaction.title)).toBe('Set mode');
    expect(groundStationDecisionSource(interaction)).toBe('PX4 panel control executor');
    expect(groundStationDecisionBodyMessage(interaction)).toBe(interaction.message);
    expect(groundStationDecisionCompactApproveLabel(interaction)).toBe('Set mode');
  });

  it('hides only exact restatements, never a matching prefix with consequences', () => {
    expect(groundStationDecisionBodyMessage(decision({ message: 'Confirm Set mode' }))).toBe('');
    const message = 'Confirm Set mode; this affects all selected robots and cancels their current task.';
    expect(groundStationDecisionBodyMessage(decision({ message }))).toBe(message);
  });

  it('keeps a distinctive consequence and a specific approve label', () => {
    const interaction = decision({
      title: 'Preflight arm test',
      message: 'About to arm 5 PX4 robots once. Confirm the area is clear?',
      payload: { decision: { approveLabel: 'Arm 5 robots',rejectLabel: 'Cancel',requireReason: false } },
    });
    expect(groundStationDecisionActionName(interaction.title)).toBe('Preflight arm test');
    expect(groundStationDecisionBodyMessage(interaction)).toBe(interaction.message);
    expect(groundStationDecisionCompactApproveLabel(interaction)).toBe('Arm 5 robots');
  });

  it('abbreviates the clock and does not keep node plumbing in the source', () => {
    expect(groundStationDecisionSource(decision())).not.toMatch(/confirmation-request|px4-control/);
    const sameDay = formatGroundStationClock('2026-09-06T07:29:16Z', Date.parse('2026-09-06T12:00:00Z'));
    expect(sameDay).not.toMatch(/2026/);
    expect(sameDay.split(':')).toHaveLength(2);
    const otherDay = formatGroundStationClock('2026-09-05T07:29:16Z', Date.parse('2026-09-06T12:00:00Z'));
    expect(otherDay).not.toBe(sameDay);
    expect(otherDay.split(':')).toHaveLength(2);
  });

  it('reports authorized instead of the Confirm button label', () => {
    const t = (key: string) => key;
    expect(groundStationDecisionOutcomeLabel(decision({
      status: 'resolved',
      response: { action: 'approved' },
    }), false, t)).toBe('Authorized');
  });
});
