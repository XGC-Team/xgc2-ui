import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { Notice,useTextPromptDialog } from '@xgc2/ui-react';
import { RefreshCw } from 'lucide-react';
import { ConfigSection } from '../../components/ConfigSection';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import { InputControl } from '../../components/controls/TextControls';
import { useHostTask } from './useHostTask';
import { useDeferSystemTabReady } from './hostSystemTabSurface';
import { useDeferRouteReady } from '../../shared/routeReady';
import { useHostText } from './hostMessages';
import { executionTargetKeyForCore } from '../execution/executionPublic';
import { useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import {
  applyHostSettings,
  getHostSettings,
  hostPrivilegeCode,
  hostSettingsErrorMessage,
  subscribeHostSettings,
  type HostSettings,
  type HostSettingsPatch,
} from './hostSettingsPublic';
import type { ApiTargetOptions } from '../../api/http';
import './HostSettingsPanel.css';

const timezoneOptions = [
  { value: 'Asia/Shanghai',label: 'Asia/Shanghai' },
  { value: 'UTC',label: 'UTC' },
  { value: 'Asia/Tokyo',label: 'Asia/Tokyo' },
  { value: 'Asia/Seoul',label: 'Asia/Seoul' },
  { value: 'Asia/Singapore',label: 'Asia/Singapore' },
  { value: 'Asia/Hong_Kong',label: 'Asia/Hong Kong' },
];

const idleOptions = [
  { value: '0',label: 'Never' },
  { value: '300',label: '5 minutes' },
  { value: '600',label: '10 minutes' },
  { value: '1800',label: '30 minutes' },
  { value: '3600',label: '1 hour' },
];

type HostSettingsPanelProps = {
  apiTarget: ApiTargetOptions;
  actionsEnabled: boolean;
  presentation?: 'section' | 'performance';
};

export function HostSettingsPanel(props: HostSettingsPanelProps) {
  // Changing targets also ends any pending password dialog and drops its password.
  const key = JSON.stringify([props.apiTarget.targetCoreId ?? '',props.apiTarget.managedHostId ?? '']);
  return <HostSettingsContent key={key} {...props} />;
}

function HostSettingsContent({ apiTarget: target,actionsEnabled,presentation = 'section' }: HostSettingsPanelProps) {
  const { targetCoreId,managedHostId,auth,timeoutMs } = target;
  const apiTarget = useMemo<ApiTargetOptions>(() => ({
    ...(targetCoreId ? { targetCoreId } : {}),
    ...(managedHostId ? { managedHostId } : {}),
    ...(auth ? { auth } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  }),[targetCoreId,managedHostId,auth,timeoutMs]);
  const t = useHostText();
  const notificationTarget = apiTarget.managedHostId || executionTargetKeyForCore(apiTarget.targetCoreId);
  const [settings,setSettings] = useState<HostSettings | null>(null);
  const [draft,setDraft] = useState<HostSettings | null>(null);
  const [failure,setFailure] = useState<{ targetId: string;message: string }>();
  const error = failure?.targetId === notificationTarget ? failure.message : '';
  const hostPasswordRef = useRef('');
  const lifetimeRef = useRef({ active: true });
  const busyRef = useRef(false);
  const settingsRef = useRef<HostSettings | null>(null);
  const snapshotRevision = useRef(0);
  const { prompt: promptText,dialog: passwordDialog } = useTextPromptDialog();
  const task = useHostTask();
  const { run } = task;
  const waitingForSettings = settings === null && !error;
  useDeferSystemTabReady(waitingForSettings);
  useDeferRouteReady(presentation === 'performance' && waitingForSettings);
  busyRef.current = task.isBusy();
  settingsRef.current = settings;

  useEffect(() => {
    const lifetime = { active: true };
    lifetimeRef.current = lifetime;
    return () => {
      lifetime.active = false;
      hostPasswordRef.current = '';
    };
  },[]);

  useGroundStationErrorNotification(notificationTarget,error,{
    title: 'Host policy',source: 'host-policy',dedupeKey: 'host-policy:error',
  });
  const showError = useCallback((cause: unknown) => setFailure({
    targetId: notificationTarget,message: hostSettingsErrorMessage(cause),
  }), [notificationTarget]);

  useEffect(() => subscribeHostSettings(apiTarget,(next) => {
    snapshotRevision.current += 1;
    const committed = settingsRef.current;
    settingsRef.current = next;
    setSettings(next);
    setDraft((current) => current && committed
      && current.autologinUser !== committed.autologinUser
      ? { ...next,autologinUser: current.autologinUser } : next);
  }),[apiTarget]);

  const promptHostPassword = useCallback(async (rejected: boolean) => (
    promptText({
      title: rejected ? 'Host password was rejected' : 'Host password required',
      label: 'Administrator password on this host',
      submitLabel: 'Apply',
      placeholder: 'Not saved — used only to change this setting',
      inputType: 'password',
    })
  ), [promptText]);

  const applyPatch = useCallback(async (patch: HostSettingsPatch) => {
    const lifetime = lifetimeRef.current;
    const isCurrent = () => lifetime.active && lifetimeRef.current === lifetime;
    if (!isCurrent()) return undefined;
    try {
      const applied = await applyHostSettings(patch, apiTarget);
      return isCurrent() ? applied : undefined;
    } catch (error) {
      if (!isCurrent()) return undefined;
      if (hostPrivilegeCode(error) !== 'privilege_required') throw error;
    }
    if (!isCurrent()) return undefined;
    if (hostPasswordRef.current) {
      try {
        const applied = await applyHostSettings({
          ...patch,
          privilegePassword: hostPasswordRef.current,
        }, apiTarget);
        return isCurrent() ? applied : undefined;
      } catch (error) {
        if (!isCurrent()) return undefined;
        const code = hostPrivilegeCode(error);
        if (code !== 'privilege_denied' && code !== 'privilege_required') throw error;
        hostPasswordRef.current = '';
      }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!isCurrent()) return undefined;
      const password = await promptHostPassword(attempt > 0);
      if (!isCurrent() || !password) return undefined;
      try {
        const applied = await applyHostSettings({ ...patch,privilegePassword: password }, apiTarget);
        if (!isCurrent()) return undefined;
        hostPasswordRef.current = password;
        return applied;
      } catch (error) {
        if (!isCurrent()) return undefined;
        if (hostPrivilegeCode(error) === 'privilege_denied') continue;
        throw error;
      }
    }
    throw new Error('Host password was rejected.');
  }, [apiTarget,promptHostPassword]);

  const load = useCallback(async (silent = false) => {
    if (silent && busyRef.current) return;
    setFailure(undefined);
    const revision = snapshotRevision.current;
    try {
      await run('refresh',async () => {
        const next = await getHostSettings(apiTarget);
        if (revision !== snapshotRevision.current) return;
        setSettings(next);
        setDraft((current) => {
          const committed = settingsRef.current;
          if (current && committed && current.autologinUser !== committed.autologinUser) {
            return { ...next,autologinUser: current.autologinUser };
          }
          return next;
        });
      }, { quiet: true });
    } catch (error) {
      if (!silent && revision === snapshotRevision.current) await showError(error);
    }
  },[apiTarget,run,showError]);

  useEffect(() => {
    void load();
  },[load]);

  const applyField = async (next: HostSettings, field: keyof HostSettings) => {
    if (!settings) return;
    if (next[field] === settings[field]) {
      setDraft(next);
      return;
    }
    setDraft(next);
    setFailure(undefined);
    try {
      const applied = await run(`save:${field}`, async () => applyPatch({
        mask: [field],
        timezone: next.timezone,
        ntpEnabled: next.ntpEnabled,
        cpuGovernor: next.cpuGovernor,
        displayIdleSeconds: next.displayIdleSeconds,
        autologinEnabled: next.autologinEnabled,
        autologinUser: next.autologinUser,
        sleepEnabled: next.sleepEnabled,
      }), { quiet: true });
      if (applied) return;
      setDraft(settingsRef.current);
    } catch (error) {
      setDraft(settingsRef.current);
      await showError(error);
    }
  };

  const governorOptions = useMemo(() => {
    const values = new Set(draft?.availableGovernors ?? []);
    if (draft?.cpuGovernor) values.add(draft.cpuGovernor);
    return [...values].map((value) => ({ value,label: value }));
  },[draft]);

  const timezoneSelect = useMemo(() => {
    const values = timezoneOptions.slice();
    if (draft?.timezone && !values.some((item) => item.value === draft.timezone)) {
      values.unshift({ value: draft.timezone,label: draft.timezone });
    }
    return values;
  },[draft?.timezone]);

  const disabled = task.isBusy() || !actionsEnabled;
  const performanceRole = presentation === 'performance' ? 'maintenance-performance-mode' : 'system-host-settings-governor';
  const performance = (
    <FormField className={presentation === 'performance' ? 'xgc-host-performance-field' : undefined} label={t('Performance mode')} dataXgcRole={`${performanceRole}-field`} dataXgcId={`${performanceRole}-field`}>
      <SelectControl
        value={draft?.cpuGovernor || ''}
        options={governorOptions.length > 0 ? governorOptions : [{ value: '',label: waitingForSettings ? '—' : t('Unavailable') }]}
        ariaLabel={t('Performance mode')}
        dataXgcRole={performanceRole} dataXgcId={performanceRole}
        size={presentation === 'performance' ? 'compact' : 'default'}
        fill
        disabled={disabled || !draft?.availableGovernors?.length}
        onChange={(value) => { if (draft) void applyField({ ...draft,cpuGovernor: value },'cpuGovernor'); }}
      />
    </FormField>
  );

  if (presentation === 'performance') return (
    <div className="xgc-host-performance-control" data-xgc-role="maintenance-performance" data-xgc-id="maintenance-performance" aria-busy={task.isBusy() || undefined}>
      {performance}
      <ControlButton
        iconOnly
        size="compact"
        title={t('Refresh performance mode')}
        aria-label={t('Refresh performance mode')}
        dataXgcRole="maintenance-performance-refresh" dataXgcId="maintenance-performance"
        disabled={disabled}
        onClick={() => void load()}
      ><RefreshCw size={14} aria-hidden="true" /></ControlButton>
      {passwordDialog}
    </div>
  );

  return (
    <ConfigSection
      className="xgc-host-settings"
      title={t('Host policy')}
      dataXgcRole="system-host-settings"
      dataXgcId="host-policy"
    >
      {draft?.pendingRestart && (
        <Notice tone="warning" density="compact">Autologin is written. It takes effect on the next graphical login.</Notice>
      )}
      {passwordDialog}
      {draft && (
        <>
          <FormField label="Timezone" dataXgcRole="system-host-settings-timezone-field" dataXgcId="system-host-settings-timezone-field">
            <SelectControl
              value={draft.timezone || 'UTC'}
              options={timezoneSelect}
              ariaLabel={t('Host timezone')}
              dataXgcRole="system-host-settings-timezone" dataXgcId="system-host-settings-timezone"
              fill
              disabled={disabled}
              onChange={(value) => void applyField({ ...draft,timezone: value }, 'timezone')}
            />
          </FormField>
          {performance}
          <FormField label="Screen idle" dataXgcRole="system-host-settings-idle-field" dataXgcId="system-host-settings-idle-field">
            <SelectControl
              value={String(Math.max(0,draft.displayIdleSeconds))}
              options={idleOptions}
              ariaLabel={t('Screen idle timeout')}
              dataXgcRole="system-host-settings-idle" dataXgcId="system-host-settings-idle"
              fill
              disabled={disabled}
              onChange={(value) => void applyField({ ...draft,displayIdleSeconds: Number(value) }, 'displayIdleSeconds')}
            />
          </FormField>
          <FormField label="Autologin user" dataXgcRole="system-host-settings-autologin-user-field" dataXgcId="system-host-settings-autologin-user-field">
            <InputControl
              value={draft.autologinUser}
              aria-label={t('Autologin user')}
              dataXgcRole="system-host-settings-autologin-user" dataXgcId="system-host-settings-autologin-user"
              disabled={disabled}
              onBlur={() => void applyField(draft, 'autologinUser')}
              onChange={(value) => setDraft({ ...draft,autologinUser: value })}
            />
          </FormField>
          <FormField label="Network time" dataXgcRole="system-host-settings-ntp-field" dataXgcId="system-host-settings-ntp-field">
            <SwitchControl
              ariaLabel={t('Network time')}
              checked={draft.ntpEnabled}
              dataXgcRole="system-host-settings-ntp" dataXgcId="system-host-settings-ntp"
              disabled={disabled}
              onChange={(checked) => void applyField({ ...draft,ntpEnabled: checked }, 'ntpEnabled')}
            />
          </FormField>
          <FormField label="Autologin to desktop" dataXgcRole="system-host-settings-autologin-field" dataXgcId="system-host-settings-autologin-field">
            <SwitchControl
              ariaLabel={t('Autologin to desktop')}
              checked={draft.autologinEnabled}
              dataXgcRole="system-host-settings-autologin" dataXgcId="system-host-settings-autologin"
              disabled={disabled}
              onChange={(checked) => void applyField({ ...draft,autologinEnabled: checked }, 'autologinEnabled')}
            />
          </FormField>
          <FormField label="Allow sleep" dataXgcRole="system-host-settings-sleep-field" dataXgcId="system-host-settings-sleep-field">
            <SwitchControl
              ariaLabel={t('Allow sleep')}
              checked={draft.sleepEnabled}
              dataXgcRole="system-host-settings-sleep" dataXgcId="system-host-settings-sleep"
              disabled={disabled}
              onChange={(checked) => void applyField({ ...draft,sleepEnabled: checked }, 'sleepEnabled')}
            />
          </FormField>
        </>
      )}
    </ConfigSection>
  );
}
