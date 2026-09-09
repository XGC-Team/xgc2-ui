import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  Fragment,
} from 'react';
import { EmptyState,StatusText,Vector3Control } from '@xgc2/ui-react';
import { ControlButton,ControlLink } from '../../components/controls/ControlButton';
import { ConfigDrawer } from '../../components/ConfigDrawer';
import { SelectControl } from '../../components/controls/SelectControl';
import { InputControl,SearchControl } from '../../components/controls/TextControls';
import { FormField,SwitchControl } from '../../components/FormPrimitives';
import {
  compareExperimentRobotBindingSlots,
  experimentRobotAssignmentLabel,
  experimentRobotAssetDisabledReason,
  experimentRobotRoleLabel,
  experimentRobotSlotGroup,
  experimentProcessRuntimeProjection,
  experimentWorkflowMemberOwnerRunId,
  newExperimentRobotBinding,
  normalizeExperimentRobotBindings,
  removeExperimentRobotAsset,
  reorderExperimentRobotAssets,
  validateExperimentRobotBindings,
  DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET,
  type ExperimentDocument,
  type ExperimentHybridSource,
  type ExperimentLocalizationOffset,
  type ExperimentRobotBinding,
} from '../../domains/experiment/experimentPublic';
import {
  robotAssetChassisClass,
  robotAssetDocumentHash,
  robotAssetKindLabel,
  robotAssetOverviewAttributes,
  useRobotAssetKindComposition,useRobotText,
  type RobotAssetDocument,
} from '../../domains/robot/robotAssetPublic';
import { useProductRouteVisible } from '../../shared/routeReady';
import { configResourceDefinitionEditLocked } from '../../shared/configResourceProtection';
import { ExperimentRobotPortrait } from './ExperimentRobotPortrait';
import { ExperimentCoordinateScene } from './ExperimentCoordinateScene';
import { ExperimentCoordinateDrawer } from './ExperimentCoordinateDrawer';
import { WorkspaceBusyOverlay } from '../../shared/WorkspaceBusyOverlay';
import type { PanelPluginProps } from '../types';
import {
  normalizeRobotAssetsSearchQuery,
  robotAssetMatchesQuery,
} from './experimentRobotAssetsPanelSearch';
import './experiment-robot-assets-panel.css';

type RobotBindingsDraft = {
  experimentResourceId: string;
  headCommitId: string;
  headVersion: number;
  baseline: ExperimentRobotBinding[];
  bindings: ExperimentRobotBinding[];
  baselineOffset: ExperimentLocalizationOffset;
  localizationOffset: ExperimentLocalizationOffset;
};

type CoordinateAuthoringBase = Pick<RobotBindingsDraft,
  'experimentResourceId' | 'headCommitId' | 'bindings' | 'localizationOffset'>;

const ROBOT_ASSET_DRAG_MIME = 'text/xgc-experiment-robot-asset';
const ROBOT_ASSIGNMENT_DRAG_MIME = 'text/xgc-experiment-robot-assignment';
const UPDATE_ROBOTS_REASON = 'Update Experiment Robots from Config dashboard';
const REORDER_ROBOTS_REASON = 'Reorder Experiment Robots from Config dashboard';
const FILL_CURRENT_POSES_REASON = 'Set starting poses for the next Experiment';
const UPDATE_WORLD_ORIGIN_OFFSET_REASON = 'Update Experiment world origin offset from Config dashboard';
const ROBOT_RUNTIME_WORKFLOW_INSTANCE_ID = 'panel-robot-instruments';
const FLEET_GROUPS = ['UAV', 'UGV'] as const;

function fleetGroupLabel(binding: ExperimentRobotBinding) {
  return experimentRobotRoleLabel(binding).replace(/-\d+$/,'');
}

function fleetGroupOrder(bindings: readonly { binding: ExperimentRobotBinding }[]) {
  const extras: string[] = [];
  for (const { binding } of bindings) {
    const label = fleetGroupLabel(binding);
    if ((label === 'UAV' || label === 'UGV' || extras.includes(label))) continue;
    extras.push(label);
  }
  return [...FLEET_GROUPS, ...extras];
}

type PendingRobotBindings = {
  bindings: ExperimentRobotBinding[];
  reason: string;
};


