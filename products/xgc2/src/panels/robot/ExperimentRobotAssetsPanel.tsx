import { ExperimentWorldFenceDrawer } from './ExperimentWorldFenceDrawer';
import { ExperimentSceneDrawer,type ExperimentScene,coordinateFieldNumber, coordinateFieldText, presentedExperimentWorldBoundary, type ExperimentWorldBoundary } from '../../domains/experiment/experimentPublic';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  Fragment,
} from 'react';
import { Button,EmptyState,FormSection,StatusText,Vector3Control } from '@xgc2/ui-react';
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
  useExperimentRobotSources,
  validateExperimentRobotBindings,
  DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET,
  type ExperimentDocument,
  EXPERIMENT_LINK_PROFILES,
  type ExperimentHybridSource,
  type ExperimentLocalizationOffset,
  type ExperimentRobotBinding,
  type ExperimentRobotSourceLabel,
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
const SWARM_GROUPS = ['UAV', 'UGV'] as const;
const UNKNOWN_ROBOT_SOURCE_LABEL: ExperimentRobotSourceLabel = { current: 'unknown' };

function swarmGroupLabel(binding: ExperimentRobotBinding) {
  return experimentRobotRoleLabel(binding).replace(/-\d+$/,'');
}

function swarmGroupOrder(bindings: readonly { binding: ExperimentRobotBinding }[]) {
  const extras: string[] = [];
  for (const { binding } of bindings) {
    const label = swarmGroupLabel(binding);
    if ((label === 'UAV' || label === 'UGV' || extras.includes(label))) continue;
    extras.push(label);
  }
  return [...SWARM_GROUPS, ...extras];
}

type PendingRobotBindings = {
  bindings: ExperimentRobotBinding[];
  reason: string;
};



