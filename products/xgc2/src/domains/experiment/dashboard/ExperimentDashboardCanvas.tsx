import { useCallback,useEffect,useMemo,useState,type CSSProperties,type DragEventHandler } from 'react';
import { Play,Plug,RotateCw,Square,Unplug,Workflow } from 'lucide-react';
import { Notice } from '@xgc2/ui-react';
import { ControlButton,ControlLink } from '../../../components/controls/ControlButton';
import { PanelFrame } from '../../../panels/PanelFrame';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { AutomationPanelContext } from '../../../panels/types';
import { routedCoreIdForPanel,targetPermissionReason } from '../../../shared/utils/controlPlane';
import { executionTargetKeyForCore } from '../../execution/executionPublic';
import type { CoreNode } from '../../core/corePublic';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import type { ExperimentDashboard,ExperimentDocument,PanelInstance } from '../experimentModel';
import { isRobotInstrumentPanel } from './robotInstrumentModel';
import { DashboardGrid } from './DashboardGrid';
import { DASHBOARD_GAP,DASHBOARD_ROW_HEIGHT } from '../../../shared/dashboardGeometry';
import { panelDashboardId } from '../../../shared/panelDashboard';
import { DashboardEmptyState,ExperimentPanelContent } from './ExperimentPanelContent';
import { RobotInstrumentViewHeaderControl } from './robotInstrument';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';
import { PanelAutomationRuntimeProvider } from './PanelAutomationRuntimeProvider';
import { DashboardStationOccupancyProvider } from './DashboardStationOccupancyProvider';
import {
  panelAutomationRuntime,
  panelFallbackRuntime,
  useDashboardRunSelection,
  useDashboardRunStore,
  usePanelExecutionObserver,
  type DashboardRunLifecycle,
  type DashboardRunSnapshot,
  type FullRunRelationsSnapshot,
  type PanelRuntimeFallback,
} from './dashboardRunStore';
import { automationRefsForPanels } from './offlineVideoAction';
import {
  createPanelRunScopeCache,
  panelRunScopeApplies,
  scopePanelRunRuntimes,
  snapshotPanelRunOwners,
  type PanelRunScopeCache,
} from './panelRunScope';
import { SYSTEM_EXPERIMENT_RUNNER } from '../experimentPublic';
import { canonicalRobotSelectionParameters,useRobotSelection } from '../../robot/robotPublic';
import {
  connectedRobotIdsForSelection,
  instrumentRunCoversAll,
  instrumentSlotGroupsKnown,
  liveInstrumentSlotStops,
  partitionSelectedRobotConnection,
} from './robotInstrumentConnectionSelection';
import {
  automationDocumentHash,
  getAutomationExecutionRelations,
  type AutomationChildRunRelation,
  type AutomationExecutionRelations,
  type AutomationRun,
  type AutomationRunDetail,
} from '../../automation/automationPublic';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import { experimentChildRunRelations } from '../experimentChildRunBinding';
import { useRobotInstrumentReconnect,type InstrumentReconnectStop } from './useRobotInstrumentReconnect';
import {
  ensureOperatorControlSession,
  operatorAccessCopy,
  useOperatorControlSession,
} from '../../operatorAccess/operatorAccessPublic';
import { useAppLanguage } from '../../../shared/localization/localizedText';

const RETIRED_PANEL_PLUGIN_IDS = new Set(['recording-control', 'experiment-video-production']);
// One shared empty catalog: a per-render default would rebuild every Panel frame.
const NO_ROBOT_ASSET_CATALOG: DashboardRenderContext['robotAssetCatalog'] = { assets: [],loading: false,error: '' };

export type DashboardCanvasEditSession = {
  visibleExperiment?: ExperimentDocument;
  editing: boolean;
  readOnly: boolean;
  commitConflict: string;
  saveError: string;
};

export type DashboardCanvasPanelWorkspace = {
  items: PanelInstance[];
  selectedPanelId: string;
  select: (panelId: string) => void;
  openConfig: (panelId: string) => void;
  remove: (panelId: string) => void;
  updateLayout: (positions: Record<string,PanelInstance['gridPos']>) => void;
};

export type DashboardCanvasDropTarget = {
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
};

/**
 * Everything a Panel frame needs that does not move with Run events. Run
 * state reaches Panel slots through the dashboard Run store instead, so a
 * Run event leaves this context, the grid and every frame untouched.
 */
export type DashboardRenderContext = {
  session: DashboardCanvasEditSession;
  layoutEditing: boolean;
  panels: DashboardCanvasPanelWorkspace;
  coreNodes: CoreNode[];
  selectedTargetCore?: CoreNode;
  routedTargetCoreId?: string;
  executionTargetId: string;
  gcsMode: boolean;
  standalonePage: boolean;
  robotAssetCatalog: {
    assets: readonly RobotAssetDocument[];
    loading: boolean;
    error: string;
  };
};

