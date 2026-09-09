import type { AutomationTargetPolicy } from './automationDefinitionContracts';
import { automationResourceProtection } from './automationResourceProtection';

type AutomationTargetCatalogDocument = {
  head: { namespaceId?: string;system?: boolean };
  spec: {
    metadata: { tags?: readonly string[] };
    targetPolicy: AutomationTargetPolicy;
  };
};

/**
 * Automations authoring documents live in the Core configuration catalog, but
 * the list must switch with the selected execution host:
 *
 * - fixed target → only that host's catalog projection
 * - inherit (portable) → Core/local ground-station context; remote Agent views
 *   only keep true operator-authored portable graphs — never Core product seeds
 *   (ROS/PX4/Gazebo/session/robot-runtime), even when a lab DB epoch lost
 *   `head.system=true` and would otherwise classify them as "user"
 *
 * Run still happens on the chosen host; this filter is catalog scope, not a
 * cosmetic hide of an otherwise shared bag.
 */
export function isLocalExecutionTarget(targetId: string): boolean {
  const id = targetId.trim();
  return id === '' || id === 'local';
}

export function isManagedAgentExecutionTarget(targetId: string): boolean {
  const id = targetId.trim();
  if (!id || isLocalExecutionTarget(id)) return false;
  // Remote Core keys are not managed Agent hosts.
  if (id.startsWith('core:')) return false;
  return true;
}

export function sameAutomationExecutionTarget(left: string, right: string): boolean {
  const a = normalizeAutomationExecutionTargetId(left);
  const b = normalizeAutomationExecutionTargetId(right);
  return a === b;
}

export function normalizeAutomationExecutionTargetId(targetId: string): string {
  const id = targetId.trim();
  return id === '' ? 'local' : id;
}

/**
 * Product-owned Automation graphs that belong to the Core/GCS catalog, not to a
 * managed Agent's operator list. Product ownership is a resource-head fact;
 * user-facing tags never participate in identity or protection.
 */
export function isCoreProductCatalogAutomation(document: {
  head: { system?: boolean };
  spec: { metadata: { tags?: readonly string[] } };
}): boolean {
  return document.head.system === true;
}

export function automationDocumentVisibleForExecutionTarget(
  document: AutomationTargetCatalogDocument,
  targetId: string,
): boolean {
  return automationTargetPolicyVisibleForExecutionTarget(
    document.spec.targetPolicy,
    targetId,
    automationResourceProtection(document),
    document,
  );
}

export function automationTargetPolicyVisibleForExecutionTarget(
  policy: AutomationTargetPolicy,
  targetId: string,
  protection: 'system' | 'template' | 'user',
  document: AutomationTargetCatalogDocument,
): boolean {
  const selected = normalizeAutomationExecutionTargetId(targetId);
  if (policy.mode === 'fixed') {
    return sameAutomationExecutionTarget(policy.executionTargetId, selected);
  }
  // inherit: portable graph. Agent catalogs never list Core product seeds.
  if (isManagedAgentExecutionTarget(selected)) {
    if (protection !== 'user') return false;
    if (isCoreProductCatalogAutomation(document)) return false;
    return true;
  }
  return true;
}

export function filterAutomationDocumentsForExecutionTarget<T extends AutomationTargetCatalogDocument>(
  documents: readonly T[],
  targetId: string,
): T[] {
  return documents.filter((document) => automationDocumentVisibleForExecutionTarget(document, targetId));
}
