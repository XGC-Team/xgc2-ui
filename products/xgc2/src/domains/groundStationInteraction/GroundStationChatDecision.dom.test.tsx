// @vitest-environment jsdom

import { act,fireEvent,render,screen,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationDecisionChatCard,GroundStationOperatorResponseBubble } from './GroundStationChatDecision';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

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
    for (const leaf of ['title','message','origin']) {
      expect(request.querySelector(`[data-xgc-role="ground-station-chat-decision-${leaf}"][data-xgc-id="arm-test"]`)).toBeInTheDocument();
    }
    expect(request.querySelector('[data-xgc-role="decision-card-time"]')).toBeInTheDocument();
    expect(within(request).getByText(interaction.message)).toBeInTheDocument();
    expect(within(request).getByText('Preflight')).toBeInTheDocument();
    expect(within(request).getByText('Preflight arm test')).toBeInTheDocument();
    expect(request).toHaveClass('xgc-decision-card','xgc-ground-station-decision-request');
    const approve = within(request).getByRole('button', { name: 'Arm 5 robots' });
    expect(approve).toBeEnabled();
    expect(approve).toHaveAttribute('data-xgc-tone', 'default');
    expect(approve).toHaveAttribute('data-xgc-appearance', 'raised');
    expect(within(request).getByRole('button', { name: 'Cancel' })).toBeEnabled();
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
    expect(onRespond).toHaveBeenCalledWith(interaction, action, {});
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/Confirming|Rejecting/)).toBeNull();
    await act(async () => { resolve(interaction); });
  });

  it('keeps two simultaneous response notes separately markable and submits the correct note', async () => {
    const first = decision('request-one');
    const second = decision('request-two');
    const onRespond = vi.fn(async () => second);
    const { container } = render(<>
      <GroundStationDecisionChatCard interaction={first} onRespond={onRespond} presentation="panel" />
      <GroundStationDecisionChatCard interaction={second} onRespond={onRespond} presentation="panel" />
    </>);
    for (const interaction of [first,second]) {
      const request = container.querySelector(`[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="${interaction.id}"]`)!;
      const addNote = within(request as HTMLElement).getByRole('button', { name: 'Add a note' });
      expect(addNote).toHaveAttribute('data-xgc-id', interaction.id);
      fireEvent.click(addNote);
      expect(request.querySelector(`[data-xgc-role="ground-station-decision-reason-label"][data-xgc-id="${interaction.id}"]`))
        .toBeInTheDocument();
      expect(request.querySelector(`[data-xgc-role="ground-station-decision-reason-input"][data-xgc-id="${interaction.id}"]`))
        .toBeInTheDocument();
    }
    const secondRequest = container.querySelector<HTMLElement>('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="request-two"]')!;
    fireEvent.change(within(secondRequest).getByRole('textbox', { name: 'Operator note' }), { target: { value: 'Area checked' } });
    await act(async () => { fireEvent.click(within(secondRequest).getByRole('button', { name: 'Arm 5 robots' })); });
    expect(onRespond).toHaveBeenCalledWith(second, 'approved', { reason: 'Area checked' });
  });

  it('uses a three-row Confirm ticket: kicker and clock, operation, then controls', () => {
    const interaction = decision('set-mode');
    interaction.title = 'Confirm Set mode';
    interaction.message = 'Confirm Set mode for the selected PX4 robots?';
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
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-origin"]')).toHaveTextContent('PX4 panel control executor');
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-message"]')).toHaveTextContent('selected PX4 robots');
    expect(request).not.toHaveTextContent('confirmation-request');
    expect(within(request).getByRole('button', { name: 'Set mode' })).toBeEnabled();
    const time = request.querySelector('[data-xgc-role="decision-card-time"]')!;
    expect(time.textContent).not.toMatch(/2026/);
  });

  it('keeps the third row as an authorization result instead of leftover Confirm', () => {
    const interaction = decision('answered');
    interaction.title = 'Confirm Arm';
    interaction.status = 'resolved';
    interaction.response = { action: 'approved',actor: 'station-main' };
    interaction.payload.decision.approveLabel = 'Confirm';
    const { container } = render(<GroundStationDecisionChatCard interaction={interaction} onRespond={vi.fn()} presentation="panel" />);
    const request = container.querySelector('[data-xgc-role="ground-station-chat-decision-entry"][data-xgc-id="answered"]') as HTMLElement;
    expect(request.querySelector('[data-xgc-role="ground-station-chat-decision-title"]')).toHaveTextContent('Arm');
    const outcome = request.querySelector('[data-xgc-role="ground-station-decision-response-state"]');
    expect(outcome).toHaveTextContent('Authorized');
    expect(outcome).not.toHaveTextContent('Confirm');
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
