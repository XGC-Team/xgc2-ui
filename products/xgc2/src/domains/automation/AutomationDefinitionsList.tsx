import { Copy,LoaderCircle,Play,Square,Trash2,Workflow } from 'lucide-react';
import { useEffect,useLayoutEffect,useRef,type HTMLAttributes } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { usePersistentState } from '../../hooks/usePersistentState';
import {
  ListPage,
  ListPageFolderEmpty,
  ListPageHost,
  ListPageItemActions,
  ListPageItemMain,
  ListPageItemMeta,
  ListPageRow,
} from '../../components/ListPage';
import {
  CONFIG_SYSTEM_FOLDER_ID,
  CONFIG_TEMPLATES_FOLDER_ID,
  userNamespaceIdForFolder,
} from '../../shared/configResourceProtection';
import {
  buildProjectedConfigAssetCatalog,
  ConfigAssetCatalogControls,
  ConfigAssetCatalogRowTags,
  ConfigAssetFolderTitle,
  useConfigAssetCatalogView,
} from '../assets/assetsPublic';
import { useAutomationAuthoringText } from './automationAuthoringMessages';
import {
  automationTargetPolicyInheritsExperiment,
  automationWorkflowNodeCount,
  type AutomationDocument,
  type AutomationNamespace,
} from './automationDefinitionContracts';
import { automationCatalogSearchTerms,automationCatalogTags } from './automationCatalogTags';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import { isAutomationExecutionRunActive } from './automationRunSummaryModel';
import { automationUserViewStorageKey } from './automationNavigation';
import { automationResourceFolderId,automationResourceProtection } from './automationResourceProtection';

