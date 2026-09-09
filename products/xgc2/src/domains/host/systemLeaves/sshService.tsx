import { FileText,RefreshCw,Save,SlidersHorizontal } from 'lucide-react';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { ConfigSection } from '../../../components/ConfigSection';
import { ControlButton } from '../../../components/controls/ControlButton';
import { TextareaControl } from '../../../components/controls/TextControls';
import { InputActionControl,Notice,Panel,StatusText,Toolbar } from '@xgc2/ui-react';
import { FormField,SwitchControl } from '../../../components/FormPrimitives';
import { PanelViewSwitcher } from '../../../components/PanelViewSwitcher';
import { usePersistentState } from '../../../hooks/usePersistentState';
import type { HostSSHInfo } from '../hostModel';
import { HostSSHConfigDrawer } from '../HostSSHConfigDrawer';
import {
  getHostSSH,
  getHostSSHConfigFile,
  operateHostSSH,
  saveHostSSHConfigFile,
  updateHostSSHSetting,
  type HostSSHOperation,
} from '../hostSSHActions';
import { permitRootLoginLabel,type SSHDrawerDraft } from '../hostServicesModel';
import type { HostSystemLeafProps } from '../hostSystemComposition';
import { useHostTask } from '../useHostTask';
import { useDeferSystemTabReady } from '../hostSystemTabSurface';
import './sshService.css';

type HostSSHMode = 'base' | 'all';

const sshModes = [
  { id: 'base',label: 'Base config',icon: SlidersHorizontal },
  { id: 'all',label: 'All config',icon: FileText },
] as const;

export function HostSSHServiceSystemLeaf(context: HostSystemLeafProps<'SSHService'>) {
  const apiTarget = useMemo(() => ({
    ...(context.targetCoreId ? { targetCoreId: context.targetCoreId } : {}),
    ...(context.managedHostId ? { managedHostId: context.managedHostId } : {}),
  }),[context.managedHostId,context.targetCoreId]);
  const [ssh,setSSH] = useState<HostSSHInfo | null>(null);
  const task = useHostTask();
  const { run } = task;
  const waitingForSsh = context.requestsAllowed && ssh === null && !task.message;
  useDeferSystemTabReady(waitingForSsh);

  const loadSSH = useCallback(async () => {
    if (!context.requestsAllowed) return;
    await run('refresh',async () => setSSH(await getHostSSH(apiTarget)));
  },[apiTarget,context.requestsAllowed,run]);

  useEffect(() => {
    void loadSSH();
  },[loadSSH]);

  const operate = async (operation: HostSSHOperation) => {
    if (!context.actionsEnabled || !context.requestsAllowed) return;
    await run(`operate:${operation}`,async () => {
      await operateHostSSH(operation,apiTarget);
      setSSH(await getHostSSH(apiTarget));
    });
  };
  const updateSetting = async (key: string,value: string) => {
    if (!context.actionsEnabled || !context.requestsAllowed) return;
    await run(`setting:${key}`,async () => setSSH(await updateHostSSHSetting(key,value,apiTarget)));
  };

  return (
    <>
      {task.message && (
        <Notice tone={task.messageTone} density="compact" onDismiss={task.clearMessage}>
          {task.message}
        </Notice>
      )}
      {ssh ? (
        <HostSSHPanel
          ssh={ssh}
          apiTarget={apiTarget}
          isRemote={context.isRemote}
          busy={task.isBusy() || !context.actionsEnabled}
          actionsEnabled={context.actionsEnabled}
          onRefresh={loadSSH}
          onOperate={(operation) => void operate(operation)}
          onUpdateSetting={(key,value) => void updateSetting(key,value)}
        />
      ) : null}
    </>
  );
}

