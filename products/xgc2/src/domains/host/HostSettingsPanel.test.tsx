// @vitest-environment jsdom

import { render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { HTTPError,type ApiTargetOptions } from '../../api/http';
import { selectControlOption } from '../../test/selectControlTestUtils';
import { HostSettingsPanel } from './HostSettingsPanel';
import { hostPrivilegeCode,hostSettingsErrorMessage,type HostSettings,type HostSettingsPatch } from './hostSettingsService';

const hostSettingsApi = vi.hoisted(() => ({
  getHostSettings: vi.fn(),
  applyHostSettings: vi.fn(),
}));

const promptHostPassword = vi.hoisted(() => vi.fn());
const confirmHostError = vi.hoisted(() => vi.fn());
const notifyHostError = vi.hoisted(() => vi.fn());
const settingsSubscribers = vi.hoisted(() => new Set<{
  target: string;changed: (settings: HostSettings) => void;
}>());

vi.mock('../groundStationInteraction/groundStationInteractionPublic', () => ({
  useGroundStationErrorNotification: notifyHostError,
}));

vi.mock('./hostSettingsService',async (importOriginal) => {
  const actual = await importOriginal() as Record<string,unknown>;
  return {
    ...actual,
    getHostSettings: hostSettingsApi.getHostSettings,
    applyHostSettings: async (patch: HostSettingsPatch,options?: ApiTargetOptions) => {
      const next = await hostSettingsApi.applyHostSettings(patch,options);
      const target = JSON.stringify([options?.targetCoreId ?? '',options?.managedHostId ?? '']);
      for (const listener of settingsSubscribers) {
        if (listener.target === target) listener.changed(next);
      }
      return next;
    },
    subscribeHostSettings: (options: ApiTargetOptions,changed: (settings: HostSettings) => void) => {
      const listener = { target: JSON.stringify([options.targetCoreId ?? '',options.managedHostId ?? '']),changed };
      settingsSubscribers.add(listener);
      return () => { settingsSubscribers.delete(listener); };
    },
  };
});

vi.mock('@xgc2/ui-react',async (importOriginal) => {
  const actual = await importOriginal() as Record<string,unknown>;
  return {
    ...actual,
    useTextPromptDialog: () => ({ prompt: promptHostPassword,dialog: null }),
    useConfirmationDialog: () => ({ confirm: confirmHostError,dialog: null }),
  };
});

function policy(overrides: Partial<HostSettings> = {}): HostSettings {
  return {
    timezone: 'Etc/UTC',
    ntpEnabled: false,
    cpuGovernor: 'powersave',
    availableGovernors: ['powersave','performance'],
    displayIdleSeconds: 0,
    autologinEnabled: true,
    autologinUser: 'operator',
    sleepEnabled: false,
    pendingRestart: false,
    collectedAt: '2026-08-16T00:00:00Z',
    ...overrides,
  };
}

describe('HostSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hostSettingsApi.getHostSettings.mockResolvedValue(policy());
    hostSettingsApi.applyHostSettings.mockImplementation(async (patch: { mask: string[] } & Partial<HostSettings>) =>
      policy({
        timezone: patch.timezone ?? 'Etc/UTC',
        ntpEnabled: patch.ntpEnabled ?? false,
        cpuGovernor: patch.cpuGovernor ?? 'powersave',
        displayIdleSeconds: patch.displayIdleSeconds ?? 0,
        autologinEnabled: patch.autologinEnabled ?? true,
        autologinUser: patch.autologinUser ?? 'operator',
        sleepEnabled: patch.sleepEnabled ?? false,
      }),
    );
    promptHostPassword.mockReset();
    confirmHostError.mockReset();
    confirmHostError.mockResolvedValue(true);
  });

  it('renders Host policy as a Settings ConfigSection with two-column FormField rows', async () => {
    const { container } = render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);

    const section = await waitFor(() => {
      const el = container.querySelector('[data-xgc-role="system-host-settings"]');
      expect(el).not.toBeNull();
      expect(el!.querySelectorAll('.xgc-form-field')).toHaveLength(7);
      return el as HTMLElement;
    });

    expect(section).toHaveClass('xgc-config-section');
    expect(section).toHaveClass('xgc-host-settings');
    expect(section).toHaveAttribute('data-xgc-id', 'host-policy');
    expect(section).toHaveAttribute('data-xgc-expanded', 'true');
    expect(section.querySelector('.xgc-host-settings-grid')).toBeNull();
    expect(section.querySelector('.xgc-panel')).toBeNull();
    expect(section.querySelectorAll('.xgc-form-field')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Host policy' })).toHaveAttribute('aria-expanded', 'true');

    expect(container.querySelector('[data-xgc-role="system-host-settings-timezone-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-governor-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-idle-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-autologin-user-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-ntp-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-autologin-field"]')).not.toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-sleep-field"]')).not.toBeNull();

    const ntpField = container.querySelector('[data-xgc-role="system-host-settings-ntp-field"]');
    expect(ntpField?.querySelector('[data-xgc-role="system-host-settings-ntp"]')).not.toBeNull();
    expect(screen.getByRole('switch', { name: 'Network time' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Autologin to desktop' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Allow sleep' })).not.toBeChecked();

    expect(container.querySelector('[data-xgc-role="system-host-settings-actions"]')).toBeNull();
    expect(container.querySelector('[data-xgc-role="system-host-settings-refresh"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('applies a timezone change immediately through the existing host-settings mask', async () => {
    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Host timezone')).toBeInTheDocument();

    selectControlOption('Host timezone', 'Asia/Shanghai');

    await waitFor(() => expect(hostSettingsApi.applyHostSettings).toHaveBeenCalledWith({
      mask: ['timezone'],
      timezone: 'Asia/Shanghai',
      ntpEnabled: false,
      cpuGovernor: 'powersave',
      displayIdleSeconds: 0,
      autologinEnabled: true,
      autologinUser: 'operator',
      sleepEnabled: false,
    }, {}));
    expect(promptHostPassword).not.toHaveBeenCalled();
  });

  it('keeps the loaded policy and edited text when a parent recreates the same target options', async () => {
    const { rerender } = render(<HostSettingsPanel apiTarget={{ managedHostId: 'agent-a' }} actionsEnabled />);
    expect(await screen.findByLabelText('Host timezone')).toBeInTheDocument();
    rerender(<HostSettingsPanel apiTarget={{ managedHostId: 'agent-a' }} actionsEnabled />);
    await waitFor(() => expect(screen.getByLabelText('Host timezone')).not.toBeDisabled());
    expect(hostSettingsApi.getHostSettings).toHaveBeenCalledTimes(1);
  });

  it('offers only performance settings in the Maintenance toolbar and can retry a failed read', async () => {
    hostSettingsApi.getHostSettings.mockRejectedValueOnce(new Error('Host disconnected'));
    const { container } = render(<HostSettingsPanel apiTarget={{}} actionsEnabled presentation="performance" />);
    const refresh = await screen.findByRole('button',{ name: 'Refresh performance mode' });
    await waitFor(() => expect(refresh).not.toBeDisabled());
    expect(screen.getByLabelText('Performance mode')).toBeDisabled();
    expect(screen.queryByLabelText('Host timezone')).toBeNull();
    expect(container.querySelector('.xgc-config-section')).toBeNull();
    refresh.click();
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toHaveTextContent('powersave'));
    expect(screen.getByLabelText('Performance mode')).not.toBeDisabled();
    expect(hostSettingsApi.getHostSettings).toHaveBeenCalledTimes(2);
  });

  it('prompts for a host password when the apply needs elevation', async () => {
    hostSettingsApi.applyHostSettings
      .mockRejectedValueOnce(new HTTPError(403,'Forbidden',{
        error: 'host settings: host password required',
        code: 'privilege_required',
      }))
      .mockResolvedValueOnce(policy({ timezone: 'Asia/Shanghai' }));
    promptHostPassword.mockResolvedValueOnce('secret');

    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Host timezone')).toBeInTheDocument();
    selectControlOption('Host timezone', 'Asia/Shanghai');

    await waitFor(() => expect(promptHostPassword).toHaveBeenCalledWith({
      title: 'Host password required',
      label: 'Administrator password on this host',
      submitLabel: 'Apply',
      placeholder: 'Not saved — used only to change this setting',
      inputType: 'password',
    }));
    await waitFor(() => expect(hostSettingsApi.applyHostSettings).toHaveBeenLastCalledWith({
      mask: ['timezone'],
      timezone: 'Asia/Shanghai',
      ntpEnabled: false,
      cpuGovernor: 'powersave',
      displayIdleSeconds: 0,
      autologinEnabled: true,
      autologinUser: 'operator',
      sleepEnabled: false,
      privilegePassword: 'secret',
    }, {}));
  });

  it('reverts the draft when the operator cancels the password prompt', async () => {
    hostSettingsApi.applyHostSettings.mockRejectedValueOnce(new HTTPError(403,'Forbidden',{
      error: 'host settings: host password required',
      code: 'privilege_required',
    }));
    promptHostPassword.mockResolvedValueOnce(null);

    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Host timezone')).toBeInTheDocument();
    selectControlOption('Host timezone', 'Asia/Shanghai');

    await waitFor(() => expect(promptHostPassword).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Host timezone')).toHaveTextContent('Etc/UTC'));
    expect(hostSettingsApi.applyHostSettings).toHaveBeenCalledTimes(1);
    expect(confirmHostError).not.toHaveBeenCalled();
  });

  it('applies the selected performance mode to the selected host after a password retry', async () => {
    const target = { managedHostId: 'agent-performance' };
    hostSettingsApi.applyHostSettings
      .mockRejectedValueOnce(new HTTPError(403,'Forbidden',{ code: 'privilege_required' }))
      .mockRejectedValueOnce(new HTTPError(403,'Forbidden',{ code: 'privilege_denied' }))
      .mockResolvedValueOnce(policy({ cpuGovernor: 'performance' }));
    promptHostPassword.mockResolvedValueOnce('incorrect').mockResolvedValueOnce('correct');
    render(<HostSettingsPanel apiTarget={target} actionsEnabled />);
    expect(await screen.findByLabelText('Performance mode')).toBeInTheDocument();
    selectControlOption('Performance mode','performance');

    await waitFor(() => expect(hostSettingsApi.applyHostSettings).toHaveBeenCalledTimes(3));
    expect(hostSettingsApi.applyHostSettings).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ mask: ['cpuGovernor'],cpuGovernor: 'performance' }),target);
    expect(hostSettingsApi.applyHostSettings.mock.calls[0][0]).not.toHaveProperty('privilegePassword');
    expect(promptHostPassword).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ title: 'Host password was rejected',inputType: 'password' }));
    expect(hostSettingsApi.applyHostSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ mask: ['cpuGovernor'],cpuGovernor: 'performance',privilegePassword: 'correct' }),target);
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toHaveTextContent('performance'));
  });

  it('restores the selected performance mode when the password request is cancelled', async () => {
    hostSettingsApi.applyHostSettings.mockRejectedValueOnce(new HTTPError(403,'Forbidden',{
      code: 'privilege_required',
    }));
    promptHostPassword.mockResolvedValueOnce(null);
    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Performance mode')).toBeInTheDocument();
    selectControlOption('Performance mode','performance');

    await waitFor(() => expect(promptHostPassword).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Performance mode')).toHaveTextContent('powersave'));
    expect(hostSettingsApi.applyHostSettings).toHaveBeenCalledTimes(1);
  });

  it('disables performance selection when the host reports no available modes', async () => {
    hostSettingsApi.getHostSettings.mockResolvedValueOnce(policy({ cpuGovernor: '',availableGovernors: [] }));
    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    const control = await screen.findByLabelText('Performance mode');
    expect(control).toBeDisabled();
    expect(control).toHaveTextContent('Unavailable');
    expect(hostSettingsApi.applyHostSettings).not.toHaveBeenCalled();
  });

  it('does not treat a station authorization error as a host password challenge', async () => {
    hostSettingsApi.applyHostSettings.mockRejectedValueOnce(new HTTPError(403,'Forbidden',{
      error: 'station token rejected',
    }));
    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Performance mode')).toBeInTheDocument();
    selectControlOption('Performance mode','performance');

    await waitFor(() => expect(notifyHostError).toHaveBeenCalledWith(
      'local','station token rejected',expect.objectContaining({ source: 'host-policy' }),
    ));
    expect(promptHostPassword).not.toHaveBeenCalled();
    expect(hostSettingsApi.applyHostSettings).toHaveBeenCalledTimes(1);
  });

  it('publishes an error notification and restores the field when a host-policy apply fails', async () => {
    hostSettingsApi.applyHostSettings.mockRejectedValueOnce(new HTTPError(500,'Internal Server Error',{
      error: 'host settings: timedatectl: Failed to create bus connection',
    }));

    render(<HostSettingsPanel apiTarget={{}} actionsEnabled />);
    expect(await screen.findByLabelText('Network time')).toBeInTheDocument();
    screen.getByRole('switch', { name: 'Network time' }).click();

    await waitFor(() => expect(notifyHostError).toHaveBeenCalledWith(
      'local','host settings: timedatectl: Failed to create bus connection',
      { title: 'Host policy',source: 'host-policy',dedupeKey: 'host-policy:error' },
    ));
    expect(confirmHostError).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Network time' })).not.toBeChecked();
    expect(screen.queryByText(/Internal Server Error/)).toBeNull();
  });

  it('routes managed-host policy errors to the same host without prompting for a decision', async () => {
    hostSettingsApi.getHostSettings.mockRejectedValueOnce(new Error('Host disconnected'));
    render(<HostSettingsPanel apiTarget={{ managedHostId: 'agent-b' }} actionsEnabled />);
    await waitFor(() => expect(notifyHostError).toHaveBeenCalledWith(
      'agent-b','Host disconnected',expect.objectContaining({ title: 'Host policy' }),
    ));
    expect(confirmHostError).not.toHaveBeenCalled();
    expect(promptHostPassword).not.toHaveBeenCalled();
  });
});

describe('hostPrivilegeCode', () => {
  it('reads the structured privilege code from a 403 body', () => {
    expect(hostPrivilegeCode(new HTTPError(403,'Forbidden',{
      error: 'host settings: host password required',
      code: 'privilege_required',
    }))).toBe('privilege_required');
    expect(hostPrivilegeCode(new HTTPError(403,'Forbidden',{
      error: 'host settings: host password was rejected',
      code: 'privilege_denied',
    }))).toBe('privilege_denied');
    expect(hostPrivilegeCode(new HTTPError(403,'Forbidden',{ error: 'station token rejected' }))).toBe('');
  });

  it('prefers the JSON error body over the HTTP status line', () => {
    expect(hostSettingsErrorMessage(new HTTPError(500,'Internal Server Error',{
      error: 'host settings: timedatectl: Failed to create bus connection',
    }))).toBe('host settings: timedatectl: Failed to create bus connection');
  });
});