const LINK_PROFILE_LABELS: Record<(typeof EXPERIMENT_LINK_PROFILES)[number], string> = {
  ideal: 'Ideal radio link',
  'lab-wifi': 'Lab Wi-Fi',
  weak: 'Weak radio link',
  severe: 'Severe radio link',
  intermittent: 'Intermittent radio link',
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
  const [coordinateView,setCoordinateView] = useState<'origin' | 'starting-poses' | 'world-fence' | 'scene' | null>(null);
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
  const worldFenceFillRef = useRef('');
  const saveWorldFenceRef = useRef<(value: ExperimentWorldBoundary, expectedCommitId: string) => Promise<void>>(async () => {});
  const robotSources = useExperimentRobotSources({
    runtime: experimentRuntime,
    targetId,
    experimentResourceId: experiment?.head.resourceId ?? '',
    bindings: draft.bindings,
    composition: robotKindComposition,
  });
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

  function openCoordinateView(view: 'origin' | 'starting-poses' | 'world-fence' | 'scene') {
    if (coordinateView === view) return;
    coordinateBaseRef.current = coordinateAuthoringBase(draftRef.current);
    setAddingRobots(false);
    setDraggingAssetId('');
    setCoordinateView(view);
  }

  async function saveExperimentSetting(port:string,value:unknown,expectedCommitId:string,reason:string) {
    const current=draftRef.current;
    if (!experiment || current.experimentResourceId!==experiment.head.resourceId || current.headCommitId!==expectedCommitId) throw new Error(t('The Experiment configuration changed. Reopen coordinate settings before saving.'));
    if (persistLockRef.current || pendingBindingsRef.current) throw new Error(t('Wait for the current changes to finish saving.'));
    const authoring=context.ports.authoring[port];
    if (!authoring?.connected || authoring.disabledReason) throw new Error(authoring?.disabledReason || t('Experiment configuration is unavailable.'));
    persistLockRef.current=true;
    try {
      const saved=await authoring.commit(value,expectedCommitId,reason);
      writeDraft(applyPersistedDraft(draftRef.current,{},experimentDocument(saved),current));
      setPersistError('');
    } finally {persistLockRef.current=false;if(pendingBindingsRef.current) void flushPersist();}
  }

  const saveWorldBoundary = (value:ExperimentWorldBoundary,expectedCommitId:string) => saveExperimentSetting('world-boundary-editor',value,expectedCommitId,'Update Experiment world fence');
  const saveScene = (value:ExperimentScene,expectedCommitId:string) => saveExperimentSetting('scene-editor',value,expectedCommitId,'Update Experiment scene');

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
        if (JSON.stringify(bindings) === JSON.stringify(current.baseline)) {
          if (coordinateBaseRef.current === coordinateBase) {
            coordinateBaseRef.current = coordinateAuthoringBase(current);
          }
          return;
        }
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
  ));
  const coordinateRobotRunIds = useMemo(() => runtimeSession?.members
    .filter((member) => member.targetId === targetId && (member.kind === 'workflow_run' || member.kind === 'workflow_command'))
    .map((member) => member.ownerId) ?? [],[runtimeSession,targetId]);
  const selectedAsset = selectedBinding
    ? robotAssetCatalog.assets.find((asset) => asset.head.resourceId === selectedBinding.ref.resourceId)
    : undefined;
  // Robot parameters ride the shared wide ConfigDrawer like every other panel
  // settings surface; the draft keeps live-persisting while the drawer is open.
  const robotDrawerVisible = Boolean(routeVisible && robotSettingsOpen && selectedBinding && !addingRobots && !coordinateView);
  const worldFence = useMemo(() => (
    experiment
      ? presentedExperimentWorldBoundary(experiment.spec.worldBoundary, experiment.spec.name) ?? experiment.spec.worldBoundary
      : null
  ), [experiment]);
  saveWorldFenceRef.current = saveWorldBoundary;
  useEffect(() => {
    if (coordinateView !== 'world-fence' || !experiment || !worldFence) return;
    if (JSON.stringify(worldFence) === JSON.stringify(experiment.spec.worldBoundary)) return;
    const authoring = context.ports.authoring['world-boundary-editor'];
    if (!authoring?.connected || authoring.disabledReason) return;
    const token = `${experiment.head.resourceId}:${experiment.spec.name}:${JSON.stringify(worldFence)}`;
    if (worldFenceFillRef.current === token) return;
    worldFenceFillRef.current = token;
    void saveWorldFenceRef.current(worldFence, draft.headCommitId).catch(() => {
      if (worldFenceFillRef.current === token) worldFenceFillRef.current = '';
    });
  }, [coordinateView, experiment, worldFence, draft.headCommitId, context.ports.authoring]);

  if (!experiment) {
    return <EmptyState appearance="plain" fill title={t('Experiment unavailable')} description={t('Select an Experiment to manage its Robot assets.')} />;
  }

  return (
    <section className="experiment-robot-assets-panel-root" data-xgc-role="experiment-robot-assets" data-xgc-id="experiment-robot-assets">
      <div className="experiment-robot-assets-panel-workspace">
        <div className="experiment-robot-assets-panel-gallery">
          <ExperimentRobots
            panelId={panel.id}
            browseButtonRef={browseButtonRef}
            robotButtonRefs={robotButtonRefs.current}
            bindings={draft.bindings}
            orderedBindings={orderedBindings}
            sourceLabels={robotSources.labels}
            assets={robotAssetCatalog.assets}
            selectedIndex={selectedIndex}
            disabled={Boolean(rosterLockedReason)}
            disabledReason={rosterLockedReason}
            draggingAssetId={draggingAssetId}
            onSelect={selectRobot}
            onBrowseAssets={() => { coordinateBaseRef.current = null;setCoordinateView(null);setAddingRobots(true); }}
            browsingAssets={addingRobots}
            scene={experiment.spec.scene}
            onSelectScene={() => openCoordinateView('scene')}
            onSelectWorldOrigin={() => openCoordinateView('origin')}
            onSelectWorldFence={() => openCoordinateView('world-fence')}
            onRemove={removeRobot}
            onMove={moveRobot}
            onAssetDrop={addDraggedAsset}
            onFillCurrentPoses={() => openCoordinateView('starting-poses')}
            feedbackError={persistError || robotAssetCatalog.error}
          />
        </div>
      </div>
      {robotSettingsOpen && selectedBinding && (
        <ConfigDrawer
          open={robotDrawerVisible}
          ariaLabel={t('Robot parameters')}
          title={(
            <span
              className="experiment-robot-assets-panel-robot-drawer-title"
              data-xgc-role="experiment-robot-assets-pane-title"
              data-xgc-id="parameters"
            >
              <span className="experiment-robot-assets-panel-robot-drawer-mark" aria-hidden="true">
                <ExperimentRobotPortrait
                  family={portraitFamily(selectedAsset ? robotAssetChassisClass(selectedAsset.spec,robotKindComposition) : undefined)}
                  selected
                  motion={routeVisible}
                  variant={selectedIndex ?? 0}
                />
              </span>
              <span
                data-xgc-role="experiment-robot-assets-panel-current-robot"
                data-xgc-id={selectedBinding.ref.resourceId}
              >{selectedAsset?.spec.name ?? t('Robot parameters')}</span>
            </span>
          )}
          className="config-drawer-wide experiment-robot-assets-robot-drawer"
          dataXgcRole="experiment-robot-assets-robot-inspector"
          dataXgcId={selectedBinding.ref.resourceId}
          closeDataXgcRole="experiment-robot-assets-robot-inspector-close"
          closeDataXgcId={selectedBinding.ref.resourceId}
          closeLabel={t('Close Robot parameters')}
          closeOnBackdrop
          onClose={() => {
            const resourceId = selectedBinding.ref.resourceId;
            setRobotSettingsOpen(false);
            robotButtonRefs.current.get(resourceId)?.focus();
          }}
        >
          <RobotForm
            binding={selectedBinding}
            index={selectedIndex}
            assets={robotAssetCatalog.assets}
            scene={experiment.spec.scene}
            disabled={Boolean(readOnlyReason)}
            disabledReason={readOnlyReason}
            onChange={updateSelected}
          />
        </ConfigDrawer>
      )}
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
      {coordinateView === 'scene' && (
        <ExperimentSceneDrawer value={experiment.spec.scene} headCommitId={draft.headCommitId} visible={routeVisible}
          disabledReason={configResourceDefinitionEditLocked(experiment.head,experiment.spec.tags) ? t('This Experiment is read only.') : context.ports.authoring['scene-editor']?.disabledReason || (!context.ports.authoring['scene-editor']?.connected ? t('Experiment configuration is unavailable.') : '')}
          onSave={saveScene} onClose={() => { coordinateBaseRef.current = null;setCoordinateView(null); }} />
      )}
      {coordinateView === 'world-fence' && (
        <ExperimentWorldFenceDrawer value={worldFence} headCommitId={draft.headCommitId}
          visible={routeVisible} editing={context.editing}
          disabledReason={configResourceDefinitionEditLocked(experiment.head,experiment.spec.tags) ? t('This Experiment is read only.') : context.ports.authoring['world-boundary-editor']?.disabledReason || (!context.ports.authoring['world-boundary-editor']?.connected ? t('Experiment configuration is unavailable.') : '')}
          onSave={saveWorldBoundary} onClose={() => {coordinateBaseRef.current=null;setCoordinateView(null);}} />
      )}
      {(coordinateView === 'origin' || coordinateView === 'starting-poses') && (
        <ExperimentCoordinateDrawer
          key={coordinateView}
          view={coordinateView}
          visible={routeVisible}
          targetId={targetId}
          runId={runtimeSession ? runtimeOwnerRunId ?? coordinateRobotRunIds[0] : undefined}
          expectedCommitId={runtimeSession?.session.experimentCommitId ?? ''}
          expectedDigest={runtimeSession?.session.experimentDigest ?? ''}
          sessionId={runtimeSession?.session.id ?? ''}
          robotRunIds={coordinateRobotRunIds}
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
  sourceLabels,
  assets,
  selectedIndex,
  disabled,
  disabledReason: _disabledReason,
  draggingAssetId,
  onSelect,
  onBrowseAssets,
  browsingAssets,
  onSelectScene,
  scene,
  onSelectWorldOrigin,
  onSelectWorldFence,
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
  sourceLabels: ReadonlyMap<string,ExperimentRobotSourceLabel>;
  assets: readonly RobotAssetDocument[];
  selectedIndex: number | null;
  disabled: boolean;
  disabledReason: string;
  draggingAssetId: string;
  onSelect: (index: number) => void;
  onBrowseAssets: () => void;
  browsingAssets: boolean;
  onSelectScene: () => void;
  scene?: ExperimentScene;
  onSelectWorldOrigin: () => void;
  onSelectWorldFence: () => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number,toIndex: number) => void;
  onAssetDrop: (resourceId: string) => void;
  onFillCurrentPoses: () => void;
  feedbackError: string;
}) {
  const t = useRobotText();
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

  // Roster lookups for this render in one pass over the roster and catalog;
  // resolving them per robot card made each render O(robots^2).
  const assetById = new Map<string,RobotAssetDocument>();
  assets.forEach((asset) => {
    if (!assetById.has(asset.head.resourceId)) assetById.set(asset.head.resourceId,asset);
  });
  const slotGroupIndexes = new Map<string,number[]>();
  const slotGroupPositions = new Map<number,number>();
  bindings.forEach((candidate,candidateIndex) => {
    const group = experimentRobotSlotGroup(candidate);
    const indexes = slotGroupIndexes.get(group) ?? [];
    if (indexes.length === 0) slotGroupIndexes.set(group,indexes);
    slotGroupPositions.set(candidateIndex,indexes.length);
    indexes.push(candidateIndex);
  });
  const groupItemsByLabel = new Map<string,{ binding: ExperimentRobotBinding; index: number }[]>();
  orderedBindings.forEach((item) => {
    const label = swarmGroupLabel(item.binding);
    const items = groupItemsByLabel.get(label) ?? [];
    if (items.length === 0) groupItemsByLabel.set(label,items);
    items.push(item);
  });
  const draggedBinding = bindings.find((candidate) => candidate.ref.resourceId === draggingRobotAssetId);
  const draggedName = assetById.get(draggingRobotAssetId)?.spec.name;
  // Cards call the roster's current handlers through stable delegates, so a
  // roster render (an Experiment runtime change, another robot's edit) does
  // not re-render every card; each card re-renders when its own data changes.
  const latest = useRef({ bindings,draggingRobotAssetId,onSelect,onMove,onRemove,robotButtonRefs });
  latest.current = { bindings,draggingRobotAssetId,onSelect,onMove,onRemove,robotButtonRefs };
  const cardActions = useMemo<ExperimentRobotCardActions>(() => ({
    select:(index) => latest.current.onSelect(index),
    move:(fromIndex,toIndex) => latest.current.onMove(fromIndex,toIndex),
    remove:(index) => latest.current.onRemove(index),
    bindings:() => latest.current.bindings,
    draggingRobotAssetId:() => latest.current.draggingRobotAssetId,
    setDraggingRobotAssetId,
    setDropTargetIndex,
    registerButton:(id,button) => {
      if (button) latest.current.robotButtonRefs.set(id,button);
      else latest.current.robotButtonRefs.delete(id);
    },
  }),[]);

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
      <ExperimentCoordinateScene scene={scene} onOpenScene={onSelectScene} onOpenOrigin={onSelectWorldOrigin} onOpenStartingPoses={onFillCurrentPoses} onOpenFence={onSelectWorldFence} motion={motion} />
      <div className="experiment-robot-assets-panel-scroll experiment-robot-assets-panel-item-list">
        {swarmGroupOrder(orderedBindings).map((groupLabel) => {
          const groupId = groupLabel.toLowerCase();
          const groupItems = groupItemsByLabel.get(groupLabel) ?? [];
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
          const asset = assetById.get(binding.ref.resourceId);
          const slotGroup = experimentRobotSlotGroup(binding);
          const slotIndexes = slotGroupIndexes.get(slotGroup) ?? [];
          const slotGroupPosition = slotGroupPositions.get(index) ?? -1;
          const targetSlot = draggedBinding && draggedBinding !== binding
            && experimentRobotSlotGroup(draggedBinding) === slotGroup
            ? experimentRobotRoleLabel(binding) : '';
          const sourceLabel = sourceLabels.get(binding.id) ?? UNKNOWN_ROBOT_SOURCE_LABEL;
          return (
            <ExperimentRobotCard
              key={binding.ref.resourceId}
              binding={binding}
              index={index}
              asset={asset}
              slotGroup={slotGroup}
              reorderable={!disabled && slotIndexes.length > 1}
              previousSlotIndex={slotIndexes[slotGroupPosition - 1]}
              nextSlotIndex={slotIndexes[slotGroupPosition + 1]}
              disabled={disabled}
              disabledReason={_disabledReason}
              moveTitle={targetSlot && draggedName ? t('Move {name} to {slot}',{ name:draggedName,slot:targetSlot }) : undefined}
              sourceCurrent={sourceLabel.current}
              sourceNext={sourceLabel.next}
              selected={selectedIndex === index}
              dragging={draggingRobotAssetId === binding.ref.resourceId}
              dropTarget={dropTargetIndex === index}
              motion={motion}
              actions={cardActions}
            />
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

type ExperimentRobotCardActions = {
  select: (index: number) => void;
  move: (fromIndex: number,toIndex: number) => void;
  remove: (index: number) => void;
  bindings: () => readonly ExperimentRobotBinding[];
  draggingRobotAssetId: () => string;
  setDraggingRobotAssetId: (resourceId: string) => void;
  setDropTargetIndex: (index: number | null) => void;
  registerButton: (id: string,button: HTMLButtonElement | null) => void;
};

/**
 * One roster card. Props are this robot's own binding, asset, slot, source
 * and drag/selection state; commands are the roster's stable delegates.
 */
const ExperimentRobotCard = memo(function ExperimentRobotCard({
  binding,
  index,
  asset,
  slotGroup,
  reorderable,
  previousSlotIndex,
  nextSlotIndex,
  disabled,
  disabledReason: _disabledReason,
  moveTitle,
  sourceCurrent,
  sourceNext,
  selected,
  dragging,
  dropTarget,
  motion,
  actions,
}: {
  binding: ExperimentRobotBinding;
  index: number;
  asset?: RobotAssetDocument;
  slotGroup: string;
  reorderable: boolean;
  previousSlotIndex?: number;
  nextSlotIndex?: number;
  disabled: boolean;
  disabledReason: string;
  moveTitle?: string;
  sourceCurrent: ExperimentRobotSourceLabel['current'];
  sourceNext?: ExperimentRobotSourceLabel['next'];
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  motion: boolean;
  actions: ExperimentRobotCardActions;
}) {
  const t = useRobotText();
  const robotKindComposition = useRobotAssetKindComposition();
  const disabledReason = asset
    ? experimentRobotAssetDisabledReason(asset, robotKindComposition)
    : '';
  const assetName = asset?.spec.name ?? t('Missing Robot asset');
  const assignmentName = experimentRobotAssignmentLabel(binding,assetName);
  const reorderDisabledReason = disabled ? _disabledReason : '';
  return (
              <article
                className="experiment-robot-assets-panel-robot-card"
                data-selected={selected ? 'true' : undefined}
                data-xgc-dragging={dragging ? 'true' : undefined}
                data-xgc-drop-target={dropTarget ? 'true' : undefined}
                title={moveTitle}
                data-xgc-role="experiment-robot-assets-panel-robot"
                data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                data-xgc-state={disabledReason ? 'known-disabled' : undefined}
                onDragOver={(event) => {
                  const sourceId = event.dataTransfer.getData(ROBOT_ASSIGNMENT_DRAG_MIME)
                    || actions.draggingRobotAssetId();
                  const source = actions.bindings().find((candidate) => candidate.ref.resourceId === sourceId);
                  if (!reorderable || !sourceId || sourceId === binding.ref.resourceId
                    || !source || experimentRobotSlotGroup(source) !== slotGroup) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                  actions.setDropTargetIndex(index);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  if (dropTarget) actions.setDropTargetIndex(null);
                }}
                onDrop={(event) => {
                  const sourceId = event.dataTransfer.getData(ROBOT_ASSIGNMENT_DRAG_MIME)
                    || actions.draggingRobotAssetId();
                  const bindings = actions.bindings();
                  const sourceIndex = bindings.findIndex((candidate) => candidate.ref.resourceId === sourceId);
                  if (!reorderable || sourceIndex < 0 || sourceIndex === index
                    || experimentRobotSlotGroup(bindings[sourceIndex]!) !== slotGroup) return;
                  event.preventDefault();
                  event.stopPropagation();
                  actions.setDraggingRobotAssetId('');
                  actions.setDropTargetIndex(null);
                  actions.move(sourceIndex,index);
                }}
              >
                <Button
                  appearance="ghost"
                  ref={(button) => actions.registerButton(asset?.head.resourceId ?? binding.ref.resourceId,button)}
                  className="experiment-robot-assets-panel-robot-select experiment-robot-portrait-host"
                  type="button"
                  data-xgc-role="experiment-robot-assets-panel-robot-select"
                  data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                  aria-label={assignmentName}
                  aria-pressed={selected}
                  draggable={reorderable ? true : undefined}
                  title={moveTitle
                    ?? (reorderable ? t('Drag {name} to another slot',{ name:assetName }) : undefined)}
                  onDragStart={(event) => {
                    if (!reorderable) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(ROBOT_ASSIGNMENT_DRAG_MIME,binding.ref.resourceId);
                    actions.setDraggingRobotAssetId(binding.ref.resourceId);
                    actions.setDropTargetIndex(null);
                  }}
                  onDragEnd={() => {
                    actions.setDraggingRobotAssetId('');
                    actions.setDropTargetIndex(null);
                  }}
                  onClick={() => actions.select(index)}
                >
                  <span
                    className="experiment-robot-assets-panel-robot-source"
                    data-xgc-role="experiment-robot-assets-panel-robot-source"
                    data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                    data-xgc-source={sourceCurrent}
                  >
                    {sourceCurrent === 'unknown'
                      ? t('Source undetermined')
                      : t(sourceCurrent === 'simulation' ? 'Simulation' : 'Physical')}
                    {sourceNext && (
                      <span
                        className="experiment-robot-assets-panel-robot-source-next"
                        data-xgc-role="experiment-robot-assets-panel-robot-source-next"
                        data-xgc-id={asset?.head.resourceId ?? binding.ref.resourceId}
                      >
                        {t('Next start: {source}',{
                          source: t(sourceNext === 'simulation' ? 'Simulation' : 'Physical'),
                        })}
                      </span>
                    )}
                  </span>
                  <span className="experiment-robot-assets-panel-robot-mark" aria-hidden="true">
                    <ExperimentRobotPortrait family={portraitFamily(asset ? robotAssetChassisClass(asset.spec,robotKindComposition) : undefined)} selected={selected} variant={index} motion={motion} />
                  </span>
                  <span className="experiment-robot-assets-panel-robot-copy">
                    <span className="experiment-robot-assets-panel-robot-identity">
                      <span className="experiment-robot-assets-panel-assignment-name">{assetName}</span>
                      <span className="experiment-robot-assets-panel-slot-name">{experimentRobotRoleLabel(binding)}</span>
                    </span>
                    {disabledReason && (
                      <span className="experiment-robot-assets-panel-robot-note" title={t(disabledReason)}>
                        {t('Not enabled for Experiments')}
                      </span>
                    )}
                  </span>
                </Button>
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
                    onClick={() => previousSlotIndex !== undefined && actions.move(index,previousSlotIndex)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
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
                    onClick={() => nextSlotIndex !== undefined && actions.move(index,nextSlotIndex)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
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
                    onClick={() => actions.remove(index)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </ControlButton>
                </div>
              </article>
  );
});

function RobotForm({
  binding,
  index,
  assets,
  scene,
  disabled,
  disabledReason,
  onChange,
}: {
  binding?: ExperimentRobotBinding;
  index: number | null;
  assets: readonly RobotAssetDocument[];
  scene?: ExperimentScene;
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
  const showSimpleLidar = scene?.simulator === 'gazebo' && Boolean(binding && (
    (binding.px4 !== undefined
      && currentAsset?.spec.kind === 'px4_multirotor'
      && currentAsset.spec.px4?.modelId === 'fs150')
    || (binding.scout !== undefined && currentAsset?.spec.kind === 'scout_mini')
    || (binding.mecanum !== undefined && currentAsset?.spec.kind === 'mecanum_ugv')
  ));
  const showFs150Sensors = Boolean(binding?.px4
    && currentAsset?.spec.kind === 'px4_multirotor'
    && currentAsset.spec.px4?.modelId === 'fs150'
    && !experimentDisabledReason);
  const showScoutSensors = Boolean(binding?.scout && !experimentDisabledReason);
  const showSensorSection = showFs150Sensors || showScoutSensors || Boolean(showSimpleLidar && binding?.mecanum);
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
      <div className="xgc-config-form">
        {binding && !experimentDisabledReason && (
        <FormSection
          title={<span data-xgc-role="experiment-robot-assets-panel-settings-group-title" data-xgc-id="starting-pose">{t('Starting pose')}</span>}
          dataXgcRole="experiment-robot-assets-panel-settings-group"
          dataXgcId="starting-pose"
        >
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
                step="0.01"
                value={coordinateFieldText(binding.initialPose.yaw)}
                disabled={disabled}
                title={disabled ? disabledReason : undefined}
                aria-label={t('Yaw')}
                dataXgcRole="experiment-robot-assets-panel-pose-yaw"
                dataXgcId="starting-pose"
                onChange={(next) => onChange({
                  ...binding,
                  initialPose: {
                    ...binding.initialPose,
                    yaw: coordinateFieldNumber(next),
                  },
                })}
              />
            </FormField>
          </div>
        </FormSection>
        )}
        {binding && !experimentDisabledReason && (
        <FormSection
          title={<span data-xgc-role="experiment-robot-assets-panel-settings-group-title" data-xgc-id="experiment-setup">{t('Experiment setup')}</span>}
          dataXgcRole="experiment-robot-assets-panel-settings-group"
          dataXgcId="experiment-setup"
        >
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
            <FormField
              className="experiment-robot-assets-panel-field"
              label={t('Radio link')}
              tooltip={t('Network station condition for this Robot\'s radio link (AgentLink, ROS/MAVLink to the station). The physics network is never degraded. Recorded in the startup plan and the Session.')}
              dataXgcRole="experiment-robot-assets-panel-link-profile-field"
              dataXgcId={binding.ref.resourceId}
            >
              <span title={disabled ? disabledReason : undefined}>
                <SelectControl
                  fill
                  value={binding.linkProfile ?? 'ideal'}
                  options={EXPERIMENT_LINK_PROFILES.map((profile) => ({
                    value: profile,
                    label: t(LINK_PROFILE_LABELS[profile]),
                  }))}
                  disabled={disabled}
                  onChange={(linkProfile) => {
                    const next = { ...binding };
                    if (linkProfile === 'ideal') delete next.linkProfile;
                    else next.linkProfile = linkProfile;
                    onChange(next);
                  }}
                  ariaLabel={t('Radio link')}
                  dataXgcRole="experiment-robot-assets-panel-link-profile"
                  dataXgcId={binding.ref.resourceId}
                />
              </span>
            </FormField>
          </div>
        </FormSection>
        )}
        {/*
          PX4 transport identity (MAV system ID, physical and simulation ports)
          is owned entirely by the Robot asset. Experiment authoring keeps only
          higher-level, experiment-varying facts: role, namespace, Hybrid source, pose.
        */}
        {showSensorSection && binding && (
          <FormSection
            title={<span data-xgc-role="experiment-robot-assets-panel-settings-group-title" data-xgc-id="simulated-sensors">{t('Simulated sensors')}</span>}
            dataXgcRole="experiment-robot-assets-panel-settings-group"
            dataXgcId="simulated-sensors"
          >
            <div className="experiment-robot-assets-panel-switches" title={disabled ? disabledReason : undefined}>
              {showFs150Sensors && binding.px4 && (
                <SwitchControl className="experiment-robot-assets-panel-sensor-switch" checked={binding.px4.imageSimulationEnabled === true} disabled={disabled} label={t('Simulate front camera')} onChange={(imageSimulationEnabled) => onChange({ ...binding,px4: { imageSimulationEnabled } })} />
              )}
              {showScoutSensors && binding.scout && (
                <Fragment>
                  <SwitchControl className="experiment-robot-assets-panel-sensor-switch" checked={binding.scout.lidarSimulationEnabled} disabled={disabled} label={t('Simulate LiDAR')} onChange={(lidarSimulationEnabled) => onChange({ ...binding,scout: { ...binding.scout!,lidarSimulationEnabled } })} />
                  <SwitchControl className="experiment-robot-assets-panel-sensor-switch" checked={binding.scout.imageSimulationEnabled} disabled={disabled} label={t('Simulate camera and depth')} onChange={(imageSimulationEnabled) => onChange({ ...binding,scout: { ...binding.scout!,imageSimulationEnabled } })} />
                </Fragment>
              )}
              {showSimpleLidar && (
                <SwitchControl
                  className="experiment-robot-assets-panel-sensor-switch"
                  checked={binding.simulationSensors?.simpleLidar === true}
                  disabled={disabled}
                  label={t('Simple lidar')}
                  dataXgcRole="experiment-robot-assets-panel-simple-lidar"
                  dataXgcId={binding.ref.resourceId}
                  onChange={(simpleLidar) => onChange({ ...binding,simulationSensors:{ simpleLidar } })}
                />
              )}
            </div>
          </FormSection>
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
    value: coordinateFieldText(values[key]),
    step: 0.01,
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
          onAxisChange(key, coordinateFieldNumber(next));
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
    <FormSection
      title={(
        <span className="experiment-robot-assets-panel-asset-parameters-title">
          <span
            data-xgc-role="experiment-robot-assets-panel-settings-group-title"
            data-xgc-id="asset-parameters"
          >{t('Asset parameters')}</span>
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
        </span>
      )}
      dataXgcRole="experiment-robot-assets-panel-asset-parameters"
      dataXgcId={asset.head.resourceId}
    >
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
    </FormSection>
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
