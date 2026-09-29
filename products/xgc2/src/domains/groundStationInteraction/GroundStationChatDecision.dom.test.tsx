// @vitest-environment jsdom

import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationDecisionChatCard,GroundStationDecisionResultLog,GroundStationOperatorResponseBubble } from './GroundStationChatDecision';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

vi.mock('../operatorAccess/operatorAccessPublic', async (importOriginal) => ({
  ...(await importOriginal() as object),
  ensureOperatorControlSession: async () => true,
  operatorControlSessionReady: () => true,
  useOperatorControlSession: () => ({ phase: 'ready', ensuring: false, blocked: false, retry: vi.fn() }),
  OperatorControlSessionNotice: () => null,
}));

function decision(id = 'arm-test'): GroundStationDecisionInteraction {
  return {
    schemaVersion: 1,id,targetScope: 'local',revision: 1,status: 'open',
    kind: 'decision',presentation: 'panel',responseMode: 'decision',severity: 'warning',
    title: 'Preflight arm test',
    message: 'About to arm 5 PX4 robots once. Confirm the area is clear?',
    origin: { type: 'automation',ref: 'Preflight' },audience: { scope: 'all' },
    createdAt: '2026-09-05T10:00:00Z',updatedAt: '2026-09-05T10:00:00Z',
    payload: { decision: { approveLabel: 'Arm 5 robots',rejectLabel: 'Cancel',requireReason: false } },
  };
}