export function ExperimentRobotAssetsPanel({ panel,context }: PanelPluginProps<readonly ['experiment','automation']>) {
  const t = useRobotText();
  const experiment = experimentDocument(context.ports.data.robots?.value);
  const robotKindComposition = useRobotAssetKindComposition();
  const robotAssetCatalog = robotAssetProjection(context.ports.data['robot-assets']?.value);
  const experimentRuntime = experimentProcessRuntimeProjection(context.ports.data['robot-runtime']?.value);
  const targetId = context.executionTargetId || experimentRuntime?.targetId || 'local';
  const runtimeOwnerRunId = experimentWorkflowMemberOwnerRunId(
    experimentRuntime,ROBOT_RUNTIME_WORKFLOW_INSTANCE_ID,
  );
  const sourceBindings = experiment?.spec.robots ?? [];
  const sourceFingerprint = JSON.stringify({
    robots: sourceBindings,
    localizationOffset: experiment?.spec.localizationOffset ?? DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET,
  });
  const [draft,setDraft] = useState<RobotBindingsDraft>(() => draftFor(experiment));
  const [selectedIndex,setSelectedIndex] = useState<number | null>(null);
  const [robotSettingsOpen,setRobotSettingsOpen] = useState(false);
  const routeVisible = useProductRouteVisible();
  const [coordinateView,setCoordinateView] = useState<'origin' | 'starting-poses' | null>(null);
  const coordinateBaseRef = useRef<CoordinateAuthoringBase | null>(null);
  const [addingRobots,setAddingRobots] = useState(false);
  const [assetSearch,setAssetSearch] = useState('');
  const browseButtonRef = useRef<HTMLButtonElement | null>(null);
  const robotButtonRefs = useRef(new Map<string,HTMLButtonElement>());
  const [draggingAssetId,setDraggingAssetId] = useState('');
  const [persistError,setPersistError] = useState('');
  const assetSearchQuery = normalizeRobotAssetsSearchQuery(assetSearch);
  const draftRef = useRef(draft);
  const persistLockRef = useRef(false);
  const pendingBindingsRef = useRef<PendingRobotBindings | null>(null);
  const configuration = context.ports.authoring['robots-editor'];
  const offsetAuthoring = context.ports.authoring['world-origin-offset-editor'];
  const hostRefusal = configuration?.disabledReason
    || (!configuration?.connected ? t('Connect the Experiment Robots authoring port.') : '');
  const readOnlyReason = hostRefusal || context.disabledReason || '';
  // The domain opens the existing Edit draft on the first roster mutation.
  // Only actual authoring refusals make the gallery unavailable.
  const rosterLockedReason = readOnlyReason;
  const configurationRef = useRef(configuration);
  const offsetAuthoringRef = useRef(offsetAuthoring);
  const readOnlyReasonRef = useRef(readOnlyReason);
  const rosterLockedReasonRef = useRef(rosterLockedReason);
  configurationRef.current = configuration;
  offsetAuthoringRef.current = offsetAuthoring;
  readOnlyReasonRef.current = readOnlyReason;
  rosterLockedReasonRef.current = rosterLockedReason;

  function writeDraft(next: RobotBindingsDraft) {
    draftRef.current = next;
    setDraft(next);
  }

  useEffect(() => {
    if (!experiment) return;
    const current = draftRef.current;
    const changedExperiment = current.experimentResourceId !== experiment.head.resourceId;
    const dirty = JSON.stringify(current.bindings) !== JSON.stringify(current.baseline)
      || JSON.stringify(current.localizationOffset) !== JSON.stringify(current.baselineOffset);
    if (!changedExperiment && dirty) return;
    // A confirmed persist can return before the parent catalog render catches up.
    // Never roll that confirmed result back to an older prop snapshot.
    if (!changedExperiment && experiment.branch.headVersion < current.headVersion) return;
    if (!changedExperiment
      && current.headCommitId === experiment.branch.headCommitId
      && JSON.stringify({
        robots: current.baseline,
        localizationOffset: current.baselineOffset,
      }) === sourceFingerprint) return;
    writeDraft(draftFor(experiment));
    if (changedExperiment) {
      setSelectedIndex(null);
      setRobotSettingsOpen(false);
      coordinateBaseRef.current = null;
      setCoordinateView(null);
      setAddingRobots(false);
      setAssetSearch('');
    }
    setPersistError('');
  },[experiment,sourceFingerprint]);

  const selectedBinding = selectedIndex === null ? undefined : draft.bindings[selectedIndex];
  const usedAssets = useMemo(
    () => new Map(draft.bindings.map((binding,index) => [binding.ref.resourceId,index])),
    [draft.bindings],
  );
  const experimentCapableAssets = useMemo(
    () => robotAssetCatalog.assets.filter(
      (asset) => !experimentRobotAssetDisabledReason(asset, robotKindComposition),
    ),
    [robotAssetCatalog.assets, robotKindComposition],
  );
  const visibleAssets = useMemo(
    () => assetSearchQuery
      ? experimentCapableAssets.filter((asset) => robotAssetMatchesQuery(asset, assetSearchQuery, robotKindComposition))
      : experimentCapableAssets,
    [experimentCapableAssets, robotKindComposition, assetSearchQuery],
  );
  const orderedBindings = useMemo(
    () => draft.bindings.map((binding,index) => ({ binding,index }))
      .sort((left,right) => compareExperimentRobotBindingSlots(left.binding,right.binding)),
    [draft.bindings],
  );

  async function flushPersist() {
    if (persistLockRef.current) return;
    persistLockRef.current = true;
    try {
      while (pendingBindingsRef.current) {
        if (pendingBindingsRef.current) {
          const pending = pendingBindingsRef.current;
          pendingBindingsRef.current = null;
          const snapshot = pending.bindings;
          const authoring = configurationRef.current;
          const locked = readOnlyReasonRef.current;
          const current = draftRef.current;
          if (!authoring || locked) break;
          if (validateExperimentRobotBindings(snapshot, robotKindComposition)) break;
          if (JSON.stringify(snapshot) !== JSON.stringify(current.baseline)) {
            try {
              const saved = await authoring.commit(
                normalizeExperimentRobotBindings(snapshot, robotKindComposition),
                current.headCommitId,
                pending.reason,
              );
              writeDraft(applyPersistedDraft(draftRef.current,{ bindings:snapshot },experimentDocument(saved)));
              setPersistError('');
            } catch (cause) {
              pendingBindingsRef.current = null;
              rollbackPendingChanges();
              setPersistError(cause instanceof Error ? cause.message : String(cause));
              break;
            }
          }
        }

      }
    } finally {
      persistLockRef.current = false;
      if (pendingBindingsRef.current) void flushPersist();
    }
  }

  function updateBindings(bindings: ExperimentRobotBinding[], reason = UPDATE_ROBOTS_REASON) {
    if (readOnlyReasonRef.current) return;
    writeDraft({ ...draftRef.current,bindings });
    setPersistError('');
    pendingBindingsRef.current = { bindings,reason };
    void flushPersist();
  }


  function rollbackPendingChanges() {
    const current = draftRef.current;
    const bindings = structuredClone(current.baseline);
    writeDraft({
      ...current,
      bindings,
      localizationOffset:{ ...current.baselineOffset },
    });
    setSelectedIndex((selected) => {
      if (selected === null) return null;
      const selectedId = current.bindings[selected]?.ref.resourceId;
      if (!selectedId) return null;
      const restoredIndex = bindings.findIndex((binding) => binding.ref.resourceId === selectedId);
      return restoredIndex >= 0 ? restoredIndex : null;
    });
  }

  function updateSelected(binding: ExperimentRobotBinding) {
    if (selectedIndex === null) return;
    updateBindings(draftRef.current.bindings.map((item,index) => index === selectedIndex ? binding : item));
  }

  function selectRobot(index: number) {
    setSelectedIndex(index);
    setRobotSettingsOpen(true);
    coordinateBaseRef.current = null;
    setCoordinateView(null);
    setAddingRobots(false);
  }

  function addAsset(asset: RobotAssetDocument) {
    const current = draftRef.current;
    if (rosterLockedReasonRef.current
      || experimentRobotAssetDisabledReason(asset, robotKindComposition)
      || current.bindings.some((binding) => binding.ref.resourceId === asset.head.resourceId)) return;
    const next = newExperimentRobotBinding(asset, current.bindings, robotKindComposition);
    const bindings = [...current.bindings,next].sort(compareExperimentRobotBindingSlots);
    updateBindings(bindings);
    setSelectedIndex(bindings.indexOf(next));
  }

  function addDraggedAsset(resourceId: string) {
    const asset = robotAssetCatalog.assets.find((candidate) => candidate.head.resourceId === resourceId);
    if (asset) addAsset(asset);
    setDraggingAssetId('');
  }

  function removeRobot(index: number) {
    if (rosterLockedReasonRef.current) return;
    updateBindings(removeExperimentRobotAsset(
      draftRef.current.bindings,robotAssetCatalog.assets,index,robotKindComposition,
    ));
    setSelectedIndex(null);
  }

  function moveRobot(fromIndex: number, toIndex: number) {
    if (rosterLockedReasonRef.current) return;
    const currentBindings = draftRef.current.bindings;
    if (fromIndex < 0
      || fromIndex >= currentBindings.length
      || toIndex < 0
      || toIndex >= currentBindings.length
      || fromIndex === toIndex) return;
    const bindings = reorderExperimentRobotAssets(
      currentBindings,robotAssetCatalog.assets,fromIndex,toIndex,robotKindComposition,
    );
    if (JSON.stringify(bindings) === JSON.stringify(currentBindings)) return;
    updateBindings(bindings,REORDER_ROBOTS_REASON);
    setSelectedIndex(toIndex);
  }

  function openCoordinateView(view: 'origin' | 'starting-poses') {
    if (coordinateView === view) return;
    coordinateBaseRef.current = coordinateAuthoringBase(draftRef.current);
    setAddingRobots(false);
    setDraggingAssetId('');
    setCoordinateView(view);
  }

  async function saveCoordinateChange(change: { offset: ExperimentLocalizationOffset } | { bindings: readonly ExperimentRobotBinding[] }) {
    const current = draftRef.current;
    const coordinateBase = coordinateBaseRef.current;
    if (current.experimentResourceId !== experiment?.head.resourceId) {
      throw new Error(t('Experiment configuration is unavailable.'));
    }
    if (persistLockRef.current || pendingBindingsRef.current) {
      throw new Error(t('Wait for the current changes to finish saving.'));
    }
    if (!coordinateBase || JSON.stringify(coordinateBase) !== JSON.stringify(coordinateAuthoringBase(current))) {
      throw new Error(t('The Experiment configuration changed. Reopen coordinate settings before saving.'));
    }
    if (!experiment || configResourceDefinitionEditLocked(experiment.head,experiment.spec.tags)) {
      throw new Error(t('This Experiment is read only.'));
    }
    const authoring = 'offset' in change ? offsetAuthoringRef.current : configurationRef.current;
    if (!authoring?.connected) throw new Error(t('Experiment configuration is unavailable.'));
    persistLockRef.current = true;
    try {
      if ('offset' in change) {
        const saved = await authoring.commit(change.offset,current.headCommitId,UPDATE_WORLD_ORIGIN_OFFSET_REASON);
        const savedDocument = experimentDocument(saved);
        writeDraft(applyPersistedDraft(draftRef.current,{ localizationOffset:change.offset },savedDocument,current));
        if (coordinateBaseRef.current === coordinateBase) {
          coordinateBaseRef.current = coordinateAuthoringBase({
            ...current,
            headCommitId:savedDocument?.branch.headCommitId ?? current.headCommitId,
            localizationOffset:change.offset,
          });
        }
      } else {
        const poses = new Map(change.bindings.map((binding) => [binding.ref.resourceId,binding]));
        if (poses.size !== current.bindings.length || current.bindings.some((binding) => {
          const candidate = poses.get(binding.ref.resourceId);
          return !candidate || candidate.id !== binding.id || candidate.namespace !== binding.namespace;
        })) throw new Error(t('The Robot selection changed. Reopen starting poses.'));
        const bindings = current.bindings.map((binding) => ({ ...binding,initialPose:{ ...poses.get(binding.ref.resourceId)!.initialPose } }));
        if (JSON.stringify(bindings) === JSON.stringify(current.baseline)) return;
        const saved = await authoring.commit(normalizeExperimentRobotBindings(bindings,robotKindComposition),current.headCommitId,FILL_CURRENT_POSES_REASON);
        if (draftRef.current.experimentResourceId !== current.experimentResourceId) return;
        // An input callback can queue another edit while the commit is awaited.
        const pending = pendingBindingsRef.current as PendingRobotBindings | null;
        if (pending) {
          pendingBindingsRef.current = {
            ...pending,
            bindings:mergeSavedStartingPoses(pending.bindings,current.bindings,bindings),
          };
        }
        const savedDocument = experimentDocument(saved);
        writeDraft(applyPersistedDraft(draftRef.current,{ bindings },savedDocument,current));
        if (coordinateBaseRef.current === coordinateBase) {
          coordinateBaseRef.current = coordinateAuthoringBase({
            ...current,
            headCommitId:savedDocument?.branch.headCommitId ?? current.headCommitId,
            bindings,
          });
        }
      }
      setPersistError('');
    } finally {
      persistLockRef.current = false;
      if (pendingBindingsRef.current) void flushPersist();
    }
  }

  const runtimeSession = experimentRuntime?.sessionViews?.find((view) => (
    view.session.targetId === targetId && view.session.experimentResourceId === experiment?.head.resourceId
    && (view.session.state === 'opening' || view.session.state === 'active')
    && view.members.some((member) => member.ownerId === runtimeOwnerRunId)
  ));
  const selectedAsset = selectedBinding
    ? robotAssetCatalog.assets.find((asset) => asset.head.resourceId === selectedBinding.ref.resourceId)
    : undefined;
  const inspectorVisible = Boolean(routeVisible && robotSettingsOpen && selectedBinding && !addingRobots && !coordinateView);

  if (!experiment) {
    return <EmptyState appearance="plain" fill title={t('Experiment unavailable')} description={t('Select an Experiment to manage its Robot assets.')} />;
  }

  return (
    <section className="experiment-robot-assets-panel-root" data-xgc-role="experiment-robot-assets" data-xgc-id="experiment-robot-assets">
      <div className="experiment-robot-assets-panel-workspace" data-inspector-open={inspectorVisible ? 'true' : 'false'}>
        <ExperimentRobots
          panelId={panel.id}
          browseButtonRef={browseButtonRef}
          robotButtonRefs={robotButtonRefs.current}
          bindings={draft.bindings}
          orderedBindings={orderedBindings}
          assets={robotAssetCatalog.assets}
          selectedIndex={selectedIndex}
          disabled={Boolean(rosterLockedReason)}
          disabledReason={rosterLockedReason}
          draggingAssetId={draggingAssetId}
          onSelect={selectRobot}
          onBrowseAssets={() => { coordinateBaseRef.current = null;setCoordinateView(null);setAddingRobots(true); }}
          browsingAssets={addingRobots}
          onSelectWorldOrigin={() => openCoordinateView('origin')}
          onRemove={removeRobot}
          onMove={moveRobot}
          onAssetDrop={addDraggedAsset}
          onFillCurrentPoses={() => openCoordinateView('starting-poses')}
          feedbackError={persistError || robotAssetCatalog.error}
        />
        <aside
          hidden={!inspectorVisible}
          className="experiment-robot-assets-panel-inspector"
          data-xgc-role="experiment-robot-assets-robot-inspector"
          data-xgc-id={selectedBinding?.ref.resourceId ?? 'selection'}
          aria-label={t('Robot parameters')}
        >
          {selectedBinding && <div className="experiment-robot-assets-panel-inspector-heading" data-xgc-role="experiment-robot-assets-pane-header" data-xgc-id="parameters">
            <h2 data-xgc-role="experiment-robot-assets-pane-title" data-xgc-id="parameters">
              <span
                data-xgc-role="experiment-robot-assets-panel-current-robot"
                data-xgc-id={selectedBinding?.ref.resourceId ?? 'selection'}
              >{selectedAsset?.spec.name ?? t('Robot parameters')}</span>
            </h2>
            <ControlButton size="compact" iconOnly appearance="ghost"
              aria-label={t('Close Robot parameters')} title={t('Close Robot parameters')}
              data-xgc-role="experiment-robot-assets-robot-inspector-close"
              data-xgc-id={selectedBinding?.ref.resourceId ?? 'selection'}
              onClick={() => setRobotSettingsOpen(false)}
            ><X size={16} aria-hidden="true" /></ControlButton>
          </div>}
          <RobotForm
            binding={selectedBinding}
            index={selectedIndex}
            assets={robotAssetCatalog.assets}
            disabled={Boolean(readOnlyReason)}
            disabledReason={readOnlyReason}
            onChange={updateSelected}
          />
        </aside>
      </div>
      {addingRobots && (
        <ConfigDrawer
          open={routeVisible}
          ariaLabel={t('Add robots')}
          title={<span data-xgc-role="experiment-robot-assets-pane-title" data-xgc-id="assets">{t('Add robots')}</span>}
          className="config-drawer-wide experiment-robot-assets-picker-drawer"
          dataXgcRole="experiment-robot-assets-picker-drawer" dataXgcId="assets"
          closeDataXgcRole="experiment-robot-assets-picker-close" closeDataXgcId="assets"
          closeLabel={t('Close drawer')}
          closeOnBackdrop
          onClose={() => {
            setAddingRobots(false);
            setDraggingAssetId('');
            browseButtonRef.current?.focus();
          }}
        >
          <AssetCatalog
            assets={experimentCapableAssets}
            visibleAssets={visibleAssets}
            catalogError={robotAssetCatalog.error}
            loading={robotAssetCatalog.loading}
            usedAssets={usedAssets}
            selectedIndex={selectedIndex}
            search={assetSearch}
            onSearchChange={setAssetSearch}
            searching={Boolean(assetSearchQuery)}
            disabled={Boolean(rosterLockedReason)}
            disabledReason={rosterLockedReason}
            onAdd={addAsset}
            onSelectBound={(index) => {
              const resourceId = draftRef.current.bindings[index]?.ref.resourceId;
              selectRobot(index);
              (resourceId ? robotButtonRefs.current.get(resourceId) ?? browseButtonRef.current : browseButtonRef.current)?.focus();
            }}
            draggingAssetId={draggingAssetId}
            onDragStart={setDraggingAssetId}
            onDragEnd={() => setDraggingAssetId('')}
          />
        </ConfigDrawer>
      )}
      {coordinateView && (
        <ExperimentCoordinateDrawer
          key={coordinateView}
          view={coordinateView}
          visible={routeVisible}
          targetId={targetId}
          runId={runtimeSession ? runtimeOwnerRunId : undefined}
          runMode={runtimeSession?.session.runMode ?? ''}
          experimentResourceId={experiment.head.resourceId}
          bindings={draft.bindings}
          assets={robotAssetCatalog.assets}
          offset={draft.localizationOffset}
          editing={context.editing}
          disabledReason={configResourceDefinitionEditLocked(experiment.head,experiment.spec.tags)
            ? t('This Experiment is read only.')
            : coordinateView === 'origin' ? offsetAuthoring?.disabledReason || (!offsetAuthoring?.connected ? t('Experiment configuration is unavailable.') : '')
              : !configuration?.connected ? t('Experiment configuration is unavailable.') : ''}
          onSaveOrigin={(offset) => saveCoordinateChange({ offset })}
          onSavePoses={(bindings) => saveCoordinateChange({ bindings })}
          onClose={() => { coordinateBaseRef.current = null;setCoordinateView(null); }}
        />
      )}
    </section>
  );
}

