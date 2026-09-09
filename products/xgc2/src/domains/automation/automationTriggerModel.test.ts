import { describe,expect,it } from 'vitest';
import {
  parseAutomationActivations,
  parseAutomationIngressAuditEnvelope,
  parseAutomationRunOnceReceipt,
  parseAutomationTestListener,
} from './automationTriggerModel';

describe('automationTriggerModel', () => {
  it('parses multiple trigger facts for one resource by their explicit entrypoint', () => {
    const webhook = activationFixture('webhook-entry');
    const schedule = activationFixture('schedule-entry', { triggerKind: 'trigger.schedule',scheduleId: 'schedule-entry' });

    expect(parseAutomationActivations([webhook,schedule], '/activations').map((activation) => activation.entrypointNodeId))
      .toEqual(['webhook-entry','schedule-entry']);
  });

  it('rejects duplicate identities and legacy or unknown activation properties', () => {
    const activation = activationFixture('webhook-entry');
    expect(() => parseAutomationActivations([activation,activation], '/activations'))
      .toThrow('duplicate activation identity');

    const legacy: Record<string,unknown> = { ...activation,triggerNodeId: activation.entrypointNodeId };
    delete legacy.entrypointNodeId;
    expect(() => parseAutomationActivations([legacy], '/activations')).toThrow('unknown property "triggerNodeId"');
    expect(() => parseAutomationActivations([{ ...activation,sideChannel: true }], '/activations'))
      .toThrow('unknown property "sideChannel"');
    expect(() => parseAutomationActivations([{ ...activation,lastError: 'raw scheduler detail' }], '/activations'))
      .toThrow('unknown property "lastError"');
  });

  it('accepts only closed activation failure codes with matching error state', () => {
    expect(parseAutomationActivations([activationFixture('schedule-entry', {
      triggerKind: 'trigger.schedule',observedState: 'error',failureCode: 'schedule_policy_rejected',
    })], '/activations')[0]).toMatchObject({
      observedState: 'error',failureCode: 'schedule_policy_rejected',
    });
    expect(() => parseAutomationActivations([activationFixture('schedule-entry', {
      triggerKind: 'trigger.schedule',observedState: 'error',
    })], '/activations')).toThrow('error observedState and failureCode must be present together');
    expect(() => parseAutomationActivations([activationFixture('schedule-entry', {
      triggerKind: 'trigger.schedule',failureCode: 'internal_scheduler_error',
    })], '/activations')).toThrow('unsupported value "internal_scheduler_error"');
    expect(() => parseAutomationActivations([activationFixture('schedule-entry', {
      triggerKind: 'trigger.schedule',failureCode: 'schedule_reconcile_failed',
    })], '/activations')).toThrow('error observedState and failureCode must be present together');
  });

  it('requires entrypointNodeId on listener and safe ingress audit facts without accepting compatibility aliases', () => {
    const listener = listenerFixture();
    expect(parseAutomationTestListener(listener, '/listener').entrypointNodeId).toBe('webhook-entry');
    const legacyListener: Record<string,unknown> = { ...listener,triggerNodeId: listener.entrypointNodeId };
    delete legacyListener.entrypointNodeId;
    expect(() => parseAutomationTestListener(legacyListener, '/listener')).toThrow('unknown property "triggerNodeId"');

    const ingress = triggerIngressFixture();
    expect(parseAutomationIngressAuditEnvelope({ ingress }, '/receipt').entrypointNodeId).toBe('webhook-entry');
    expect(parseAutomationRunOnceReceipt({ ingress }, '/receipt')).toEqual({ eventId: 'event-a',runId: 'run-a' });
    expect(() => parseAutomationIngressAuditEnvelope({ ingress: { ...ingress,entrypointNodeId: '' } }, '/receipt'))
      .toThrow('entrypointNodeId');
    expect(() => parseAutomationIngressAuditEnvelope({ ingress: { ...ingress,payload: { token: 'secret' } } }, '/receipt'))
      .toThrow('unknown property "payload"');
  });
});

const timestamp = '2026-07-19T00:00:00Z';
const pinnedRef = {
  domain: 'automation',resourceId: 'automation-a',branch: 'main',commitId: 'commit-a',
  version: 1,digest: 'a'.repeat(64),
};

function activationFixture(entrypointNodeId: string, overrides: Record<string,unknown> = {}) {
  return {
    resourceId: 'automation-a',entrypointNodeId,revision: 1,desiredState: 'active',observedState: 'active',
    pinnedRef,targetId: 'local',triggerKind: 'trigger.webhook',triggerVersion: 1,publicId: `public-${entrypointNodeId}`,
    requiredCapabilities: [],reachability: 'reachable',lastObservedAt: timestamp,createdAt: timestamp,updatedAt: timestamp,
    ...overrides,
  };
}

function listenerFixture() {
  return {
    id: 'listener-a',resourceId: 'automation-a',entrypointNodeId: 'webhook-entry',revision: 1,status: 'listening',
    pinnedRef,targetId: 'local',triggerKind: 'trigger.webhook',triggerVersion: 1,oneShot: true,
    publicId: 'listener-public',expiresAt: '2026-07-19T00:02:00Z',createdAt: timestamp,updatedAt: timestamp,
  };
}

function triggerIngressFixture() {
  return {
    eventId: 'event-a',revision: 1,status: 'dispatched',sourceKind: 'webhook',
    entrypointNodeId: 'webhook-entry',triggerKind: 'trigger.webhook',runId: 'run-a',attemptCount: 1,
    occurredAt: timestamp,receivedAt: timestamp,
  };
}
