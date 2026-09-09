import type { ConfigResourceHead } from '../../shared/configResource';
import {
  configResourceFolderId,
  configResourceIsProtected,
  configResourceProtection,
  type ConfigResourceProtection,
} from '../../shared/configResourceProtection';

type AutomationProtectionDocument = {
  head: Pick<ConfigResourceHead, 'namespaceId' | 'system'>;
  spec: { metadata: { tags?: readonly string[] } };
};

export function automationResourceProtection(
  document: AutomationProtectionDocument,
): ConfigResourceProtection {
  const tags = document.spec.metadata.tags ?? [];
  return configResourceProtection(document.head, tags);
}

export function automationResourceIsProtected(document: AutomationProtectionDocument) {
  return configResourceIsProtected(document.head, document.spec.metadata.tags ?? []);
}

export function automationResourceFolderId(document: AutomationProtectionDocument) {
  return configResourceFolderId(document.head, document.spec.metadata.tags ?? []);
}