export function AutomationDefinitionsList({
  targetId,
  documents,
  namespaces,
  latestRunsByResourceId,
  loading,
  startingResourceIds,
  stoppingRunIds,
  onCreate,
  onOpen,
  onRun,
  onStop,
  onDuplicate,
  onArchive,
  onRenameFolder,
  onArchiveFolder,
  onMove,
  onEditTags,
  onUpdateTags,
}: {
  targetId: string;
  documents: AutomationDocument[];
  namespaces: AutomationNamespace[];
  latestRunsByResourceId: ReadonlyMap<string,AutomationExecutionRunSummary>;
  loading: boolean;
  startingResourceIds: readonly string[];
  stoppingRunIds: readonly string[];
  onCreate: () => void;
  onOpen: (document: AutomationDocument) => void;
  onRun: (document: AutomationDocument) => void;
  onStop: (run: AutomationExecutionRunSummary) => void;
  onDuplicate: (document: AutomationDocument) => void;
  onArchive: (document: AutomationDocument) => void;
  onRenameFolder: (namespace: AutomationNamespace, name: string) => void;
  onArchiveFolder: (namespace: AutomationNamespace) => void;
  onMove: (document: AutomationDocument, namespaceId?: string) => void;
  onEditTags: (document: AutomationDocument) => void;
  onUpdateTags: (document: AutomationDocument, tags: string[]) => void;
}) {
  const t = useAutomationAuthoringText();
  const storageScope = automationUserViewStorageKey(targetId, 'catalog');
  const [persistedHideSystem,setPersistedHideSystem] = usePersistentState(
    `${storageScope}.hideSystem`,true,isBoolean,
  );
  const [persistedHideTemplates,setPersistedHideTemplates] = usePersistentState(
    `${storageScope}.hideTemplates`,false,isBoolean,
  );
  const [persistedViewMode,setPersistedViewMode] = usePersistentState(
    `${storageScope}.viewMode`,'folder',isCatalogViewMode,
  );
  const catalogView = useConfigAssetCatalogView({
    hideSystem:persistedHideSystem,
    hideTemplates:persistedHideTemplates,
    viewMode:persistedViewMode,
  });
  const namespaceById = new Map(namespaces.map((namespace) => [namespace.namespaceId,namespace]));
  const { tags,effectiveTagFilter,folders } = buildProjectedConfigAssetCatalog({
    items: documents,
    namespaces,
    search: catalogView.search,
    tagFilter: catalogView.tagFilter,
    sortMode: catalogView.sortMode,
    viewMode: catalogView.viewMode,
    hideSystem: catalogView.hideSystem,
    hideTemplates: catalogView.hideTemplates,
    allAssetsTitle: t('All Automations'),
    folderText: {
      system: t('System workflows'),
      templates: t('Templates'),
      user: t('User workflows'),
      namespace: (path) => `${t('User workflows')} / ${path}`,
    },
    project: (document) => ({
      name: document.spec.metadata.name,
      description: document.spec.metadata.description,
      tags: automationCatalogTags(document.spec.metadata.tags),
      updatedAt: document.head.updatedAt,
      folderId: automationResourceFolderId(document),
      searchTerms: automationCatalogSearchTerms(document),
    }),
  });
  useAutomationCatalogScrollRestoration(
    targetId,
    `${storageScope}.scrollPosition`,
    `${loading}:${documents.length}:${folders.length}`,
    catalogView.viewMode,
  );

  return (
    <ListPageHost className="automation-page-list xgc-workspace-full-span" data-xgc-role="automations-page" data-xgc-id={targetId}>
      <ListPage<AutomationDocument>
        dataXgcRole="automation-definitions-page"
        dataXgcId="automation"
        onCreate={onCreate}
        search={{ value: catalogView.search,placeholder: t('Search Automations and folders'),onChange: catalogView.setSearch,role: 'automation-definition-search' }}
        controls={(
          <ConfigAssetCatalogControls
            tags={tags}
            tagFilter={effectiveTagFilter}
            viewMode={catalogView.viewMode}
            sortMode={catalogView.sortMode}
            rolePrefix="automation"
            singleViewToggle
            text={{
              allTags: t('All tags'),
              folderView: t('Folder view'),
              listView: t('List view'),
              recentlyUpdated: t('Recently updated'),
              oldestUpdated: t('Oldest updated'),
              nameAscending: t('Name A-Z'),
              filterByTag: t('Filter Automations by tag'),
              sort: t('Sort Automations'),
            }}
            protectedVisibility={{
              system: {
                hidden: catalogView.hideSystem,
                showLabel: t('Show system workflows'),
                hideLabel: t('Hide system workflows'),
                onChange: (hidden) => {
                  catalogView.setHideSystem(hidden);
                  setPersistedHideSystem(hidden);
                },
              },
              templates: {
                hidden: catalogView.hideTemplates,
                showLabel: t('Show template workflows'),
                hideLabel: t('Hide template workflows'),
                onChange: (hidden) => {
                  catalogView.setHideTemplates(hidden);
                  setPersistedHideTemplates(hidden);
                },
              },
            }}
            createLabel={t('New')}
            createRole="automation-definition-create"
            onCreate={onCreate}
            onTagFilterChange={catalogView.setTagFilter}
            onViewModeChange={(viewMode) => {
              catalogView.setViewMode(viewMode);
              setPersistedViewMode(viewMode);
            }}
            onSortModeChange={catalogView.setSortMode}
          />
        )}
        folders={folders}
        showFolderHeaders={catalogView.viewMode === 'folder'}
        collapsedFolders={catalogView.collapsedFolders}
        onToggleFolder={catalogView.toggleFolder}
        getFolderProps={(folder) => ({
          'data-xgc-role': 'automation-folder',
          'data-xgc-id': folder.id,
          'data-xgc-protected': folder.isSystem || folder.readOnly ? 'true' : undefined,
        })}
        renderFolderTitle={(folder, collapsed) => (
          <ConfigAssetFolderTitle
            title={folder.title}
            itemCount={folder.items.length}
            collapsed={collapsed}
            namespace={namespaceById.get(folder.id)}
            renameLabel={t('Folder name')}
            onRename={onRenameFolder}
          />
        )}
        renderFolderActions={(folder) => {
          const namespace = namespaceById.get(folder.id);
          const hasChildren = namespace && namespaces.some((item) => item.parentNamespaceId === namespace.namespaceId);
          const hasResources = namespace && documents.some((document) => document.head.namespaceId === namespace.namespaceId);
          return namespace && !hasResources && !hasChildren ? (
            <ControlButton iconOnly type="button" data-xgc-role="automation-folder-archive" data-xgc-id={namespace.namespaceId} title={t('Archive folder')} onClick={() => onArchiveFolder(namespace)}><Trash2 size={14} /></ControlButton>
          ) : undefined;
        }}
        renderFolderEmpty={(folder) => (
          <ListPageFolderEmpty data-xgc-role="automation-folder-empty" data-xgc-id={folder.id}>
            {loading ? t('Loading Automations…') : t('No items')}
          </ListPageFolderEmpty>
        )}
        drag={catalogView.viewMode === 'folder' ? {
          mimeType: 'text/xgc-automation-id',
          getItemId: (document) => document.head.resourceId,
          onMove: (resourceId, namespaceId) => {
            if (namespaceId === CONFIG_SYSTEM_FOLDER_ID || namespaceId === CONFIG_TEMPLATES_FOLDER_ID) return;
            const document = documents.find((item) => item.head.resourceId === resourceId);
            if (document && automationResourceProtection(document) === 'user') {
              onMove(document, userNamespaceIdForFolder(namespaceId));
            }
          },
        } : undefined}
        renderItem={(document, dragProps) => (
          <AutomationDefinitionListRow
            key={document.head.resourceId}
            document={document}
            dragProps={dragProps}
            tagFilter={effectiveTagFilter}
            latestRun={latestRunsByResourceId.get(document.head.resourceId)}
            starting={startingResourceIds.includes(document.head.resourceId)}
            stoppingRunIds={stoppingRunIds}
            onOpen={onOpen}
            onRun={onRun}
            onStop={onStop}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onTagFilterChange={catalogView.setTagFilter}
            onEditTags={onEditTags}
            onUpdateTags={onUpdateTags}
          />
        )}
        emptyTitle={loading ? t('Loading Automations') : t('No Automation definitions')}
        listClassName="automation-definition-list"
      />
    </ListPageHost>
  );
}