function AssetCatalog({
  assets,
  visibleAssets,
  catalogError,
  loading,
  usedAssets,
  selectedIndex,
  search,
  onSearchChange,
  searching,
  disabled,
  disabledReason,
  onAdd,
  onSelectBound,
  draggingAssetId,
  onDragStart,
  onDragEnd,
}: {
  assets: readonly RobotAssetDocument[];
  visibleAssets: readonly RobotAssetDocument[];
  catalogError: string;
  loading: boolean;
  usedAssets: ReadonlyMap<string,number>;
  selectedIndex: number | null;
  search: string;
  onSearchChange: (value: string) => void;
  searching: boolean;
  disabled: boolean;
  disabledReason: string;
  onAdd: (asset: RobotAssetDocument) => void;
  onSelectBound: (index: number) => void;
  draggingAssetId: string;
  onDragStart: (resourceId: string) => void;
  onDragEnd: () => void;
}) {
  const t = useRobotText();
  const motion = useProductRouteVisible();
  const robotKindComposition = useRobotAssetKindComposition();
  const searchSlotRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading) searchSlotRef.current?.querySelector('input')?.focus();
  },[loading]);
  return (
    <section
      className="experiment-robot-assets-panel-catalog"
      data-xgc-role="experiment-robot-assets-picker" data-xgc-id="assets"
      aria-busy={loading || undefined}
    >
      <div className="experiment-robot-assets-panel-picker-content" inert={loading} aria-hidden={loading || undefined}>
        <div ref={searchSlotRef} className="experiment-robot-assets-panel-list-toolbar" data-xgc-role="experiment-robot-assets-picker-toolbar" data-xgc-id="assets">
          <SearchControl
            className="experiment-robot-assets-panel-search"
            size="compact" value={search}
            placeholder={t('Search assets')} ariaLabel={t('Search assets')}
            dataXgcRole="experiment-robot-assets-picker-search" dataXgcId="assets"
            onChange={onSearchChange}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();event.stopPropagation();onSearchChange('');
            }}
          />
        </div>
        <div className="experiment-robot-assets-panel-scroll experiment-robot-assets-panel-item-list">
          {assets.length === 0 && !loading && (
            <EmptyState
              appearance="plain"
              fill
              title={catalogError ? t('Unable to load Robot assets') : t('No Robot assets')}
              description={catalogError || t('Create hardware Robots in Configuration before adding them to an Experiment.')}
            />
          )}
          {searching && assets.length > 0 && visibleAssets.length === 0 && (
            <EmptyState
              density="compact"
              appearance="plain"
              fill
              title={t('No matching assets')}
              description={t('Try another name, kind, or model, or press Escape to clear the search.')}
              data-xgc-role="experiment-robot-assets-search-empty"
              data-xgc-id="assets"
            />
          )}
          {visibleAssets.map((asset) => {
            const experimentIndex = usedAssets.get(asset.head.resourceId);
            const available = experimentIndex === undefined;
            const selected = !available && selectedIndex === experimentIndex;
            const attributes = robotAssetOverviewAttributes(asset,robotKindComposition);
            const address = attributes.find((attribute) => attribute.id === 'remote-ip')?.value;
            const model = attributes.find((attribute) => attribute.id === 'model')?.value
              || robotAssetKindLabel(asset,robotKindComposition);
            return (
              <ControlButton
                appearance={selected ? 'default' : 'ghost'}
                className="experiment-robot-assets-panel-asset-card experiment-robot-portrait-host"
                key={asset.head.resourceId}
                disabled={loading || (available && disabled)}
                draggable={available && !disabled ? true : undefined}
                aria-label={available
                  ? t('Add {name} to Experiment',{ name:asset.spec.name })
                  : t('Open {name} settings',{ name:asset.spec.name })}
                aria-current={selected ? 'true' : undefined}
                title={available
                  ? (disabled ? disabledReason || t('Click or drag to add') : t('Click or drag to add'))
                  : t('Open Robot settings')}
                dataXgcRole={available ? 'experiment-robot-asset-add' : 'experiment-robot-asset-added'}
                dataXgcId={asset.head.resourceId}
                data-xgc-dragging={draggingAssetId === asset.head.resourceId ? 'true' : undefined}
                onClick={() => available ? onAdd(asset) : onSelectBound(experimentIndex)}
                onDragStart={(event) => {
                  if (!available || disabled) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData(ROBOT_ASSET_DRAG_MIME,asset.head.resourceId);
                  onDragStart(asset.head.resourceId);
                }}
                onDragEnd={onDragEnd}
              >
                <span className="experiment-robot-assets-panel-robot-mark" aria-hidden="true">
                  <ExperimentRobotPortrait family={portraitFamily(robotAssetChassisClass(asset.spec,robotKindComposition))} selected={selected} motion={motion} />
                </span>
                <span className="experiment-robot-assets-panel-asset-name">{asset.spec.name}</span>
                <span className="experiment-robot-assets-panel-asset-summary"
                  data-xgc-role="experiment-robot-asset-summary" data-xgc-id={asset.head.resourceId}
                >
                  {address && <span className="experiment-robot-assets-panel-asset-address">{address}</span>}
                  <span>{model}</span>
                </span>
                {!available && <Check className="experiment-robot-assets-panel-asset-check" size={14} aria-hidden="true" />}
              </ControlButton>
            );
          })}
        </div>
      </div>
      {loading && <WorkspaceBusyOverlay id="experiment-robot-assets-picker" label={t('Loading assets')} />}
    </section>
  );
}

