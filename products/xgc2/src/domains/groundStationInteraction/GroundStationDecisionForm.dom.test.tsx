// @vitest-environment jsdom

import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import { GroundStationDecisionResponseControls } from './GroundStationDecisionResponse';
import type { GroundStationDecisionResponder } from './groundStationInteractionActions';
import type { GroundStationDecisionInteraction } from './groundStationInteractionTypes';

function formDecision(): GroundStationDecisionInteraction {
  return {
    schemaVersion: 1,
    id: 'interaction-form-1',
    targetScope: 'local',
    revision: 1,
    status: 'open',
    kind: 'decision',
    presentation: 'panel',
    responseMode: 'decision',
    severity: 'info',
    title: 'Landing parameters',
    message: 'Fill in the landing site',
    origin: { type: 'automation',runId: 'run-1' },
    audience: { scope: 'all' },
    createdAt: '2026-07-27T00:00:00Z',
    updatedAt: '2026-07-27T00:00:00Z',
    payload: { decision: {
      approveLabel: 'Send',
      rejectLabel: 'Skip',
      requireReason: false,
      form: { fields: [
        { name: 'site',label: 'Site',kind: 'string',required: true },
        { name: 'altitude',label: 'Altitude',kind: 'number',default: 12 },
        { name: 'verified',label: 'Verified',kind: 'boolean' },
      ] },
    } },
  };
}

describe('decision form response controls', () => {
  it('submits typed values and seeds declared defaults', async () => {
    const onRespond = vi.fn<GroundStationDecisionResponder>(async () => formDecision());
    render(<GroundStationDecisionResponseControls
      interaction={formDecision()}
      onRespond={onRespond}
      appearance="dialog"
    />);

    expect((screen.getByLabelText('Altitude') as HTMLInputElement).value).toBe('12');
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: '  pad-3  ' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Verified' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(1));
    expect(onRespond.mock.calls[0]![1]).toBe('approved');
    expect(onRespond.mock.calls[0]![2]).toEqual({
      values: { site: 'pad-3',altitude: 12,verified: true },
    });
  });

  it('refuses to submit a blank required field and never blocks declining', async () => {
    const onRespond = vi.fn<GroundStationDecisionResponder>(async () => formDecision());
    render(<GroundStationDecisionResponseControls
      interaction={formDecision()}
      onRespond={onRespond}
      appearance="dialog"
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Site is required.')).toBeTruthy();
    expect(onRespond).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(1));
    expect(onRespond.mock.calls[0]![1]).toBe('rejected');
    expect(onRespond.mock.calls[0]![2]).toEqual({});
  });
});
