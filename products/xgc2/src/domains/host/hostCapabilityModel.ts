import {
  isLocalManagedHost,
  managedHostEffectiveProfile,
  managedHostRequestsAllowed,
  type AgentManagementConnection,
  type AgentSystemEffective,
  type ManagedHost,
} from '../managedHost/managedHostPublic';

export type HostManagementConnection = AgentManagementConnection;
export type HostSystemProfile = AgentSystemEffective;
export type HostSystemTab = 'overview' | 'files' | 'processes' | 'host' | 'maintenance' | 'ssh';

/** Local Core static composition — never inferred from an Agent manifest. */
export const LOCAL_HOST_SYSTEM_PROFILE: HostSystemProfile = {
  Overview: true,
  Files: true,
  Processes: true,
  Network: true,
  MaintenanceCleanup: true,
  // Host sshd/firewall management is product-denied; Terminal.RemoteSSH is separate.
  SSHService: false,
  Firewall: false,
  HostLogs: false,
  SystemVisible: true,
  RuntimeTabVisible: true,
  MaintenanceVisible: true,
};

export const DISABLED_HOST_SYSTEM_PROFILE: HostSystemProfile = {
  Overview: false,
  Files: false,
  Processes: false,
  Network: false,
  MaintenanceCleanup: false,
  SSHService: false,
  Firewall: false,
  HostLogs: false,
  SystemVisible: false,
  RuntimeTabVisible: false,
  MaintenanceVisible: false,
};

export type HostSystemContext = {
  isRemote: boolean;
  managedHostId?: string;
  systemProfile: HostSystemProfile;
  managementConnection: HostManagementConnection;
  requestsAllowed: boolean;
  actionsEnabled: boolean;
};

/** Membership comes from AgentEffective; the three connection axes gate I/O only. */
export function resolveHostSystemContext(input: {
  managedHostId?: string;
  host?: ManagedHost;
}): HostSystemContext {
  if (isLocalManagedHost(input.managedHostId)) {
    return {
      isRemote: false,
      managedHostId: undefined,
      systemProfile: LOCAL_HOST_SYSTEM_PROFILE,
      managementConnection: 'ready',
      requestsAllowed: true,
      actionsEnabled: true,
    };
  }
  const effectiveProfile = managedHostEffectiveProfile(input.host);
  const systemProfile = effectiveProfile
    ? normalizeSystemProfile(effectiveProfile.System)
    : { ...DISABLED_HOST_SYSTEM_PROFILE };
  const managementConnection = normalizeManagementConnection(input.host?.managementConnection);
  const requestsAllowed = managedHostRequestsAllowed(input.host);
  return {
    isRemote: true,
    managedHostId: input.managedHostId,
    systemProfile,
    managementConnection,
    requestsAllowed,
    actionsEnabled: requestsAllowed,
  };
}

export function normalizeSystemProfile(value: unknown): HostSystemProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DISABLED_HOST_SYSTEM_PROFILE };
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(DISABLED_HOST_SYSTEM_PROFILE);
  if (Object.keys(record).length !== keys.length || keys.some((key) => typeof record[key] !== 'boolean')) {
    return { ...DISABLED_HOST_SYSTEM_PROFILE };
  }
  return { ...(record as HostSystemProfile) };
}

export function normalizeManagementConnection(value: unknown): HostManagementConnection {
  if (value === 'idle' || value === 'connecting' || value === 'ready' || value === 'unavailable') {
    return value;
  }
  return 'unavailable';
}

export function managementConnectionAllowsRequests(state: HostManagementConnection): boolean {
  return state === 'idle' || state === 'ready';
}

/** Fixed content mapping from the eight Agent System membership leaves. */
export function hostTabContentAvailable(tab: HostSystemTab, profile: HostSystemProfile): boolean {
  switch (tab) {
  case 'overview': return profile.Overview || profile.HostLogs;
  case 'files': return profile.Files;
  case 'processes': return profile.Processes || profile.Network;
  case 'host': return true;
  case 'maintenance': return profile.MaintenanceCleanup;
  case 'ssh': return profile.SSHService || profile.Firewall;
  default: return false;
  }
}

export function hostServiceLabel(service: keyof HostSystemProfile): string {
  switch (service) {
  case 'Overview': return 'Overview';
  case 'Files': return 'Files';
  case 'Processes': return 'Processes';
  case 'Network': return 'Network';
  case 'MaintenanceCleanup': return 'Maintenance';
  case 'SSHService': return 'SSH';
  case 'Firewall': return 'Firewall';
  case 'HostLogs': return 'Host logs';
  case 'SystemVisible': return 'System';
  case 'RuntimeTabVisible': return 'Runtime';
  case 'MaintenanceVisible': return 'Maintenance';
  default: return service;
  }
}