export function ExperimentDashboardCanvas({
  session,
  dashboard,
  panels,
  drop,
  actions,
  gcsMode,
  coreNodes,
  selectedTargetCore,
  routedTargetCoreId,
  executionTargetId,
  automation,
  localAutomation = automation,
  robotAssetCatalog = NO_ROBOT_ASSET_CATALOG,
}: {
  session: DashboardCanvasEditSession;
  dashboard: ExperimentDashboard;
  panels: DashboardCanvasPanelWorkspace;
  drop: DashboardCanvasDropTarget;
  actions: ExperimentDashboardActions;
  gcsMode: boolean;
  coreNodes: CoreNode[];
  selectedTargetCore?: CoreNode;
  routedTargetCoreId?: string;
  executionTargetId: string;
  automation: AutomationPanelContext['automation'];
  localAutomation?: AutomationPanelContext['automation'];
  robotAssetCatalog?: {
    assets: readonly RobotAssetDocument[];
    loading: boolean;
    error: string;
  };
}) {
  const fullRunRelations = useFullRunRelations(actions);
  const layoutEditing = session.editing
    && !session.readOnly
    && !actions.experimentIsRunning
    && !actions.activeRun
    && !actions.startInFlight
    && !actions.stopAllInFlight;
  const selectedPanels = useMemo(
    () => panels.items.filter((panel) => !RETIRED_PANEL_PLUGIN_IDS.has(panel.pluginId)),
    [panels.items],
  );
  const standalonePage = !gcsMode
    && selectedPanels.length === 1
    && Boolean(getPanelPlugin(selectedPanels[0]!.pluginId)?.standalonePresentation);
  const renderContext: DashboardRenderContext = useMemo(() => ({
    session,
    layoutEditing,
    panels,
    coreNodes,
    selectedTargetCore,
    routedTargetCoreId,
    executionTargetId,
    gcsMode,
    standalonePage,
    robotAssetCatalog,
  }),[
    coreNodes,executionTargetId,gcsMode,layoutEditing,panels,robotAssetCatalog,routedTargetCoreId,
    selectedTargetCore,session,standalonePage,
  ]);
  const lifecycle: DashboardRunLifecycle = useMemo(() => ({
    actions,fullRunRelations,automation,localAutomation,
  }),[actions,automation,fullRunRelations,localAutomation]);
  const panelAutomationTargetIds = useMemo(() => session.visibleExperiment?.spec.workflowInstances
    .flatMap((workflow) => workflow.executionTargetId ? [workflow.executionTargetId] : [])
    ?? [],[session.visibleExperiment]);
  const panelMountErrors = useMemo(() => {
    const mountedPanelCounts = new Map<string,number>();
    const errors = new Map<string,string>();
    for (const panel of selectedPanels) {
      const plugin = getPanelPlugin(panel.pluginId);
      const count = (mountedPanelCounts.get(panel.pluginId) ?? 0) + 1;
      mountedPanelCounts.set(panel.pluginId, count);
      if (plugin?.maxInstancesPerDashboard !== undefined && count > plugin.maxInstancesPerDashboard) {
        errors.set(
          panel.id,
          `${plugin.name} is limited to ${plugin.maxInstancesPerDashboard} instance${plugin.maxInstancesPerDashboard === 1 ? '' : 's'} per dashboard. Remove this duplicate panel to enable it.`,
        );
      }
    }
    return errors;
  },[selectedPanels]);
  const workflowBindingRefs = useMemo(() => automationRefsForPanels(
    session.visibleExperiment?.spec.workflowInstances ?? [],
    selectedPanels,
  ),[selectedPanels,session.visibleExperiment]);
  const renderPanel = useCallback((panel: PanelInstance) => renderDashboardPanel(
    panel,renderContext,panelMountErrors.get(panel.id) ?? '',
  ),[panelMountErrors,renderContext]);
  const experimentResourceId = session.visibleExperiment?.head.resourceId;
  // A stable grid element: the Run provider re-renders on every Run event,
  // but the grid, frames and Panel content below it only follow layout.
  const grid = useMemo(() => (
    <DashboardGrid
      key={`${experimentResourceId ?? 'none'}:${dashboard.id}`}
      panels={selectedPanels}
      editing={layoutEditing}
      empty={<DashboardEmptyState dashboard={dashboard} editMode={layoutEditing} />}
      gcsMode={gcsMode}
      fillRemainingHeight={standalonePage}
      onLayoutCommit={panels.updateLayout}
    >
      {renderPanel}
    </DashboardGrid>
  ),[dashboard,experimentResourceId,gcsMode,layoutEditing,panels.updateLayout,renderPanel,selectedPanels,standalonePage]);

  return (
    <>
      {session.commitConflict && (
        <Notice tone="danger" density="compact" data-xgc-role="experiment-dashboard-save-conflict" data-xgc-id={session.visibleExperiment?.head.resourceId}>
          The experiment changed elsewhere. The latest data was loaded and the unsaved dashboard draft remains open.
        </Notice>
      )}
      {session.saveError && <Notice tone="danger" density="compact" data-xgc-role="experiment-dashboard-save-error" data-xgc-id={session.visibleExperiment?.head.resourceId}>{session.saveError}</Notice>}
      <div
        className="experiment-grid dashboard-grid"
        data-xgc-role="experiment-dashboard-canvas"
        data-xgc-id={dashboard.id}
        data-xgc-editing={layoutEditing ? 'true' : 'false'}
        data-xgc-readonly={session.readOnly ? 'true' : undefined}
        data-xgc-fill-remaining={standalonePage ? 'true' : undefined}
        style={{
          '--xgc-workspace-gap-x': `${DASHBOARD_GAP}px`,
          '--xgc-workspace-gap-y': `${DASHBOARD_GAP}px`,
          '--xgc-workspace-row-height': `${DASHBOARD_ROW_HEIGHT}px`,
        } as CSSProperties}
        onDragOver={layoutEditing ? drop.onDragOver : undefined}
        onDrop={layoutEditing ? drop.onDrop : undefined}
      >
        <DashboardStationOccupancyProvider
          experimentResourceId={experimentResourceId}
          executionTargetId={executionTargetId}
          stopping={actions.stopAllInFlight}
        >
          <PanelAutomationRuntimeProvider
            targetIds={panelAutomationTargetIds}
            lifecycle={lifecycle}
            scopeKey={JSON.stringify([session.visibleExperiment?.head.resourceId,session.visibleExperiment?.branch.headCommitId])}
            workflowRefs={workflowBindingRefs}
          >
            {grid}
          </PanelAutomationRuntimeProvider>
        </DashboardStationOccupancyProvider>
      </div>
    </>
  );
}

function renderDashboardPanel(panel: PanelInstance, context: DashboardRenderContext, mountError: string) {
  const {
    session,
    layoutEditing,
    panels,
    coreNodes,
    selectedTargetCore,
    routedTargetCoreId,
    executionTargetId,
    gcsMode,
    standalonePage,
    robotAssetCatalog,
  } = context;
  const plugin = getPanelPlugin(panel.pluginId);
  const targetPolicy = plugin?.executionTargetPolicy ?? 'configurable';
  const localGCSPanel = targetPolicy === 'local';
  const runtimeFallback: PanelRuntimeFallback = localGCSPanel ? 'local' : 'dashboard';
  const targetCoreId = localGCSPanel
    ? undefined
    : targetPolicy === 'dashboard'
      ? routedTargetCoreId
      : panel.targetCoreId ? routedCoreIdForPanel(panel, coreNodes, routedTargetCoreId) : routedTargetCoreId;
  const authoredWorkflowTarget = panelWorkflowExecutionTarget(session.visibleExperiment,panel);
  const targetExecutionId = authoredWorkflowTarget
    || (localGCSPanel ? 'local' : targetCoreId ? executionTargetKeyForCore(targetCoreId) : executionTargetId);
  const targetCore = localGCSPanel
    ? undefined
    : targetPolicy === 'dashboard'
      ? selectedTargetCore
      : panel.targetCoreId ? coreNodes.find((core) => core.id === panel.targetCoreId) : selectedTargetCore;
  const PluginFrameProvider = plugin?.frameProvider;
  const PluginHeaderLeading = plugin?.headerLeading;
  const PluginHeaderStatus = plugin?.headerStatus;
  const PluginHeaderActions = plugin?.headerActions;
  const panelWorkflowRunInputOverrides = () => plugin?.workflowRunInputOverrides?.({
    panel,experimentId:session.visibleExperiment?.head.resourceId,
  }) ?? {};
  // Configure + delete are frame chrome for every panel in edit mode. Plugins only
  // supply optionsEditor content inside the shared PanelConfigDrawer.
  const canMutateLayout = layoutEditing;
  const configurePanel = canMutateLayout && plugin?.configExposure?.drawer !== 'hidden'
    ? () => panels.openConfig(panel.id)
    : undefined;
  const deletePanel = canMutateLayout ? () => panels.remove(panel.id) : undefined;
  const workflowInstance=panelWorkflowInstance(session.visibleExperiment,panel);
  const panelWorkflowControlsVisible=plugin?.panelWorkflowControls!=='hidden'
    && panel.options.panelWorkflowControls!=='hidden';
  const showLeading = !mountError && (isRobotInstrumentPanel(panel) || Boolean(PluginHeaderLeading));
  const showStatus = !mountError && Boolean(PluginHeaderStatus);
  const showActions = !mountError && (
    Boolean(PluginHeaderActions) || (panelWorkflowControlsVisible && Boolean(panelWorkflowBinding(panel)))
  );
  const frame = (
    <PanelFrame
      panel={panel}
      selected={layoutEditing && panels.selectedPanelId === panel.id}
      editing={layoutEditing}
      gcsMode={gcsMode}
      chrome={standalonePage && plugin?.standalonePresentation === 'page' ? 'flat' : undefined}
      interactiveWhileEditing={Boolean(plugin?.interactiveWhileEditing)}
      fillBody={Boolean(plugin?.fillBody)}
      headerLeading={showLeading ? (
        <>
          {!mountError && isRobotInstrumentPanel(panel) && (
            <RobotInstrumentViewHeaderControl
              experimentId={session.visibleExperiment?.head.resourceId}
              dashboardId={panelDashboardId(panel)}
              panelId={panel.id}
              editing={layoutEditing}
            />
          )}
          {!mountError && PluginHeaderLeading && <PluginHeaderLeading panel={panel} editing={layoutEditing} />}
        </>
      ) : undefined}
      headerStatus={showStatus && PluginHeaderStatus ? (
        <PluginHeaderStatus panel={panel} editing={layoutEditing} />
      ) : undefined}
      headerActions={showActions ? (
        <>
          {PluginHeaderActions && <PluginHeaderActions panel={panel} editing={layoutEditing} />}
          {panelWorkflowControlsVisible && panelWorkflowBinding(panel) && (
            <PanelWorkflowHeaderControl
              panel={panel}
              runtimeFallback={runtimeFallback}
              executionTargetId={targetExecutionId}
              experimentId={session.visibleExperiment?.head.resourceId}
              experimentCommitId={session.visibleExperiment?.branch.headCommitId}
              editing={layoutEditing}
              runInputOverrides={panelWorkflowRunInputOverrides}
            />
          )}
        </>
      ) : undefined}
      onSelect={() => panels.select(panel.id)}
      onConfigure={configurePanel}
      onDelete={deletePanel}
    >
      {mountError ? (
        <Notice
          tone="danger"
          density="compact"
          role="alert"
          data-xgc-role="panel-plugin-instance-blocked"
          data-xgc-id={panel.id}
        >{mountError}</Notice>
      ) : (
        <ExperimentPanelRuntimeContent
          key={panel.id}
          panel={panel}
          experiment={session.visibleExperiment}
          executionTargetId={targetExecutionId}
          runtimeFallback={runtimeFallback}
          disabledReason={targetPermissionReason(targetCore, [...(plugin?.permissions ?? [])], `${plugin?.name ?? panel.pluginId} access`)}
          editing={layoutEditing}
          robotAssetCatalog={robotAssetCatalog}
          runInputOverrides={panelWorkflowRunInputOverrides}
        />
      )}
      {workflowInstance && (
        <ControlLink
          className="xgc-panel-workflow-open"
          size="compact"
          href={automationDocumentHash(targetExecutionId,workflowInstance.ref.resourceId)}
          title={`Open ${panel.title} workflow`}
          aria-label={`Open ${panel.title} workflow`}
          dataXgcRole="panel-workflow-open"
          dataXgcId={panel.id}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Workflow size={14} aria-hidden="true" />
          Open workflow
        </ControlLink>
      )}
    </PanelFrame>
  );

  return PluginFrameProvider && !mountError ? <PluginFrameProvider panel={panel}>{frame}</PluginFrameProvider> : frame;
}

