import type { JobStatus } from '../../shared/executionStatusVocabulary';

export type ExecutionTargetId = string;
export type ProcessDesiredState = 'stopped' | 'running';

export type ProcessObservedState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exited'
  | 'failed'
  | 'lost';

export type ExecutionProbeState = {
  status: 'unknown' | 'passing' | 'failing';
  message?: string;
  checkedAt?: string;
};

export type ProcessParameterDefinition = {
  type: 'string' | 'integer' | 'number' | 'boolean';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  sensitive?: boolean;
  fixedOnly?: boolean;
  'x-xgc-path-kind'?: 'file' | 'directory';
  'x-xgc-file-extensions'?: string[];
};

export type ProcessParameterSchema = {
  properties: Record<string, ProcessParameterDefinition>;
  required?: string[];
  groups?: ProcessParameterGroup[];
  additionalProperties: boolean;
};

export type ProcessParameterGroup = {
  id: string;
  label: string;
  collapsed: boolean;
  parameters: string[];
};

export type ProcessCommandTemplate = {
  executable: string;
  args?: string[];
  argumentParameter?: string;
  optionalArgumentParameter?: string;
  optionalArgumentFlag?: string;
  directExecutable?: boolean;
  workDir?: string;
  env?: Record<string, string>;
};

export type ProcessProbeDefinition = {
  kind: 'none' | 'process' | 'tcp' | 'exec' | 'ros1-master' | 'ros1-node';
  address?: string;
  node?: string;
  command?: ProcessCommandTemplate;
  interval: number;
  timeout: number;
  successThreshold: number;
  failureThreshold: number;
};

export type ProcessDefinition = {
  id: string;
  version: string;
  label: string;
  description?: string;
  drivers: string[];
  parameters: ProcessParameterSchema;
  command: ProcessCommandTemplate;
  readiness: ProcessProbeDefinition;
  liveness: ProcessProbeDefinition;
  stop: { gracePeriod: number };
  restart: { mode: 'never' | 'on-failure'; maxRestarts: number; backoff: number };
  digest: string;
};

export type ProcessInstance = {
  id: string;
  targetId: ExecutionTargetId;
  definitionId: string;
  definitionVersion: string;
  definitionDigest: string;
  ownerType: string;
  ownerId: string;
  scope: string;
  parameters: Record<string, unknown>;
  driver: string;
  targetConfig?: Record<string, unknown>;
  desiredState: ProcessDesiredState;
  observedState: ProcessObservedState;
  readiness: ExecutionProbeState;
  liveness: ExecutionProbeState;
  handle?: Record<string, unknown> | null;
  revision: number;
  restartCount: number;
  transitionReason?: string;
  lastError?: string;
  startedAt?: string;
  stoppedAt?: string;
  nextRestartAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProcessInstanceCreateInput = {
  id: string;
  definitionId: string;
  ownerType: string;
  ownerId: string;
  scope: string;
  parameters: Record<string, unknown>;
  driver: string;
  targetConfig: Record<string, unknown>;
};

export type ProcessInstanceUpdateInput = {
  expectedRevision: number;
  parameters: Record<string, unknown>;
  driver: string;
  targetConfig: Record<string, unknown>;
};

export type ProcessAction = 'start' | 'stop' | 'restart' | 'kill';

export type ProcessActionRequest = {
  action: ProcessAction;
  expectedRevision: number;
  requestId: string;
  idempotencyKey: string;
  reason: string;
  configuration?: ProcessRestartConfiguration;
};

export type ProcessRestartConfiguration = Pick<ProcessInstanceUpdateInput, 'parameters' | 'driver' | 'targetConfig'>;

export type CommandReceipt = {
  commandId: string;
  requestId: string;
  idempotencyKey: string;
  actor: string;
  risk: string;
  target: string;
  action: string;
  reason?: string;
  payload?: unknown;
  status: string;
  resultRef?: string;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
};

export type ProcessActionResponse = {
  instance: ProcessInstance;
  receipt: CommandReceipt;
};

export type ExecutionJob = {
  id: string;
  targetId: ExecutionTargetId;
  kind: string;
  status: JobStatus;
  revision: number;
  parameters: Record<string, unknown>;
  result?: unknown;
  currentAttempt: number;
  maxAttempts: number;
  recovery: string;
  errorClass?: string;
  createdAt: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  nextAttemptAt?: string;
  cancelRequestedAt?: string;
  updatedAt: string;
  error?: string;
};

export type ExecutionJobAttempt = {
  id: string;
  runId: string;
  number: number;
  status: JobStatus;
  owner: string;
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  errorClass?: string;
  errorMessage?: string;
};

export type ExecutionJobArtifact = {
  id: string;
  runId: string;
  attemptId: string;
  name: string;
  mediaType: string;
  uri: string;
  sizeBytes: number;
  digest?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type JobControlRequest = {
  expectedRevision: number;
  requestId: string;
  idempotencyKey: string;
  reason: string;
};

export type JobActionResponse = {
  job: ExecutionJob;
  receipt: CommandReceipt;
};

export type ExecutionEventLevel = 'debug' | 'info' | 'warning' | 'error' | string;

export type ExecutionEvent = {
  offset: number;
  entityType: string;
  entityId: string;
  seq: number;
  type: string;
  level: ExecutionEventLevel;
  payload: Record<string, unknown>;
  commandId?: string;
  createdAt: string;
};

export type ExecutionEventCursor = {
  streamId: string;
  latestOffset: number;
};

export type ExecutionLogChunk = {
  entityType: string;
  entityId: string;
  stream: string;
  offset: number;
  content: string;
  nextOffset: number;
  truncated: boolean;
};

export type ExecutionLogEvent = {
  entityType: string;
  entityId: string;
  offset: number;
  content: string;
  nextOffset: number;
  truncated: boolean;
  stream?: string;
  occurredAt: string;
};

export type ExecutionStreamState = 'connecting' | 'connected' | 'replaying' | 'disconnected';

export type ExecutionSnapshot = {
  targetId: ExecutionTargetId;
  processDefinitions: ProcessDefinition[];
  processInstances: ProcessInstance[];
  processInstancesTruncated: boolean;
  jobs: ExecutionJob[];
  events: ExecutionEvent[];
  streamId: string;
  lastOffset: number;
  streamState: ExecutionStreamState;
  loading: boolean;
  error: string;
};

export function emptyExecutionSnapshot(targetId: string): ExecutionSnapshot {
  return {
    targetId,
    processDefinitions: [],
    processInstances: [],
    processInstancesTruncated: false,
    jobs: [],
    events: [],
    streamId: '',
    lastOffset: 0,
    streamState: 'disconnected',
    loading: false,
    error: '',
  };
}

export function executionRequestId(scope: string, entityId: string) {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `execution:${safePart(scope)}:${safePart(entityId)}:${suffix}`;
}

function safePart(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.:-]+/g, '-') || 'unknown';
}
