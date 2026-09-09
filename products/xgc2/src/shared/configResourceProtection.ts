import type { ConfigResourceHead } from './configResource';

export const CONFIG_SYSTEM_FOLDER_ID = 'system';
export const CONFIG_TEMPLATES_FOLDER_ID = 'templates';
export const CONFIG_USER_FOLDER_ID = 'user';
export const CONFIG_TEMPLATE_TAG = 'template';

export type ConfigResourceProtection = 'system' | 'template' | 'user';

export function configResourceProtection(
  head: Pick<ConfigResourceHead, 'system'>,
  tags: readonly string[],
): ConfigResourceProtection {
  if (!head.system) return 'user';
  return tags.includes(CONFIG_TEMPLATE_TAG) ? 'template' : 'system';
}

export function configResourceIsProtected(
  head: Pick<ConfigResourceHead, 'system'>,
  tags: readonly string[],
) {
  return configResourceProtection(head, tags) !== 'user';
}

/** Templates stay editable; every other Core-owned resource stays locked. */
export function configResourceDefinitionEditLocked(
  head: Pick<ConfigResourceHead, 'system'>,
  tags: readonly string[],
) {
  const protection = configResourceProtection(head, tags);
  return protection === 'system';
}

/** System resources (including templates) cannot be archived by Core. */
export function configResourceArchiveLocked(
  head: Pick<ConfigResourceHead, 'system'>,
) {
  return Boolean(head.system);
}

export function configResourceFolderId(
  head: Pick<ConfigResourceHead, 'system' | 'namespaceId'>,
  tags: readonly string[],
) {
  const protection = configResourceProtection(head, tags);
  if (protection === 'system') return CONFIG_SYSTEM_FOLDER_ID;
  if (protection === 'template') return CONFIG_TEMPLATES_FOLDER_ID;
  return head.namespaceId || CONFIG_USER_FOLDER_ID;
}

export function userNamespaceIdForFolder(folderId: string) {
  return folderId === CONFIG_USER_FOLDER_ID ? undefined : folderId;
}