type PanelWorkflowHeaderInput = {
  panel:PanelInstance;
  runtimeFallback:PanelRuntimeFallback;
  executionTargetId:string;
  experimentId?:string;
  experimentCommitId?:string;
  editing:boolean;
  runInputOverrides:() => Record<string,unknown>;
  selectedRobotIds:readonly string[];
  pending:'run'|'stop'|'';
  pendingSelectionIdentity:string;
  localSelectionByRunId:ReadonlyMap<string,string>;
  locallyStoppedRunIds:ReadonlySet<string>;
};

/** Everything Run/Stop derives for one Panel header from one Run snapshot. */
function panelWorkflowHeaderState(snapshot:DashboardRunSnapshot,input:PanelWorkflowHeaderInput) {
  const {
    panel,runtimeFallback,executionTargetId,experimentId,experimentCommitId,editing,runInputOverrides,
    selectedRobotIds,pending,pendingSelectionIdentity,localSelectionByRunId,locallyStoppedRunIds,
  } = input;
  const { actions,fullRunRelations } = snapshot;
  const automationFallback = panelFallbackRuntime(snapshot,runtimeFallback);
  const automation = panelAutomationRuntime(snapshot,executionTargetId,runtimeFallback);
  const binding = panelWorkflowBinding(panel);
  const panelRoots = actions.activeRuns.filter((run) => {
    if (run.actionId !== SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
      && run.actionId !== SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction) return false;
    const exact = exactRun(actions,automation,run.id);
    if (exact?.status && !isRunStatusActive(exact.status)) return false;
    return exact
      ? exact.parameters.panelId === panel.id
      : run.panelId === panel.id;
  });
  const fullRoots=actions.activeRuns.filter((run) => run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run);
  const exactRunDetails=mergeRunDetailsById(actions.runDetailsById,automation.runDetailsById);
  const fullManaged=Boolean(binding?.managed && fullRoots.length>0);
  const fullProjection=fullManaged && fullRoots.length!==1
    ? { state:'unavailable' as const,children:[] }
    : projectFullRunPanel(
      fullManaged ? fullRoots[0] : undefined,fullRunRelations,binding?.workflowInstanceId ?? '',exactRunDetails,
    );
  const selectionScoped=isRobotInstrumentPanel(panel);
  const fullRunStarting=!selectionScoped && Boolean(binding?.managed) && actions.startInFlight;
  const runOverrides=runInputOverrides();
  const selectedParams=selectionScoped
    ? canonicalRobotSelectionParameters([...selectedRobotIds])
    : canonicalRobotSelectionParameters(
      Array.isArray(runOverrides.robotIds) ? runOverrides.robotIds as string[] : [],
    );
  const selectedIds=new Set(selectedParams.robotIds);
  const currentSelectionIdentity=selectionScoped
    ? selectedRobotConnectionIdentity(selectedParams)
    : '';
  const unresolvedSelectionRoot=selectionScoped && panelRoots.some((root) => (
    !exactRun(actions,automation,root.id) && !localSelectionByRunId.has(root.id)
  ));
  const slotParentRunIds=[
    ...panelRoots.map((root) => root.id),
    ...fullProjection.children.map((child) => child.childRunId),
  ];
  const slotGroupsKnown=selectionScoped && instrumentSlotGroupsKnown(exactRunDetails,slotParentRunIds);
  const instrumentCoverages=selectionScoped ? instrumentConnectionCoverages(
    panelRoots,exactRunDetails,localSelectionByRunId,
  ).filter((coverage) => !coverage.coversAll || !slotGroupsKnown) : [];
  const liveSelectedSlots=selectionScoped ? liveInstrumentSlotStops(
    exactRunDetails,slotParentRunIds,selectedIds,
  ) : [];
  if (liveSelectedSlots.length > 0) {
    instrumentCoverages.push({
      robotIds:[...new Set(liveSelectedSlots.map((slot) => slot.itemKey))],
      coversAll:false,
    });
  }
  const connectedIds=connectedRobotIdsForSelection(selectedParams.robotIds,instrumentCoverages);
  const partition=partitionSelectedRobotConnection(selectedParams.robotIds,connectedIds);
  const toDisconnect=new Set(partition.toDisconnect);
  const slotStops=selectionScoped ? liveInstrumentSlotStops(
    exactRunDetails,slotParentRunIds,toDisconnect,locallyStoppedRunIds,
  ) : [];
  const containedDisconnectRoots=selectionScoped ? panelRoots.filter((root) => {
    if (locallyStoppedRunIds.has(root.id)) return false;
    const coverage=instrumentConnectionCoverageFromRoot(
      exactRun(actions,automation,root.id) ?? undefined,
      localSelectionByRunId.get(root.id),
    );
    return Boolean(coverage && !coverage.coversAll && coverage.robotIds.length > 0
      && coverage.robotIds.every((id) => toDisconnect.has(id)));
  }) : [];
  const stoppableDisconnectIds=new Set([
    ...containedDisconnectRoots.flatMap((root) => (
      instrumentConnectionCoverageFromRoot(
        exactRun(actions,automation,root.id) ?? undefined,
        localSelectionByRunId.get(root.id),
      )?.robotIds ?? []
    )),
    ...slotStops.map((slot) => slot.itemKey),
  ]);
  const canDisconnectSelection=partition.toDisconnect.every((id) => stoppableDisconnectIds.has(id));
  const selectionStopping=selectionScoped && (
    liveSelectedSlots.some(({child}) => locallyStoppedRunIds.has(child.childRunId)
      || child.runStatus==='stopping')
    || panelRoots.some((root) => {
      const run=exactRun(actions,automation,root.id);
      if (!locallyStoppedRunIds.has(root.id) && run?.status!=='stopping') return false;
      const coverage=instrumentConnectionCoverageFromRoot(run,localSelectionByRunId.get(root.id));
      return coverage && (coverage.coversAll || coverage.robotIds.some((id) => selectedIds.has(id)));
    })
  );
  const roots=selectionScoped ? containedDisconnectRoots : panelRoots;
  const projectedRoots=roots.filter((root) => !locallyStoppedRunIds.has(root.id));
  const projectedChildren=fullProjection.children.filter((child) => !locallyStoppedRunIds.has(child.childRunId));
  const projectionUnavailable=!selectionScoped && fullManaged
    && fullProjection.state==='unavailable' && projectedRoots.length===0;
  const active = projectedRoots.length > 0
    || (!selectionScoped && (projectedChildren.length > 0 || projectionUnavailable))
    || fullRunStarting
    || (!selectionScoped && Boolean(binding?.managed) && actions.stopAllInFlight)
    || pending === 'stop'
    || (pending === 'run' && (!selectionScoped || pendingSelectionIdentity===currentSelectionIdentity));
  const baseBusy = editing || Boolean(pending) || actions.stopAllInFlight || projectionUnavailable
    || selectionStopping || (selectionScoped && unresolvedSelectionRoot);
  return {
    actions,automation,automationFallback,binding,exactRunDetails,localSelectionByRunId,
    selectionScoped,fullManaged,fullProjection,fullRunStarting,partition,unresolvedSelectionRoot,
    containedDisconnectRoots,slotStops,canDisconnectSelection,selectionStopping,
    projectedRoots,projectedChildren,projectionUnavailable,active,baseBusy,
    reconnectScopeKey:JSON.stringify([experimentId,experimentCommitId,panel.id,binding,executionTargetId,automation.targetId,automationFallback.targetId,actions.runMode]),
    reconnectCanceled:!binding || !selectionScoped || editing || actions.stopAllInFlight
      // A partial Session may close as a result of this batch's own last
      // Panel Stop. Full-session shutdown is external to selected reconnect.
      || actions.sessionViews.some((view) => view.session.experimentResourceId===experimentId
        && view.session.mode==='full' && view.session.state==='stopping')
      || fullRoots.some((root) => (exactRun(actions,automation,root.id)?.status ?? root.status)==='stopping'),
  };
}

