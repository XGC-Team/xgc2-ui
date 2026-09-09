import type {
  AutomationExecutionIngressStatus,
  AutomationRunStatus,
} from '../../shared/executionStatusVocabulary';
import type {
  AutomationTriggerKind,
  AutomationTriggerSourceKind,
} from './automationTriggerContracts';
import type {
  AutomationRunAdmissionConflict,
  AutomationRunSourceKind,
  AutomationRunTerminationKind,
  AutomationTriggerInvocation,
} from './automationRunContracts';
import type { PinnedConfigRef } from '../../shared/configResource';

export type AutomationExecutionIngressAudit = {
  eventId: string;
  revision: number;
  status: AutomationExecutionIngressStatus;
  sourceKind: AutomationTriggerSourceKind;
  entrypointNodeId: string;
  triggerKind: AutomationTriggerKind;
  sessionId?: string;
  correlationId?: string;
  attemptCount: number;
  occurredAt: string;
  receivedAt: string;
  runId: string;
};

export type AutomationExecutionRunSummary = {
  id: string;
  targetId: string;
  automationResourceId: string;
  definitionId: string;
  definitionVersion: number;
  actionId: string;
  actionVersion: number;
  configDigest: string;
  executionPlanDigest: string;
  registryDigest: string;
  definitionDigest: string;
  executionModel: 'orchestration-occurrence-v1';
  sourceKind?: AutomationRunSourceKind;
  sourceRef?: PinnedConfigRef<AutomationRunSourceKind>;
  experimentSelector?: { runMode:string;panelId?:string;presetId?:string };
  status: AutomationRunStatus;
  terminationKind?: AutomationRunTerminationKind;
  revision: number;
  parentRunId?: string;
  rootRunId?: string;
  callNodeId?: string;
  throughNodeId?: string;
  depth?: number;
  admissionMode: 'parallel' | 'limited';
  admissionScope: 'all' | 'root';
  admissionLimit?: number;
  admissionOnConflict?: AutomationRunAdmissionConflict;
  replacesRunId?: string;
  triggerInvocation?: AutomationTriggerInvocation;
  acceptedAt: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
};

export type AutomationExecutionHistoryEntry = {
  id: string;
  runId: string;
  targetId: string;
  automationResourceId: string;
  acceptedAt: string;
  phase: 'ingress' | 'run';
  ingress?: AutomationExecutionIngressAudit;
  run?: AutomationExecutionRunSummary;
};

export type AutomationExecutionHistoryPage = {
  entries: AutomationExecutionHistoryEntry[];
  nextCursor?: string;
  complete: boolean;
  unavailableSources?: 'agent'[];
};

export type AutomationRunControl = Pick<AutomationExecutionRunSummary,'id' | 'revision' | 'status'>;
export type AutomationRunSummaryView = Pick<
  AutomationExecutionRunSummary,
  'id' | 'targetId' | 'automationResourceId' | 'actionId' | 'actionVersion' | 'sourceKind' | 'sourceRef' | 'experimentSelector' | 'status' | 'revision' | 'parentRunId' | 'rootRunId' | 'createdAt' | 'startedAt' | 'updatedAt' | 'finishedAt'
>;

export type AutomationIngressTransitionKind =
  | 'accepted'
  | 'gate_released'
  | 'gate_abandoned'
  | 'claimed'
  | 'reclaimed'
  | 'dispatched'
  | 'requeued'
  | 'dead_lettered'
  | 'operator_retried'
  | 'operator_canceled';
export type AutomationIngressTransitionFailureCode =
  | 'canceled'
  | 'deadline'
  | 'idempotency_conflict'
  | 'runner_panic'
  | 'dispatch_failed'
  | 'gate_abandoned';
export type AutomationIngressTransitionActor =
  | 'source_adapter'
  | 'admission_controller'
  | 'dispatcher'
  | 'operator';
export type AutomationIngressTransition = {
  eventId: string;
  revision: number;
  kind: AutomationIngressTransitionKind;
  fromStatus?: AutomationExecutionIngressStatus;
  toStatus: AutomationExecutionIngressStatus;
  attemptCount: number;
  failureCode?: AutomationIngressTransitionFailureCode;
  actor: AutomationIngressTransitionActor;
  occurredAt: string;
};
export type AutomationIngressTransitionPage = {
  transitions: AutomationIngressTransition[];
  nextAfterRevision?: number;
  complete: boolean;
  unavailableSources?: 'agent'[];
};
export type AutomationIngressTransitionLedger = AutomationIngressTransitionPage & {
  runId: string;
  automationResourceId: string;
  eventId: string;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};
