// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { NativeSettings } from '@xgc2/native-agent/react';
import { NativeAgentClientError } from '@xgc2/native-agent/client';
import { NativeProvidersSettingsSection } from './NativeProvidersSettingsSection';

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock('./groundStationNativeSettingsService', () => ({
  getNativeProviderSettings: mocks.get,
  updateNativeProviderSettings: mocks.save,
  refreshNativeProviderSettings: mocks.refresh,
}));

const context = {
  language: 'en-US' as const,
  skin: 'dark' as const,
  onLanguageChange: vi.fn(),
  onSkinChange: vi.fn(),
};

function settingsDoc(revision = 'one'): NativeSettings {
  return {
    revision,
    providers: [
      {
        id: 'claude',
        provider: 'claude',
        enabled: false,
        binaryPath: '',
        available: false,
        version: '1.0.0',
        login: { status: 'unknown', detail: 'Native login' },
        defaults: {},
        models: [],
        permissions: [],
      },
      {
        id: 'codex',
        provider: 'codex',
        enabled: true,
        binaryPath: '/usr/bin/codex',
        available: true,
        version: '0.153.4',
        login: { status: 'authenticated', detail: '' },
        defaults: { model: 'gpt-5.6-luna' },
        models: [{
          id: 'gpt-5.6-luna',
          label: 'gpt-5.6-luna',
          efforts: [{ id: 'medium', label: 'Medium' }],
        }],
        permissions: [{ id: 'approval-required', label: 'Approval required', description: '' }],
      },
    ],
  };
}

describe('native provider Settings contribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(settingsDoc());
  });

  it('keeps companion-down plumbing out of the Settings operator surface', async () => {
    mocks.get.mockRejectedValue(new NativeAgentClientError(502,'native_upstream_unavailable','原生客户端连接中断。'));
    render(<NativeProvidersSettingsSection {...context} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI providers' }));
    expect(await screen.findByRole('button', { name: 'Retry connection' })).toBeInTheDocument();
    expect(screen.queryByText('原生客户端连接中断。')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('loads only when opened and does not start probes or native sessions', async () => {
    render(<NativeProvidersSettingsSection {...context} />);
    expect(mocks.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'AI providers' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('places provider disclosures as ConfigSection body children instead of a nested T3 panel', async () => {
    const { container } = render(<NativeProvidersSettingsSection {...context} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI providers' }));
    const body = await waitFor(() => {
      const el = container.querySelector('[data-xgc-role="config-section-body"][data-xgc-id="native-providers"]');
      expect(el?.querySelector('[data-xgc-role="config-section-disclosure"]')).not.toBeNull();
      return el as HTMLElement;
    });

    const disclosures = [...body.querySelectorAll(':scope > [data-xgc-role="config-section-disclosure"]')];
    expect(disclosures.map((el) => el.getAttribute('data-xgc-id'))).toEqual([
      'native-providers:claude',
      'native-providers:codex',
    ]);
    expect(disclosures[0].tagName).not.toBe('BUTTON');
    expect(disclosures[0]).toHaveTextContent('Claude');
    expect(disclosures[0]).toHaveTextContent('Disabled');
    expect(disclosures[1]).toHaveTextContent('Codex');
    expect(disclosures[1]).toHaveTextContent('Available');
    const claudeToggle = disclosures[0].querySelector('[data-xgc-role="config-section-disclosure-toggle"]');
    const claudeStatus = disclosures[0].querySelector('[data-xgc-role="config-section-disclosure-status"]');
    expect(claudeToggle?.tagName).toBe('BUTTON');
    expect(claudeToggle?.getAttribute('data-xgc-id')).toBe('native-providers:claude');
    expect(claudeToggle).toHaveTextContent('Claude');
    expect(claudeToggle).not.toHaveTextContent('Disabled');
    expect(claudeStatus?.getAttribute('data-xgc-id')).toBe('native-providers:claude');
    expect(claudeStatus).toHaveTextContent('Disabled');
    expect(disclosures[0].querySelector('.config-section-disclosure-toggle .config-section-disclosure-chevron')).not.toBeNull();
    expect(disclosures[0].querySelector('.config-section-disclosure-status .config-section-disclosure-chevron')).toBeNull();
    expect(body.querySelector('.xgc-status-text')).toBeNull();
    expect(body.querySelector('.config-section-disclosure-value')).toBeNull();
    expect(body.querySelector('[data-xgc-role="station-native-provider-settings-body"]')).toBeNull();
    expect(body.querySelector('.xgc-native-chat')).toBeNull();
    expect(body.querySelector('[data-xgc-role="native-provider-select"]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Native providers' })).not.toBeInTheDocument();
  });

  it('expands one provider into sibling FormFields and keeps the original revision on save', async () => {
    const { container } = render(<NativeProvidersSettingsSection {...context} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI providers' }));
    const claude = await screen.findByRole('button', { name: /Claude/ });
    fireEvent.click(claude);

    const body = container.querySelector('[data-xgc-role="config-section-body"][data-xgc-id="native-providers"]')!;
    const enabled = body.querySelector('[data-xgc-role="native-provider-enabled"][data-xgc-id="claude"]');
    expect(enabled).toBe(body.querySelector('[data-xgc-role="config-section-disclosure"][data-xgc-id="native-providers:claude"] + .xgc-form-field'));
    expect(enabled?.closest('button')).toBeNull();
    expect(enabled?.querySelector('[data-xgc-role="native-provider-enabled-label"][data-xgc-id="claude"]')).not.toBeNull();
    expect(enabled?.querySelector('[data-xgc-role="native-provider-enabled-control"][data-xgc-id="claude"]')).not.toBeNull();
    const actions = body.querySelector('[data-xgc-role="native-provider-config-actions"][data-xgc-id="claude"]');
    expect(actions).toBe(body.querySelector('[data-xgc-role="native-provider-binary-path"][data-xgc-id="claude"] + [data-xgc-role="native-provider-config-actions"]'));
    expect(actions?.parentElement).toBe(body);
    expect([...actions?.querySelectorAll(':scope > [data-xgc-role]') ?? []].map((el) => el.getAttribute('data-xgc-role'))).toEqual([
      'native-provider-refresh',
      'native-provider-discard',
      'native-provider-save',
    ]);
    expect(screen.getByLabelText('Enabled')).not.toBeChecked();
    expect(screen.queryByText(/Login status unknown/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Native login has not been checked/)).not.toBeInTheDocument();
    expect(body.querySelector('.xgc-form-field-hint')).toBeNull();

    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledWith({
      revision: 'one',
      provider: {
        id: 'claude',
        provider: 'claude',
        enabled: true,
        binaryPath: '',
        defaults: {},
      },
    });
  });

  it('forwards the shared editor original revision even after a newer document arrives', async () => {
    render(<NativeProvidersSettingsSection {...context} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI providers' }));
    fireEvent.click(await screen.findByRole('button', { name: /Codex/ }));
    fireEvent.click(screen.getByLabelText('Enabled'));
    mocks.refresh.mockResolvedValue(settingsDoc('two'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith('codex'));
    mocks.save.mockRejectedValue(new Error('Settings changed; reload the draft.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ revision: 'one' }));
  });
});