type PanelWorkflowHeaderState = ReturnType<typeof panelWorkflowHeaderState>;

/** Exactly what the header renders from its state. */
function panelWorkflowHeaderView(state:PanelWorkflowHeaderState) {
  return {
    bound:Boolean(state.binding),
    selectionScoped:state.selectionScoped,
    active:state.active,
    baseBusy:state.baseBusy,
    stopAllInFlight:state.actions.stopAllInFlight,
    runModeSelected:Boolean(state.actions.runMode),
    selectedCount:state.partition.selected.length,
    toConnectCount:state.partition.toConnect.length,
    toDisconnectCount:state.partition.toDisconnect.length,
    canDisconnectSelection:state.canDisconnectSelection,
    selectionStopping:Boolean(state.selectionStopping),
    unresolvedSelectionRoot:state.unresolvedSelectionRoot,
    reconnectProjectionUnavailable:state.fullManaged && state.fullProjection.state==='unavailable',
    reconnectScopeKey:state.reconnectScopeKey,
    reconnectCanceled:state.reconnectCanceled,
  };
}

function selectionStopPlan(state:PanelWorkflowHeaderState,panelId:string):InstrumentReconnectStop[] {
  const { actions,automation,automationFallback,exactRunDetails,localSelectionByRunId } = state;
  const remaining=new Set(state.partition.toDisconnect);
  const targets:InstrumentReconnectStop[]=state.containedDisconnectRoots.map((root) => {
    instrumentConnectionCoverageFromRoot(
      exactRun(actions,automation,root.id) ?? undefined,localSelectionByRunId.get(root.id),
    )?.robotIds.forEach((id) => remaining.delete(id));
    return { targetId:automationFallback.targetId,run:root,
      stop:() => actions.stopPanelAction(root,`Stop Panel ${panelId}`) };
  });
  state.slotStops.filter((slot) => remaining.has(slot.itemKey)).forEach(({ child }) => {
    const status=panelChildRunStatus(child,exactRunDetails);
    const revision=panelChildRunRevision(child,exactRunDetails);
    if (!status || !revision) throw new Error('Selected robot disconnect status is unavailable.');
    targets.push({ targetId:automation.targetId,run:{ id:child.childRunId,status,revision },
      stop:() => stopPanelChild(automation,child,panelId,exactRunDetails) });
  });
  return targets;
}

/** Exact Run observations the selected reconnect barrier follows, per target. */
function instrumentReconnectObservations(
  snapshot:DashboardRunSnapshot,executionTargetId:string,runtimeFallback:PanelRuntimeFallback,
) {
  const { actions } = snapshot;
  const automationFallback = panelFallbackRuntime(snapshot,runtimeFallback);
  const automation = panelAutomationRuntime(snapshot,executionTargetId,runtimeFallback);
  return new Map([
    [automationFallback.targetId,{ retainRunObservation:automationFallback.retainRunObservation,runDetailsById:mergeRunDetailsById(actions.runDetailsById,automationFallback.runDetailsById) }],
    [automation.targetId,{ retainRunObservation:automation.retainRunObservation,runDetailsById:automation.targetId===automationFallback.targetId ? mergeRunDetailsById(actions.runDetailsById,automation.runDetailsById) : automation.runDetailsById }],
  ]);
}

