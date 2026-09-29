// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorDeviceSignIn } from './OperatorDeviceSignIn';
import { getOperatorIdentity, getOperatorPairingOptions, issueOperatorPairing } from './operatorAccessService';

vi.mock('./operatorAccessService', () => ({ getOperatorIdentity: vi.fn(), getOperatorPairingOptions: vi.fn(), issueOperatorPairing: vi.fn(), deleteOperatorSession: vi.fn() }));
const station = { stationId: 'station-main', name: 'Main operator', role: 'owner', capabilities: ['core.view', 'experiment.read'], visibleCores: ['local'] };
const options = { pairingPath: '/operator-pair' as const, origins: [{ host: '192.168.51.251', publicOrigin: 'http://192.168.51.251:5174' }], grants: [station] };
const futureExpiry = () => new Date(Date.now() + 30 * 60_000).toISOString();

describe('OperatorDeviceSignIn (device sign-in)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOperatorIdentity).mockResolvedValue({ ...station, authenticated: true, transport: 'local', canPair: true });
    vi.mocked(getOperatorPairingOptions).mockResolvedValue(options);
    vi.mocked(issueOperatorPairing).mockResolvedValue({ publicOrigin: options.origins[0]!.publicOrigin, pairingPath: '/operator-pair', bootstrapToken: 'one-use', bootstrapExpiresAt: futureExpiry(), station });
  });
  afterEach(cleanup);
  async function chooseAddress() {
    await screen.findByRole('button', { name: 'Station address' });
    fireEvent.click(screen.getByRole('button', { name: 'Station address' }));
    fireEvent.click(screen.getByRole('option', { name: options.origins[0]!.publicOrigin }));
  }
  it('matches the grant to the current identity without any scheme selection, then issues a link', async () => {
    render(<OperatorDeviceSignIn language="en-US" />);
    expect(await screen.findByRole('textbox', { name: 'This browser' })).toHaveValue('Main operator');
    expect(screen.queryByText('This computer (the station itself)')).toBeNull();
    expect(screen.queryByText('No expiry set')).toBeNull();
    const generate = screen.getByRole('button', { name: 'Generate sign-in link' });
    expect(generate).toBeDisabled();
    expect(issueOperatorPairing).not.toHaveBeenCalled();
    await chooseAddress();
    expect(issueOperatorPairing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate sign-in link' }));
    const link = await screen.findByRole('textbox', { name: 'Sign-in link' });
    expect(link).toHaveValue('http://192.168.51.251:5174/operator-pair#token=one-use');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(issueOperatorPairing).toHaveBeenCalledExactlyOnceWith('station-main', '192.168.51.251');
  });
  it('refuses an issuance response redirecting to an unselected origin', async () => {
    vi.mocked(issueOperatorPairing).mockResolvedValue({ publicOrigin: 'http://evil.test:5174', pairingPath: '/operator-pair', bootstrapToken: 'one-use', bootstrapExpiresAt: '', station });
    render(<OperatorDeviceSignIn language="en-US" />);
    await chooseAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Generate sign-in link' }));
    await screen.findByText('The sign-in link could not be generated.');
    expect(screen.queryByRole('textbox', { name: 'Sign-in link' })).toBeNull();
  });
  it('does not fetch delegation options or offer generation to a paired LAN operator', async () => {
    vi.mocked(getOperatorIdentity).mockResolvedValue({ ...station, authenticated: true, transport: 'operator-cookie', canPair: false });
    render(<OperatorDeviceSignIn language="en-US" />);
    await screen.findByText('Sign-in links can only be generated in the browser on the station computer itself.');
    await waitFor(() => expect(getOperatorPairingOptions).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Generate sign-in link' })).toBeNull();
  });
  it('blocks generation when the matched identity grant carries capabilities it cannot describe', async () => {
    vi.mocked(getOperatorPairingOptions).mockResolvedValue({ ...options, grants: [{ ...station, capabilities: ['core.view', 'mystery.cap'] }] });
    render(<OperatorDeviceSignIn language="en-US" />);
    await screen.findByText(/cannot be described by this interface/);
    await chooseAddress();
    expect(screen.getByRole('button', { name: 'Generate sign-in link' })).toBeDisabled();
    expect(issueOperatorPairing).not.toHaveBeenCalled();
  });
  it('reports when no grant matches the current identity', async () => {
    vi.mocked(getOperatorPairingOptions).mockResolvedValue({ ...options, grants: [] });
    render(<OperatorDeviceSignIn language="en-US" />);
    await screen.findByText('The current identity cannot sign in other devices.');
    expect(screen.queryByRole('button', { name: 'Generate sign-in link' })).toBeNull();
    expect(issueOperatorPairing).not.toHaveBeenCalled();
  });
  it('does not present an expired one-time link as valid and asks for regeneration', async () => {
    vi.mocked(issueOperatorPairing).mockResolvedValue({ publicOrigin: options.origins[0]!.publicOrigin, pairingPath: '/operator-pair', bootstrapToken: 'stale', bootstrapExpiresAt: new Date(Date.now() - 1000).toISOString(), station });
    render(<OperatorDeviceSignIn language="en-US" />);
    await chooseAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Generate sign-in link' }));
    await screen.findByText(/This link has expired/);
    expect(screen.queryByRole('textbox', { name: 'Sign-in link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('does not show a ticket whose issued grant carries capabilities it cannot describe', async () => {
    vi.mocked(issueOperatorPairing).mockResolvedValue({ publicOrigin: options.origins[0]!.publicOrigin, pairingPath: '/operator-pair', bootstrapToken: 'widened', bootstrapExpiresAt: futureExpiry(), station: { ...station, capabilities: ['core.view', 'late.mystery'] } });
    render(<OperatorDeviceSignIn language="en-US" />);
    await chooseAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Generate sign-in link' }));
    await screen.findByText(/cannot be described by this interface/);
    expect(screen.queryByRole('textbox', { name: 'Sign-in link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });
  it('ignores a late issue response after the address selection changed', async () => {
    const second = { host: '192.168.51.252', publicOrigin: 'http://192.168.51.252:5174' };
    vi.mocked(getOperatorPairingOptions).mockResolvedValue({ ...options, origins: [...options.origins, second] });
    let resolveIssue: ((value: Awaited<ReturnType<typeof issueOperatorPairing>>) => void) | undefined;
    vi.mocked(issueOperatorPairing).mockImplementation(() => new Promise((resolve) => { resolveIssue = resolve; }));
    render(<OperatorDeviceSignIn language="en-US" />);
    await chooseAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Generate sign-in link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Station address' }));
    fireEvent.click(screen.getByRole('option', { name: second.publicOrigin }));
    resolveIssue!({ publicOrigin: options.origins[0]!.publicOrigin, pairingPath: '/operator-pair', bootstrapToken: 'late', bootstrapExpiresAt: futureExpiry(), station });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Sign-in link' })).toBeNull());
  });
});