function useAutomationCatalogScrollRestoration(
  targetId:string,
  storageKey:string,
  contentRevision:string,
  viewMode:'folder'|'list',
) {
  const storedState = useRef(readStoredCatalogScrollState(storageKey));
  const restoredModes = useRef(new Set<'folder'|'list'>());

  useLayoutEffect(() => {
    if (restoredModes.current.has(viewMode)) return;
    const position = storedState.current[viewMode];
    if (!position) {
      restoredModes.current.add(viewMode);
      return;
    }
    const scroller = automationCatalogScroller(targetId);
    if (!scroller) return;
    const maximum = Math.max(0,scroller.scrollHeight - scroller.clientHeight);
    if (maximum === 0) return;
    const anchor = position.anchor && findAutomationCatalogAnchor(scroller,position.anchor);
    const anchorTop = anchor ? automationCatalogContentTop(anchor,scroller) : undefined;
    const restoredTop = anchorTop !== undefined && Number.isFinite(anchorTop)
      ? anchorTop + position.anchor!.offset
      : position.fraction * maximum;
    scroller.scrollTop = clampScrollTop(restoredTop,maximum);
    restoredModes.current.add(viewMode);
  },[contentRevision,targetId,viewMode]);

  useEffect(() => {
    const scroller = automationCatalogScroller(targetId);
    if (!scroller) return undefined;
    const save = () => {
      const next = {
        ...storedState.current,
        version: 1 as const,
        [viewMode]: captureAutomationCatalogScrollPosition(scroller,viewMode),
      };
      storedState.current = next;
      try {
        window.localStorage.setItem(storageKey,JSON.stringify(next));
      } catch {
        return;
      }
    };
    scroller.addEventListener('scrollend',save,{ passive:true });
    return () => {
      save();
      scroller.removeEventListener('scrollend',save);
    };
  },[storageKey,targetId,viewMode]);
}

