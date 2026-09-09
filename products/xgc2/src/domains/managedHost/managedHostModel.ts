export type AgentEnrollment = 'known' | 'enrolled' | 'revoked';
export type AgentConnectivity = 'offline' | 'ready';
export type AgentManagementConnection = 'idle' | 'connecting' | 'ready' | 'unavailable';

export type AgentProductEffective = {
  Docker: boolean;
  AppStore: boolean;
  Operations: boolean;
  Automations: boolean;
  UserScripts: boolean;
  Calibration: boolean;
};

export type AgentTerminalEffective = {
  LocalShell: boolean;
  RemoteSSH: boolean;
  TerminalVisible: boolean;
  HostsTabVisible: boolean;
};

export type AgentSystemEffective = {
  Overview: boolean;
  Files: boolean;
  Processes: boolean;
  Network: boolean;
  MaintenanceCleanup: boolean;
  SSHService: boolean;
  Firewall: boolean;
  HostLogs: boolean;
  SystemVisible: boolean;
  RuntimeTabVisible: boolean;
  MaintenanceVisible: boolean;
};

export type AgentExperimentEffective = {
  WorldCameraEdgeProcess: boolean;
};

export type AgentRobotEffective = {
  PX4Multirotor: {
    Models: {
      MocapRotor: boolean;
    };
  };
  UnitreeB2: {
    EdgeCompute: boolean;
    ManipulatorARXR5A: boolean;
  };
};

export type AgentLinkEffective = {
  ComputeProvider: boolean;
};

export type AgentAutomationEffective = {
  Nodes: {
    CoreFlow: boolean;
    ManualTriggers: boolean;
    CallGraph: boolean;
    ScheduledTriggers: boolean;
    FormSubmissionTriggers: boolean;
    ChatMessageTriggers: boolean;
    WebhookTriggers: boolean;
    Process: boolean;
    GroundStation: boolean;
    ScreenRecordingRequests: boolean;
    MCP: boolean;
    ROS1: boolean;
    ROS2: boolean;
    Robot: boolean;
    Simulation: boolean;
    Media: boolean;
    Visualization: boolean;
    Analysis: boolean;
    ExperimentRobotContext: boolean;
    UserScripts: boolean;
    CalibrationRender: boolean;
  };
};

export type AgentDerivedSurfaces = {
  Operations: boolean;
  Automations: boolean;
  Terminal: boolean;
  System: boolean;
  AppStore: boolean;
  Containers: boolean;
};

/** Mirrors profilecontract.AgentEffective, including its uppercase JSON names. */
export type AgentEffective = {
  Product: AgentProductEffective;
  Terminal: AgentTerminalEffective;
  System: AgentSystemEffective;
  Experiment: AgentExperimentEffective;
  Robot: AgentRobotEffective;
  AgentLink: AgentLinkEffective;
  Automation: AgentAutomationEffective;
  Surfaces: AgentDerivedSurfaces;
};

export type AgentCapabilityManifest = {
  host: { arch: string;os: string;distro: string;hostname: string };
  middleware: {
    ros1?: { distro: string;version: string };
    ros2?: { distro: string;version: string };
  };
  execution: {
    canRunProcess: boolean;
    canRunDocker: boolean;
    canCopyFiles: boolean;
    canInstallApt: boolean;
    canInstallPip: boolean;
    canRunRosdep: boolean;
    canManageSystemd: boolean;
  };
  devices: { serial: string[];can: string[];camera: string[];lidar: string[];gpu: string[] };
  network: { interfaces: string[];ips: string[];openPorts: number[] };
  security: { sandboxLevel: string;allowedRoots: string[];highRiskAllowed: boolean };
};

/** Exact read-only projection returned by GET /managed-hosts. */
export type ManagedHost = {
  id: string;
  displayName: string;
  buildIdentity: string;
  productId: string;
  profileDigest: string;
  providerRegistryDigest: string;
  advertisedManagementEndpoint: string;
  publicKeyFingerprint: string;
  enrollment: AgentEnrollment;
  connectivity: AgentConnectivity;
  managementConnection: AgentManagementConnection;
  effectiveProfile: AgentEffective | null;
  capabilityManifest: AgentCapabilityManifest;
};