function ExperimentRobots({
  panelId,
  browseButtonRef,
  robotButtonRefs,
  bindings,
  orderedBindings,
  assets,
  selectedIndex,
  disabled,
  disabledReason: _disabledReason,
  draggingAssetId,
  onSelect,
  onBrowseAssets,
  browsingAssets,
  onSelectWorldOrigin,
  onRemove,
  onMove,
  onAssetDrop,
  onFillCurrentPoses,
  feedbackError,
}: {
  panelId: string;
  browseButtonRef: { current: HTMLButtonElement | null };
  robotButtonRefs: Map<string,HTMLButtonElement>;
  bindings: readonly ExperimentRobotBinding[];
  orderedBindings: readonly { binding: ExperimentRobotBinding; index: number }[];
  assets: readonly RobotAssetDocument[];
  selectedIndex: number | null;
  disabled: boolean;
  disabledReason: string;
  draggingAssetId: string;
  onSelect: (index: number) => void;
  onBrowseAssets: () => void;
  browsingAssets: boolean;
  onSelectWorldOrigin: () => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number,toIndex: number) => void;
  onAssetDrop: (resourceId: string) => void;
  onFillCurrentPoses: () => void;
  feedbackError: string;
}) {
  const t = useRobotText();
  const robotKindComposition = useRobotAssetKindComposition();
  const motion = useProductRouteVisible();
  const [dropActive,setDropActive] = useState(false);
  const [draggingRobotAssetId,setDraggingRobotAssetId] = useState('');
  const [dropTargetIndex,setDropTargetIndex] = useState<number | null>(null);
  const dragDepthRef = useRef(0);


  useEffect(() => {
    if (!draggingAssetId) {
      dragDepthRef.current = 0;
      setDropActive(false);
    }
  },[draggingAssetId]);

  useEffect(() => {
    if (disabled
      || !bindings.some((binding) => binding.ref.resourceId === draggingRobotAssetId)) {
      setDraggingRobotAssetId('');
      setDropTargetIndex(null);
    }
  },[bindings,disabled,draggingRobotAssetId]);

  function acceptAssetDrop(event: ReactDragEvent<HTMLElement>) {
    if (disabled
      || !draggingAssetId
      || !Array.from(event.dataTransfer.types).includes(ROBOT_ASSET_DRAG_MIME)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  }

  return (
    <section
      className="experiment-robot-assets-panel-pane experiment-robot-assets-panel-collection"
      data-drag-available={draggingAssetId && !disabled ? 'true' : undefined}
      data-drop-active={dropActive ? 'true' : undefined}
      onDragEnter={(event) => {
        if (!acceptAssetDrop(event)) return;
        dragDepthRef.current += 1;
        setDropActive(true);
      }}
      onDragOver={acceptAssetDrop}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDropActive(false);
      }}
      onDrop={(event) => {
        if (!acceptAssetDrop(event)) return;
        dragDepthRef.current = 0;
        setDropActive(false);
        const resourceId = event.dataTransfer.getData(ROBOT_ASSET_DRAG_MIME);
        if (resourceId) onAssetDrop(resourceId);
      }}
    >
      {draggingAssetId && !disabled && (
        <div className="experiment-robot-assets-panel-drop-overlay" aria-hidden="true">
          <span><Plus size={18} /></span>
          <strong>{dropActive ? t('Release to add') : t('Drop to add')}</strong>
        </div>
      )}
      <ExperimentCoordinateScene onOpenOrigin={onSelectWorldOrigin} onOpenStartingPoses={onFillCurrentPoses} motion={motion} />
      <div className="experiment-robot-assets-panel-scroll experiment-robot-assets-panel-item-list">
        {fleetGroupOrder(orderedBindings).map((groupLabel) => {
          const groupId = groupLabel.toLowerCase();
          const groupItems = orderedBindings.filter(({ binding }) => fleetGroupLabel(binding) === groupLabel);
          return (
            <Fragment key={groupId}>
              <div
                className="experiment-robot-assets-panel-group"
                data-xgc-role="experiment-robot-assets-group"
                data-xgc-id={groupId}
              >
                <h2
                  className="experiment-robot-assets-panel-group-label"
                  data-xgc-role="experiment-robot-assets-group-label"
                  data-xgc-id={groupId}
                >{t(groupLabel)}</h2>
                <ControlButton
                  className="experiment-robot-assets-panel-group-add"
                  iconOnly
                  size="compact"
                  appearance="ghost"
                  dataXgcRole="experiment-robot-assets-browse"
                  dataXgcId={groupId}
                  aria-label={t('Add robots')}
                  title={t('Add robots')}
                  aria-pressed={browsingAssets}
                  onClick={(event) => {
                    browseButtonRef.current = event.currentTarget;
                    onBrowseAssets();
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                </ControlButton>
              </div>
              {groupItems.map(({ binding,index }) => {
          const asset = assets.find((item) => item.head.resourceId === binding.ref.resourceId);
          const disabledReason = asset
            ? experimentRobotAssetDisabledReason(asset, robotKindComposition)
            : '';
          const assetName = asset?.spec.name ?? t('Missing Robot asset');
          const assignmentName = experimentRobotAssignmentLabel(binding,assetName);
          const slotGroup = experimentRobotSlotGroup(binding);
          const slotGroupIndexes = bindings.flatMap((candidate,candidateIndex) => (
            experimentRobotSlotGroup(candidate) === slotGroup ? [candidateIndex] : []
          ));
          const slotGroupPosition = slotGroupIndexes.indexOf(index);
          const previousSlotIndex = slotGroupIndexes[slotGroupPosition - 1];
          const nextSlotIndex = slotGroupIndexes[slotGroupPosition + 1];
          const reorderable = !disabled && slotGroupIndexes.length > 1;
          const reorderDisabledReason = disabled ? _disabledReason : '';
          const draggedBinding = bindings.find((candidate) => candidate.ref.resourceId === draggingRobotAssetId);
          const targetSlot = draggedBinding && draggedBinding !== binding
            && experimentRobotSlotGroup(draggedBinding) === slotGroup
            ? experimentRobotRoleLabel(binding) : '';
          const draggedName = assets.find((candidate) => candidate.head.resourceId === draggingRobotAssetId)?.spec.name;
          return (
              <article
                key={binding.ref.resourceId}
                className="experiment-robot-assets-panel-robot-card"
                data-selected={selectedIndex === index ? 'true' : undefined}
                data-xgc-dragging={draggingRobotAssetId === binding.ref.resourceId ? 'true' : undefined}
                data-xgc-drop-target={dropTargetIndex === index ? 'true' : undefined}
                title={targetSlot && draggedName ? t('Move {name} to {slot}',{ name:draggedName,slot:targetSlot }) : undefined}
                data-xgc-role="experiment-robot-assets-panel-robot"
                data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                data-xgc-state={disabledReason ? 'known-disabled' : undefined}
                data-scene-depth={index % 2 === 0 ? 'near' : 'far'}
                onDragOver={(event) => {
                  const sourceId = event.dataTransfer.getData(ROBOT_ASSIGNMENT_DRAG_MIME)
                    || draggingRobotAssetId;
                  const source = bindings.find((candidate) => candidate.ref.resourceId === sourceId);
                  if (!reorderable || !sourceId || sourceId === binding.ref.resourceId
                    || !source || experimentRobotSlotGroup(source) !== slotGroup) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTargetIndex(index);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  if (dropTargetIndex === index) setDropTargetIndex(null);
                }}
                onDrop={(event) => {
                  const sourceId = event.dataTransfer.getData(ROBOT_ASSIGNMENT_DRAG_MIME)
                    || draggingRobotAssetId;
                  const sourceIndex = bindings.findIndex((candidate) => candidate.ref.resourceId === sourceId);
                  if (!reorderable || sourceIndex < 0 || sourceIndex === index
                    || experimentRobotSlotGroup(bindings[sourceIndex]!) !== slotGroup) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDraggingRobotAssetId('');
                  setDropTargetIndex(null);
                  onMove(sourceIndex,index);
                }}
              >
                <button
                  ref={(button) => {
                    const id = asset?.head.resourceId ?? binding.ref.resourceId;
                    if (button) robotButtonRefs.set(id,button);
                    else robotButtonRefs.delete(id);
                  }}
                  className="experiment-robot-assets-panel-robot-select experiment-robot-portrait-host"
                  type="button"
                  data-xgc-role="experiment-robot-assets-panel-robot-select"
                  data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                  aria-label={assignmentName}
                  aria-pressed={selectedIndex === index}
                  draggable={reorderable ? true : undefined}
                  title={targetSlot && draggedName ? t('Move {name} to {slot}',{ name:draggedName,slot:targetSlot })
                    : reorderable ? t('Drag {name} to another slot',{ name:assetName }) : undefined}
                  onDragStart={(event) => {
                    if (!reorderable) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(ROBOT_ASSIGNMENT_DRAG_MIME,binding.ref.resourceId);
                    setDraggingRobotAssetId(binding.ref.resourceId);
                    setDropTargetIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggingRobotAssetId('');
                    setDropTargetIndex(null);
                  }}
                  onClick={() => onSelect(index)}
                >
                  <span className="experiment-robot-assets-panel-robot-mark" aria-hidden="true">
                    <ExperimentRobotPortrait family={portraitFamily(asset ? robotAssetChassisClass(asset.spec,robotKindComposition) : undefined)} selected={selectedIndex === index} variant={index} motion={motion} />
                  </span>
                  <span className="experiment-robot-assets-panel-robot-copy">
                    <span className="experiment-robot-assets-panel-slot-name">{experimentRobotRoleLabel(binding)}</span>
                    <strong className="experiment-robot-assets-panel-assignment-name">{assetName}</strong>
                    {disabledReason && (
                      <span className="experiment-robot-assets-panel-robot-note" title={t(disabledReason)}>
                        {t('Not enabled for Experiments')}
                      </span>
                    )}
                  </span>
                </button>
                <div className="experiment-robot-assets-panel-robot-actions">
                  <ControlButton
                    iconOnly
                    size="compact"
                    appearance="ghost"
                    aria-label={t('Move {name} up',{ name:assetName })}
                    title={reorderDisabledReason || t('Move up')}
                    disabled={!reorderable || previousSlotIndex === undefined}
                    dataXgcRole="experiment-robot-assets-panel-robot-move-up"
                    dataXgcId={asset?.head.resourceId ?? binding.ref.resourceId}
                    onClick={() => previousSlotIndex !== undefined && onMove(index,previousSlotIndex)}
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    iconOnly
                    size="compact"
                    appearance="ghost"
                    aria-label={t('Move {name} down',{ name:assetName })}
                    title={reorderDisabledReason || t('Move down')}
                    disabled={!reorderable || nextSlotIndex === undefined}
                    dataXgcRole="experiment-robot-assets-panel-robot-move-down"
                    dataXgcId={asset?.head.resourceId ?? binding.ref.resourceId}
                    onClick={() => nextSlotIndex !== undefined && onMove(index,nextSlotIndex)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </ControlButton>
                  <ControlButton
                    iconOnly
                    size="compact"
                    tone="danger"
                    appearance="ghost"
                    aria-label={t('Remove {name} from Experiment',{ name:assetName })}
                    title={disabled ? _disabledReason : undefined}
                    disabled={disabled}
                    dataXgcRole="experiment-robot-assets-panel-robot-remove"
                    dataXgcId={asset?.head.resourceId ?? binding.ref.resourceId}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </ControlButton>
                </div>
              </article>
          );
              })}
            </Fragment>
          );
        })}
      </div>
      <div className="experiment-robot-assets-panel-feedback" data-xgc-role="experiment-robot-assets-feedback" data-xgc-id={panelId} role="status" title={feedbackError || undefined}>
        {feedbackError ? (
          <StatusText status="error" data-xgc-role="experiment-robot-assets-panel-persist-error" data-xgc-id={panelId}>
            {feedbackError}
          </StatusText>
        ) : null}
      </div>
    </section>
  );
}

function RobotForm({
  binding,
  index,
  assets,
  disabled,
  disabledReason,
  onChange,
}: {
  binding?: ExperimentRobotBinding;
  index: number | null;
  assets: readonly RobotAssetDocument[];
  disabled: boolean;
  disabledReason: string;
  onChange: (binding: ExperimentRobotBinding) => void;
}) {
  const t = useRobotText();
  const robotKindComposition = useRobotAssetKindComposition();
  const currentAsset = binding
    ? assets.find((asset) => asset.head.resourceId === binding.ref.resourceId)
    : undefined;
  const experimentDisabledReason = currentAsset
    ? experimentRobotAssetDisabledReason(currentAsset, robotKindComposition)
    : '';
  const disabledRobotState = experimentDisabledReason && currentAsset ? (
    <EmptyState
      appearance="plain"
      fill
      title={t('Robot not enabled for Experiments')}
      description={t('{reason} Remove this stored binding or add another Experiment-capable Robot.',{
        reason:t(experimentDisabledReason),
      })}
      data-xgc-role="experiment-robot-admission-known-disabled"
      data-xgc-id="parameters"
    />
  ) : null;

  if (!binding || index === null) return null;
  if (experimentDisabledReason && currentAsset) return disabledRobotState;

  return (
    <section className="experiment-robot-assets-panel-form"
      data-xgc-role="experiment-robot-assets-robot-parameters" data-xgc-id={binding.ref.resourceId}
    >
      <div className="experiment-robot-assets-panel-scroll experiment-robot-assets-panel-fields">
        {binding && !experimentDisabledReason && (
        <section
          className="experiment-robot-assets-panel-settings-group"
          data-xgc-role="experiment-robot-assets-panel-settings-group"
          data-xgc-id="starting-pose"
        >
          <header
            data-xgc-role="experiment-robot-assets-panel-settings-group-header"
            data-xgc-id="starting-pose"
          >
            <strong
              data-xgc-role="experiment-robot-assets-panel-settings-group-title"
              data-xgc-id="starting-pose"
            >{t('Starting pose')}</strong>
          </header>
          {/*
            Dual-column pose: Vector3Control for authored XYZ, existing yaw in
            the orientation slot. ExperimentRobotBinding.initialPose has no
            roll/pitch, so this pane must not invent R/P cells.
          */}
          <div
            className="experiment-robot-assets-panel-pose-fields"
            data-xgc-role="experiment-robot-assets-panel-pose-fields"
            data-xgc-id="starting-pose"
            title={disabled ? disabledReason : undefined}
          >
            <PosePositionXyzField
              values={binding.initialPose}
              disabled={disabled}
              fieldRole="experiment-robot-assets-panel-pose-position"
              fieldId="starting-pose"
              vectorRole="experiment-robot-assets-panel-pose-xyz"
              axisRolePrefix="experiment-robot-assets-panel-pose"
              onAxisChange={(key, next) => onChange({
                ...binding,
                initialPose: {
                  ...binding.initialPose,
                  [key]: next,
                },
              })}
            />
            <FormField
              className="experiment-robot-assets-panel-pose-field"
              label={t('Yaw')}
              dataXgcRole="experiment-robot-assets-panel-pose-attitude"
              dataXgcId="starting-pose"
            >
              <InputControl
                className="experiment-robot-assets-panel-pose-control"
                type="number"
                unit="rad"
                step="any"
                value={String(finiteNumberValue(binding.initialPose.yaw))}
                disabled={disabled}
                title={disabled ? disabledReason : undefined}
                aria-label={t('Yaw')}
                dataXgcRole="experiment-robot-assets-panel-pose-yaw"
                dataXgcId="starting-pose"
                onChange={(next) => onChange({
                  ...binding,
                  initialPose: {
                    ...binding.initialPose,
                    yaw: next.trim() === '' ? Number.NaN : Number(next),
                  },
                })}
              />
            </FormField>
          </div>
        </section>
        )}
        {binding && !experimentDisabledReason && (
        <section
          className="experiment-robot-assets-panel-settings-group"
          data-xgc-role="experiment-robot-assets-panel-settings-group"
          data-xgc-id="experiment-setup"
        >
          <header
            data-xgc-role="experiment-robot-assets-panel-settings-group-header"
            data-xgc-id="experiment-setup"
          >
            <strong
              data-xgc-role="experiment-robot-assets-panel-settings-group-title"
              data-xgc-id="experiment-setup"
            >{t('Experiment setup')}</strong>
          </header>
          <div className="experiment-robot-assets-panel-field-grid">
            {!currentAsset && (
            <FormField
              className="experiment-robot-assets-panel-field"
              label={t('Hardware Robot')}
              dataXgcRole="experiment-robot-assets-panel-selected-asset-field"
              dataXgcId={binding.ref.resourceId}
            >
              <SelectControl
                fill
                value={binding.ref.resourceId}
                options={[{
                  value: binding.ref.resourceId,
                  label: t('Missing · {id}',{ id:binding.ref.resourceId }),
                }]}
                disabled
                onChange={() => undefined}
                ariaLabel={t('Hardware Robot')}
                dataXgcRole="experiment-robot-assets-panel-selected-asset"
                dataXgcId={binding.ref.resourceId}
              />
            </FormField>
            )}
            <FormField
              className="experiment-robot-assets-panel-field"
              label={t('Experiment slot')}
              dataXgcRole="experiment-robot-assets-panel-slot-field"
              dataXgcId={binding.ref.resourceId}
            >
              <InputControl
                value={experimentRobotRoleLabel(binding)}
                disabled
                title={t('Experiment slots stay sequential; reorder Robot assets between slots.')}
                aria-label={t('Experiment slot')}
                dataXgcRole="experiment-robot-assets-panel-slot"
                dataXgcId={binding.ref.resourceId}
              />
            </FormField>
            <TextField
              label={t('ROS namespace')}
              value={binding.namespace}
              disabled={disabled}
              disabledReason={disabledReason}
              dataXgcRole="experiment-robot-assets-panel-ros-namespace"
              dataXgcId={binding.ref.resourceId}
              inputRole="experiment-robot-assets-panel-namespace"
              onChange={(namespace) => onChange({ ...binding,namespace })}
            />
            <FormField
              className="experiment-robot-assets-panel-field"
              label={t('Hybrid source')}
              tooltip={t('Used when the Session runMode is hybrid. Simulation and physical Sessions run every Robot from one source and ignore this field.')}
              dataXgcRole="experiment-robot-assets-panel-hybrid-source-field"
              dataXgcId={binding.ref.resourceId}
            >
              <span title={disabled ? disabledReason : undefined}>
                <SelectControl
                  fill
                  value={binding.hybridSource}
                  options={(['simulation','physical'] as const).map((source) => ({
                    value: source,
                    label: t(source === 'simulation' ? 'Simulation source' : 'Physical source'),
                  }))}
                  disabled={disabled}
                  onChange={(hybridSource) => onChange({
                    ...binding,
                    hybridSource: hybridSource as ExperimentHybridSource,
                  })}
                  ariaLabel={t('Hybrid source')}
                  dataXgcRole="experiment-robot-assets-panel-hybrid-source"
                  dataXgcId={binding.ref.resourceId}
                />
              </span>
            </FormField>
          </div>
        </section>
        )}
        {/*
          PX4 transport identity (MAV system ID, physical and simulation ports)
          is owned entirely by the Robot asset. Experiment authoring keeps only
          higher-level, experiment-varying facts: role, namespace, Hybrid source, pose.
        */}
        {binding?.scout && !experimentDisabledReason && (
          <section
            className="experiment-robot-assets-panel-settings-group"
            data-xgc-role="experiment-robot-assets-panel-settings-group"
            data-xgc-id="simulated-sensors"
          >
            <header
              data-xgc-role="experiment-robot-assets-panel-settings-group-header"
              data-xgc-id="simulated-sensors"
            >
              <strong
                data-xgc-role="experiment-robot-assets-panel-settings-group-title"
                data-xgc-id="simulated-sensors"
              >{t('Simulated sensors')}</strong>
            </header>
            <div className="experiment-robot-assets-panel-switches" title={disabled ? disabledReason : undefined}>
              <SwitchControl className="experiment-robot-assets-panel-sensor-switch" checked={binding.scout.lidarSimulationEnabled} disabled={disabled} label={t('Simulate LiDAR')} onChange={(lidarSimulationEnabled) => onChange({ ...binding,scout: { ...binding.scout!,lidarSimulationEnabled } })} />
              <SwitchControl className="experiment-robot-assets-panel-sensor-switch" checked={binding.scout.imageSimulationEnabled} disabled={disabled} label={t('Simulate camera and depth')} onChange={(imageSimulationEnabled) => onChange({ ...binding,scout: { ...binding.scout!,imageSimulationEnabled } })} />
            </div>
          </section>
        )}
        {currentAsset && !experimentDisabledReason && (
          <RobotAssetParametersCard asset={currentAsset} />
        )}
      </div>
    </section>
  );
}

const POSE_XYZ_KEYS = ['x', 'y', 'z'] as const;
const POSE_XYZ_ARIA = {
  x: 'X east',
  y: 'Y north',
  z: 'Z up',
} as const;

function PosePositionXyzField({
  values,
  disabled,
  fieldRole,
  fieldId,
  vectorRole,
  axisRolePrefix,
  tooltip,
  onAxisChange,
}: {
  values: { x: number; y: number; z: number };
  disabled: boolean;
  fieldRole: string;
  fieldId: string;
  vectorRole: string;
  axisRolePrefix: string;
  tooltip?: string;
  onAxisChange: (key: 'x' | 'y' | 'z', next: number) => void;
}) {
  const t = useRobotText();
  const axes = POSE_XYZ_KEYS.map((key) => ({
    label: key.toUpperCase(),
    value: finiteNumberValue(values[key]),
    step: 0.1,
    ariaLabel: t(POSE_XYZ_ARIA[key]),
    dataXgcRole: `${axisRolePrefix}-${key}`,
    dataXgcId: `${fieldId}:${key}`,
  }));
  return (
    <FormField
      className="experiment-robot-assets-panel-pose-field"
      label={t('Position')}
      tooltip={tooltip}
      dataXgcRole={fieldRole}
      dataXgcId={fieldId}
    >
      <Vector3Control
        className="experiment-robot-assets-panel-pose-control"
        unit="m"
        disabled={disabled}
        dataXgcRole={vectorRole}
        dataXgcId={fieldId}
        axes={[axes[0], axes[1], axes[2]]}
        onValueChange={(axis, next) => {
          const key = POSE_XYZ_KEYS[axis];
          onAxisChange(key, next.trim() === '' ? Number.NaN : Number(next));
        }}
      />
    </FormField>
  );
}

function RobotAssetParametersCard({ asset }: { asset: RobotAssetDocument }) {
  const t = useRobotText();
  const robotKindComposition = useRobotAssetKindComposition();
  const attributes = robotAssetOverviewAttributes(asset,robotKindComposition);
  const configureLabel = t('Configure {name} Robot asset',{ name:asset.spec.name });
  return (
    <section
      className="experiment-robot-assets-panel-settings-group experiment-robot-assets-panel-asset-parameters-card"
      data-xgc-role="experiment-robot-assets-panel-asset-parameters"
      data-xgc-id={asset.head.resourceId}
    >
      <header data-xgc-role="experiment-robot-assets-panel-settings-group-header" data-xgc-id="asset-parameters">
        <strong
          data-xgc-role="experiment-robot-assets-panel-settings-group-title"
          data-xgc-id="asset-parameters"
        >{t('Asset parameters')}</strong>
        <ControlLink
          iconOnly
          size="compact"
          appearance="ghost"
          href={robotAssetDocumentHash(asset.head.resourceId)}
          aria-label={configureLabel}
          title={configureLabel}
          dataXgcRole="experiment-robot-assets-panel-asset-configure"
          dataXgcId={asset.head.resourceId}
        >
          <Settings size={14} aria-hidden="true" />
        </ControlLink>
      </header>
      <div className="experiment-robot-assets-panel-asset-parameters-grid">
        {attributes.map((attribute) => (
          <FormField
            className="experiment-robot-assets-panel-field"
            key={attribute.id}
            label={t(attribute.label)}
            dataXgcRole="experiment-robot-assets-panel-asset-parameter"
            dataXgcId={attribute.id}
          >
            <InputControl
              value={attribute.value}
              disabled
              title={configureLabel}
              aria-label={t(attribute.label)}
            />
          </FormField>
        ))}
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  disabled,
  disabledReason,
  dataXgcRole,
  dataXgcId,
  inputRole,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  disabledReason: string;
  dataXgcRole: string;
  dataXgcId: string;
  inputRole: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField
      className="experiment-robot-assets-panel-field"
      label={label}
      dataXgcRole={dataXgcRole}
      dataXgcId={dataXgcId}
    >
      <InputControl
        value={value}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        dataXgcRole={inputRole}
        dataXgcId={dataXgcId}
        onChange={onChange}
      />
    </FormField>
  );
}

function finiteNumberValue(value: number) {
  return Number.isFinite(value) ? value : '';
}

function applyPersistedDraft(
  current: RobotBindingsDraft,
  persisted: {
    bindings?: ExperimentRobotBinding[];
    localizationOffset?: ExperimentLocalizationOffset;
  },
  saved: ExperimentDocument | undefined,
  submitted?: RobotBindingsDraft,
): RobotBindingsDraft {
  if (submitted && submitted.experimentResourceId !== current.experimentResourceId) return current;
  const next: RobotBindingsDraft = {
    ...current,
    experimentResourceId: saved?.head.resourceId ?? current.experimentResourceId,
    headCommitId: saved?.branch.headCommitId ?? current.headCommitId,
    headVersion: saved?.branch.headVersion ?? current.headVersion,
  };
  if (persisted.bindings) {
    const pendingLocal = JSON.stringify(current.bindings) !== JSON.stringify(persisted.bindings);
    next.baseline = structuredClone(persisted.bindings);
    next.bindings = submitted
      ? mergeSavedStartingPoses(current.bindings,submitted.bindings,persisted.bindings)
      : pendingLocal ? current.bindings : structuredClone(persisted.bindings);
  }
  if (persisted.localizationOffset) {
    const pendingLocal = JSON.stringify(current.localizationOffset)
      !== JSON.stringify(submitted?.localizationOffset ?? persisted.localizationOffset);
    next.baselineOffset = { ...persisted.localizationOffset };
    next.localizationOffset = pendingLocal ? current.localizationOffset : { ...persisted.localizationOffset };
  }
  return next;
}

/** Rebase only saved pose axes that were not edited again while Save was pending. */
function mergeSavedStartingPoses(
  current: readonly ExperimentRobotBinding[],
  submitted: readonly ExperimentRobotBinding[],
  saved: readonly ExperimentRobotBinding[],
): ExperimentRobotBinding[] {
  return current.map((binding) => {
    const before = submitted.find((candidate) => candidate.id === binding.id && candidate.ref.resourceId === binding.ref.resourceId);
    const persisted = saved.find((candidate) => candidate.id === binding.id && candidate.ref.resourceId === binding.ref.resourceId);
    if (!before || !persisted) return binding;
    const initialPose = { ...binding.initialPose };
    for (const axis of ['x','y','z','yaw'] as const) {
      if (binding.initialPose[axis] === before.initialPose[axis]) initialPose[axis] = persisted.initialPose[axis];
    }
    return { ...binding,initialPose };
  });
}

function coordinateAuthoringBase(draft: CoordinateAuthoringBase): CoordinateAuthoringBase {
  return {
    experimentResourceId:draft.experimentResourceId,
    headCommitId:draft.headCommitId,
    bindings:structuredClone(draft.bindings),
    localizationOffset:{ ...draft.localizationOffset },
  };
}

function draftFor(experiment: ExperimentDocument | undefined): RobotBindingsDraft {
  const bindings = structuredClone(experiment?.spec.robots ?? []);
  const localizationOffset = {
    ...(experiment?.spec.localizationOffset ?? DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET),
  };
  return {
    experimentResourceId: experiment?.head.resourceId ?? '',
    headCommitId: experiment?.branch.headCommitId ?? '',
    headVersion: experiment?.branch.headVersion ?? 0,
    baseline: bindings,
    bindings: structuredClone(bindings),
    baselineOffset:{ ...localizationOffset },
    localizationOffset:{ ...localizationOffset },
  };
}

function experimentDocument(value: unknown): ExperimentDocument | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentDocument>;
  return candidate.head && candidate.branch && candidate.spec ? candidate as ExperimentDocument : undefined;
}

function robotAssetProjection(value: unknown): { assets:readonly RobotAssetDocument[];loading:boolean;error:string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { assets:[],loading:false,error:'' };
  const candidate = value as { assets?:unknown;loading?:unknown;error?:unknown };
  return {
    assets:Array.isArray(candidate.assets) ? candidate.assets as RobotAssetDocument[] : [],
    loading:candidate.loading === true,
    error:typeof candidate.error === 'string' ? candidate.error : '',
  };
}

function portraitFamily(chassis?: string): 'air' | 'ground' | 'mecanum' | 'generic' {
  if (chassis === 'multirotor') return 'air';
  if (chassis === 'mecanum') return 'mecanum';
  if (chassis === 'unicycle') return 'ground';
  return 'generic';
}
