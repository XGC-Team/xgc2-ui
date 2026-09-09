// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationDecisionResponseControls } from './GroundStationDecisionResponse';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

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

    expect(onRespond).toHaveBeenCalledWith(request, action, {});
    await waitFor(() => expect(onResponded).toHaveBeenCalledTimes(1));
  });
});