function automationCatalogScroller(targetId:string) {
  const host = [...document.querySelectorAll<HTMLElement>('[data-xgc-role="automations-page"]')]
    .find((candidate) => candidate.dataset.xgcId === targetId);
  return host?.querySelector<HTMLElement>('[data-xgc-role="list-page-items-scroll"]');
}

type AutomationCatalogScrollState = {
  version: 1;
  folder?: AutomationCatalogScrollPosition;
  list?: AutomationCatalogScrollPosition;
};

type AutomationCatalogScrollPosition = {
  fraction: number;
  anchor?: AutomationCatalogScrollAnchor;
};

type AutomationCatalogScrollAnchor = {
  role: 'automation-definition-row'|'automation-folder';
  id: string;
  offset: number;
};

function readStoredCatalogScrollState(storageKey:string): AutomationCatalogScrollState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { version: 1 };
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || value.version !== 1) return { version: 1 };
    const state: AutomationCatalogScrollState = { version: 1 };
    const folder = parseCatalogScrollPosition(value.folder);
    const list = parseCatalogScrollPosition(value.list);
    if (folder) state.folder = folder;
    if (list) state.list = list;
    return state;
  } catch {
    return { version: 1 };
  }
}

function parseCatalogScrollPosition(value:unknown): AutomationCatalogScrollPosition|undefined {
  if (!isRecord(value) || typeof value.fraction !== 'number' || !Number.isFinite(value.fraction) || value.fraction < 0 || value.fraction > 1) return undefined;
  const anchorValue = value.anchor;
  if (!isRecord(anchorValue)) return { fraction: value.fraction };
  const role = anchorValue.role;
  const id = anchorValue.id;
  const offset = anchorValue.offset;
  if ((role !== 'automation-definition-row' && role !== 'automation-folder')
    || typeof id !== 'string' || !id
    || typeof offset !== 'number' || !Number.isFinite(offset)) {
    return { fraction: value.fraction };
  }
  return { fraction: value.fraction,anchor: { role,id,offset } };
}

function captureAutomationCatalogScrollPosition(
  scroller: HTMLElement,
  viewMode:'folder'|'list',
): AutomationCatalogScrollPosition {
  const maximum = Math.max(0,scroller.scrollHeight - scroller.clientHeight);
  const fraction = maximum > 0 ? clampFraction(scroller.scrollTop / maximum) : 0;
  const anchor = findAutomationCatalogScrollAnchor(scroller,viewMode);
  return {
    fraction,
    ...(anchor ? {
      anchor: {
        role: anchor.role,
        id: anchor.element.dataset.xgcId ?? '',
        offset: Math.round(scroller.scrollTop - anchor.top),
      },
    } : {}),
  };
}

function findAutomationCatalogScrollAnchor(scroller:HTMLElement,viewMode:'folder'|'list') {
  const rows = [...scroller.querySelectorAll<HTMLElement>('[data-xgc-role="automation-definition-row"][data-xgc-id]')];
  const row = findNearestScrollAnchor(rows,scroller);
  if (row) return { ...row,role: 'automation-definition-row' as const };
  if (viewMode !== 'folder') return undefined;
  const folders = [...scroller.querySelectorAll<HTMLElement>('[data-xgc-role="automation-folder"][data-xgc-id]')];
  const folder = findNearestScrollAnchor(folders,scroller);
  return folder ? { ...folder,role: 'automation-folder' as const } : undefined;
}

