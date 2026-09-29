// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationDecisionResponseControls } from './GroundStationDecisionResponse';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

vi.mock('../operatorAccess/operatorAccessPublic', async (importOriginal) => ({
  ...(await importOriginal() as object),
  ensureOperatorControlSession: async () => true,
  operatorControlSessionReady: () => true,
  useOperatorControlSession: () => ({ phase: 'ready', ensuring: false, blocked: false, retry: vi.fn() }),
  OperatorControlSessionNotice: () => null,
}));

function decision(): GroundStationDecisionInteraction {
  return {
    schemaVersion: 1,
    id: 'interaction-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'decision',
    presentation: 'panel',
    responseMode: 'decision',
    severity: 'info',
    title: 'Continue workflow',
    message: 'Confirm that checks are complete.',
    origin: { type: 'automation',runId: 'run-1' },
    audience: { scope: 'all' },
    createdAt: '2026-07-27T00:00:00Z',
    updatedAt: '2026-07-27T00:00:00Z',
    payload: { decision: {
      approveLabel: 'Continue',
      rejectLabel: 'Not now',
      requireReason: false,
    } },
  };
}

describe('GroundStationDecisionResponseControls', () => {
  it.each(['start', 'stop'])('does not offer a false approval for an already held retired recording %s request', (op) => {
    const request = decision();
    const legacyRequest = {
      ...request,
      title: 'Screen recording',
      payload: { decision: {
        ...request.payload.decision,
        approveLabel: 'Record ground station',
        action: { kind: 'screen-recording',op },
      } },
    };
    const onRespond = vi.fn(async () => request);
    const { container } = render(<GroundStationDecisionResponseControls
      interaction={legacyRequest}
      onRespond={onRespond}
      appearance="dialog"
    />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it.each([
    ['Continue', 'approved'],
    ['Not now', 'rejected'],
  ] as const)('preserves an operator’s %s response to ordinary decisions', async (label, action) => {
    const request = decision();
    const onRespond = vi.fn(async () => request);
    const onResponded = vi.fn();
    render(<GroundStationDecisionResponseControls
      interaction={request}
      onRespond={onRespond}
      onResponded={onResponded}
      appearance="dialog"
    />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    if (label === 'Continue') {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('data-xgc-tone', 'primary');
    }
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveAttribute('data-xgc-appearance', 'default');

    await waitFor(() => expect(onRespond).toHaveBeenCalledWith(request, action, {}));
    await waitFor(() => expect(onResponded).toHaveBeenCalledTimes(1));
  });

  it('keeps dialog expiry as a text row above the actions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T04:00:00Z'));
    try {
      const request = decision();
      request.createdAt = '2026-09-12T04:00:00Z';
      request.updatedAt = request.createdAt;
      request.expiresAt = '2026-09-12T04:00:30Z';
      const { container } = render(<GroundStationDecisionResponseControls
        interaction={request}
        onRespond={vi.fn(async () => request)}
        appearance="dialog"
      />);
      const response = container.querySelector('[data-xgc-role="ground-station-decision-response"]') as HTMLElement;
      const deadline = response.querySelector('[data-xgc-role="ground-station-decision-deadline"]') as HTMLElement;
      const actions = response.querySelector('[data-xgc-role="ground-station-decision-actions"]') as HTMLElement;
      expect(deadline).not.toHaveAttribute('data-xgc-variant');
      expect(deadline).toHaveTextContent('Expires in 30s');
      expect(actions).not.toContainElement(deadline);
      expect(deadline.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('data-xgc-tone', 'primary');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps two dialog notes separately markable and submits the typed note', async () => {
    const first = decision();
    first.id = 'request-one';
    const second = decision();
    second.id = 'request-two';
    const onRespond = vi.fn(async () => second);
    const { container } = render(<>
      <GroundStationDecisionResponseControls interaction={first} onRespond={onRespond} appearance="dialog" />
      <GroundStationDecisionResponseControls interaction={second} onRespond={onRespond} appearance="dialog" />
    </>);
    for (const interaction of [first, second]) {
      const response = container.querySelector(`[data-xgc-role="ground-station-decision-response"][data-xgc-id="${interaction.id}"]`) as HTMLElement;
      const addNote = within(response).getByRole('button', { name: 'Add a note' });
      expect(addNote).toHaveAttribute('data-xgc-id', interaction.id);
      fireEvent.click(addNote);
      expect(response.querySelector(`[data-xgc-role="ground-station-decision-reason-input"][data-xgc-id="${interaction.id}"]`)).toBeInTheDocument();
    }
    const secondResponse = container.querySelector('[data-xgc-role="ground-station-decision-response"][data-xgc-id="request-two"]') as HTMLElement;
    fireEvent.change(within(secondResponse).getByRole('textbox', { name: 'Operator note' }), { target: { value: 'Area checked' } });
    fireEvent.click(within(secondResponse).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith(second, 'approved', { reason: 'Area checked' }));
  });
});
