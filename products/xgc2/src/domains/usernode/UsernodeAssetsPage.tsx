import { ScrollText,Settings,Trash2 } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { EmptyState,useConfirmationDialog } from '@xgc2/ui-react';
import {
  ListPage,
  ListPageFolderEmpty,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMain,
  ListPageItemMeta,
  ListPageRow,
} from '../../components/ListPage';
import { configAssetTagsIssue } from '../../shared/configAssetTags';
import {
  CONFIG_SYSTEM_FOLDER_ID,
  CONFIG_TEMPLATES_FOLDER_ID,
  CONFIG_USER_FOLDER_ID,
  configResourceFolderId,
  configResourceProtection,
  userNamespaceIdForFolder,
} from '../../shared/configResourceProtection';
import {
  buildProjectedConfigAssetCatalog,
  ConfigAssetCatalogControls,
  ConfigAssetCatalogRowTags,
  ConfigAssetCreateDrawer,
  ConfigAssetFolderTitle,
  ConfigAssetSettingsDrawer,
  ConfigAssetTagDialog,
  configAssetCatalogControlText,
  configAssetFolderText,
  useConfigAssetCatalogView,
  useAssetsText,
} from '../assets/assetsPublic';
import { useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { newUsernodeAssetSpec } from './usernodeAuthoring';
import { usernodeAssetMessage,usernodeAssetSummary } from './usernodeAssetPresentation';
import { mergeUsernodeCatalogTags,usernodeCatalogTags } from './usernodeCatalogTags';
import { UsernodeAssetDetailPage } from './UsernodeAssetDetailPage';
import type { UsernodeAssetDocument,UsernodeAssetSpec } from './usernodeContractsPublic';
import { UsernodeAssetCommitConflict,useUsernodeAssetsStore } from './usernodeStore';
import { sortUsernodeAssetsByCatalogOrder } from './usernodeTerminalProjection';

export function UsernodeAssetsPage({
  resourceId,
  onOpenResource,
  onCloseResource,
  onInvalidResource,
}: {
  resourceId?: string;
  onOpenResource?: (resourceId: string) => void;
  onCloseResource?: () => void;
  onInvalidResource?: () => void;
} = {}) {
  const t = useAssetsText();
  const confirmation = useConfirmationDialog();
  const store = useUsernodeAssetsStore(resourceId);
  const selected = resourceId
    ? store.assets.find((asset) => asset.head.resourceId === resourceId) ?? null
    : store.selected;
  const catalogView = useConfigAssetCatalogView({ hideSystem: true });
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsAsset, setSettingsAsset] = useState<UsernodeAssetDocument | null>(null);
  const [tagEditor, setTagEditor] = useState<UsernodeAssetDocument | null>(null);
  const [actionError, setActionError] = useState('');
  const notificationError = usernodeAssetMessage(store.error || actionError);
  useGroundStationErrorNotification('local', notificationError, {
    title: 'User scripts',source: 'usernode-assets',dedupeKey: 'usernode-assets:error',
  });
  const currentSettingsAsset = settingsAsset
    ? store.assets.find((asset) => asset.head.resourceId === settingsAsset.head.resourceId) ?? settingsAsset
    : null;
  const currentTagEditor = tagEditor
    ? store.assets.find((asset) => asset.head.resourceId === tagEditor.head.resourceId) ?? tagEditor
    : null;
  const { tags,effectiveTagFilter,folders: catalogFolders } = buildProjectedConfigAssetCatalog({
    items: store.assets,
    namespaces: store.namespaces,
    search: catalogView.search,
    tagFilter: catalogView.tagFilter,
    sortMode: catalogView.sortMode,
    viewMode: catalogView.viewMode,
    hideSystem: catalogView.hideSystem,
    hideTemplates: catalogView.hideTemplates,
    allAssetsTitle: t('All user scripts'),
    folderText: configAssetFolderText(t),
    project: (asset) => ({
      name: asset.spec.name,
      description: asset.spec.description,
      tags: usernodeCatalogTags(asset.spec.tags),
      updatedAt: asset.head.updatedAt,
      folderId: configResourceFolderId(asset.head, asset.spec.tags),
    }),
  });
  const folders = useMemo(() => {
    if (catalogView.viewMode !== 'folder') return catalogFolders;
    return catalogFolders
      .filter((folder) => folder.id !== CONFIG_USER_FOLDER_ID || folder.items.length > 0)
      .map((folder) => ({ ...folder, items: sortUsernodeAssetsByCatalogOrder(folder.items) }));
  }, [catalogFolders, catalogView.viewMode]);

  useEffect(() => {
    if (!resourceId || store.loading || store.error || selected) return;
    onInvalidResource?.();
  }, [onInvalidResource,resourceId,selected,store.error,store.loading]);

  function openResource(nextResourceId: string) {
    onOpenResource?.(nextResourceId);
    void store.open(nextResourceId).catch(() => undefined);
  }

  function closeResource() {
    store.close();
    onCloseResource?.();
  }

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (cause) {
      setActionError(usernodeAssetMessage(cause));
    }
  }

  async function archiveAsset(asset: UsernodeAssetDocument) {
    if (!await confirmation.confirm({
      title: 'Archive user script',
      message: `Archive ${asset.spec.name}?`,
      confirmLabel: 'Archive',
    })) return;
    await runAction(() => store.archive(asset));
  }

  async function updateUsernodeTags(target: UsernodeAssetDocument, catalogTags: string[]) {
    const base = store.assets.find((asset) => asset.head.resourceId === target.head.resourceId) ?? target;
    if (configResourceProtection(base.head, base.spec.tags) !== 'user') {
      setActionError('Protected user scripts are read-only.');
      return;
    }
    const nextTags = mergeUsernodeCatalogTags(base.spec.tags, catalogTags);
    const tagIssue = configAssetTagsIssue(nextTags);
    if (tagIssue) {
      setActionError(tagIssue);
      return;
    }
    setActionError('');
    try {
      await store.update(base, { ...base.spec,tags: nextTags }, base.head.namespaceId ?? '');
      setTagEditor(null);
    } catch (cause) {
      if (cause instanceof UsernodeAssetCommitConflict) {
        setTagEditor(null);
        setActionError('This user script changed elsewhere. Reopen tags to review the latest metadata before editing again.');
        return;
      }
      setActionError(usernodeAssetMessage(cause));
    }
  }

  if (selected) {
    const protection = configResourceProtection(selected.head, selected.spec.tags);
    return (
      <ListPageHost className="xgc-workspace-full-span" data-xgc-role="usernode-assets-page" data-xgc-id="usernode">
        <UsernodeAssetDetailPage document={selected} readOnly={protection !== 'user'} onBack={closeResource} onCommit={store.commit} />
      </ListPageHost>
    );
  }

  if (resourceId) {
    return (
      <ListPageHost className="xgc-workspace-full-span" data-xgc-role="usernode-assets-page" data-xgc-id="usernode">
        <EmptyState
          title={store.error ? t('User script unavailable') : t('Loading user script')}
          density="compact"
          role="status"
        />
      </ListPageHost>
    );
  }

  return (
    <ListPageHost className="xgc-workspace-full-span" data-xgc-role="usernode-assets-page" data-xgc-id="usernode">
      <ListPage<UsernodeAssetDocument>
        onCreate={() => setCreateOpen(true)}
        search={{ value: catalogView.search,placeholder: t('Search user scripts and folders'),onChange: catalogView.setSearch,role: 'usernode-asset-search' }}
        controls={(
          <ConfigAssetCatalogControls
            tags={tags}
            tagFilter={effectiveTagFilter}
            viewMode={catalogView.viewMode}
            sortMode={catalogView.sortMode}
            rolePrefix="usernode"
            text={configAssetCatalogControlText(t, {
              filterByTag: 'Filter user scripts by tag',
              sort: 'Sort user scripts',
            })}
            protectedVisibility={{
              system: {
                hidden: catalogView.hideSystem,
                showLabel: t('Show system items'),
                hideLabel: t('Hide system items'),
                onChange: catalogView.setHideSystem,
              },
              templates: {
                hidden: catalogView.hideTemplates,
                showLabel: t('Show templates'),
                hideLabel: t('Hide templates'),
                onChange: catalogView.setHideTemplates,
              },
            }}
            createLabel={t('New')}
            createRole="usernode-asset-create"
            onCreate={() => setCreateOpen(true)}
            onTagFilterChange={catalogView.setTagFilter}
            onViewModeChange={catalogView.setViewMode}
            onSortModeChange={catalogView.setSortMode}
          />
        )}
        folders={folders}
        showFolderHeaders={catalogView.viewMode === 'folder'}
        collapsedFolders={catalogView.collapsedFolders}
        onToggleFolder={catalogView.toggleFolder}
        getFolderProps={(folder) => ({
          'data-xgc-role': 'usernode-folder',
          'data-xgc-id': folder.id,
          'data-xgc-protected': folder.isSystem || folder.readOnly || undefined,
        })}
        renderFolderTitle={(folder, collapsed) => (
          <ConfigAssetFolderTitle title={folder.title} itemCount={folder.items.length} collapsed={collapsed} />
        )}
        renderFolderActions={(folder) => {
          const namespace = store.namespaces.find((item) => item.namespaceId === folder.id);
          const hasChildren = namespace && store.namespaces.some((item) => item.parentNamespaceId === namespace.namespaceId);
          return namespace && folder.items.length === 0 && !hasChildren ? (
            <ControlButton iconOnly size="compact" dataXgcRole="usernode-folder-archive" dataXgcId={namespace.namespaceId} aria-label={t('Archive folder')} title={t('Archive folder')} onClick={() => void runAction(() => store.archiveNamespace(namespace))}><Trash2 size={14} /></ControlButton>
          ) : undefined;
        }}
        renderFolderEmpty={(folder) => (
          <ListPageFolderEmpty data-xgc-role="usernode-folder-empty" data-xgc-id={folder.id}>
            {store.loading ? t('Loading user scripts…') : t('No items')}
          </ListPageFolderEmpty>
        )}
        drag={catalogView.viewMode === 'folder' ? {
          mimeType: 'text/xgc-usernode-id',
          getItemId: (asset) => asset.head.resourceId,
          onMove: (movedResourceId, folderId) => {
            const asset = store.assets.find((item) => item.head.resourceId === movedResourceId);
            if (!asset || configResourceProtection(asset.head, asset.spec.tags) !== 'user') return;
            if (folderId === CONFIG_SYSTEM_FOLDER_ID || folderId === CONFIG_TEMPLATES_FOLDER_ID) return;
            void runAction(() => store.move(asset, userNamespaceIdForFolder(folderId)));
          },
        } : undefined}
        renderItem={(asset, dragProps) => {
          const protection = configResourceProtection(asset.head, asset.spec.tags);
          const readOnly = protection !== 'user';
          return (
            <ListPageRow
              {...(readOnly ? {} : dragProps)}
              data-xgc-role="usernode-asset-row"
              data-xgc-id={asset.head.resourceId}
              data-xgc-system={asset.head.system || undefined}
              data-xgc-protection={protection}
              data-xgc-readonly={readOnly || undefined}
              key={asset.head.resourceId}
              onClick={() => openResource(asset.head.resourceId)}
            >
              <ListPageItemMain
                title={asset.spec.name}
                description={asset.spec.description}
                icon={ScrollText}
                openLabel={`Open user script ${asset.spec.name}`}
                onOpen={() => openResource(asset.head.resourceId)}
                tagRowRole="usernode-asset-tags"
                tagRowId={asset.head.resourceId}
              >
                <ConfigAssetCatalogRowTags
                  tags={usernodeCatalogTags(asset.spec.tags)}
                  tagFilter={effectiveTagFilter}
                  resourceId={asset.head.resourceId}
                  rolePrefix="usernode-asset"
                  filterLabel={(tag) => t('Filter by {tag}', { tag })}
                  showAllLabel={t('Show all tags')}
                  onTagFilterChange={catalogView.setTagFilter}
                  editable={!readOnly}
                  onRemoveTag={(tag) => void updateUsernodeTags(asset, usernodeCatalogTags(asset.spec.tags).filter((value) => value !== tag))}
                  onEditTags={() => setTagEditor(asset)}
                  editLabel={t('Edit tags')}
                  removeLabel={(tag) => t('Remove {tag}', { tag })}
                />
              </ListPageItemMain>
              <ListPageItemMeta data-xgc-role="usernode-asset-meta" data-xgc-id={asset.head.resourceId}>
                <span>{formatTimestamp(asset.head.updatedAt)}</span>
                <span>{usernodeAssetSummary(asset)}</span>
              </ListPageItemMeta>
              {!readOnly && <ListPageItemActions>
                <ControlButton iconOnly size="compact" dataXgcRole="usernode-asset-settings" dataXgcId={asset.head.resourceId} aria-label="Configure user script" title="Configure user script" onClick={(event) => { event.stopPropagation(); setSettingsAsset(asset); }}><Settings size={15} /></ControlButton>
                <ControlButton iconOnly size="compact" dataXgcRole="usernode-asset-archive" dataXgcId={asset.head.resourceId} aria-label="Archive user script" title="Archive user script" onClick={(event) => {
                  event.stopPropagation();
                  void archiveAsset(asset);
                }}><Trash2 size={15} /></ControlButton>
              </ListPageItemActions>}
            </ListPageRow>
          );
        }}
        emptyTitle={store.loading ? 'Loading user scripts' : 'No user scripts'}
      />

      {createOpen && (
        <ConfigAssetCreateDrawer
          assetKind="asset"
          assetLabel="User script"
          assetIcon={<ScrollText size={15} />}
          rolePrefix="usernode-create"
          tagsPlaceholder="巡检, 标定"
          namespaces={store.namespaces}
          onClose={() => setCreateOpen(false)}
          createSpec={({ name,description,tags }): UsernodeAssetSpec => ({
            ...newUsernodeAssetSpec(name),description,tags,
          })}
          presentError={usernodeAssetMessage}
          onError={setActionError}
          onCreateAsset={async (namespaceId, spec) => {
            await store.create(userNamespaceIdForFolder(namespaceId || CONFIG_USER_FOLDER_ID), spec);
            setCreateOpen(false);
          }}
          onCreateNamespace={async (name, parentNamespaceId) => {
            await store.addNamespace(name, userNamespaceIdForFolder(parentNamespaceId || CONFIG_USER_FOLDER_ID));
            setCreateOpen(false);
          }}
        />
      )}
      {currentSettingsAsset && configResourceProtection(currentSettingsAsset.head, currentSettingsAsset.spec.tags) === 'user' && (
        <ConfigAssetSettingsDrawer
          document={{
            ...currentSettingsAsset,
            spec: {
              ...currentSettingsAsset.spec,
              tags: usernodeCatalogTags(currentSettingsAsset.spec.tags),
            },
          }}
          namespaces={store.namespaces}
          title="Configure user script"
          rolePrefix="usernode-settings"
          presentError={usernodeAssetMessage}
          onError={setActionError}
          onClose={() => setSettingsAsset(null)}
          onSave={async (spec, namespaceId) => {
            const base = store.assets.find((asset) => asset.head.resourceId === currentSettingsAsset.head.resourceId) ?? currentSettingsAsset;
            if (configResourceProtection(base.head, base.spec.tags) !== 'user') throw new Error('Protected user scripts are read-only.');
            const tags = mergeUsernodeCatalogTags(base.spec.tags, spec.tags);
            const tagIssue = configAssetTagsIssue(tags);
            if (tagIssue) throw new Error(tagIssue);
            try {
              await store.update(base, {
                ...base.spec,
                name: spec.name,
                description: spec.description,
                tags,
              }, userNamespaceIdForFolder(namespaceId || CONFIG_USER_FOLDER_ID));
              setSettingsAsset(null);
            } catch (cause) {
              if (!(cause instanceof UsernodeAssetCommitConflict)) throw cause;
              setSettingsAsset(null);
              setActionError('This user script changed elsewhere. Reopen settings to review the latest metadata before editing again.');
            }
          }}
        />
      )}
      {currentTagEditor && configResourceProtection(currentTagEditor.head, currentTagEditor.spec.tags) === 'user' && (
        <ConfigAssetTagDialog
          name={currentTagEditor.spec.name}
          resourceId={currentTagEditor.head.resourceId}
          tags={usernodeCatalogTags(currentTagEditor.spec.tags)}
          rolePrefix="usernode-asset"
          onClose={() => setTagEditor(null)}
          onSave={(nextTags) => void updateUsernodeTags(currentTagEditor, nextTags)}
        />
      )}
      {confirmation.dialog}
    </ListPageHost>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