function PanelWorkflowHeaderControl({
  panel,runtimeFallback,executionTargetId,experimentId,experimentCommitId,editing,runInputOverrides,
}: {
  panel:PanelInstance;
  runtimeFallback:PanelRuntimeFallback;
  executionTargetId:string;
  experimentId?:string;
  experimentCommitId?:string;
  editing:boolean;
  runInputOverrides:() => Record<string,unknown>;
}) {
  const [pending,setPending] = useState<'run'|'stop'|''>('');
  const [pendingSelectionIdentity,setPendingSelectionIdentity] = useState('');
  const [localSelectionByRunId,setLocalSelectionByRunId] = useState<ReadonlyMap<string,string>>(() => new Map());
  const [locallyStoppedRunIds,setLocallyStoppedRunIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedRobotIds] = useRobotSelection({ experimentId,shared:'experiment' });
  const store = useDashboardRunStore();
  const input:PanelWorkflowHeaderInput = {
    panel,runtimeFallback,executionTargetId,experimentId,experimentCommitId,editing,runInputOverrides,
    selectedRobotIds,pending,pendingSelectionIdentity,localSelectionByRunId,locallyStoppedRunIds,
  };
  // Run/Stop derives from the whole Run lifecycle, but this header re-renders
  // only when what it shows changes. Commands derive their targets from the
  // latest Run snapshot when they run.
  const view = useDashboardRunSelection((snapshot) => panelWorkflowHeaderView(panelWorkflowHeaderState(snapshot,input)));
  const latest = () => panelWorkflowHeaderState(store.get(),input);
  const reconnect = useRobotInstrumentReconnect({
    scopeKey:view.reconnectScopeKey,
    targetId:executionTargetId,
    canceled:view.reconnectCanceled,
    observations:() => instrumentReconnectObservations(store.get(),executionTargetId,runtimeFallback),
    subscribe:store.subscribe,
    start:(ids) => store.get().actions.startPanel(panel.id,canonicalRobotSelectionParameters([...ids])),
    onStarted:(started,ids) => {
      const identity=selectedRobotConnectionIdentity(canonicalRobotSelectionParameters([...ids]));
      setLocalSelectionByRunId((current) => new Map(current).set(started.id,identity));
    },
  });
  const busy=view.baseBusy || reconnect.busy;
  // Panel workflow Run/Stop drives robot connections. Run verifies the
  // operator session first; Stop is a safety path and is never gated.
  const controlSession = useOperatorControlSession();
  const sessionCopy = operatorAccessCopy(useAppLanguage());
  const sessionBlockReason = controlSession.phase === 'denied'
    ? sessionCopy.controlSessionDenied
    : controlSession.phase === 'unavailable' ? sessionCopy.controlSessionUnavailable : '';
  const stopDisabled = editing || pending === 'stop' || view.stopAllInFlight;
  const stop = async () => {
    const state = latest();
    if (state.selectionScoped && state.partition.toDisconnect.length===0) return;
    const abortAdmission = state.fullRunStarting || pending === 'run' || state.projectionUnavailable;
    setPending('stop');
    try {
      let stoppedRunIds:string[]=[];
      if (state.selectionScoped) {
        const targets=selectionStopPlan(state,panel.id);
        await Promise.all(targets.map((target) => target.stop()));
        stoppedRunIds=targets.map((target) => target.run.id);
      } else if (state.projectedRoots.length > 0) {
        await Promise.all(state.projectedRoots.map((root) => state.actions.stopPanelAction(
          root,`Stop Panel ${panel.id}`,
        )));
        stoppedRunIds=state.projectedRoots.map((root) => root.id);
      } else if (state.projectedChildren.length > 0) {
        await Promise.all(state.projectedChildren.map((child) => stopPanelChild(
          state.automation,child,panel.id,state.exactRunDetails,
        )));
        stoppedRunIds=state.projectedChildren.map((child) => child.childRunId);
      } else if (abortAdmission) {
        await state.actions.stopExperiment();
      }
      if (stoppedRunIds.length > 0) {
        setLocallyStoppedRunIds((current) => new Set([...current,...stoppedRunIds]));
      }
    } finally {
      setPending('');
    }
  };
  const start = () => {
    if (sessionBlockReason) return;
    void ensureOperatorControlSession().then((granted) => {
      if (granted) startNow();
    });
  };
  const startNow = () => {
    const state = latest();
    if (state.selectionScoped) {
      if (state.partition.toConnect.length===0) return;
      const overrides=canonicalRobotSelectionParameters(state.partition.toConnect);
      const selectionIdentity=JSON.stringify([overrides.selectionKey,overrides.robotIds]);
      setPending('run');
      setPendingSelectionIdentity(selectionIdentity);
      void state.actions.startPanel(panel.id,overrides).then((started) => {
        setLocalSelectionByRunId((current) => new Map(current).set(started.id,selectionIdentity));
      }).catch(() => undefined).finally(() => {
        setPending('');
        setPendingSelectionIdentity('');
      });
      return;
    }
    setPending('run');
    setPendingSelectionIdentity('');
    void state.actions.startPanel(panel.id,runInputOverrides()).catch(() => undefined).finally(() => {
      setPending((current) => current === 'run' ? '' : current);
    });
  };
  if (!view.bound) return null;
  if (view.selectionScoped) {
    const hasSelection=view.selectedCount > 0;
    const connectDisabled = busy || Boolean(sessionBlockReason) || !hasSelection || view.toConnectCount===0 || !view.runModeSelected;
    const disconnectDisabled = busy || !hasSelection || view.toDisconnectCount===0 || !view.canDisconnectSelection;
    const reconnectDisabled = busy || !hasSelection || !view.canDisconnectSelection || !view.runModeSelected
      || view.reconnectProjectionUnavailable;
    const reconnectTitle = reconnect.busy
      ? reconnect.phase==='connecting' ? 'Reconnecting selected robots' : 'Waiting for all selected robots to disconnect'
      : !hasSelection ? 'Select robots to reconnect'
        : view.stopAllInFlight ? 'The Experiment is stopping'
          : view.selectionStopping ? 'Waiting for previous disconnect to finish'
            : view.reconnectProjectionUnavailable || view.unresolvedSelectionRoot ? 'Waiting for selected robot connection status'
              : !view.runModeSelected ? 'Select an Experiment run mode'
                : !view.canDisconnectSelection ? 'Cannot disconnect selected robots without stopping others'
          : 'Reconnect selected robots';
    const connectTitle = sessionBlockReason || (!hasSelection
      ? 'Select robots to connect'
      : view.selectionStopping
        ? 'Waiting for previous disconnect to finish'
        : view.toConnectCount===0
          ? 'Selected robots already connected'
          : view.toDisconnectCount > 0
            ? 'Connect remaining selected robots'
            : 'Connect selected robots');
    const disconnectTitle = !hasSelection
      ? 'Select robots to disconnect'
      : view.selectionStopping
        ? 'Waiting for previous disconnect to finish'
        : view.toDisconnectCount===0
          ? 'Selected robots are not connected'
          : !view.canDisconnectSelection
            ? 'Cannot disconnect selected robots without stopping others'
            : view.toConnectCount > 0
              ? 'Disconnect connected selected robots'
              : 'Disconnect selected robots';
    return (
      <span
        data-xgc-role="robot-instruments-connection"
        data-xgc-id={panel.id}
        aria-label="Selected robot connection"
      >
        <ControlButton
          className="xgc-panel-runtime-action"
          size="compact"
          appearance="raised"
          iconOnly
          title={connectTitle}
          aria-label="Connect selected robots"
          dataXgcRole="panel-workflow-run"
          dataXgcId={panel.id}
          disabled={connectDisabled}
          onClick={(event) => { event.stopPropagation();start(); }}
        >
          <Plug size={13} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          className="xgc-panel-runtime-action"
          size="compact"
          appearance="raised"
          iconOnly
          title={disconnectTitle}
          aria-label="Disconnect selected robots"
          dataXgcRole="panel-workflow-stop"
          dataXgcId={panel.id}
          disabled={disconnectDisabled}
          onClick={(event) => { event.stopPropagation();void stop().catch(() => undefined); }}
        >
          <Unplug size={13} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          className="xgc-panel-runtime-action"
          size="compact"
          appearance="raised"
          iconOnly
          title={reconnectTitle}
          aria-label="Reconnect selected robots"
          dataXgcRole="panel-workflow-reconnect"
          dataXgcId={panel.id}
          disabled={reconnectDisabled}
          onClick={(event) => {
            event.stopPropagation();
            const state=latest();
            reconnect.reconnect(state.partition.selected,selectionStopPlan(state,panel.id));
          }}
        >
          <RotateCw size={13} aria-hidden="true" />
        </ControlButton>
        {sessionBlockReason ? (
          <ControlButton
            className="xgc-panel-runtime-action"
            size="compact"
            appearance="ghost"
            title={sessionBlockReason}
            aria-label={sessionCopy.controlSessionRetry}
            dataXgcRole="operator-control-session-retry"
            dataXgcId={panel.id}
            disabled={controlSession.ensuring}
            onClick={(event) => { event.stopPropagation();controlSession.retry(); }}
          >
            {sessionCopy.controlSessionRetry}
          </ControlButton>
        ) : null}
      </span>
    );
  }
  return view.active ? (
    <ControlButton
      className="xgc-panel-runtime-action"
      size="compact"
      appearance="raised"
      tone="danger"
      iconOnly
      title="Stop Panel workflow"
      aria-label={`Stop ${panel.title} workflow`}
      dataXgcRole="panel-workflow-stop"
      dataXgcId={panel.id}
      data-xgc-status="running"
      disabled={stopDisabled}
      onClick={(event) => { event.stopPropagation();void stop().catch(() => undefined); }}
    >
      <Square size={13} aria-hidden="true" />
    </ControlButton>
  ) : (
    <>
      <ControlButton
        className="xgc-panel-runtime-action"
        size="compact"
        appearance="raised"
        iconOnly
        title={sessionBlockReason || 'Run Panel workflow'}
        aria-label={`Run ${panel.title} workflow`}
        dataXgcRole="panel-workflow-run"
        dataXgcId={panel.id}
        data-xgc-status="stopped"
        disabled={busy || Boolean(sessionBlockReason) || !view.runModeSelected}
        onClick={(event) => { event.stopPropagation();start(); }}
      >
        <Play size={13} aria-hidden="true" />
      </ControlButton>
      {sessionBlockReason ? (
        <ControlButton
          className="xgc-panel-runtime-action"
          size="compact"
          appearance="ghost"
          title={sessionBlockReason}
          aria-label={sessionCopy.controlSessionRetry}
          dataXgcRole="operator-control-session-retry"
          dataXgcId={panel.id}
          disabled={controlSession.ensuring}
          onClick={(event) => { event.stopPropagation();controlSession.retry(); }}
        >
          {sessionCopy.controlSessionRetry}
        </ControlButton>
      ) : null}
    </>
  );
}

