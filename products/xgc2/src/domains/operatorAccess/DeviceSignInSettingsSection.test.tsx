// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeviceSignInSettingsSection } from './DeviceSignInSettingsSection';
import { getOperatorIdentity, getOperatorPairingOptions } from './operatorAccessService';

vi.mock('./operatorAccessService', () => ({
  getOperatorIdentity: vi.fn(),
  getOperatorPairingOptions: vi.fn(),
  issueOperatorPairing: vi.fn(),
  deleteOperatorSession: vi.fn(),
}));

const station = {
  authenticated: true as const,
  stationId: 'station-main',
  name: 'Main GCS',
  role: 'owner',
  capabilities: ['core.view', 'experiment.read'],
  visibleCores: ['local'],
  transport: 'local' as const,
  canPair: true,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('loads device sign-in only when its settings section is opened', async () => {
  vi.mocked(getOperatorIdentity).mockResolvedValue({ ...station, canPair: false });
  render(<DeviceSignInSettingsSection language="en-US" skin="dark" onLanguageChange={vi.fn()} onSkinChange={vi.fn()} />);
  const toggle = screen.getByRole('button', { name: 'Device sign-in' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(getOperatorIdentity).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(getOperatorIdentity).toHaveBeenCalledTimes(1));
  fireEvent.click(toggle);
  expect(screen.queryByRole('region')).toBeNull();
});

it('puts identity, address and generate on the ConfigSection field track', async () => {
  vi.mocked(getOperatorIdentity).mockResolvedValue(station);
  vi.mocked(getOperatorPairingOptions).mockResolvedValue({
    pairingPath: '/operator-pair',
    origins: [{ host: '192.168.51.251', publicOrigin: 'http://192.168.51.251:5174' }],
    grants: [{ stationId: station.stationId, name: station.name, role: station.role, capabilities: station.capabilities, visibleCores: station.visibleCores }],
  });
  const { container } = render(
    <DeviceSignInSettingsSection language="en-US" skin="dark" onLanguageChange={vi.fn()} onSkinChange={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Device sign-in' }));
  await screen.findByRole('textbox', { name: 'This browser' });

  const body = container.querySelector('[data-xgc-role="config-section-body"][data-xgc-id="operator-device-sign-in"]');
  expect(body).not.toBeNull();
  const browser = body!.querySelector('[data-xgc-role="operator-session-browser-setting"]');
  const address = body!.querySelector('[data-xgc-role="operator-pairing-address-setting"]');
  const actions = body!.querySelector('[data-xgc-role="operator-device-sign-in-actions"]');
  expect(browser).toHaveClass('xgc-form-field');
  expect(address).toHaveClass('xgc-form-field');
  expect(browser!.parentElement).toBe(body);
  expect(address!.parentElement).toBe(body);
  expect(actions!.parentElement).toBe(body);
  expect(body!.querySelector('.operator-access-stack')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'This browser' })).toHaveValue('Main GCS');
  expect(screen.queryByText('This computer (the station itself)')).toBeNull();
  expect(screen.queryByText('No expiry set')).toBeNull();
  expect(screen.getByRole('button', { name: 'Generate sign-in link' })).toBeDisabled();
});
