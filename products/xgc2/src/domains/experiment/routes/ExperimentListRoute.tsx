import { useState } from 'react';
import { usePersistentState } from '../../../hooks/usePersistentState';
import { configAssetTagsIssue } from '../../../shared/configAssetTags';
import {
  ConfigAssetTagDialog,
  type ConfigAssetViewMode,
  useConfigAssetCatalogView,
} from '../../assets/assetsPublic';
import { useGroundStationErrorNotification } from '../../groundStationInteraction/groundStationInteractionPublic';
import { ExperimentCreateDialog,ExperimentSettingsDrawer } from '../ExperimentResourceDrawers';
import type {
  ExperimentDocument,
  ExperimentNamespace,
  ExperimentSpec,
} from '../experimentModel';
import { newExperimentSpec,normalizeExperimentSpec } from '../experimentModel';
import { ExperimentCommitConflict,type ExperimentCatalog } from '../useExperimentCatalog';
import { ExperimentListPage } from './ExperimentListPage';
import {
  useRobotAssetKindComposition,
  type RobotAssetKindComposition,
} from '../../robot/robotAssetPublic';

export function ExperimentListRoute({
  catalog,
  targetId,
  selectedExperimentId,
  runningExperimentIds,
  setSelectedExperimentId,
  openDashboard,
}: {
  catalog: ExperimentCatalog;
  targetId: string;
  selectedExperimentId: string;
  runningExperimentIds: ReadonlySet<string>;
  setSelectedExperimentId: (id: string) => void;
  openDashboard: () => void;
}) {
  const robotKindComposition = useRobotAssetKindComposition();
  const { experiments,namespaces } = catalog;
  const storageScope = `xgc.experiment.catalog.${encodeURIComponent(targetId)}`;
  const [persistedViewMode,setPersistedViewMode] = usePersistentState(
    `${storageScope}.viewMode`,
    'folder',
    isConfigAssetViewMode,
  );
  const [persistedHideSystem,setPersistedHideSystem] = usePersistentState(
    `${storageScope}.hideSystem`,true,isBoolean,
  );
  const [persistedHideTemplates,setPersistedHideTemplates] = usePersistentState(
    `${storageScope}.hideTemplates`,false,isBoolean,
  );
  const catalogView = useConfigAssetCatalogView({
    viewMode:persistedViewMode,
    hideSystem:persistedHideSystem,
    hideTemplates:persistedHideTemplates,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [tagEditor, setTagEditor] = useState<ExperimentDocument | null>(null);
  const [experimentSettings, setExperimentSettings] = useState<ExperimentDocument | null>(null);
  const [settingsConflict, setSettingsConflict] = useState('');
  const [errorNotification, setErrorNotification] = useState({ message: '',revision: 0 });
  const setError = (message: string) => setErrorNotification((current) => ({
    message,
    revision: current.revision + 1,
  }));
  const currentTagEditor = tagEditor
    ? experiments.find((item) => item.head.resourceId === tagEditor.head.resourceId) ?? tagEditor
    : null;
  const currentExperimentSettings = experimentSettings
    ? experiments.find((item) => item.head.resourceId === experimentSettings.head.resourceId) ?? experimentSettings
    : null;

  async function createExperimentFromDialog(input: {
    name: string;
    tags: string[];
    description: string;
    namespaceId?: string;
  }) {
    setError('');
    try {
      const created = await catalog.createExperiment({
        namespaceId: input.namespaceId,
        spec: newExperimentSpec({
          ...input,
          robots: [],
          workflowInstances: [],
        }, robotKindComposition),
      });
      setSelectedExperimentId(created.head.resourceId);
      setCreateOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function updateExperimentTags(target: ExperimentDocument, tags: string[]) {
    const tagIssue = configAssetTagsIssue(tags);
    if (tagIssue) {
      setError(tagIssue);
      return;
    }
    setError('');
    try {
      const saved = await catalog.saveExperimentDraft({ ...target,spec: { ...target.spec,tags } }, 'Update experiment tags');
      setTagEditor(null);
      if (experimentSettings?.head.resourceId === saved.head.resourceId) setExperimentSettings(saved);
    } catch (cause) {
      if (cause instanceof ExperimentCommitConflict) {
        setTagEditor(null);
        setError('The experiment changed elsewhere. The latest data was loaded; reopen tags before editing again.');
      } else {
        setError(messageOf(cause));
      }
    }
  }

  async function updateExperimentSettings(
    target: ExperimentDocument,
    updates: Pick<ExperimentSpec, 'name' | 'description' | 'tags' | 'runModes'>,
  ) {
    const tagIssue = configAssetTagsIssue(updates.tags);
    if (tagIssue) {
      setSettingsConflict(tagIssue);
      return;
    }
    setSettingsConflict('');
    setError('');
    try {
      await catalog.saveExperimentDraft({ ...target,spec: { ...target.spec,...updates } }, 'Update experiment settings');
      setExperimentSettings(null);
    } catch (cause) {
      if (cause instanceof ExperimentCommitConflict) {
        setExperimentSettings(null);
        setSettingsConflict('');
        setError('The experiment changed elsewhere. The latest data was loaded; reopen settings before editing again.');
      } else {
        setError(messageOf(cause));
      }
    }
  }

  async function moveExperimentToNamespace(target: ExperimentDocument, namespaceId?: string) {
    if ((target.head.namespaceId ?? '') === (namespaceId ?? '')) return;
    setError('');
    try {
      await catalog.saveExperimentDraft({ ...target,head: { ...target.head,namespaceId } }, 'Move experiment folder');
    } catch (cause) {
      setError(cause instanceof ExperimentCommitConflict
        ? 'The experiment changed elsewhere. Review the latest data and move it again.'
        : messageOf(cause));
    }
  }

  async function duplicateExperiment(source: ExperimentDocument) {
    setError('');
    try {
      const created = await catalog.createExperiment({
        namespaceId: source.head.namespaceId,
        spec: duplicateExperimentSpec(source, robotKindComposition),
      });
      setSelectedExperimentId(created.head.resourceId);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function removeExperiment(id: string) {
    const target = experiments.find((item) => item.head.resourceId === id);
    if (!target) return;
    setError('');
    try {
      await catalog.archiveExperiment(target);
      if (selectedExperimentId === id) setSelectedExperimentId('');
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function createNamespace(name: string) {
    setError('');
    try {
      await catalog.createNamespace(name);
      setCreateOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function renameNamespace(namespace: ExperimentNamespace, name: string) {
    setError('');
    try {
      await catalog.updateNamespace(namespace, name);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function removeNamespace(namespace: ExperimentNamespace) {
    if (experiments.some((item) => item.head.namespaceId === namespace.namespaceId)
      || namespaces.some((item) => item.parentNamespaceId === namespace.namespaceId)) return;
    setError('');
    try {
      await catalog.archiveNamespace(namespace);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <>
      <ExperimentListErrorNotification
        key={errorNotification.revision}
        targetId={targetId}
        message={errorNotification.message}
      />
      <div className="xgc-experiment-list-route xgc-workspace-full-span" data-xgc-role="experiment-list-route" data-xgc-id="experiment-list-route">
        <ExperimentListPage
          experiments={experiments}
          namespaces={namespaces}
          selectedExperimentId={selectedExperimentId}
          runningExperimentIds={runningExperimentIds}
          search={catalogView.search}
          tagFilter={catalogView.tagFilter}
          onSearchChange={catalogView.setSearch}
          onTagFilterChange={catalogView.setTagFilter}
          viewMode={catalogView.viewMode}
          sortMode={catalogView.sortMode}
          hideSystem={catalogView.hideSystem}
          hideTemplates={catalogView.hideTemplates}
          onHideSystemChange={(hidden) => {
            catalogView.setHideSystem(hidden);
            setPersistedHideSystem(hidden);
          }}
          onHideTemplatesChange={(hidden) => {
            catalogView.setHideTemplates(hidden);
            setPersistedHideTemplates(hidden);
          }}
          onViewModeChange={(viewMode) => {
            catalogView.setViewMode(viewMode);
            setPersistedViewMode(viewMode);
          }}
          onSortModeChange={catalogView.setSortMode}
          onCreate={() => setCreateOpen(true)}
          onOpen={(id) => { setSelectedExperimentId(id); openDashboard(); }}
          onEditTags={setTagEditor}
          onUpdateTags={(target, tags) => void updateExperimentTags(target, tags)}
          collapsedFolders={catalogView.collapsedFolders}
          onToggleFolder={catalogView.toggleFolder}
          onMoveToNamespace={(target, namespaceId) => void moveExperimentToNamespace(target, namespaceId)}
          onRenameNamespace={(namespace, name) => void renameNamespace(namespace, name)}
          onDeleteNamespace={(namespace) => void removeNamespace(namespace)}
          onConfigure={(target) => {
            setSettingsConflict('');
            setExperimentSettings(target);
          }}
          onDuplicate={(target) => void duplicateExperiment(target)}
          onDelete={(id) => void removeExperiment(id)}
        />
      </div>
      {createOpen && <ExperimentCreateDialog namespaces={namespaces} onClose={() => setCreateOpen(false)} onCreate={(input) => void createExperimentFromDialog(input)} onCreateNamespace={(name) => void createNamespace(name)} />}
      {currentTagEditor && (
        <ConfigAssetTagDialog
          name={currentTagEditor.spec.name}
          resourceId={currentTagEditor.head.resourceId}
          tags={currentTagEditor.spec.tags}
          rolePrefix="experiment"
          onClose={() => setTagEditor(null)}
          onSave={(tags) => void updateExperimentTags(currentTagEditor, tags)}
        />
      )}
      {currentExperimentSettings && (
        <ExperimentSettingsDrawer
          experiment={currentExperimentSettings}
          conflict={settingsConflict}
          onClose={() => setExperimentSettings(null)}
          onSave={(updates) => void updateExperimentSettings(currentExperimentSettings, updates)}
        />
      )}
    </>
  );
}

function isConfigAssetViewMode(value: unknown): value is ConfigAssetViewMode {
  return value === 'folder' || value === 'list';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function ExperimentListErrorNotification({ targetId,message }: { targetId: string;message: string }) {
  useGroundStationErrorNotification(targetId, message, {
    title: 'Experiments',source: 'experiment-list',dedupeKey: 'experiment-list:error',
  });
  return null;
}

function duplicateExperimentSpec(
  source: ExperimentDocument,
  robotKindComposition: RobotAssetKindComposition,
): ExperimentSpec {
  const cloned = structuredClone(source.spec);
  const baseName = source.spec.name.trim() || 'Experiment';
  return normalizeExperimentSpec({
    ...cloned,
    name: `${baseName} (copy)`,
    // Drop seed/protection tags so the copy is a normal user experiment.
    tags: cloned.tags.filter((tag) => !['built-in','template','system'].includes(tag)),
  }, robotKindComposition);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
