import type { PinnedConfigRef } from '../../shared/configResource';

export const AUTOMATION_CALL_TRIGGER_KIND = 'trigger.automation-call';
export const AUTOMATION_TRIGGER_KINDS = [
  'trigger.manual',
  'trigger.schedule',
  'trigger.target-startup',
  'trigger.form-submission',
  'trigger.chat-message',
  'trigger.webhook',
  AUTOMATION_CALL_TRIGGER_KIND,
] as const;

export type AutomationTriggerKind = typeof AUTOMATION_TRIGGER_KINDS[number];

export function isAutomationTriggerKind(kind: string): kind is AutomationTriggerKind {
  return AUTOMATION_TRIGGER_KINDS.includes(kind as AutomationTriggerKind);
}

export type AutomationActivationState = 'inactive' | 'activating' | 'active' | 'error';
export type AutomationActivationFailureCode = 'schedule_policy_rejected' | 'schedule_reconcile_failed';
export type AutomationActivation = {
  resourceId: string;
  entrypointNodeId: string;
  revision: number;
  desiredState: AutomationActivationState;
  observedState: AutomationActivationState;
  pinnedRef: PinnedConfigRef<'automation'>;
  targetId: string;
  triggerKind: AutomationTriggerKind;
  triggerVersion: number;
  scheduleId?: string;
  publicId?: string;
  requiredCapabilities?: string[];
  failureCode?: AutomationActivationFailureCode;
  reachability: 'reachable' | 'unreachable';
  lastObservedAt: string;
  createdAt: string;
  updatedAt: string;
};
export type AutomationActivationInput = {
  commitId: string;
  entrypointNodeId: string;
  desiredState: Extract<AutomationActivationState,'active' | 'inactive'>;
  expectedRevision: number;
};
export type AutomationTriggerCredential = { publicId: string;token: string };
export type AutomationActivationCredentialSession = {
  resourceId: string;
  entrypointNodeId: string;
  credential: AutomationTriggerCredential;
};
export type AutomationActivationResponse = {
  activation: AutomationActivation;
  credential?: AutomationTriggerCredential;
};

export type AutomationTestListenerStatus = 'listening' | 'consumed' | 'cancelled' | 'expired';
export type AutomationTestListener = {
  id: string;
  resourceId: string;
  entrypointNodeId: string;
  revision: number;
  status: AutomationTestListenerStatus;
  pinnedRef: PinnedConfigRef<'automation'>;
  targetId: string;
  triggerKind: Extract<AutomationTriggerKind,'trigger.chat-message' | 'trigger.form-submission' | 'trigger.webhook'>;
  triggerVersion: number;
  oneShot: boolean;
  publicId: string;
  expiresAt: string;
  consumedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
};
export type CreateAutomationTestListenerInput = {
  resourceId: string;
  commitId: string;
  entrypointNodeId: string;
  ttlSeconds?: number;
};
export type AutomationTestListenerResponse = {
  listener: AutomationTestListener;
  credential: AutomationTriggerCredential;
};
export type AutomationTestListenerSession = {
  resourceId: string;
  entrypointNodeId: string;
  listener: AutomationTestListener;
  credential?: AutomationTriggerCredential;
};

export type AutomationTriggerEventReceipt = {
  eventId: string;
  runId?: string;
  created?: boolean;
};
export type AutomationTriggerSourceKind = 'action' | 'manual' | 'schedule' | 'startup' | 'chat' | 'form' | 'webhook' | 'call';
export type AutomationRunOnceInput = {
  resourceId: string;
  commitId: string;
  entrypointNodeId: string;
  sourceEventKey?: string;
};