describe('GroundStationDecisionChatCard', () => {
  it('presents the complete decision and its source in one activity document', () => {
    const interaction = decision();
    const { container } = render(<GroundStationDecisionChatCard interaction={interaction} onRespond={vi.fn()} presentation="panel" />);
    const request = screen.getByRole('article', { name: 'Preflight arm test' });
    expect(request).toHaveAttribute('data-xgc-role', 'ground-station-chat-decision-entry');
    expect(request).toHaveAttribute('data-xgc-id', interaction.id);
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(request.querySelector('.xgc-conversation-message')).toBeNull();
    for (const leaf of ['title','message']) {
      expect(request.querySelector(`[data-xgc-role="ground-station-chat-decision-${leaf}"][data-xgc-id="arm-test"]`)).toBeInTheDocument();
    }
    expect(request.querySelector('[data-xgc-role="decision-card-details-toggle"]')).toBeNull();
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-origin"]')).toBeNull();
    expect(within(request).queryByRole('button', { name: 'Add a note' })).toBeNull();
    expect(request.querySelector('[data-xgc-role="decision-card-time"]')).toBeInTheDocument();
    expect(within(request).getByText(interaction.message)).toBeInTheDocument();
    expect(within(request).getByText('Preflight arm test')).toBeInTheDocument();
    expect(request).toHaveClass('xgc-decision-card','xgc-ground-station-decision-request');
    const approve = within(request).getByRole('button', { name: 'Arm 5 robots' });
    expect(approve).toBeEnabled();
    expect(approve).toHaveAttribute('data-xgc-tone', 'default');
    expect(approve).toHaveAttribute('data-xgc-appearance', 'raised');
    const reject = within(request).getByRole('button', { name: 'Cancel' });
    expect(reject).toBeEnabled();
    expect(reject).toHaveAttribute('data-xgc-appearance', 'raised');
    expect(approve).toHaveClass('xgc-ground-station-decision-choice');
    expect(reject).toHaveClass('xgc-ground-station-decision-choice');
  });

  it.each([
    ['Arm 5 robots','approved'],
    ['Cancel','rejected'],
  ] as const)('keeps the %s action readable while its response is pending', async (label,action) => {
    const interaction = decision();
    let resolve!: (value: GroundStationDecisionInteraction) => void;
    const onRespond = vi.fn(() => new Promise<GroundStationDecisionInteraction>((complete) => { resolve = complete; }));
    render(<GroundStationDecisionChatCard interaction={interaction} onRespond={onRespond} presentation="panel" />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith(interaction, action, {}));
    expect(screen.queryByText(/Confirming|Rejecting/)).toBeNull();
    await act(async () => { resolve(interaction); });
  });

  it('does not offer empty Details or an optional note on compact operator confirms', () => {
    const first = decision('request-one');
    const second = decision('request-two');
    const { container } = render(<>
      <GroundStationDecisionChatCard interaction={first} onRespond={vi.fn()} presentation="panel" />
      <GroundStationDecisionChatCard interaction={second} onRespond={vi.fn()} presentation="panel" />
    </>);
    for (const interaction of [first,second]) {
      const request = container.querySelector(`[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="${interaction.id}"]`)!;
      expect(request.querySelector('[data-xgc-role="decision-card-details-toggle"]')).toBeNull();
      expect(within(request as HTMLElement).queryByRole('button', { name: 'Add a note' })).toBeNull();
      expect(request.querySelector(`[data-xgc-role="ground-station-decision-reason-input"][data-xgc-id="${interaction.id}"]`)).toBeNull();
    }
  });

  it('uses a three-row Confirm ticket: kicker and clock, operation, then controls', () => {
    const interaction = decision('set-mode');
    interaction.title = 'Confirm Set mode';
    interaction.message = 'Confirm setting PX4 robots ["px4-01","px4-02"] to flight mode OFFBOARD?';
    interaction.origin = {
      type: 'automation',
      ref: 'px4-control',
      displayName: 'PX4 panel control executor',
      nodeId: 'confirmation-request',
    };
    interaction.payload.decision.approveLabel = 'Confirm';
    interaction.createdAt = '2026-09-06T07:29:16Z';
    interaction.updatedAt = interaction.createdAt;
    const { container } = render(<GroundStationDecisionChatCard interaction={interaction} onRespond={vi.fn()} presentation="panel" />);
    const request = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="set-mode"]') as HTMLElement;
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-title"]')).toHaveTextContent('Set mode');
    expect(request.querySelector('[data-xgc-role="decision-card-details-toggle"]')).toBeNull();
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-origin"]')).toBeNull();
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-targets"]')).toHaveTextContent('px4-01, px4-02');
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-message"]')).toHaveTextContent('Confirm Set mode for px4-01, px4-02?');
    expect(request).not.toHaveTextContent('the selected');
    expect(request).not.toHaveTextContent('PX4 panel control executor');
    expect(request).not.toHaveTextContent('confirmation-request');
    expect(within(request).getByRole('button', { name: 'Set mode' })).toBeEnabled();
    expect(request.querySelector('[data-xgc-role="ground-station-decision-deadline"]')).toBeNull();
    const time = request.querySelector('[data-xgc-role="decision-card-time"]')!;
    expect(time.textContent).not.toMatch(/2026/);
  });

  it('puts a white circular countdown on the same row as equal-width Set mode and Cancel', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T04:00:00Z'));
    try {
      const interaction = decision('set-mode');
      interaction.title = 'Confirm Set mode';
      interaction.message = 'Confirm Set mode for the selected PX4 robots?';
      interaction.createdAt = '2026-09-12T04:00:00Z';
      interaction.updatedAt = interaction.createdAt;
      interaction.expiresAt = '2026-09-12T04:00:30Z';
      interaction.payload.decision.approveLabel = 'Confirm';
      interaction.payload.decision.rejectLabel = 'Cancel';
      const { container } = render(<GroundStationDecisionChatCard interaction={interaction} onRespond={vi.fn()} presentation="panel" />);
      const request = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="set-mode"]') as HTMLElement;
      const actions = request.querySelector('[data-xgc-role="ground-station-decision-actions"]') as HTMLElement;
      const deadline = request.querySelector('[data-xgc-role="ground-station-decision-deadline"]') as HTMLElement;
      const approve = within(request).getByRole('button', { name: 'Set mode' });
      const reject = within(request).getByRole('button', { name: 'Cancel' });
      expect(actions).toContainElement(deadline);
      expect(actions).toContainElement(approve);
      expect(actions).toContainElement(reject);
      expect(deadline).toHaveAttribute('data-xgc-variant', 'ring');
      expect(deadline).toHaveAttribute('role', 'timer');
      expect(deadline).toHaveAccessibleName('Expires in 30s');
      expect(deadline.querySelector('.xgc-ground-station-decision-deadline-count')).toHaveTextContent('30');
      expect(deadline.querySelector('.xgc-ground-station-decision-deadline-fill')).toHaveAttribute('stroke-dasharray');
      expect(request).not.toHaveTextContent('Expires in 30s');
      expect(approve.compareDocumentPosition(reject) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(reject.compareDocumentPosition(deadline) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(actions.lastElementChild).toBe(deadline);
      expect(approve).toHaveClass('xgc-ground-station-decision-choice');
      expect(reject).toHaveClass('xgc-ground-station-decision-choice');
      expect(request).not.toHaveTextContent(/the selected/i);
      expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-message"]')).toHaveTextContent('Confirm Set mode?');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a far-future compact countdown as a short ring mark instead of a long English line', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T04:00:00Z'));
    try {
      const interaction = decision('set-mode');
      interaction.createdAt = '2026-09-12T04:00:00Z';
      interaction.updatedAt = interaction.createdAt;
      interaction.expiresAt = '2099-07-15T09:05:00Z';
      const { container } = render(<GroundStationDecisionChatCard interaction={interaction} onRespond={vi.fn()} presentation="panel" />);
      const request = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="set-mode"]') as HTMLElement;
      const deadline = request.querySelector('[data-xgc-role="ground-station-decision-deadline"]') as HTMLElement;
      expect(request.querySelector('[data-xgc-role="ground-station-decision-actions"]')).toContainElement(deadline);
      expect(deadline).toHaveAttribute('data-xgc-variant', 'ring');
      expect(deadline.querySelector('.xgc-ground-station-decision-deadline-count')).toHaveTextContent('');
      expect(request).not.toHaveTextContent(/Expires in/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('enters only once per pending identity and never for terminal states', () => {
    const pending = decision('pending-once');
    const { container, rerender } = render(
      <GroundStationDecisionChatCard interaction={pending} onRespond={vi.fn()} presentation="panel" />,
    );
    const request = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="pending-once"]') as HTMLElement;
    expect(request).toHaveAttribute('data-xgc-decision-state', 'pending');
    expect(request).toHaveAttribute('data-xgc-arrive', 'true');

    // Remount with the same id must not re-arm the entrance animation.
    rerender(<GroundStationDecisionChatCard interaction={pending} onRespond={vi.fn()} presentation="panel" />);
    expect(request).toHaveAttribute('data-xgc-arrive', 'true');

    const resolved = decision('resolved-history');
    resolved.status = 'resolved';
    resolved.response = { action: 'approved', actor: 'station-main' };
    rerender(<GroundStationDecisionChatCard interaction={resolved} onRespond={vi.fn()} presentation="panel" />);
    const resolvedCard = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="resolved-history"]') as HTMLElement;
    expect(resolvedCard).not.toHaveClass('xgc-ground-station-decision-request');
    expect(resolvedCard).not.toHaveAttribute('data-xgc-arrive');
  });

  it('collapses a resolved decision to a one-line confirmation log instead of the black card', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm';
    resolved.message = 'Confirm Arm for the selected PX4 robots?';
    resolved.status = 'resolved';
    resolved.response = { action: 'approved', actor: 'station-main' };
    const { container } = render(<GroundStationDecisionChatCard interaction={resolved} onRespond={vi.fn()} presentation="panel" />);
    const entry = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="answered"]') as HTMLElement;
    expect(entry).not.toHaveClass('xgc-ground-station-decision-request');
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-resolved"]')).toHaveTextContent('Confirm Arm?');
    expect(entry).not.toHaveTextContent('Arm · Authorized');
    expect(entry).not.toHaveTextContent(/the selected/i);
    expect(entry.querySelector('[data-xgc-role="ground-station-decision-response-state"]')).toBeNull();
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-title"]')).toBeNull();
  });

  it('includes target names in the frozen confirmation when they are known', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Set mode';
    resolved.message = 'Confirm setting PX4 robots ["px4-01","px4-02"] to flight mode OFFBOARD?';
    resolved.status = 'resolved';
    resolved.response = { action: 'approved', actor: 'station-main' };
    const { container } = render(<GroundStationDecisionChatCard interaction={resolved} onRespond={vi.fn()} presentation="panel" />);
    const entry = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="answered"]') as HTMLElement;
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-resolved"]'))
      .toHaveTextContent('Confirm Set mode for px4-01, px4-02?');
    expect(entry).not.toHaveTextContent('Authorized');
  });

  it('keeps a distinctive consequence as the frozen request log', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm px4-01, px4-02';
    resolved.message = 'Confirm the area is clear?';
    resolved.status = 'resolved';
    resolved.response = { action: 'approved', actor: 'station-main' };
    const { container } = render(<GroundStationDecisionChatCard interaction={resolved} onRespond={vi.fn()} presentation="panel" />);
    const entry = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="answered"]') as HTMLElement;
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-resolved"]'))
      .toHaveTextContent('Confirm the area is clear?');
    expect(entry).not.toHaveTextContent('Arm · Authorized');
  });

  it('does not paste the confirmation question under an Arm · Rejected summary', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm';
    resolved.message = 'Confirm Arm for PX4 robots ["px4-01","px4-02"]?';
    resolved.status = 'resolved';
    resolved.response = { action: 'rejected', actor: 'station-main', reason: 'Area not clear' };
    const { container } = render(<GroundStationDecisionChatCard interaction={resolved} onRespond={vi.fn()} presentation="panel" />);
    const entry = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="answered"]') as HTMLElement;
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-resolved"]'))
      .toHaveTextContent('Confirm Arm for px4-01, px4-02?');
    expect(entry.querySelector('[data-xgc-role="ground-station-chat-decision-resolved-detail"]')).toBeNull();
    expect(entry).not.toHaveTextContent('Arm · Rejected');
  });
});

