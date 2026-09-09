import type { CommandReceipt } from '../execution/executionPublic';
import type { PinnedConfigRef } from '../../shared/configResource';
import type {
  AutomationRunStatus,
  AutomationStopRunSetPriorStatus,
} from '../../shared/executionStatusVocabulary';
import type { AutomationSpec } from './automationDefinitionContracts';

export type AutomationStopRunSetInput = {
  expectedRevision: number;
  includeAnchor: boolean;
  includeDetached: boolean;
  reason: string;
  requestId: string;
  idempotencyKey: string;
};
export type AutomationStopRunSetOutcome = {
  runId: string;
  priorStatus: AutomationStopRunSetPriorStatus;
  accepted: boolean;
  alreadyTerminal: boolean;
  error: string;
};
export type AutomationStopRunSetResponse = {
  receipt: CommandReceipt;
  anchorRunId: string;
  outcomes: AutomationStopRunSetOutcome[];
};
export type AutomationRunTerminationKind = 'completed' | 'failed' | 'canceled' | 'stopped' | 'rejected';
export type AutomationRunAdmissionConflict = 'queue' | 'reject' | 'replace';
export type AutomationRunSourceKind = 'experiment' | 'automation';
export type AutomationTriggerInvocation = {
  eventId: string;
  nodeId: string;
  kind: string;
  sessionId?: string;
  occurredAt: string;
};
export type AutomationRun = {
  id: string;targetId: string;automationResourceId: string;definitionId: string;definitionVersion: number;
  actionId: string;actionVersion: number;
  configDigest: string;executionPlanDigest: string;registryDigest: string;definitionDigest: string;
  executionModel: 'orchestration-occurrence-v1';
  sourceKind: AutomationRunSourceKind;sourceRef: PinnedConfigRef<'experiment' | 'automation'>;
  automationRef?: PinnedConfigRef<'automation'>;status: AutomationRunStatus;revision: number;
  parameters: Record<string,unknown>;reason?: string;terminationKind?: AutomationRunTerminationKind;
  primaryError?: string;cleanupErrors?: string[];parentRunId?: string;
  admissionMode: 'parallel' | 'limited';admissionScope: 'all' | 'root';admissionKey?: string;admissionLimit?: number;
  admissionOnConflict?: AutomationRunAdmissionConflict;replacesRunId?: string;
  rootRunId: string;callNodeId?: string;throughNodeId?: string;depth: number;correlationId: string;
  triggerInvocation?: AutomationTriggerInvocation;result?: unknown;
  acceptedAt: string;createdAt: string;startedAt?: string;updatedAt: string;finishedAt?: string;
};

export type AutomationRunAssetContext = {
  schemaVersion: number;
  robots?: AutomationRunRobotSelectionContext;
};
export type AutomationRunRobotSelectionContext = {
  schemaVersion: number;
  experimentResourceId: string;
  experimentCommitId: string;
  experimentDigest: string;
  robotSelectionDigest: string;
  robots: AutomationRunRobotContext[];
};
export type AutomationRunRobotContext = {
  id: string;
  robotAssetId: string;
  robotAssetCommitId: string;
  robotAssetDigest: string;
  name: string;
  description: string;
  tags: string[];
  kind: string;
  namespace: string;
  hybridSource: 'simulation' | 'physical';
  profileId: string;
  px4?: {
    mavSystemId: number;
    simulationMavSystemId: number;
    managementIp: string;
    mocapRigidBodyName: string;
    physicalMavrosLocalPort: number;
    physicalFcuRemotePort: number;
    simulation: AutomationRunSimulationContext;
    simulationLink: { localPort: number;remotePort: number };
  };
  scout?: {
    managementAddress: string;
    mocapRigidBodyName: string;
    lidarSimulationEnabled: boolean;
    imageSimulationEnabled: boolean;
    simulation: AutomationRunSimulationContext;
  };
  mecanum?: {
    mocapRigidBodyName: string;
    simulation: AutomationRunSimulationContext;
  };
};
export type AutomationRunSimulationContext = {
  productId: string;launchPackage: string;launchFile: string;
  initialPose: { x: number;y: number;z: number;yaw: number };
};
export type AutomationRunSnapshot = {
  runId: string;targetId: string;sourceKind: AutomationRunSourceKind;
  sourceRef: PinnedConfigRef<'experiment' | 'automation'>;automationRef: PinnedConfigRef<'automation'>;
  assetContext: AutomationRunAssetContext;automationSpec: AutomationSpec;definitionDigest: string;digest: string;createdAt: string;
};
export type AutomationRunActionResponse = { run: AutomationRun;receipt: CommandReceipt };
