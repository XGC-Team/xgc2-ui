import type { AutomationRun,AutomationRunSnapshot } from './automationRunContracts';

export type AutomationNodeExecutionSummaryStatus = 'pending' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'canceled' | 'skipped' | 'compensating' | 'compensated';
export type AutomationNodeExecutionSummary = {
  runId: string;nodeId: string;kind: string;status: AutomationNodeExecutionSummaryStatus;latestInvocationId?: string;
  occurrenceCount: number;activeOccurrenceCount: number;completedOccurrenceCount: number;failedOccurrenceCount: number;
  attemptCount: number;
  inputs?: unknown;output?: unknown;route?: string;errorClass?: 'transient' | 'permanent' | 'canceled' | 'uncertain';
  error?: string;nextAttemptAt?: string;startedAt?: string;finishedAt?: string;updatedAt: string;revision: number;
};
export type AutomationNodeAttemptPhase = 'execution' | 'compensation';
export type AutomationInvocationStatus = 'ready' | 'running' | 'waiting' | 'retry-wait' | 'succeeded' | 'failed' | 'canceled' | 'skipped';
export type AutomationAttemptStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'canceled' | 'abandoned';
export type AutomationCompensationStatus = 'none' | 'ready' | 'running' | 'retry-wait' | 'succeeded' | 'failed' | 'canceled';
export type AutomationOccurrenceFailure = {
  class: 'transient' | 'permanent' | 'canceled' | 'uncertain';
  message: string;
};
export type AutomationNodeOutputRef = {
  id: string;
  runId: string;
  invocationId: string;
  attemptId?: string;
  nodeId: string;
  port: string;
  value: unknown;
  valueDigest: string;
};
export type AutomationNodeInputRef = {
  id: string;
  runId: string;
  consumerInvocationId: string;
  edgeId: string;
  inputKey: string;
  ordinal: number;
  producer: AutomationNodeOutputRef;
};
export type AutomationNodeAttempt = {
  id: string;
  runId: string;
  invocationId: string;
  phase: AutomationNodeAttemptPhase;
  number: number;
  status: AutomationAttemptStatus;
  adoptionCount?: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  revision: number;
};
export type AutomationNodeInvocation = {
  id: string;
  runId: string;
  nodeId: string;
  kind: string;
  status: AutomationInvocationStatus;
  activeAttemptId?: string;
  currentWaitId?: string;
  waitGeneration?: number;
  failure?: AutomationOccurrenceFailure;
  nextAttemptAt?: string;
  compensationStatus: AutomationCompensationStatus;
  compensationFailure?: AutomationOccurrenceFailure;
  compensationNextAttemptAt?: string;
  compensationStartedAt?: string;
  compensationFinishedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  attempts: AutomationNodeAttempt[];
  inputRefs: AutomationNodeInputRef[];
  outputRefs: AutomationNodeOutputRef[];
};
export type AutomationNodeOccurrenceAggregate = {
  nodeId: string;
  total: number;
  active: number;
  failed: number;
  completed: number;
  latestStatus: AutomationInvocationStatus;
};
export type AutomationBindingOwnership = 'owned' | 'borrowed' | 'shared';
export type AutomationChildRunRelation = {
  id: string;targetId: string;rootRunId: string;parentRunId: string;parentInvocationId: string;
  callNodeId: string;ordinal: number;childRunId: string;ownerRunId: string;childDefinitionId: string;
  childDefinitionVersion: number;childConfigDigest: string;childExecutionPlanDigest: string;
  childRegistryDigest: string;childDefinitionDigest: string;triggerNodeId: string;
  targetRoot?:boolean;targetRootBindingId?:string;targetRootPresetId?:string;targetRootActionId?:string;
  targetRootActionVersion?:number;targetRootRunMode?:string;observedStatus?:AutomationRun['status'];
  observedRevision?:number;observedAt?:string;observedFinishedAt?:string;observedReason?:string;
  relation: 'attached' | 'supervised' | 'detached';waitPolicy: 'wait' | 'no-wait' | 'join-later';
  cancelPolicy: 'cascade' | 'retain' | 'explicit';resultPolicy: 'propagate' | 'reference' | 'discard';
  createdAt: string;updatedAt: string;boundAt?: string;launchAbandonedAt?: string;
  launchAbandonedReason?: string;runStatus?:AutomationRun['status'];runRevision?:number;revision: number;
};
export type AutomationChildRunGroupRelation = {
  id: string;targetId: string;rootRunId: string;parentRunId: string;producerInvocationId: string;
  producerNodeId: string;groupKey: string;expectedMembers: number;memberCount: number;membershipDigest?: string;
  waitPolicy: 'wait' | 'join-later';joinMode: 'join-all' | 'join-any';failurePolicy: 'fail-fast' | 'collect-errors';
  remainingPolicy: 'cancel' | 'retain';resultPolicy: 'propagate' | 'reference' | 'discard';maxConcurrency: number;
  state: 'open' | 'sealed' | 'resolved' | 'canceled';outcome?: 'succeeded' | 'failed' | 'canceled' | 'rejected' | 'completed-with-errors';
  winnerChildRunId?: string;terminalCount: number;createdAt: string;updatedAt: string;sealedAt?: string;resolvedAt?: string;revision: number;
};
export type AutomationChildRunGroupMemberRelation = {
  id: string;groupId: string;ordinal: number;itemKey: string;childRunId: string;
  state: 'queued' | 'leased' | 'dispatched' | 'terminal' | 'abandoned' | 'cancel-requested';
  createdAt: string;updatedAt: string;dispatchedAt?: string;terminalAt?: string;revision: number;
};
export type AutomationWaitRelation = {
  id: string;generation: number;type: 'timer' | 'event' | 'human' | 'child' | 'child-group' | 'runtime' | 'resource' | 'job' | 'ros-core-ready' | 'gazebo-ready' | 'robot-operation' | 'callback';
  subjectId?: string;runId: string;invocationId: string;attemptId: string;
  state: 'pending' | 'resumed' | 'timed-out' | 'canceled';wakeAt?: string;deadline?: string;reason?: string;
  terminalAt?: string;deliveredAt?: string;createdAt: string;updatedAt: string;revision: number;
};
export type AutomationEffectRelation = {
  id: string;targetId: string;runId: string;invocationId: string;preparedAttemptId: string;
  effectKey: string;kind: string;ownership: AutomationBindingOwnership;checkpointDigest: string;
  state: 'prepared' | 'applying' | 'applied' | 'failed' | 'uncertain';externalIdentity?: string;
  primaryErrorClass?: AutomationOccurrenceFailure['class'];primaryError?: string;
  compensationPolicy: 'none' | 'required' | 'best-effort';
  compensationState: 'not-required' | 'unscheduled' | 'pending' | 'running' | 'succeeded' | 'failed';
  compensationAttemptCount: number;compensationErrorClass?: AutomationOccurrenceFailure['class'];compensationError?: string;
  preparedAt: string;applyingAt?: string;primaryTerminalAt?: string;compensationStartedAt?: string;
  compensationFinishedAt?: string;updatedAt: string;revision: number;
};
export type AutomationRuntimeGroupRelation = {
  id: string;targetId: string;runId: string;invocationId: string;preparedAttemptId: string;
  groupKey: string;manifestDigest: string;state: 'preparing' | 'active' | 'releasing' | 'released' | 'failed';
  lifecycleError?: string;createdAt: string;updatedAt: string;terminalAt?: string;revision: number;
};
export type AutomationRuntimeRelation = {
  id: string;targetId: string;groupId: string;runId: string;invocationId: string;bindingKey: string;
  backendKind: 'process-instance' | 'managed-backend';backendId: string;ownership: AutomationBindingOwnership;
  relation: 'attached' | 'supervised' | 'detached';cleanupPolicy: 'stop' | 'release' | 'retain' | 'explicit';
  ownerType: string;ownerId: string;state: 'active' | 'stopping' | 'released';createdAt: string;updatedAt: string;
  transferredAt?: string;releaseStartedAt?: string;releasedAt?: string;revision: number;
};
export type AutomationResourceRelation = {
  id: string;targetId: string;runId: string;invocationId: string;boundAttemptId: string;runtimeGroupId?: string;
  bindingKey: string;resourceKey: string;mode: 'exclusive' | 'shared';capacity: number;slot: number;
  ownership: AutomationBindingOwnership;cleanupPolicy: 'release' | 'retain' | 'explicit';
  scope: 'run' | 'invocation' | 'runtime-group';scopeId: string;ownerType: string;ownerId: string;
  state: 'active' | 'released' | 'lost';createdAt: string;updatedAt: string;releasedAt?: string;lostAt?: string;
  lossReason?: string;cleanupError?: string;revision: number;
};
export type AutomationExecutionRelations = {
  runId: string;childRuns: AutomationChildRunRelation[];childRunGroups: AutomationChildRunGroupRelation[];
  childRunGroupMembers: AutomationChildRunGroupMemberRelation[];waits: AutomationWaitRelation[];
  effects: AutomationEffectRelation[];runtimeGroups: AutomationRuntimeGroupRelation[];
  runtimes: AutomationRuntimeRelation[];resources: AutomationResourceRelation[];
};
export type AutomationRunDetail = {
  run?: AutomationRun;
  invocations: AutomationNodeInvocation[];nodeSummaries: AutomationNodeExecutionSummary[];
  relations?: AutomationExecutionRelations;snapshot?: AutomationRunSnapshot;loading: boolean;error: string;
};
