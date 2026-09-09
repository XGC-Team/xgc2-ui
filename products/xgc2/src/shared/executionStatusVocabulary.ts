export const RUN_STATUSES = [
  'accepted',
  'queued',
  'running',
  'waiting',
  'stopping',
  'succeeded',
  'failed',
  'canceled',
  'stopped',
  'rejected',
] as const;

export type AutomationRunStatus = typeof RUN_STATUSES[number];

export const RUN_STATUS_SET: ReadonlySet<AutomationRunStatus> = new Set(RUN_STATUSES);

const ACTIVE_RUN_STATUS_SET: ReadonlySet<AutomationRunStatus> = new Set([
  'accepted',
  'queued',
  'running',
  'waiting',
  'stopping',
]);

export const JOB_STATUSES = [
  'queued',
  'running',
  'cancel_requested',
  'succeeded',
  'failed',
  'canceled',
  'interrupted',
  'blocked',
] as const;

export type JobStatus = typeof JOB_STATUSES[number];

export const INGRESS_STATUSES = [
  'pending',
  'claimed',
  'dispatched',
  'dead_letter',
  'abandoned',
] as const;

export type AutomationExecutionIngressStatus = typeof INGRESS_STATUSES[number];

export const INGRESS_STATUS_SET: ReadonlySet<AutomationExecutionIngressStatus> = new Set(INGRESS_STATUSES);

const ACTIVE_INGRESS_STATUS_SET: ReadonlySet<AutomationExecutionIngressStatus> = new Set([
  'pending',
  'claimed',
]);

export type AutomationStopRunSetPriorStatus = AutomationRunStatus | Exclude<AutomationExecutionIngressStatus,'dispatched'>;

export const STOP_RUN_SET_PRIOR_STATUSES: readonly AutomationStopRunSetPriorStatus[] = [
  ...RUN_STATUSES,
  ...INGRESS_STATUSES.filter(
    (status): status is Exclude<AutomationExecutionIngressStatus,'dispatched'> => status !== 'dispatched',
  ),
];

export const STOP_RUN_SET_PRIOR_STATUS_SET: ReadonlySet<AutomationStopRunSetPriorStatus> = new Set(
  STOP_RUN_SET_PRIOR_STATUSES,
);

export function isRunStatus(value: unknown): value is AutomationRunStatus {
  return hasStatus(RUN_STATUS_SET, value);
}

export function isRunStatusActive(value: unknown): value is AutomationRunStatus {
  return hasStatus(ACTIVE_RUN_STATUS_SET, value);
}

export function isRunStatusTerminal(value: unknown): value is AutomationRunStatus {
  return isRunStatus(value) && !isRunStatusActive(value);
}

export function isIngressStatusActive(value: unknown): value is AutomationExecutionIngressStatus {
  return hasStatus(ACTIVE_INGRESS_STATUS_SET, value);
}

export function isStopRunSetPriorStatus(value: unknown): value is AutomationStopRunSetPriorStatus {
  return hasStatus(STOP_RUN_SET_PRIOR_STATUS_SET, value);
}

function hasStatus<T extends string>(values: ReadonlySet<T>, value: unknown): value is T {
  return typeof value === 'string' && values.has(value as T);
}