function findNearestScrollAnchor(elements: HTMLElement[],scroller:HTMLElement) {
  if (!elements.length) return undefined;
  const scrollTop = Math.max(0,scroller.scrollTop);
  const measured = elements.map((element) => ({ element,top: automationCatalogContentTop(element,scroller) }));
  return measured.find(({ top }) => top >= scrollTop) ?? measured[measured.length - 1];
}

function findAutomationCatalogAnchor(scroller:HTMLElement,anchor:AutomationCatalogScrollAnchor) {
  const selector = `[data-xgc-role="${anchor.role}"][data-xgc-id]`;
  return [...scroller.querySelectorAll<HTMLElement>(selector)]
    .find((element) => element.dataset.xgcId === anchor.id);
}

function automationCatalogContentTop(element:HTMLElement,scroller:HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (elementRect.height > 0 || scrollerRect.height > 0) {
    return elementRect.top - scrollerRect.top + scroller.scrollTop;
  }
  return element.offsetTop;
}

function clampFraction(value:number) {
  return Math.min(1,Math.max(0,value));
}

function clampScrollTop(value:number,maximum:number) {
  return Math.min(maximum,Math.max(0,value));
}

function isRecord(value:unknown): value is Record<string,unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoolean(value:unknown):value is boolean {
  return typeof value === 'boolean';
}

function isCatalogViewMode(value:unknown):value is 'folder'|'list' {
  return value === 'folder' || value === 'list';
}

