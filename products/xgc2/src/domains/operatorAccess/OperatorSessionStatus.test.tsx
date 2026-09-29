// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorSessionStatus } from './OperatorSessionStatus';
import { deleteOperatorSession, getOperatorIdentity } from './operatorAccessService';

vi.mock('./operatorAccessService', () => ({ deleteOperatorSession: vi.fn(), getOperatorIdentity: vi.fn() }));
const identity = { authenticated: true as const, transport: 'operator-cookie' as const, stationId: 'main', name: 'Field operator', role: 'operator', capabilities: ['core.view', 'experiment.read'], visibleCores: ['local'], canPair: false };

describe('OperatorSessionStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); window.localStorage.setItem('xgcStationToken', 'previous'); });
  afterEach(() => { cleanup(); window.localStorage.clear(); });
  it('shows the operator name as a Settings value and never dumps transport or capabilities', async () => {
    vi.mocked(getOperatorIdentity).mockResolvedValue(identity);
    render(<OperatorSessionStatus language="en-US" onSignedOut={vi.fn()} />);
    expect(await screen.findByRole('textbox', { name: 'This browser' })).toHaveValue('Field operator');
    expect(screen.queryByText('This computer (the station itself)')).toBeNull();
    expect(screen.queryByText('An authorized device')).toBeNull();
    expect(screen.queryByText('No expiry set')).toBeNull();
    expect(screen.queryByText('experiment.read')).toBeNull();
    expect(screen.queryByText(/operator-cookie/)).toBeNull();
  });
  it('confirms session deletion before leaving', async () => {
    vi.mocked(getOperatorIdentity).mockResolvedValue(identity);
    vi.mocked(deleteOperatorSession).mockResolvedValue(undefined);
    const onSignedOut = vi.fn();
    render(<OperatorSessionStatus language="en-US" onSignedOut={onSignedOut} />);
    await screen.findByRole('textbox', { name: 'This browser' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out this device' }));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
    expect(deleteOperatorSession).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('xgcStationToken')).toBeNull();
    expect(screen.getByText('This browser is not signed in.')).toBeTruthy();
  });
  it('keeps the session visible and credentials intact after failed logout', async () => {
    vi.mocked(deleteOperatorSession).mockRejectedValue(new Error('network down'));
    const onSignedOut = vi.fn();
    render(<OperatorSessionStatus language="en-US" identity={identity} onSignedOut={onSignedOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out this device' }));
    await screen.findByText(/Sign-out failed/);
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('xgcStationToken')).toBe('previous');
  });
  it('does not offer session logout for the implicit local station', () => {
    render(<OperatorSessionStatus language="en-US" identity={{ ...identity, transport: 'local', canPair: true }} />);
    expect(screen.queryByRole('button', { name: 'Sign out this device' })).toBeNull();
  });
  it('shows grant expiry only when the current identity actually expires', () => {
    render(<OperatorSessionStatus language="en-US" identity={{ ...identity, expiresAt: '2026-09-21T12:00:00Z' }} />);
    expect(screen.getByRole('textbox', { name: 'Valid until' })).toBeTruthy();
    expect(screen.queryByDisplayValue('No expiry set')).toBeNull();
  });
});
