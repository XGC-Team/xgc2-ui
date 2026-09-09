import { request,withTerminalAuth,type ApiTargetOptions } from '../../api/http';
import { queryString,segment } from '../../shared/url';
import type { HostFileContent,HostSSHInfo } from './hostModel';

export type HostSSHOperation = 'start' | 'stop' | 'restart' | 'enable' | 'disable';

type ManagedSSHStatus = {
  active: boolean;
  enabled: boolean;
  config: {
    port: number;
    listenAddress: string;
    passwordAuthentication: boolean;
    pubkeyAuthentication: boolean;
    permitRootLogin: boolean;
    useDNS: boolean;
  };
};

export function getHostSSH(options?: ApiTargetOptions): Promise<HostSSHInfo> {
  if (options?.managedHostId) {
    return request<ManagedSSHStatus>(
      `/managed-hosts/${segment(options.managedHostId)}/ssh`,
      undefined,
      withTerminalAuth(options),
    ).then(managedSSHToHostSSH);
  }
  return request<HostSSHInfo>('/host/ssh',undefined,withTerminalAuth(options));
}

export function operateHostSSH(
  operation: HostSSHOperation,
  options?: ApiTargetOptions,
): Promise<{ operation: string;serviceName: string }> {
  if (options?.managedHostId) {
    return request<ManagedSSHStatus>(
      `/managed-hosts/${segment(options.managedHostId)}/ssh/${segment(operation)}`,
      { method: 'POST' },
      withTerminalAuth(options),
    ).then(() => ({ operation,serviceName: 'sshd' }));
  }
  return request<{ operation: string;serviceName: string }>(
    `/host/ssh/${segment(operation)}`,
    { method: 'POST' },
    withTerminalAuth(options),
  );
}

export function updateHostSSHSetting(
  key: string,
  newValue: string,
  options?: ApiTargetOptions,
): Promise<HostSSHInfo> {
  if (options?.managedHostId) {
    return getHostSSH(options).then((current) => request<ManagedSSHStatus>(
      `/managed-hosts/${segment(options.managedHostId!)}/ssh/config`,
      { method: 'PUT',body: JSON.stringify(remoteSSHConfigFromSettings(current,key,newValue)) },
      withTerminalAuth(options),
    ).then(managedSSHToHostSSH));
  }
  return request<HostSSHInfo>(
    '/host/ssh/config',
    { method: 'PUT',body: JSON.stringify({ key,newValue }) },
    withTerminalAuth(options),
  );
}

/** SSH-owned local raw config access; it does not import the Files product leaf. */
export function getHostSSHConfigFile(
  path: string,
  options?: ApiTargetOptions,
): Promise<HostFileContent> {
  if (options?.managedHostId) {
    return Promise.reject(new Error('Remote Agents expose typed SSH configuration only.'));
  }
  return request<HostFileContent>(
    `/host/files/content${queryString({ path })}`,
    undefined,
    withTerminalAuth(options),
  );
}

/** SSH-owned local raw config write; it is unavailable for remote typed config. */
export function saveHostSSHConfigFile(
  path: string,
  content: string,
  options?: ApiTargetOptions,
): Promise<{ path: string }> {
  if (options?.managedHostId) {
    return Promise.reject(new Error('Remote Agents expose typed SSH configuration only.'));
  }
  return request<{ path: string }>(
    '/host/files/content',
    { method: 'PUT',body: JSON.stringify({ path,content }) },
    withTerminalAuth(options),
  );
}

function managedSSHToHostSSH(status: ManagedSSHStatus): HostSSHInfo {
  const config = status.config;
  const yesNo = (value: boolean) => value ? 'yes' : 'no';
  return {
    exists: true,
    active: status.active,
    autoStart: status.enabled,
    serviceName: 'sshd',
    configPath: '',
    port: String(config.port),
    listenAddress: config.listenAddress,
    passwordAuthentication: yesNo(config.passwordAuthentication),
    pubkeyAuthentication: yesNo(config.pubkeyAuthentication),
    permitRootLogin: yesNo(config.permitRootLogin),
    useDNS: yesNo(config.useDNS),
    raw: {},
    remoteTyped: true,
  };
}

function remoteSSHConfigFromSettings(current: HostSSHInfo,key: string,newValue: string) {
  const asBool = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  };
  const config = {
    port: Number(current.port) || 22,
    listenAddress: current.listenAddress,
    passwordAuthentication: current.passwordAuthentication === 'yes',
    pubkeyAuthentication: current.pubkeyAuthentication === 'yes',
    permitRootLogin: current.permitRootLogin === 'yes',
    useDNS: current.useDNS === 'yes',
  };
  switch (key) {
  case 'Port':
    config.port = Number(newValue) || config.port;
    break;
  case 'ListenAddress':
    config.listenAddress = newValue;
    break;
  case 'PasswordAuthentication':
    config.passwordAuthentication = asBool(newValue);
    break;
  case 'PubkeyAuthentication':
    config.pubkeyAuthentication = asBool(newValue);
    break;
  case 'PermitRootLogin':
    config.permitRootLogin = asBool(newValue);
    break;
  case 'UseDNS':
    config.useDNS = asBool(newValue);
    break;
  }
  return config;
}