function exactRun(
  actions:Pick<ExperimentDashboardActions,'runDetailsById'>,
  automation:AutomationPanelContext['automation'],
  runId:string,
) {
  return actions.runDetailsById[runId]?.run ?? automation.runDetailsById[runId]?.run;
}

function instrumentConnectionCoverageFromRoot(
  run:AutomationRun|undefined,
  localIdentity?:string,
) {
  if (run) {
    const encoded=run.parameters.inputOverridesJson;
    if (typeof encoded==='string') {
      try {
        const parsed:unknown=JSON.parse(encoded);
        if (parsed && typeof parsed==='object') {
          const input=parsed as Record<string,unknown>;
          if (Array.isArray(input.robotIds)
            && input.robotIds.every((id) => typeof id==='string')
            && typeof input.selectionKey==='string') {
            const robotIds=input.robotIds as string[];
            return {
              robotIds:canonicalRobotSelectionParameters(robotIds).robotIds,
              coversAll:instrumentRunCoversAll(robotIds,input.selectionKey),
            };
          }
        }
      } catch {
        return undefined;
      }
    }
  }
  if (!localIdentity) return undefined;
  try {
    const parsed:unknown=JSON.parse(localIdentity);
    if (!Array.isArray(parsed) || parsed.length!==2 || typeof parsed[0]!=='string' || !Array.isArray(parsed[1])) {
      return undefined;
    }
    const robotIds=parsed[1].filter((id):id is string => typeof id==='string');
    return {
      robotIds:canonicalRobotSelectionParameters(robotIds).robotIds,
      coversAll:instrumentRunCoversAll(robotIds,parsed[0]),
    };
  } catch {
    return undefined;
  }
}

function instrumentConnectionCoverages(
  roots:readonly { id:string }[],
  details:Readonly<Record<string,AutomationRunDetail>>,
  localSelectionByRunId:ReadonlyMap<string,string>,
) {
  return roots.flatMap((root) => {
    const coverage=instrumentConnectionCoverageFromRoot(
      details[root.id]?.run,localSelectionByRunId.get(root.id),
    );
    return coverage ? [coverage] : [];
  });
}

function robotSelectionRunIdentity(input:Record<string,unknown>) {
  if (!Array.isArray(input.robotIds)
    || input.robotIds.some((id) => typeof id!=='string' || !id.trim())
    || typeof input.robotId!=='string'
    || typeof input.selectionKey!=='string') return '';
  const canonical=canonicalRobotSelectionParameters(input.robotIds as string[]);
  if (canonical.robotIds.length!==input.robotIds.length
    || canonical.robotIds.some((id,index) => id!==(input.robotIds as string[])[index]!.trim())
    || input.robotId.trim()!==canonical.robotId
    || input.selectionKey!==canonical.selectionKey) return '';
  return JSON.stringify([canonical.selectionKey,canonical.robotIds]);
}

function selectedRobotConnectionIdentity(input:Record<string,unknown>) {
  if (!Array.isArray(input.robotIds) || input.robotIds.length===0) return '';
  return robotSelectionRunIdentity(input);
}

function useFullRunRelations(actions:ExperimentDashboardActions):FullRunRelationsSnapshot|undefined {
  const roots=actions.activeRuns.filter((run) => run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run);
  const root=roots.length===1 ? roots[0] : undefined;
  const cachedDetail=root ? actions.runDetailsById[root.id] : undefined;
  const cached=root && cachedDetail?.run?.revision===root.revision ? cachedDetail.relations : undefined;
  const [fetched,setFetched]=useState<FullRunRelationsSnapshot>();
  const rootId=root?.id ?? '';
  const rootRevision=root?.revision ?? 0;
  const rootTargetId=root?.targetId ?? '';
  // Relations already retained for this exact root revision are used in the
  // same render; only a missing projection is read, then keyed by revision.
  const fetchRelations=Boolean(rootId) && !cached;
  useEffect(() => {
    if (!fetchRelations) return undefined;
    let current=true;
    setFetched({ rootId,rootRevision,loading:true,error:'' });
    const read=readFullRunRelations(rootTargetId,rootId,rootRevision);
    void read.relations.then((relations) => {
      if (current) setFetched({ rootId,rootRevision,loading:false,error:'',relations });
    }).catch((cause:unknown) => {
      if (current) {
        setFetched({
          rootId,rootRevision,loading:false,
          error:cause instanceof Error && cause.message.trim() ? cause.message : 'Panel workflow state is unavailable.',
        });
      }
    });
    return () => {
      current=false;
      read.release();
    };
  },[fetchRelations,rootId,rootRevision,rootTargetId]);
  return useMemo(() => {
    if (!root) return undefined;
    if (cached) return { rootId:root.id,rootRevision:root.revision,loading:false,error:'',relations:cached };
    if (fetched?.rootId===root.id && fetched.rootRevision===root.revision) return fetched;
    return { rootId:root.id,rootRevision:root.revision,loading:true,error:'' };
  },[cached,fetched,root]);
}

