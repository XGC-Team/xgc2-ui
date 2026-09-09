import { HTTPError,request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { segment } from '../../shared/url';

export type HostSettings = {
  timezone: string;
  ntpEnabled: boolean;
  cpuGovernor: string;
  availableGovernors: string[];
  displayIdleSeconds: number;
  autologinEnabled: boolean;
  autologinUser: string;
  sleepEnabled: boolean;
  pendingRestart: boolean;
  collectedAt: string;
};

export type HostSettingsPatch = {
  mask: string[];
  timezone?: string;
  ntpEnabled?: boolean;
  cpuGovernor?: string;
  displayIdleSeconds?: number;
  autologinEnabled?: boolean;
  autologinUser?: string;
  sleepEnabled?: boolean;
  privilegePassword?: string;
};

export type HostPrivilegeCode = 'privilege_required' | 'privilege_denied' | '';

const settingsListeners = new Set<{ target: string; changed: (settings: HostSettings) => void }>();
const pendingSettingsApplies = new Map<string,Promise<HostSettings>>();

function hostSettingsTarget(options?: ApiTargetOptions) {
  return JSON.stringify([options?.targetCoreId ?? '',options?.managedHostId ?? '']);
}

/** Keep the Host form and Maintenance performance control on the same applied snapshot. */
export function subscribeHostSettings(options: ApiTargetOptions,changed: (settings: HostSettings) => void) {
  const listener = { target: hostSettingsTarget(options),changed };
  settingsListeners.add(listener);
  return () => { settingsListeners.delete(listener); };
}

export function hostSettingsErrorMessage(error: unknown): string {
  if (error instanceof HTTPError) {
    const body = error.body;
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
    return error.message.replace(/^\d+\s+[^:]+:\s*/, '');
  }
  return error instanceof Error ? error.message : String(error);
}

export function hostPrivilegeCode(error: unknown): HostPrivilegeCode {
  if (!(error instanceof HTTPError) || error.status !== 403) return '';
  const body = error.body;
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code?: unknown }).code;
    if (code === 'privilege_required' || code === 'privilege_denied') return code;
  }
  if (/host password required/i.test(error.message)) return 'privilege_required';
  if (/host password was rejected/i.test(error.message)) return 'privilege_denied';
  return '';
}

export function getHostSettings(options?: ApiTargetOptions): Promise<HostSettings> {
  if (options?.managedHostId) {
    return request<HostSettings>(
      `/managed-hosts/${segment(options.managedHostId)}/settings`,
      undefined,
      withTerminalAuth(options),
    );
  }
  return request<HostSettings>('/host/settings',undefined,withTerminalAuth(options));
}

export function applyHostSettings(
  patch: HostSettingsPatch,
  options?: ApiTargetOptions,
): Promise<HostSettings> {
  const target = hostSettingsTarget(options);
  const previous = pendingSettingsApplies.get(target);
  const apply = async () => {
    const settings = options?.managedHostId
      ? await request<HostSettings>(
        `/managed-hosts/${segment(options.managedHostId)}/settings`,
        { method: 'PUT',body: JSON.stringify(patch) },
        withTerminalAuth(options),
      )
      : await request<HostSettings>(
        '/host/settings',
        { method: 'PUT',body: JSON.stringify(patch) },
        withTerminalAuth(options),
      );
    for (const listener of settingsListeners) {
      if (listener.target === target) listener.changed(settings);
    }
    return settings;
  };
  // Independent forms for the same host share request order. A failed request
  // still rejects for its caller, while releasing the next accepted mutation.
  const pending = previous ? previous.catch(() => undefined).then(apply) : apply();
  pendingSettingsApplies.set(target,pending);
  const release = () => {
    if (pendingSettingsApplies.get(target) === pending) pendingSettingsApplies.delete(target);
  };
  void pending.then(release,release);
  return pending;
}