export type ManagedHostOption = {
  id: string;
  label: string;
  stateLabel: string;
  disabled: boolean;
  host: ManagedHost;
};

/** Compile/runtime lock for all AgentEffective boolean leaves. */
export const AGENT_EFFECTIVE_BOOLEAN_PATHS = [
  'Product.Docker',
  'Product.AppStore',
  'Product.Operations',
  'Product.Automations',
  'Product.UserScripts',
  'Product.Calibration',
  'Terminal.LocalShell',
  'Terminal.RemoteSSH',
  'Terminal.TerminalVisible',
  'Terminal.HostsTabVisible',
  'System.Overview',
  'System.Files',
  'System.Processes',
  'System.Network',
  'System.MaintenanceCleanup',
  'System.SSHService',
  'System.Firewall',
  'System.HostLogs',
  'System.SystemVisible',
  'System.RuntimeTabVisible',
  'System.MaintenanceVisible',
  'Experiment.WorldCameraEdgeProcess',
  'Robot.PX4Multirotor.Models.MocapRotor',
  'Robot.UnitreeB2.EdgeCompute',
  'Robot.UnitreeB2.ManipulatorARXR5A',
  'AgentLink.ComputeProvider',
  'Automation.Nodes.CoreFlow',
  'Automation.Nodes.ManualTriggers',
  'Automation.Nodes.CallGraph',
  'Automation.Nodes.ScheduledTriggers',
  'Automation.Nodes.FormSubmissionTriggers',
  'Automation.Nodes.ChatMessageTriggers',
  'Automation.Nodes.WebhookTriggers',
  'Automation.Nodes.Process',
  'Automation.Nodes.GroundStation',
  'Automation.Nodes.ScreenRecordingRequests',
  'Automation.Nodes.MCP',
  'Automation.Nodes.ROS1',
  'Automation.Nodes.ROS2',
  'Automation.Nodes.Robot',
  'Automation.Nodes.Simulation',
  'Automation.Nodes.Media',
  'Automation.Nodes.Visualization',
  'Automation.Nodes.Analysis',
  'Automation.Nodes.ExperimentRobotContext',
  'Automation.Nodes.UserScripts',
  'Automation.Nodes.CalibrationRender',
  'Surfaces.Operations',
  'Surfaces.Automations',
  'Surfaces.Terminal',
  'Surfaces.System',
  'Surfaces.AppStore',
  'Surfaces.Containers',
] as const;

const AGENT_EFFECTIVE_BOOLEAN_PATH_SET = new Set<string>(AGENT_EFFECTIVE_BOOLEAN_PATHS);

/** Rejects sparse, malformed and extended bool trees; all-false is still valid. */
export function isAgentEffective(value: unknown): value is AgentEffective {
  const paths: string[] = [];
  if (!collectBooleanLeafPaths(value, '', paths, new WeakSet<object>())) return false;
  return paths.length === AGENT_EFFECTIVE_BOOLEAN_PATHS.length
    && paths.every((path) => AGENT_EFFECTIVE_BOOLEAN_PATH_SET.has(path));
}

export function managedHostEffectiveProfile(host: ManagedHost | undefined): AgentEffective | undefined {
  return isAgentEffective(host?.effectiveProfile) ? host.effectiveProfile : undefined;
}

export function managedHostSelectable(host: ManagedHost | undefined): boolean {
  return host?.enrollment === 'enrolled' && host.connectivity === 'ready';
}

export function managedHostRequestsAllowed(host: ManagedHost | undefined): boolean {
  return managedHostSelectable(host)
    && (host?.managementConnection === 'idle' || host?.managementConnection === 'ready');
}

function collectBooleanLeafPaths(
  value: unknown,
  prefix: string,
  paths: string[],
  visited: WeakSet<object>,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || visited.has(value)) return false;
  visited.add(value);
  const entries = Object.entries(value);
  if (!entries.length) return false;
  for (const [key,child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'boolean') paths.push(path);
    else if (!collectBooleanLeafPaths(child, path, paths, visited)) return false;
  }
  return true;
}