type SharedRelationsRead = {
  relations:Promise<AutomationExecutionRelations>;
  controller:AbortController;
  readers:number;
};
const relationsReads = new Map<string,SharedRelationsRead>();

/**
 * Every mounted dashboard of the Experiment (visited hidden ones included)
 * projects the same full Run root. They join one in-flight relations read
 * per exact root revision; it is aborted only when its last reader leaves.
 */
function readFullRunRelations(targetId:string,rootId:string,rootRevision:number) {
  const key=JSON.stringify([targetId,rootId,rootRevision]);
  let read=relationsReads.get(key);
  if (!read) {
    const controller=new AbortController();
    const relations=getAutomationExecutionRelations(targetId,rootId,{ signal:controller.signal });
    const created:SharedRelationsRead={ relations,controller,readers:0 };
    const forget=() => { if (relationsReads.get(key)===created) relationsReads.delete(key); };
    relations.then(forget,forget);
    relationsReads.set(key,created);
    read=created;
  }
  const shared=read;
  shared.readers+=1;
  let released=false;
  return {
    relations:shared.relations,
    release:() => {
      if (released) return;
      released=true;
      shared.readers-=1;
      if (shared.readers>0) return;
      shared.controller.abort();
      if (relationsReads.get(key)===shared) relationsReads.delete(key);
    },
  };
}

type RunDetailsById = Readonly<Record<string,AutomationRunDetail>>;
const NO_RUN_DETAILS:RunDetailsById = {};
const mergedRunDetails = new WeakMap<RunDetailsById,WeakMap<RunDetailsById,RunDetailsById>>();

/**
 * Newest exact Run per id across the lifecycle projection and a Panel's
 * runtime. Both are immutable snapshots (often the same local one), so each
 * pair is merged once and shared by every Panel instead of per render.
 */
function mergeRunDetailsById(primary:RunDetailsById|undefined,secondary:RunDetailsById|undefined):RunDetailsById {
  if (!primary || primary===secondary) return secondary ?? primary ?? NO_RUN_DETAILS;
  if (!secondary) return primary;
  let bySecondary = mergedRunDetails.get(primary);
  if (!bySecondary) {
    bySecondary = new WeakMap();
    mergedRunDetails.set(primary,bySecondary);
  }
  const cached = bySecondary.get(secondary);
  if (cached) return cached;
  const merged:Record<string,AutomationRunDetail>={ ...primary };
  Object.entries(secondary).forEach(([id,detail]) => {
    const previous=merged[id];
    const previousRun=previous?.run;
    const nextRun=detail.run;
    if (!previous || (!previousRun && nextRun)
      || (previousRun && nextRun && nextRun.revision>=previousRun.revision)) {
      merged[id]=detail;
    }
  });
  bySecondary.set(secondary,merged);
  return merged;
}

function fullRunPanelRelationSet(
  root:ExperimentDashboardActions['activeRuns'][number]|undefined,
  snapshot:FullRunRelationsSnapshot|undefined,
  workflowInstanceId:string,
) {
  if (!root || !snapshot || snapshot.rootId!==root.id || snapshot.rootRevision!==root.revision
    || snapshot.loading || snapshot.error || !snapshot.relations) return undefined;
  const groups=snapshot.relations.childRunGroups.filter((group) => group.producerNodeId==='run-panels');
  const groupIds=new Set(groups.map((group) => group.id));
  if (groupIds.size===0) return undefined;
  const members=snapshot.relations.childRunGroupMembers.filter((member) => (
    groupIds.has(member.groupId) && member.itemKey===workflowInstanceId
  ));
  const children=[...new Map(members.flatMap((member) => {
    if (member.state==='abandoned') return [];
    const child=snapshot.relations ? experimentChildRunRelations(snapshot.relations,member.childRunId)[0] : undefined;
    return child ? [[child.childRunId,child] as const] : [];
  })).values()];
  return { groups,members,children };
}

function panelChildRunRelationRevision(
  child:Pick<AutomationChildRunRelation,'targetRoot'|'observedRevision'|'runRevision'>,
) {
  return child.targetRoot ? child.observedRevision : child.runRevision;
}

function exactPanelChildRun(
  child:Pick<AutomationChildRunRelation,'childRunId'|'targetId'>
    & Partial<Pick<AutomationChildRunRelation,'targetRoot'|'observedRevision'|'runRevision'>>,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>>,
) {
  const run=exactRunDetails[child.childRunId]?.run;
  if (!run || run.id!==child.childRunId || run.targetId!==child.targetId) return undefined;
  const relationRevision=panelChildRunRelationRevision(child);
  return relationRevision && run.revision<relationRevision ? undefined : run;
}

function panelChildRunStatus(
  child:AutomationChildRunRelation,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>>,
) {
  return exactPanelChildRun(child,exactRunDetails)?.status
    ?? (child.targetRoot ? child.observedStatus : child.runStatus);
}

function panelChildRunRevision(
  child:AutomationChildRunRelation,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>>,
) {
  return exactPanelChildRun(child,exactRunDetails)?.revision
    ?? panelChildRunRelationRevision(child);
}

function projectFullRunPanel(
  root:ExperimentDashboardActions['activeRuns'][number]|undefined,
  snapshot:FullRunRelationsSnapshot|undefined,
  workflowInstanceId:string,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>> = {},
):{ state:'active'|'inactive'|'unavailable';children:AutomationChildRunRelation[] } {
  if (!root) return { state:'inactive',children:[] };
  if (!snapshot || snapshot.rootId!==root.id || snapshot.rootRevision!==root.revision
    || snapshot.loading || snapshot.error || !snapshot.relations) {
    return { state:'unavailable',children:[] };
  }
  const relationSet=fullRunPanelRelationSet(root,snapshot,workflowInstanceId);
  if (!relationSet) return { state:'unavailable',children:[] };
  const { groups,members,children:relationChildren }=relationSet;
  if (members.length===0 && groups.some((group) => group.state==='open')) {
    return { state:'unavailable',children:[] };
  }
  if (members.some((member) => member.state==='queued' || member.state==='leased')) {
    return { state:'unavailable',children:[] };
  }
  const childrenById=new Map(relationChildren.map((child) => [child.childRunId,child]));
  const children=members.flatMap((member) => {
    if (member.state==='abandoned') return [];
    const child=childrenById.get(member.childRunId);
    if (!child) return [];
    const status=panelChildRunStatus(child,exactRunDetails);
    return status && isRunStatusActive(status) ? [child] : [];
  });
  const missingLiveChild=members.some((member) => (
    member.state!=='terminal' && member.state!=='abandoned'
    && !relationChildren.some((child) => {
      if (child.childRunId!==member.childRunId) return false;
      return Boolean(child.targetRoot ? child.observedStatus && child.observedRevision : child.runStatus && child.runRevision);
    })
  ));
  if (missingLiveChild) return { state:'unavailable',children:[] };
  return { state:children.length>0 ? 'active' : 'inactive',children };
}

