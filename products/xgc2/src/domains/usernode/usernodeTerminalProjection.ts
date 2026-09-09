import { CONFIG_USER_FOLDER_ID } from '../../shared/configResourceProtection';
import { configAssetNamespacePath } from '../assets/assetsPublic';
import { usernodeAssetSummary } from './usernodeAssetPresentation';
import {
  interpreterUsesSource,
  type UsernodeAssetDocument,
  type UsernodeNamespace,
} from './usernodeContractsPublic';

/** Terminal rail/subpage item: identity + insert text. Catalog commands insert a
 * one-line file invoke; Terminal does not interpret the spec. */
export type UsernodeTerminalScriptItem = {
  folderId: string;
  folderTitle: string;
  insertText: string;
  name: string;
  resourceId: string;
  summary: string;
};

const UNGROUPED_FOLDER_TITLE = 'Ungrouped';

/**
 * Project ordinary user-script assets into Terminal rail rows grouped by
 * functional folder (namespace). System / Template rows are not ordinary
 * operator commands and stay out of the rail.
 */
export function projectUsernodeAssetsForTerminal(
  assets: readonly UsernodeAssetDocument[],
  namespaces: readonly UsernodeNamespace[] = [],
): UsernodeTerminalScriptItem[] {
  return [...assets]
    .filter((asset) => !asset.head.system)
    .map((asset) => {
      const folderId = asset.head.namespaceId?.trim() || CONFIG_USER_FOLDER_ID;
      const path = folderId === CONFIG_USER_FOLDER_ID
        ? ''
        : configAssetNamespacePath(namespaces, folderId);
      return {
        resourceId: asset.head.resourceId,
        name: asset.spec.name.trim() || asset.head.resourceId,
        folderId,
        folderTitle: path || UNGROUPED_FOLDER_TITLE,
        summary: usernodeAssetSummary(asset),
        insertText: usernodeTerminalInsertText(asset),
        order: usernodeCatalogOrder(asset.spec.tags),
      };
    })
    .sort((left, right) => {
      const byFolder = compareFolderTitle(left.folderTitle, right.folderTitle);
      if (byFolder !== 0) return byFolder;
      const byOrder = compareCatalogOrder(left.order, right.order);
      if (byOrder !== 0) return byOrder;
      const byName = left.name.localeCompare(right.name);
      return byName !== 0 ? byName : left.resourceId.localeCompare(right.resourceId);
    })
    .map((item) => ({
      resourceId: item.resourceId,
      name: item.name,
      folderId: item.folderId,
      folderTitle: item.folderTitle,
      summary: item.summary,
      insertText: item.insertText,
    }));
}

export function groupUsernodeAssetsForTerminal(
  items: readonly UsernodeTerminalScriptItem[],
): Array<{ id: string; title: string; items: UsernodeTerminalScriptItem[] }> {
  const groups = new Map<string, { id: string; title: string; items: UsernodeTerminalScriptItem[] }>();
  for (const item of items) {
    const current = groups.get(item.folderId);
    if (current) current.items.push(item);
    else groups.set(item.folderId, { id: item.folderId, title: item.folderTitle, items: [item] });
  }
  return [...groups.values()].sort((left, right) => compareFolderTitle(left.title, right.title));
}

/** Catalog `order-N` tags. Missing tags sort after numbered commands. */
export function usernodeCatalogOrder(tags: readonly string[]) {
  for (const tag of tags) {
    if (!tag.startsWith('order-')) continue;
    const value = Number(tag.slice('order-'.length));
    if (Number.isFinite(value)) return value;
  }
  return Number.POSITIVE_INFINITY;
}

function compareCatalogOrder(left: number, right: number) {
  return Number.isFinite(left) || Number.isFinite(right) ? left - right : 0;
}

/** Keep catalog configuration order inside a folder; caller order is the tie-breaker. */
export function sortUsernodeAssetsByCatalogOrder<Item extends { spec: { tags: readonly string[] } }>(
  assets: readonly Item[],
): Item[] {
  return [...assets].sort((left, right) => (
    compareCatalogOrder(usernodeCatalogOrder(left.spec.tags), usernodeCatalogOrder(right.spec.tags))
  ));
}

function compareFolderTitle(left: string, right: string) {
  if (left === UNGROUPED_FOLDER_TITLE && right !== UNGROUPED_FOLDER_TITLE) return 1;
  if (right === UNGROUPED_FOLDER_TITLE && left !== UNGROUPED_FOLDER_TITLE) return -1;
  return left.localeCompare(right);
}

function usernodeTerminalInsertText(asset: UsernodeAssetDocument): string {
  const spec = asset.spec;
  if (interpreterUsesSource(spec.interpreter)) return spec.source;
  const args = spec.defaultArgs.map((item) => item.trim()).filter(Boolean);
  if (spec.interpreter === 'rosrun') {
    return ['rosrun', spec.package, spec.executable, ...args].filter(Boolean).join(' ');
  }
  if (spec.interpreter === 'roslaunch') {
    return ['roslaunch', spec.package, spec.launchFile, ...args].filter(Boolean).join(' ');
  }
  return spec.source;
}