function AutomationDefinitionListRow({ document,dragProps,tagFilter,latestRun,starting,stoppingRunIds,onOpen,onRun,onStop,onDuplicate,onArchive,onTagFilterChange,onEditTags,onUpdateTags }: {
  document: AutomationDocument;
  dragProps: HTMLAttributes<HTMLElement>;
  tagFilter: string;
  latestRun?: AutomationExecutionRunSummary;
  starting: boolean;
  stoppingRunIds: readonly string[];
  onOpen: (document: AutomationDocument) => void;
  onRun: (document: AutomationDocument) => void;
  onStop: (run: AutomationExecutionRunSummary) => void;
  onDuplicate: (document: AutomationDocument) => void;
  onArchive: (document: AutomationDocument) => void;
  onTagFilterChange: (value: string) => void;
  onEditTags: (document: AutomationDocument) => void;
  onUpdateTags: (document: AutomationDocument, tags: string[]) => void;
}) {
  const t = useAutomationAuthoringText();
  const manualEntrypoints = document.spec.nodes.filter((node) => node.kind === 'trigger.manual');
  const manuallyRunnable = manualEntrypoints.length === 1
    && !automationTargetPolicyInheritsExperiment(document.spec.targetPolicy);
  const protection = automationResourceProtection(document);
  const protectedResource = protection !== 'user';
  const nodeCount = automationWorkflowNodeCount(document.spec.nodes);
  const latestRunActive = Boolean(latestRun && isAutomationExecutionRunActive(latestRun));
  const stopping = Boolean(latestRun && (latestRun.status === 'stopping' || stoppingRunIds.includes(latestRun.id)));
  return (
    <ListPageRow
      {...(protectedResource ? {} : dragProps)}
      className="automation-definition-row"
      data-xgc-role="automation-definition-row"
      data-xgc-id={document.head.resourceId}
      data-xgc-protection={protection}
      data-xgc-readonly={protectedResource ? 'true' : undefined}
      onClick={() => onOpen(document)}
    >
      <ListPageItemMain
        dataXgcId={document.head.resourceId}
        titleRole="automation-row-open"
        descriptionRole="automation-row-description"
        title={document.spec.metadata.name}
        description={document.spec.metadata.description}
        icon={Workflow}
        openLabel={t('Open Automation {name}', { name: document.spec.metadata.name })}
        onOpen={() => onOpen(document)}
        tagRowRole="automation-row-tags"
        tagRowId={document.head.resourceId}
      >
        <ConfigAssetCatalogRowTags
          tags={automationCatalogTags(document.spec.metadata.tags)}
          tagFilter={tagFilter}
          resourceId={document.head.resourceId}
          rolePrefix="automation"
          filterLabel={(tag) => t('Filter by {tag}', { tag })}
          showAllLabel={t('Show all tags')}
          onTagFilterChange={onTagFilterChange}
          editable={!protectedResource}
          onRemoveTag={(tag) => onUpdateTags(
            document,
            automationCatalogTags(document.spec.metadata.tags).filter((value) => value !== tag),
          )}
          onEditTags={() => onEditTags(document)}
          editLabel={t('Edit tags')}
          removeLabel={(tag) => t('Remove {tag}', { tag })}
        />
      </ListPageItemMain>
      <ListPageItemMeta className="automation-definition-row-meta" data-xgc-role="automation-definition-meta" data-xgc-id={document.head.resourceId}>
        <span>{t(nodeCount === 1 ? '{count} node' : '{count} nodes', { count: nodeCount })}</span>
      </ListPageItemMeta>
      <ListPageItemActions className="automation-definition-row-actions">
        {manuallyRunnable ? latestRunActive && latestRun ? (
          <ControlButton
            iconOnly
            tone="danger"
            className="automation-page-run-action"
            type="button"
            aria-label={t(stopping ? 'Stopping {name}' : 'Stop {name}', { name: document.spec.metadata.name })}
            title={t(stopping ? 'Stopping {name}' : 'Stop {name}', { name: document.spec.metadata.name })}
            data-xgc-role={stopping ? 'automation-run-stopping' : 'automation-run-stop'}
            data-xgc-id={latestRun.id}
            data-xgc-resource-id={document.head.resourceId}
            data-xgc-run-id={latestRun.id}
            data-xgc-state={stopping ? 'stopping' : 'running'}
            data-xgc-status={stopping ? 'stopping' : latestRun.status}
            disabled={stopping}
            onClick={(event) => { event.stopPropagation();onStop(latestRun); }}
          >{stopping ? <LoaderCircle data-xgc-spinning="true" size={15} /> : <Square size={15} />}</ControlButton>
        ) : (
          <ControlButton
            iconOnly
            className="automation-page-run-action"
            type="button"
            aria-label={t(starting ? 'Starting {name}' : 'Run {name}', { name: document.spec.metadata.name })}
            title={latestRun ? t('Latest run: {status}', { status: latestRun.status }) : t('Run {name}', { name: document.spec.metadata.name })}
            data-xgc-role="automation-run-open"
            data-xgc-id={document.head.resourceId}
            data-xgc-run-id={latestRun?.id}
            data-xgc-state={starting ? 'starting' : 'idle'}
            data-xgc-status={starting ? 'starting' : latestRun?.status ?? 'idle'}
            disabled={starting}
            onClick={(event) => { event.stopPropagation();onRun(document); }}
          >{starting ? <LoaderCircle data-xgc-spinning="true" size={15} /> : <Play size={15} />}</ControlButton>
        ) : null}
        <ControlButton
          iconOnly
          type="button"
          aria-label={t('Duplicate {name}', { name: document.spec.metadata.name })}
          title={t('Duplicate {name}', { name: document.spec.metadata.name })}
          data-xgc-role="automation-definition-duplicate"
          data-xgc-id={document.head.resourceId}
          onClick={(event) => { event.stopPropagation();onDuplicate(document); }}
        ><Copy size={15} /></ControlButton>
        {!protectedResource && (
          <ControlButton
            iconOnly
            tone="danger"
            type="button"
            aria-label={t('Archive {name}', { name: document.spec.metadata.name })}
            title={t('Archive {name}', { name: document.spec.metadata.name })}
            data-xgc-role="automation-definition-archive"
            data-xgc-id={document.head.resourceId}
            onClick={(event) => { event.stopPropagation();onArchive(document); }}
          ><Trash2 size={15} /></ControlButton>
        )}
      </ListPageItemActions>
    </ListPageRow>
  );
}
