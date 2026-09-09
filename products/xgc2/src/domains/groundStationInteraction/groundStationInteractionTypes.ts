import type { ExperimentAgentAction,AgentAdmission } from './experimentAgentContract';

export const GROUND_STATION_INTERACTION_SCHEMA_VERSION = 1 as const;

export type GroundStationInteractionStatus = 'open' | 'resolved' | 'canceled' | 'expired';
export type GroundStationInteractionSeverity = 'info' | 'success' | 'warning' | 'error' | 'critical';
export type GroundStationInteractionPresentation = 'toast' | 'panel';
export type GroundStationInteractionResponseMode = 'none' | 'decision';

export type GroundStationInteractionOrigin = {
  type: string;
  ref?: string;
  runId?: string;
  nodeId?: string;
  invocationId?: string;
  experimentId?: string;
  displayName?: string;
};

export type GroundStationInteractionAudience = { scope: 'all' };

export type GroundStationDecisionAction = 'approved' | 'rejected' | 'canceled';
export type GroundStationDismissalAction = 'dismissed';
export type GroundStationInteractionAction = GroundStationDecisionAction | GroundStationDismissalAction;
export type GroundStationOperatorAction = Exclude<GroundStationInteractionAction,'canceled'>;

/** The closed value vocabulary a decision form collects; scalars only. */
export type GroundStationFormFieldKind = 'string' | 'number' | 'boolean';
export type GroundStationFormValue = string | number | boolean;
export type GroundStationFormValues = Record<string,GroundStationFormValue>;

export const GROUND_STATION_MAX_FORM_FIELDS = 16;

export type GroundStationFormField = {
  name: string;
  label?: string;
  kind: GroundStationFormFieldKind;
  required?: boolean;
  default?: GroundStationFormValue;
};

/**
 * The rich-input variant of a decision payload. A decision carrying a form is
 * still a panel decision on the same revision-checked respond path: approving
 * it means submitting the declared values.
 */
export type GroundStationDecisionForm = { fields: GroundStationFormField[] };

type GroundStationInteractionResponseBase<A extends GroundStationInteractionAction> = {
  action: A;
  actor?: string;
  reason?: string;
  at?: string;
  admission?: AgentAdmission;
  policy?: {policyId:string; policyRevision:string; ruleId:string; mode:'auto'|'deny'};
};

export type GroundStationDecisionResponse = GroundStationInteractionResponseBase<GroundStationDecisionAction> & {
  /** Typed answers, present only on an approved response to a form decision. */
  values?: GroundStationFormValues;
};
export type GroundStationDismissalResponse = GroundStationInteractionResponseBase<GroundStationDismissalAction>;
// Cancellation is a lifecycle outcome: an Automation run may close any still-open
// interaction while compensating a stopped run. It is not an operator action.
export type GroundStationCancellationResponse = GroundStationInteractionResponseBase<'canceled'>;
export type GroundStationInteractionResponse = GroundStationDecisionResponse | GroundStationDismissalResponse;

type GroundStationInteractionBase<
  K extends GroundStationInteractionKind,
  R extends GroundStationInteractionResponseMode,
  P extends GroundStationInteractionPresentation,
  Response extends GroundStationInteractionResponse = never,
> = {
  schemaVersion: typeof GROUND_STATION_INTERACTION_SCHEMA_VERSION;
  id: string;
  targetScope: string;
  revision: number;
  status: GroundStationInteractionStatus;
  kind: K;
  presentation: P;
  responseMode: R;
  severity: GroundStationInteractionSeverity;
  title: string;
  message: string;
  origin: GroundStationInteractionOrigin;
  audience: GroundStationInteractionAudience;
  response?: Response;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export type GroundStationInteractionKind =
  | 'message'
  | 'decision'
  | 'status'
  | 'context';

export type GroundStationMessageInteraction = GroundStationInteractionBase<
  'message','none','toast',GroundStationDismissalResponse | GroundStationCancellationResponse
> & {
  payload: { message: { durationMs: number;dismissLabel: string } };
};

export type GroundStationDecisionInteraction = GroundStationInteractionBase<'decision','decision','panel',GroundStationDecisionResponse> & {
  payload: { decision: {
    approveLabel: string;
    rejectLabel: string;
    requireReason: boolean;
    form?: GroundStationDecisionForm;
    agentAction?: ExperimentAgentAction;
  } };
};

export type GroundStationStatusInteraction = GroundStationInteractionBase<'status','none','panel',GroundStationCancellationResponse> & {
  payload: { status: {
    statusKey: string;
    state: string;
    detail?: string;
    progress?: number;
  } };
};

export type GroundStationContextDestination = {
  remoteController?: {sessionId:string;conversationId:string;robotIds:string[]};
  kind: string;
  id: string;
  subview?: string;
  actionLabel: string;
};

export type GroundStationContextInteraction = GroundStationInteractionBase<
  'context','none','panel',GroundStationDismissalResponse | GroundStationCancellationResponse
> & {
  payload: { context: GroundStationContextDestination };
};

export type GroundStationInteraction =
  | GroundStationMessageInteraction
  | GroundStationDecisionInteraction
  | GroundStationStatusInteraction
  | GroundStationContextInteraction;

export type GroundStationInteractionActionInput = {
  action: GroundStationOperatorAction;
  expectedRevision: number;
  requestId: string;
  idempotencyKey: string;
  reason?: string;
  values?: GroundStationFormValues;
};
