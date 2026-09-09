import { createDomainNavigationRequest } from '../../shared/domainNavigationRequest';

export type AutomationSourceLocation = {
  targetId: string;
  resourceId?: string;
  runId?: string;
  nodeId?: string;
  invocationId?: string;
};

const sourceNavigation = createDomainNavigationRequest<AutomationSourceLocation>();
export const openAutomationSourceLocation = sourceNavigation.open;
export const registerAutomationSourceNavigation = sourceNavigation.register;

// The hash follows the application navigation grammar. The identifier after
// /workflows is a stable configuration resource ID, never a mutable runtime
// definition ID.
export function automationDocumentHash(targetId: string, resourceId: string) {
  return `#/automations/${encodeURIComponent(targetId)}/workflows/${encodeURIComponent(resourceId)}`;
}

export function automationDocumentListHash(targetId: string) {
  return `#/automations/${encodeURIComponent(targetId)}/workflows`;
}

export function isAutomationLocationHash(hash: string) {
  return /^#\/automations\/[^/]+\/workflows(?:\/.*)?$/.test(hash);
}

export function automationUserViewStorageKey(targetId: string, key: string) {
  return `xgc.automation.user.${encodeURIComponent(targetId)}.${key}`;
}

export function readStoredAutomationResourceId(targetId: string) {
  try {
    const raw = window.localStorage.getItem(automationUserViewStorageKey(targetId, 'lastResourceId'));
    if (!raw) return '';
    const value = JSON.parse(raw) as unknown;
    return typeof value === 'string' && value ? value : '';
  } catch {
    return '';
  }
}

export function storeAutomationResourceId(targetId: string, resourceId: string) {
  try {
    window.localStorage.setItem(
      automationUserViewStorageKey(targetId, 'lastResourceId'),
      JSON.stringify(resourceId),
    );
  } catch {
    return;
  }
}

export function clearStoredAutomationResourceId(targetId: string) {
  try {
    window.localStorage.removeItem(automationUserViewStorageKey(targetId, 'lastResourceId'));
  } catch {
    return;
  }
}

export function resourceIdFromAutomationHash(hash: string, targetId: string) {
  const match = /^#\/automations\/([^/]+)\/workflows\/([^/]+)$/.exec(hash);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]) === targetId ? decodeURIComponent(match[2]) : '';
  } catch {
    return '';
  }
}

export function isCurrentTargetAutomationListHash(hash: string, targetId: string) {
  return canonicalAutomationHash(hash, targetId) === automationDocumentListHash(targetId);
}

export function canonicalAutomationHash(hash: string, targetId: string) {
  if (hash === automationDocumentListHash(targetId) || resourceIdFromAutomationHash(hash, targetId)) return hash;
  const match = /^#\/automations\/([^/]+)\/workflows(?:\/.*)?$/.exec(hash);
  if (!match) return hash;
  try {
    return decodeURIComponent(match[1]) === targetId ? automationDocumentListHash(targetId) : hash;
  } catch {
    // A malformed target does not establish an Automation target scope.
    return hash;
  }
}

/**
 * Moves an existing Automation location to an explicitly selected execution
 * target. A workflow resource belongs to its original target, so crossing the
 * target boundary always returns to the destination workflow list.
 */
export function retargetAutomationHash(hash: string, targetId: string) {
  const match = /^#\/automations\/([^/]+)\/workflows(?:\/.*)?$/.exec(hash);
  if (!match) return hash;
  try {
    if (decodeURIComponent(match[1]) === targetId) return hash;
  } catch {
    // An explicit target selection replaces malformed target identity as well.
  }
  return automationDocumentListHash(targetId);
}