function HostSSHPanel({
  ssh,
  apiTarget,
  isRemote,
  busy,
  actionsEnabled,
  onRefresh,
  onOperate,
  onUpdateSetting,
}: {
  ssh: HostSSHInfo;
  apiTarget: { targetCoreId?: string;managedHostId?: string };
  isRemote: boolean;
  busy: boolean;
  actionsEnabled: boolean;
  onRefresh: () => void;
  onOperate: (operation: HostSSHOperation) => void;
  onUpdateSetting: (key: string,value: string) => void;
}) {
  // Remote typed SSH never mounts the Files-backed full document editor.
  const remoteTyped = isRemote || ssh.remoteTyped === true;
  const [mode,setMode] = usePersistentState<HostSSHMode>(
    'xgc.system.ssh.mode',
    'base',
    isHostSSHMode,
  );
  const activeMode: HostSSHMode = remoteTyped ? 'base' : mode;
  const [drawer,setDrawer] = useState<SSHDrawerDraft | null>(null);
  const [allConfig,setAllConfig] = useState('');
  const configTask = useHostTask();
  const { run: runConfig } = configTask;

  useEffect(() => {
    if (remoteTyped || activeMode !== 'all') return;
    void runConfig('load-config',async () => {
      const content = await getHostSSHConfigFile(ssh.configPath,apiTarget);
      setAllConfig(content.content);
    });
  },[activeMode,apiTarget,remoteTyped,runConfig,ssh.configPath]);

  const saveAllConfig = async () => {
    if (remoteTyped || !actionsEnabled) return;
    await runConfig('save-config',async () => {
      await saveHostSSHConfigFile(ssh.configPath,allConfig,apiTarget);
      await onRefresh();
    },{ successMessage: 'Saved. Restart SSH to apply changes if needed.' });
  };

  const openSetting = (draft: SSHDrawerDraft) => {
    if (actionsEnabled) setDrawer(draft);
  };
  const updateToggle = (key: string,value: boolean) => onUpdateSetting(key,value ? 'yes' : 'no');

  return (
    <Panel bodyLayout="column" chrome="flat" className="xgc-host-ssh-section xgc-host-fill-section" data-xgc-role="host-ssh-section" data-xgc-id="host-ssh-section" fill padding="none">
      <div className="xgc-host-ssh-status" data-xgc-role="host-ssh-status" data-xgc-id="host-ssh-status">
        <div className="xgc-host-ssh-status-copy">
          <strong>{ssh.serviceName}</strong>
          <StatusText tone={ssh.active ? 'neutral' : 'danger'} status={ssh.active ? 'active' : 'inactive'} />
          {ssh.configPath && <span>{ssh.configPath}</span>}
        </div>
        <Toolbar className="xgc-host-ssh-actions" data-xgc-role="host-ssh-actions" data-xgc-id="host-ssh-actions">
          <ControlButton size="compact" disabled={busy || !actionsEnabled} dataXgcRole="host-ssh-toggle" dataXgcId="host-ssh-toggle" onClick={() => onOperate(ssh.active ? 'stop' : 'start')}>{ssh.active ? 'Stop' : 'Start'}</ControlButton>
          <ControlButton size="compact" disabled={busy || !actionsEnabled} dataXgcRole="host-ssh-restart" dataXgcId="host-ssh-restart" onClick={() => onOperate('restart')}>Restart</ControlButton>
          <SwitchControl
            checked={ssh.autoStart}
            disabled={busy || !actionsEnabled}
            label="Auto start"
            onChange={(checked) => onOperate(checked ? 'enable' : 'disable')}
            dataXgcRole="host-ssh-auto-start" dataXgcId="host-ssh-auto-start"
          />
          <ControlButton size="compact" disabled={busy || !actionsEnabled} dataXgcRole="host-ssh-refresh" dataXgcId="host-ssh-refresh" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />Refresh</ControlButton>
        </Toolbar>
      </div>

      {!remoteTyped && (
        <PanelViewSwitcher
          value={activeMode}
          items={sshModes}
          onChange={setMode}
          ariaLabel="SSH configuration view"
          presentation="labels"
          appearance="panel"
          dataXgcRole="host-ssh-view-switcher" dataXgcId="host-ssh-view-switcher"
          optionDataXgcRole="host-ssh-view"
        />
      )}

      {activeMode === 'base' ? (
        <ConfigSection className="xgc-host-ssh-config-section" title="Base configuration" dataXgcRole="host-ssh-base-settings" dataXgcId="base">
          <FormField label="Port" tooltip="Primary SSH listening port" dataXgcRole="host-ssh-port" dataXgcId="host-ssh-port">
            <InputActionControl
              className="xgc-host-ssh-setting-control"
              value={ssh.port}
              readOnly
              actionLabel="Set"
              actionDisabled={busy || !actionsEnabled}
              aria-label="Port"
              onAction={() => openSetting({ key: 'Port',title: 'Port',value: ssh.port,type: 'port' })}
            />
          </FormField>
          <FormField label="Listen address" tooltip="Empty or 0.0.0.0 means all interfaces" dataXgcRole="host-ssh-listen-address" dataXgcId="host-ssh-listen-address">
            <InputActionControl
              className="xgc-host-ssh-setting-control"
              value={ssh.listenAddress || 'All interfaces'}
              readOnly
              actionLabel="Set"
              actionDisabled={busy || !actionsEnabled}
              aria-label="Listen address"
              onAction={() => openSetting({ key: 'ListenAddress',title: 'Listen address',value: ssh.listenAddress,type: 'address' })}
            />
          </FormField>
          <FormField label="Permit root login" tooltip="Root login policy" dataXgcRole="host-ssh-permit-root" dataXgcId="host-ssh-permit-root">
            <InputActionControl
              className="xgc-host-ssh-setting-control"
              value={permitRootLoginLabel(ssh.permitRootLogin)}
              readOnly
              actionLabel="Set"
              actionDisabled={busy || !actionsEnabled}
              aria-label="Permit root login"
              onAction={() => openSetting({ key: 'PermitRootLogin',title: 'Permit root login',value: ssh.permitRootLogin,type: 'root' })}
            />
          </FormField>
          <FormField label="Password authentication" tooltip="PasswordAuthentication" dataXgcRole="host-ssh-password-auth" dataXgcId="host-ssh-password-auth">
            <SwitchControl
              checked={ssh.passwordAuthentication === 'yes'}
              disabled={busy || !actionsEnabled}
              ariaLabel="Password authentication"
              onChange={(checked) => updateToggle('PasswordAuthentication',checked)}
            />
          </FormField>
          <FormField label="Public key authentication" tooltip="PubkeyAuthentication" dataXgcRole="host-ssh-pubkey-auth" dataXgcId="host-ssh-pubkey-auth">
            <SwitchControl
              checked={ssh.pubkeyAuthentication === 'yes'}
              disabled={busy || !actionsEnabled}
              ariaLabel="Public key authentication"
              onChange={(checked) => updateToggle('PubkeyAuthentication',checked)}
            />
          </FormField>
          <FormField label="Use DNS" tooltip="UseDNS" dataXgcRole="host-ssh-use-dns" dataXgcId="host-ssh-use-dns">
            <SwitchControl
              checked={ssh.useDNS === 'yes'}
              disabled={busy || !actionsEnabled}
              ariaLabel="Use DNS"
              onChange={(checked) => updateToggle('UseDNS',checked)}
            />
          </FormField>
        </ConfigSection>
      ) : (
        <div className="xgc-host-ssh-all-config" data-xgc-role="host-ssh-all-config" data-xgc-id="host-ssh-all-config">
          <div className="xgc-host-ssh-config-bar">
            <span>{ssh.configPath}</span>
            <ControlButton tone="primary" disabled={configTask.isBusy() || !actionsEnabled} dataXgcRole="host-ssh-save-config" dataXgcId="host-ssh-save-config" onClick={() => void saveAllConfig()}><Save size={14} aria-hidden="true" />Save</ControlButton>
          </div>
          {configTask.message && <Notice tone={configTask.messageTone} density="compact" onDismiss={configTask.clearMessage}>{configTask.message}</Notice>}
          <TextareaControl className="xgc-host-ssh-editor" value={allConfig} aria-label="Full SSH configuration" spellCheck={false} disabled={configTask.isBusy() || !actionsEnabled} onChange={setAllConfig} />
        </div>
      )}

      {drawer && (
        <HostSSHConfigDrawer
          draft={drawer}
          onClose={() => setDrawer(null)}
          onSave={(value) => {
            onUpdateSetting(drawer.key,value);
            setDrawer(null);
          }}
        />
      )}
    </Panel>
  );
}

function isHostSSHMode(value: unknown): value is HostSSHMode {
  return value === 'base' || value === 'all';
}
