import { request } from '../../api/http';
import { startAutomationRun } from '../automation/automationPublic';
import { segment } from '../../shared/url';
import type { ExperimentPlacement } from './experimentWorkflowModel';

export const SLOT_PROFILES = [
  'fs150-focal-noetic',
  'scout-bionic-melodic',
  'scout-focal-noetic',
  'wheeltec-bionic-melodic',
] as const;

export type SlotProfile = (typeof SLOT_PROFILES)[number];

export type EnvironmentPresence = {
  id: string;
  displayName: string;
  enrollment: string;
  connectivity: string;
  managementConnection: string;
};

/** A robot's state for the current radio settings, derived by Core from its receipt. */
export type EnvironmentRadioState = 'applied' | 'failed' | 'pending';

export type EnvironmentInstance = {
  slotId: string;
  role: string;
  assetId?: string;
  profile?: string;
  agentId: string;
  displayName: string;
  containerName: string;
  containerId?: string;
  image: string;
  radioAddress: string;
  physicsAddress: string;
  workspacePath: string;
  managedHost: EnvironmentPresence | null;
  /** Absent for the world and centralized slots, which send no inter-robot traffic. */
  radio?: EnvironmentRadioState;
  radioError?: string;
  /**
   * Docker's state for this container when the environment was read (running,
   * exited, ...), "absent" when it does not exist, or "unknown" when Docker did
   * not answer. Core observes it only when the environment is read.
   */
  containerState?: string;
};

export type RadioSettings = { delayMs: number;lossPercent: number;reorderPercent: number };

export type RadioReceipt = RadioSettings & { containerId: string;applied: boolean;error?: string };

export type ExperimentEnvironment = {
  experimentId: string;
  generationId: string;
  phase: string;
  connected: boolean;
  coreEndpoint: string;
  experimentCommitId: string;
  radio: { name: string;cidr: string;gateway: string };
  physics: { name: string;cidr: string;gateway: string };
  rosMasterUri: string;
  gazeboMasterUri: string;
  agentLinkListening: boolean;
  /** The desired settings; applied only when every robot's current container holds a matching receipt. */
  radioImpairment?: RadioSettings & {
    applied?: boolean;
    applyError?: string;
    receipts?: Record<string, RadioReceipt>;
  };
  instances: EnvironmentInstance[];
};

export type EnvironmentProfileOption = {
  id: string;
  os: string;
  version: string;
  ros: string;
  installed: boolean;
};

export type EnvironmentSlotOption = {
  slotId: string;
  robotName: string;
  profile: string;
  imageReady: boolean;
};

/** Local inspect result. installed and imageReady are false when the image is not on this machine. */
export type ExperimentEnvironmentOptions = {
  worldImage: string;
  /** False for a simulator without a world container (lightweight); then no world image is needed. */
  worldRequired: boolean;
  sceneName: string;
  profiles: EnvironmentProfileOption[];
  slots: EnvironmentSlotOption[];
};

export function slotProfile(value: string): SlotProfile | undefined {
  return SLOT_PROFILES.find((profile) => profile === value);
}

/** The server's connected bit is this managed-host record, not a workflow Ready flag. */
export function environmentInstanceConnected(instance: EnvironmentInstance | undefined) {
  const host = instance?.managedHost;
  return host?.enrollment === 'enrolled'
    && host.connectivity === 'ready'
    && (host.managementConnection === 'idle' || host.managementConnection === 'ready');
}

export function listExperimentEnvironments(experimentId: string) {
  const path = `/experiments/${segment(experimentId)}/environments`;
  return request<ExperimentEnvironment[]>(path);
}

export function getExperimentEnvironmentOptions(
  experimentId: string,
  placement?: ExperimentPlacement,
) {
  const query = placement === 'centralized' || placement === 'per-robot'
    ? `?${new URLSearchParams({ placement }).toString()}`
    : '';
  return request<ExperimentEnvironmentOptions>(
    `/experiments/${segment(experimentId)}/environment-options${query}`,
  );
}

export function createExperimentEnvironment(
  experimentId: string,
  body: {
    placement?: ExperimentPlacement;
    worldImage?: string;
    slots: { slotId: string;profile?: SlotProfile }[];
  },
) {
  const path = `/experiments/${segment(experimentId)}/environments`;
  return request<ExperimentEnvironment>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const CONTAINER_LIFECYCLE_AUTOMATION = {
  domain: 'automation',
  resourceId: 'e107014c-b651-566a-829b-0ef1e426388e',
  branch: 'main',
} as const;

export const CONTAINER_LIFECYCLE_ACTIONS = {
  power: 'container-lifecycle.power',
  off: 'container-lifecycle.off',
  close: 'container-lifecycle.close',
  rebuild: 'container-lifecycle.rebuild',
} as const;

export const CONTAINER_LIFECYCLE_RADIO_ACTION = 'container-lifecycle.radio';

export type ContainerLifecycleAction = keyof typeof CONTAINER_LIFECYCLE_ACTIONS;

/**
 * Parent action parameters are the seed input schema: experimentId, generationId,
 * and for power, off, and rebuild the slotIds to act on. Omitted slotIds act on
 * every container of the environment; close always does.
 */
export function startContainerLifecycle(
  targetId: string,
  action: ContainerLifecycleAction,
  experimentId: string,
  generationId: string,
  slotIds?: readonly string[],
) {
  const actionId = CONTAINER_LIFECYCLE_ACTIONS[action];
  return startAutomationRun(targetId, {
    actionId,
    automationRef: { ...CONTAINER_LIFECYCLE_AUTOMATION },
    parameters: { experimentId, generationId, ...(slotIds?.length ? { slotIds: [...slotIds] } : {}) },
    reason: `${actionId} ${experimentId} ${generationId}${slotIds?.length ? ` ${slotIds.join(',')}` : ''}`,
  });
}

/**
 * One Run stores the settings and applies them to each started robot container;
 * slotIds limits the apply to those robots, for a retry. The Run's success, not
 * the stored value, is what makes the settings applied.
 */
export function applyExperimentRadio(
  targetId: string,
  experimentId: string,
  generationId: string,
  settings: RadioSettings,
  slotIds?: readonly string[],
) {
  return startAutomationRun(targetId, {
    actionId: CONTAINER_LIFECYCLE_RADIO_ACTION,
    automationRef: { ...CONTAINER_LIFECYCLE_AUTOMATION },
    parameters: {
      experimentId,
      generationId,
      delayMs: settings.delayMs,
      lossPercent: settings.lossPercent,
      reorderPercent: settings.reorderPercent,
      ...(slotIds?.length ? { slotIds: [...slotIds] } : {}),
    },
    reason: `${CONTAINER_LIFECYCLE_RADIO_ACTION} ${experimentId} ${generationId}`,
  });
}
