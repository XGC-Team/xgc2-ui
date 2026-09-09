import type { ConfigRef } from '../../shared/configResource';

export type AutomationRequestOptions = { signal?: AbortSignal };

export function normalizedAutomationRef(ref: ConfigRef): ConfigRef {
  return {
    domain: ref.domain.trim(),
    resourceId: ref.resourceId.trim(),
    branch: ref.branch.trim() || 'main',
    ...(ref.componentId?.trim() ? { componentId: ref.componentId.trim() } : {}),
  };
}

export function automationOperationHeaders(body: { requestId: string;idempotencyKey: string }) {
  return { 'X-Request-ID': body.requestId,'Idempotency-Key': body.idempotencyKey };
}

export function automationOperationRequestId(operation: string, target: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${operation}:${target}:${suffix}`;
}

export function exactRequiredAutomationValue(value: string, label: string) {
  if (!value || value.trim() !== value) throw new Error(`${label} must be a non-empty canonical value.`);
  return value;
}

export function exactOptionalAutomationValue(value: string | undefined, label: string) {
  if (value === undefined || value === '') return undefined;
  if (value.trim() !== value) throw new Error(`${label} must be a canonical value.`);
  return value;
}
