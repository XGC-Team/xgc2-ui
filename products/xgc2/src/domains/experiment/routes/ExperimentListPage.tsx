import {
  Copy,
  FlaskConical,
  Settings,
  Trash2,
} from 'lucide-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import {
  ListPage,
  ListPageFolderEmpty,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMain,
  ListPageItemMeta,
  ListPageRow,
} from '../../../components/ListPage';
import {
  configResourceDefinitionEditLocked,
  configResourceFolderId,
  configResourceProtection,
  userNamespaceIdForFolder,
} from '../../../shared/configResourceProtection';
import { useAppLanguage } from '../../../shared/localization/localizedText';
import {
  buildProjectedConfigAssetCatalog,
  ConfigAssetCatalogControls,
  ConfigAssetCatalogRowTags,
  ConfigAssetFolderTitle,
  type ConfigAssetSortMode,
  type ConfigAssetViewMode,
} from '../../assets/assetsPublic';
import { useExperimentText } from '../experimentMessages';
import type { ExperimentDocument,ExperimentNamespace } from '../experimentModel';
import '../experiment-list.css';

const EMPTY_RUNNING_IDS: ReadonlySet<string> = new Set();

export function ExperimentListPage({
  experiments,
  namespaces,
  selectedExperimentId,
  runningExperimentIds = EMPTY_RUNNING_IDS,
  search,
  tagFilter,
  viewMode,
  sortMode,
  hideSystem,
  hideTemplates,
  onSearchChange,
  onTagFilterChange,
  onViewModeChange,
  onSortModeChange,
  onHideSystemChange,
  onHideTemplatesChange,
  onCreate,
  onOpen,
  onEditTags,
  onUpdateTags,
  collapsedFolders,
  onToggleFolder,
  onMoveToNamespace,
  onRenameNamespace,
  onDeleteNamespace,
  onConfigure,
  onDuplicate,
  onDelete,
}: {
  experiments: ExperimentDocument[];
  namespaces: ExperimentNamespace[];
  selectedExperimentId: string;
  runningExperimentIds?: ReadonlySet<string>;
  search: string;
  tagFilter: string;
  viewMode: ConfigAssetViewMode;
  sortMode: ConfigAssetSortMode;
  hideSystem: boolean;
  hideTemplates: boolean;
  onSearchChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  onViewModeChange: (value: ConfigAssetViewMode) => void;
  onSortModeChange: (value: ConfigAssetSortMode) => void;
  onHideSystemChange: (value: boolean) => void;
  onHideTemplatesChange: (value: boolean) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEditTags: (experiment: ExperimentDocument) => void;
  onUpdateTags: (experiment: ExperimentDocument, tags: string[]) => void;
  collapsedFolders: string[];
  onToggleFolder: (namespaceId: string) => void;
  onMoveToNamespace: (experiment: ExperimentDocument, namespaceId?: string) => void;
  onRenameNamespace: (namespace: ExperimentNamespace, name: string) => void;
  onDeleteNamespace: (namespace: ExperimentNamespace) => void;
  onConfigure: (experiment: ExperimentDocument) => void;
  onDuplicate: (experiment: ExperimentDocument) => void;
  onDelete: (id: string) => void;
}) {
  const language = useAppLanguage();
  const t = useExperimentText();
  const namespaceById = new Map(namespaces.map((namespace) => [namespace.namespaceId,namespace]));
  const { tags,effectiveTagFilter,folders: listFolders } = buildProjectedConfigAssetCatalog({
    items: experiments,
    namespaces,
    search,
    tagFilter,
    sortMode,
    viewMode,
    hideSystem,
    hideTemplates,
    allAssetsTitle: t('All experiments'),
    folderText: {
      system: t('System experiments'),
      templates: t('Templates'),
      user: t('User experiments'),
      namespace: (path) => `${t('User experiments')} / ${path}`,
    },
    project: (asset) => ({
      name: asset.spec.name,
      description: asset.spec.description,
      tags: asset.spec.tags,
      updatedAt: asset.head.updatedAt,
      folderId: configResourceFolderId(asset.head, asset.spec.tags),
    }),
  });

  function renderExperimentRow(item: ExperimentDocument, dragProps = {}) {
    const id = item.head.resourceId;
    const running = runningExperimentIds.has(id);
    const protection = configResourceProtection(item.head, item.spec.tags);
    const protectedResource = protection !== 'user';
    const configureLocked = configResourceDefinitionEditLocked(item.head, item.spec.tags);
    return (
      <ListPageRow
        as="div"
        key={id}
        {...(protectedResource ? {} : dragProps)}
        className="experiment-row"
        data-xgc-role="experiment-row"
        data-xgc-id={id}
        data-xgc-protection={protection}
        data-xgc-readonly={protectedResource ? 'true' : undefined}
        data-xgc-running={running ? 'true' : undefined}
        onClick={() => onOpen(id)}
      >
        <ListPageItemMain
          dataXgcId={id}
          titleRole="experiment-row-open"
          descriptionRole="experiment-row-description"
          title={item.spec.name}
          description={item.spec.description}
          icon={FlaskConical}
          openLabel={running
            ? t('Open running experiment {name}', { name: item.spec.name })
            : t('Open experiment {name}', { name: item.spec.name })}
          current={selectedExperimentId === id}
          onOpen={() => onOpen(id)}
          tagRowRole="experiment-row-tags"
          tagRowId={id}
        >
          <ConfigAssetCatalogRowTags
            tags={item.spec.tags}
            tagFilter={effectiveTagFilter}
            resourceId={id}
            rolePrefix="experiment"
            filterLabel={(tag) => t('Filter by {tag}', { tag })}
            showAllLabel={t('Show all tags')}
            onTagFilterChange={onTagFilterChange}
            editable={!protectedResource}
            onRemoveTag={(tag) => onUpdateTags(item, item.spec.tags.filter((value) => value !== tag))}
            onEditTags={() => onEditTags(item)}
            editLabel={t('Edit tags')}
            removeLabel={(tag) => t('Remove {tag}', { tag })}
          />
        </ListPageItemMain>
        <ListPageItemMeta className="experiment-row-meta" data-xgc-role="experiment-meta" data-xgc-id={id}>
          <span title={t('Last updated')}>{new Date(item.head.updatedAt).toLocaleString(language)}</span>
        </ListPageItemMeta>
        <ListPageItemActions
          className="experiment-row-actions"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ControlButton
            iconOnly
            dataXgcRole="experiment-settings"
            dataXgcId={id}
            aria-label={t('Configure experiment')}
            title={t(configureLocked ? 'System experiments cannot be configured' : 'Configure experiment')}
            disabled={configureLocked}
            onClick={(event) => {
              event.stopPropagation();
              onConfigure(item);
            }}
          >
            <Settings size={15} />
          </ControlButton>
          <ControlButton
            iconOnly
            dataXgcRole="experiment-duplicate"
            dataXgcId={id}
            aria-label={t('Duplicate experiment')}
            title={t('Duplicate experiment')}
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate(item);
            }}
          >
            <Copy size={15} />
          </ControlButton>
          <ControlButton
            iconOnly
            tone="danger"
            dataXgcRole="experiment-delete"
            dataXgcId={id}
            aria-label={t('Archive experiment')}
            title={t(protectedResource ? 'System experiments cannot be archived' : 'Archive experiment')}
            disabled={protectedResource}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(id);
            }}
          >
            <Trash2 size={15} />
          </ControlButton>
        </ListPageItemActions>
      </ListPageRow>
    );
  }

  return (
    <ListPageHost className="experiment-list-page xgc-workspace-full-span" data-xgc-role="experiment-list-page" data-xgc-id="experiment-list-page">
      <ListPage<ExperimentDocument>
        onCreate={onCreate}
        search={{ value: search,placeholder: t('Search experiments and folders'),onChange: onSearchChange,role: 'experiment-search' }}
        controls={(
          <ConfigAssetCatalogControls
            tags={tags}
            tagFilter={effectiveTagFilter}
            viewMode={viewMode}
            sortMode={sortMode}
            rolePrefix="experiment"
            singleViewToggle
            text={{
              allTags: t('All tags'),
              folderView: t('Folder view'),
              listView: t('List view'),
              recentlyUpdated: t('Recently updated'),
              oldestUpdated: t('Oldest updated'),
              nameAscending: t('Name A-Z'),
              filterByTag: t('Filter experiments by tag'),
              sort: t('Sort experiments'),
            }}
            protectedVisibility={{
              system: {
                hidden: hideSystem,
                showLabel: t('Show system experiments'),
                hideLabel: t('Hide system experiments'),
                onChange: onHideSystemChange,
              },
              templates: {
                hidden: hideTemplates,
                showLabel: t('Show template experiments'),
                hideLabel: t('Hide template experiments'),
                onChange: onHideTemplatesChange,
              },
            }}
            createLabel={t('New')}
            createRole="experiment-create"
            onCreate={onCreate}
            onTagFilterChange={onTagFilterChange}
            onViewModeChange={onViewModeChange}
            onSortModeChange={onSortModeChange}
          />
        )}
        folders={listFolders}
        showFolderHeaders={viewMode === 'folder'}
        collapsedFolders={collapsedFolders}
        onToggleFolder={onToggleFolder}
        getFolderProps={(folder) => ({
          'data-xgc-role': 'experiment-folder',
          'data-xgc-id': folder.id,
          'data-xgc-protected': folder.isSystem || folder.readOnly ? 'true' : undefined,
        })}
        drag={viewMode === 'folder' ? {
          mimeType: 'text/xgc-experiment-id',
          getItemId: (item) => item.head.resourceId,
          onMove: (id, folder) => {
            const target = experiments.find((item) => item.head.resourceId === id);
            if (target) {
              onMoveToNamespace(target, userNamespaceIdForFolder(folder));
            }
          },
        } : undefined}
        renderFolderTitle={(folder, collapsed) => {
          const namespace = namespaceById.get(folder.id);
          return (
            <ConfigAssetFolderTitle
              title={folder.title}
              itemCount={folder.items.length}
              collapsed={collapsed}
              namespace={namespace}
              titleClassName="experiment-list-folder-name"
              renameLabel={t('Folder name')}
              onRename={onRenameNamespace}
            />
          );
        }}
        renderFolderActions={(folder) => {
          const namespace = namespaceById.get(folder.id);
          const hasResources = namespace && experiments.some((item) => item.head.namespaceId === namespace.namespaceId);
          const hasChildren = namespace && namespaces.some((item) => item.parentNamespaceId === namespace.namespaceId);
          return namespace ? (
            <div className="xgc-list-folder-actions">
              <ControlButton iconOnly className="xgc-list-folder-action" dataXgcRole="experiment-folder-delete" dataXgcId={namespace.namespaceId} title={t(hasResources || hasChildren ? 'Only empty folders can be archived' : 'Archive folder')} disabled={Boolean(hasResources || hasChildren)} onClick={(event) => { event.stopPropagation(); onDeleteNamespace(namespace); }}>
                <Trash2 size={14} />
              </ControlButton>
            </div>
          ) : null;
        }}
        renderFolderEmpty={() => <ListPageFolderEmpty>{t('Drop experiments here')}</ListPageFolderEmpty>}
        renderItem={renderExperimentRow}
        emptyTitle={t('No matching experiments')}
        listClassName={viewMode}
      />
    </ListPageHost>
  );
}