describe('GroundStationDecisionResultLog', () => {
  it('reports mixed per-target results after an approved run', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm';
    resolved.message = 'Confirm Arm for PX4 robots ["px4-01","px4-02","px4-03"]?';
    resolved.status = 'resolved';
    resolved.response = {
      action: 'approved',
      actor: 'station-main',
      results: { invocationId: 'action-1', attempt: 1, state: 'completed', at: '2026-07-15T09:02:00Z', succeeded: ['px4-01', 'px4-02'], failed: ['px4-03'] },
    };
    const { container } = render(<GroundStationDecisionResultLog interaction={resolved} presentation="panel" />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-decision-result"]'))
      .toHaveTextContent('px4-01, px4-02 Arm succeeded, px4-03 failed');
  });

  it('waits for an execution receipt after Confirm without claiming success', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm';
    resolved.status = 'resolved';
    resolved.response = { action: 'approved', actor: 'station-main' };
    const { container } = render(<GroundStationDecisionResultLog interaction={resolved} presentation="panel" />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-decision-result"]'))
      .toHaveTextContent('Awaiting execution receipt');
  });

  it('reports not executed after cancel', () => {
    const resolved = decision('answered');
    resolved.title = 'Confirm Arm';
    resolved.status = 'resolved';
    resolved.response = { action: 'rejected', actor: 'station-main' };
    const { container } = render(<GroundStationDecisionResultLog interaction={resolved} presentation="panel" />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-decision-result"]'))
      .toHaveTextContent('Not executed');
  });
});

describe('GroundStationOperatorResponseBubble', () => {
  function formDecision() {
    const interaction = decision('form-response');
    interaction.payload.decision.form = { fields: [
      { name: 'offset',label: 'World offset',kind: 'number' },
      { name: 'area_clear',label: 'Area is clear',kind: 'boolean' },
      { name: 'record',label: 'Record this run',kind: 'boolean' },
      { name: 'location',label: 'Operating area',kind: 'string' },
      { name: 'operator_note',kind: 'string' },
      { name: 'unsubmitted',label: 'Unused default',kind: 'string',default: 'not submitted' },
    ] };
    return interaction;
  }

  it('shows only submitted answers in declared field order, preserving labels, zero and false', () => {
    const interaction = formDecision();
    const { container } = render(<GroundStationOperatorResponseBubble interaction={interaction} response={{
      action: 'approved',reason: 'Area checked',
      values: { location: 'North field\nLaunch pad 2',record: false,area_clear: true,offset: 0,operator_note: 'Ready',extra: 'internal' },
    }} />);

    const receipt = container.querySelector('[data-xgc-role="ground-station-chat-response-values"][data-xgc-id="form-response"]');
    expect(receipt).toBeInTheDocument();
    const expected = [
      ['offset','World offset','0'],
      ['area_clear','Area is clear','Yes'],
      ['record','Record this run','No'],
      ['location','Operating area','North field Launch pad 2'],
      ['operator_note','operator_note','Ready'],
    ];
    expect([...receipt!.querySelectorAll('dt')].map((label) => label.textContent)).toEqual(expected.map(([,label]) => label));
    for (const [name,label,value] of expected) {
      const field = receipt!.querySelector(`[data-xgc-role="ground-station-chat-response-field"][data-xgc-id="form-response:${name}"]`);
      expect(field?.querySelector(`[data-xgc-role="ground-station-chat-response-label"][data-xgc-id="form-response:${name}"]`)).toHaveTextContent(label!);
      expect(field?.querySelector(`[data-xgc-role="ground-station-chat-response-value"][data-xgc-id="form-response:${name}"]`)).toHaveTextContent(value!);
    }
    expect(screen.getByText('Area checked')).toBeInTheDocument();
    expect(container.querySelector('.xgc-ground-station-decision-request')).toBeNull();
    expect(container.querySelector('[data-xgc-role="ground-station-chat-operator-response"]'))
      .not.toHaveClass('xgc-ground-station-decision-request');
    expect(screen.queryByText('Unused default')).toBeNull();
    expect(screen.queryByText('not submitted')).toBeNull();
    expect(screen.queryByText('internal')).toBeNull();
  });

  it.each(['rejected','canceled'] as const)('does not present answers as submitted after %s', (action) => {
    const { container } = render(<GroundStationOperatorResponseBubble interaction={formDecision()} response={{
      action,values: { area_clear: true },
    }} />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-response-values"]')).toBeNull();
  });

  it('does not invent a form receipt from defaults or a confirmation without fields', () => {
    const { rerender,container } = render(<GroundStationOperatorResponseBubble interaction={formDecision()} response={{ action: 'approved' }} />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-response-values"]')).toBeNull();
    rerender(<GroundStationOperatorResponseBubble interaction={decision()} response={{ action: 'approved',values: { extra: 'not a form' } }} />);
    expect(container.querySelector('[data-xgc-role="ground-station-chat-response-values"]')).toBeNull();
  });
});
