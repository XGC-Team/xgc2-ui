import { describe,expect,it } from 'vitest';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';
import {
  formatGroundStationClock,
  formatGroundStationDecisionTargets,
  groundStationDecisionActionName,
  groundStationDecisionBodyMessage,
  groundStationDecisionCompactApproveLabel,
  groundStationDecisionOutcomeLabel,
  groundStationDecisionRequestCopy,
  groundStationDecisionRequestLogCopy,
  groundStationDecisionResultCopy,
  groundStationDecisionSource,
  groundStationDecisionTargetNames,
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

function t(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => String(vars[key] ?? match));
}

describe('ground station decision copy', () => {
  it('strips Confirm from the action name and preserves additional scope', () => {
    const interaction = decision();
    expect(groundStationDecisionActionName(interaction.title)).toBe('Set mode');
    expect(groundStationDecisionSource(interaction)).toBe('PX4 panel control executor');
    expect(groundStationDecisionBodyMessage(interaction)).toBe('');
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
    expect(groundStationDecisionOutcomeLabel(decision({
      status: 'resolved',
      response: { action: 'approved' },
    }), false, t)).toBe('Authorized');
  });

  it('names Confirm copy from frozen robot ids and drops selected boilerplate', () => {
    expect(groundStationDecisionRequestCopy(decision(), t)).toBe('Confirm Set mode?');
    expect(groundStationDecisionRequestCopy(decision({
      title: 'Confirm Arm',
      message: 'Confirm Arm for PX4 robots ["px4-01","px4-02"]?',
    }), t)).toBe('Confirm Arm for px4-01, px4-02?');
    expect(groundStationDecisionRequestCopy(decision({
      title: 'Confirm Arm px4-01, px4-02',
      message: 'Confirm the area is clear?',
    }), t)).toBe('Confirm Arm for px4-01, px4-02?');
    expect(groundStationDecisionRequestLogCopy(decision({
      title: 'Preflight arm test',
      message: 'About to arm 5 PX4 robots once. Confirm the area is clear?',
    }), t)).toBe('About to arm 5 PX4 robots once. Confirm the area is clear?');
  });

  it('writes not-executed, all-succeeded, or mixed per-target results', () => {
    expect(groundStationDecisionResultCopy(decision({
      status: 'resolved',
      response: { action: 'rejected' },
    }), t)).toBe('Not executed');
    expect(groundStationDecisionResultCopy(decision({
      status: 'resolved',
      response: { action: 'approved' },
    }), t)).toBe('Awaiting execution receipt');
    expect(groundStationDecisionResultCopy(decision({
      title: 'Confirm Arm',
      status: 'resolved',
      response: {
        action: 'approved',
        results: { invocationId: 'action-1', attempt: 1, state: 'completed', at: '2026-07-15T09:02:00Z', succeeded: ['px4-01', 'px4-02'], failed: ['px4-03'] },
      },
    }), t)).toBe('px4-01, px4-02 Arm succeeded, px4-03 failed');
    expect(groundStationDecisionResultCopy(decision({
      title: 'Confirm Arm',
      status: 'resolved',
      response: { action: 'approved', results: { invocationId: 'action-1', attempt: 1, state: 'completed', at: '2026-07-15T09:02:00Z', failed: ['px4-03'] } },
    }), t)).toBe('px4-03 failed');
  });

  it('reports success only from completed results and preserves unknown outcomes', () => {
    const results = { invocationId: 'action-1', attempt: 1, state: 'completed' as const,
      at: '2026-07-15T09:02:00Z', succeeded: ['px4-01'] };
    expect(groundStationDecisionResultCopy(decision({ status: 'resolved',
      response: { action: 'approved', results },
    }), t)).toBe('All succeeded');
    expect(groundStationDecisionResultCopy(decision({ title: 'Confirm Arm', status: 'resolved',
      response: { action: 'approved', results: { ...results, uncertain: ['px4-02'] } },
    }), t)).toBe('px4-01 Arm succeeded; px4-02 outcome unknown');
    expect(groundStationDecisionResultCopy(decision({ status: 'resolved',
      response: { action: 'approved', results: { ...results, state: 'not-executed', succeeded: undefined } },
    }), t)).toBe('Not executed');
  });

  it('reads frozen robot names from interpolated prompt JSON, not live selection', () => {
    expect(groundStationDecisionTargetNames(decision())).toEqual([]);
    expect(groundStationDecisionTargetNames(decision({
      message: 'Confirm setting PX4 robots ["px4-01","px4-02"] to flight mode OFFBOARD?',
    }))).toEqual(['px4-01', 'px4-02']);
    expect(formatGroundStationDecisionTargets(['px4-01', 'px4-02'])).toBe('px4-01, px4-02');
    expect(groundStationDecisionTargetNames(decision({
      message: 'Confirm setting PX4 robots px4-03, px4-04 to flight mode OFFBOARD?',
    }))).toEqual(['px4-03', 'px4-04']);
    expect(groundStationDecisionTargetNames(decision({
      message: 'Confirm Set mode for the selected PX4 robots?',
    }))).toEqual([]);
  });
});