// This projector is exported for fail-closed relation tests; it is not a React component.
// eslint-disable-next-line react-refresh/only-export-components
export function fullRunPanelInvocationFallback(
  panel:PanelInstance,
  actions:Pick<ExperimentDashboardActions,'activeRuns'>,
  snapshot:FullRunRelationsSnapshot|undefined,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>> = {},
) {
  const binding=panelWorkflowBinding(panel);
  if (!binding) return undefined;
  const roots=actions.activeRuns.filter((run) => (
    run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run
  ));
  if (roots.length!==1) return undefined;
  const root=roots[0];
  const projection=projectFullRunPanel(root,snapshot,binding.workflowInstanceId,exactRunDetails);
  if (projection.state!=='active' || projection.children.length!==1) return undefined;
  const child=projection.children[0];
  const status=panelChildRunStatus(child,exactRunDetails);
  const revision=panelChildRunRevision(child,exactRunDetails);
  if (!status || !revision) return undefined;
  return { rootRunId:root.id,targetId:child.targetId,id:child.childRunId,status,revision };
}

async function stopPanelChild(
  automation:AutomationPanelContext['automation'],
  child:AutomationChildRunRelation,
  panelId:string,
  exactRunDetails:Readonly<Record<string,AutomationRunDetail>> = {},
) {
  const status=panelChildRunStatus(child,exactRunDetails);
  const revision=panelChildRunRevision(child,exactRunDetails);
  if (!status || !revision) {
    throw new Error(`Panel workflow Run ${child.childRunId} has no exact status/revision projection.`);
  }
  return automation.stopRunSet({ id:child.childRunId,status,revision },{
    includeAnchor:true,includeDetached:true,reason:`Stop Panel ${panelId}`,
  });
}

type PanelRunViewInput = {
  panel:PanelInstance;
  experiment?:ExperimentDocument;
  executionTargetId:string;
  runtimeFallback:PanelRuntimeFallback;
  scoped:boolean;
  cache:PanelRunScopeCache;
};

/**
 * Everything the Panel body reads from one Run snapshot. Scoped Panels see
 * their target runtimes without Runs that belong only to other Panels, so a
 * Run event that concerns other Panels (e.g. one of a fleet's robot slot
 * Runs) leaves this view referentially equal.
 */
function panelRunView(snapshot:DashboardRunSnapshot,input:PanelRunViewInput) {
  const { actions } = snapshot;
  const fallbackRuntime = panelFallbackRuntime(snapshot,input.runtimeFallback);
  const automation = panelAutomationRuntime(snapshot,input.executionTargetId,input.runtimeFallback);
  const panelWorkflowInvocationFallback = fullRunPanelInvocationFallback(
    input.panel,actions,snapshot.fullRunRelations,
    mergeRunDetailsById(actions.runDetailsById,fallbackRuntime.runDetailsById),
  );
  if (!input.scoped) {
    return { actions,automation,runtimes:snapshot.runtimes,panelWorkflowInvocationFallback };
  }
  const scoped = scopePanelRunRuntimes(
    input.cache,automation,snapshot.runtimes,snapshotPanelRunOwners(snapshot,input.experiment),input.panel.id,
  );
  return { actions,automation:scoped.automation,runtimes:scoped.runtimes,panelWorkflowInvocationFallback };
}

/**
 * The Panel body's Run-state slot. It subscribes to its own Run view: a Run
 * event re-renders it only when that view changes, and the plugin below it
 * re-renders only when its resolved context actually changes.
 */
function ExperimentPanelRuntimeContent({
  panel,experiment,executionTargetId,runtimeFallback,disabledReason,editing,robotAssetCatalog,runInputOverrides,
}: {
  panel:PanelInstance;
  experiment?:ExperimentDocument;
  executionTargetId:string;
  runtimeFallback:PanelRuntimeFallback;
  disabledReason:string;
  editing:boolean;
  robotAssetCatalog:DashboardRenderContext['robotAssetCatalog'];
  runInputOverrides:() => Record<string,unknown>;
}) {
  const [cache] = useState(createPanelRunScopeCache);
  const plugin = getPanelPlugin(panel.pluginId);
  const scoped = !plugin || panelRunScopeApplies(plugin);
  const run = useDashboardRunSelection((snapshot) => panelRunView(snapshot,{
    panel,experiment,executionTargetId,runtimeFallback,scoped,cache,
  }));
  const { actions,automation,runtimes,panelWorkflowInvocationFallback } = run;
  const executionObserver = usePanelExecutionObserver(executionTargetId,runtimeFallback,automation);
  return <ExperimentPanelContent
    panel={panel}
    experiment={experiment}
    executionTargetId={executionTargetId}
    disabledReason={disabledReason}
    editing={editing}
    robotAssetCatalog={robotAssetCatalog}
    updateExperimentRobotBindings={actions.updateRobotBindings}
    updateExperimentRobotBindingsDisabledReason={actions.updateRobotBindingsDisabledReason}
    updateExperimentScene={actions.updateScene}
    updateExperimentSceneDisabledReason={actions.updateSceneDisabledReason}
    updateExperimentWorldBoundary={actions.updateWorldBoundary}
    updateExperimentWorldBoundaryDisabledReason={actions.updateWorldBoundaryDisabledReason}
    updateExperimentLocalizationOffset={actions.updateLocalizationOffset}
    updateExperimentLocalizationOffsetDisabledReason={actions.updateLocalizationOffsetDisabledReason}
    updateWorkflowPresetInputs={actions.updateWorkflowPresetInputs}
    updateWorkflowPresetInputsDisabledReason={actions.updateWorkflowPresetInputsDisabledReason}
    experimentLifecycle={{
      activeRun:actions.activeRun,
      activeRuns:actions.activeRuns,
      sessionViews:actions.sessionViews,
      ...(panelWorkflowInvocationFallback ? { panelWorkflowInvocationFallback } : {}),
      runMode:actions.runMode,
      placement:actions.placement,
      start:async (inputOverrides?:Record<string,unknown>,presetId?:string) => {
        const primaryPresetId=panelWorkflowBinding(panel)?.presetId;
        const requestedPresetId=presetId && presetId!==primaryPresetId ? presetId : undefined;
        const overrides=requestedPresetId === undefined
          ? { ...runInputOverrides(),...(inputOverrides ?? {}) }
          : inputOverrides ?? {};
        const started=requestedPresetId === undefined
          ? await actions.startPanel(panel.id,overrides)
          : await actions.startPanel(panel.id,overrides,requestedPresetId);
        return started ? {
          id:started.id,status:started.status,revision:started.revision,
        } : undefined;
      },
      stop:actions.stopExperiment,
      invokeAction:async (panelId,presetId,inputOverrides,reason) => {
        const invoked = await actions.invokePanelAction(panelId,presetId,inputOverrides,reason);
        return { id:invoked.id,status:invoked.status,revision:invoked.revision };
      },
      stopAction:actions.stopPanelAction,
    }}
    automation={automation}
    automationRuntimes={runtimes}
    executionObserver={executionObserver}
  />;
}

function panelWorkflowExecutionTarget(
  experiment:ExperimentDocument|undefined,
  panel:PanelInstance,
) {
  const workflow = panel.portBindings.find((binding) => binding.kind === 'workflow');
  if (!workflow) return '';
  return experiment?.spec.workflowInstances.find((instance) => instance.id === workflow.workflowInstanceId)
    ?.executionTargetId ?? '';
}

function panelWorkflowInstance(
  experiment:ExperimentDocument|undefined,
  panel:PanelInstance,
) {
  const workflow = panelWorkflowBinding(panel);
  if (!workflow) return undefined;
  return experiment?.spec.workflowInstances.find((instance) => instance.id === workflow.workflowInstanceId);
}

function panelWorkflowBinding(panel:PanelInstance) {
  return panel.portBindings.find((binding) => binding.kind === 'workflow');
}
