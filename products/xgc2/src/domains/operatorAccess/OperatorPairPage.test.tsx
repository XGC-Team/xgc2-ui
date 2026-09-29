// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorPairPage } from './OperatorPairPage';
import { bootstrapOperatorSession } from './operatorAccessService';

vi.mock('./operatorAccessService', () => ({ bootstrapOperatorSession: vi.fn() }));
const identity = { authenticated: true as const, transport: 'operator-cookie' as const, stationId: 'station-main', name: 'Main', role: 'owner', capabilities: ['core.view'], visibleCores: ['local'], canPair: false };

describe('OperatorPairPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/operator-pair#token=once');
    window.localStorage.setItem('xgcStationToken', 'previous');
    window.localStorage.setItem('other-setting', 'keep');
  });
  afterEach(() => { cleanup(); window.localStorage.clear(); });
  it('consumes a ticket once across StrictMode and enters the station only after success', async () => {
    const onPaired = vi.fn();
    vi.mocked(bootstrapOperatorSession).mockImplementation(async () => {
      expect(window.location.hash).toBe('');
      expect(window.localStorage.getItem('xgcStationToken')).toBe('previous');
      return identity;
    });
    render(<StrictMode><OperatorPairPage language="en-US" onPaired={onPaired} /></StrictMode>);
    await waitFor(() => expect(onPaired).toHaveBeenCalledTimes(1));
    expect(bootstrapOperatorSession).toHaveBeenCalledExactlyOnceWith('once');
    expect(window.localStorage.getItem('xgcStationToken')).toBeNull();
    expect(window.localStorage.getItem('other-setting')).toBe('keep');
    expect(screen.getByRole('status').textContent).toContain('Verified');
  });
  it('keeps the previous identity when exchange fails and does not retry a consumed ticket', async () => {
    vi.mocked(bootstrapOperatorSession).mockRejectedValue(new Error('consumed'));
    const onPaired = vi.fn();
    render(<OperatorPairPage language="zh-CN" onPaired={onPaired} />);
    await screen.findByText(/链接已过期/);
    expect(window.location.hash).toBe('');
    expect(window.localStorage.getItem('xgcStationToken')).toBe('previous');
    expect(onPaired).not.toHaveBeenCalled();
    expect(bootstrapOperatorSession).toHaveBeenCalledTimes(1);
  });
  it('requires a fresh link instead of probing or falling back to local identity', async () => {
    window.history.replaceState(null, '', '/operator-pair');
    render(<OperatorPairPage language="en-US" />);
    await act(async () => undefined);
    expect(screen.getByText(/Open a fresh sign-in link/)).toBeTruthy();
    expect(bootstrapOperatorSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('xgcStationToken')).toBe('previous');
  });
});
