import { useEffect,useState,type CSSProperties,type DragEventHandler } from 'react';
import { Play,Plug,Square,Unplug,Workflow } from 'lucide-react';
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
import { usePanelAutomationRuntime } from './panelAutomationRuntimeContext';
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

export type DashboardRenderContext = {
  session: DashboardCanvasEditSession;
  layoutEditing: boolean;
  panels: DashboardCanvasPanelWorkspace;
  actions: ExperimentDashboardActions;
  coreNodes: CoreNode[];
  selectedTargetCore?: CoreNode;
  routedTargetCoreId?: string;
  executionTargetId: string;
  automation: AutomationPanelContext['automation'];
  localAutomation: AutomationPanelContext['automation'];
  fullRunRelations?: FullRunRelationsSnapshot;
  gcsMode: boolean;
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
  robotAssetCatalog = { assets: [],loading: false,error: '' },
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
  const renderContext: DashboardRenderContext = {
    session,
    layoutEditing,
    panels,
    actions,
    coreNodes,
    selectedTargetCore,
    routedTargetCoreId,
    executionTargetId,
    automation,
    localAutomation,
    fullRunRelations,
    gcsMode,
    robotAssetCatalog,
  };
  const selectedPanels = panels.items;
  const panelAutomationTargetIds = session.visibleExperiment?.spec.workflowInstances
    .flatMap((workflow) => workflow.executionTargetId ? [workflow.executionTargetId] : [])
    ?? [];
  const mountedPanelCounts = new Map<string,number>();
  const panelMountErrors = new Map<string,string>();
  for (const panel of selectedPanels) {
    const plugin = getPanelPlugin(panel.pluginId);
    const count = (mountedPanelCounts.get(panel.pluginId) ?? 0) + 1;
    mountedPanelCounts.set(panel.pluginId, count);
    if (plugin?.maxInstancesPerDashboard !== undefined && count > plugin.maxInstancesPerDashboard) {
      panelMountErrors.set(
        panel.id,
        `${plugin.name} is limited to ${plugin.maxInstancesPerDashboard} instance${plugin.maxInstancesPerDashboard === 1 ? '' : 's'} per dashboard. Remove this duplicate panel to enable it.`,
      );
    }
  }

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
        style={{
          '--xgc-workspace-gap-x': `${DASHBOARD_GAP}px`,
          '--xgc-workspace-gap-y': `${DASHBOARD_GAP}px`,
          '--xgc-workspace-row-height': `${DASHBOARD_ROW_HEIGHT}px`,
        } as CSSProperties}
        onDragOver={layoutEditing ? drop.onDragOver : undefined}
        onDrop={layoutEditing ? drop.onDrop : undefined}
      >
        <PanelAutomationRuntimeProvider
          targetIds={panelAutomationTargetIds}
          known={[automation,localAutomation]}
        >
          <DashboardGrid
            key={`${session.visibleExperiment?.head.resourceId ?? 'none'}:${dashboard.id}`}
            panels={selectedPanels}
            editing={layoutEditing}
            empty={<DashboardEmptyState dashboard={dashboard} editMode={layoutEditing} />}
            gcsMode={gcsMode}
            onLayoutCommit={panels.updateLayout}
          >
            {(panel) => renderDashboardPanel(panel, renderContext, panelMountErrors.get(panel.id) ?? '')}
          </DashboardGrid>
        </PanelAutomationRuntimeProvider>
      </div>
    </>
  );
}

function renderDashboardPanel(panel: PanelInstance, context: DashboardRenderContext, mountError: string) {
  const {
    session,
    layoutEditing,
    panels,
    actions,
    coreNodes,
    selectedTargetCore,
    routedTargetCoreId,
    executionTargetId,
    automation,
    localAutomation,
    fullRunRelations,
    gcsMode,
    robotAssetCatalog,
  } = context;
  const plugin = getPanelPlugin(panel.pluginId);
  const targetPolicy = plugin?.executionTargetPolicy ?? 'configurable';
  const localGCSPanel = targetPolicy === 'local';
  const panelAutomation = localGCSPanel ? localAutomation : automation;
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
  const panelWorkflowInvocationFallback=fullRunPanelInvocationFallback(
    panel,actions,fullRunRelations,
    mergeRunDetailsById(actions.runDetailsById,panelAutomation.runDetailsById),
  );
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
      chrome={!gcsMode && panels.items.length === 1 && plugin?.standalonePresentation === 'page' ? 'flat' : undefined}
      interactiveWhileEditing={Boolean(plugin?.interactiveWhileEditing)}
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
              actions={actions}
              automationFallback={panelAutomation}
              executionTargetId={targetExecutionId}
              experimentId={session.visibleExperiment?.head.resourceId}
              editing={layoutEditing}
              fullRunRelations={fullRunRelations}
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
          disabledReason={targetPermissionReason(targetCore, [...(plugin?.permissions ?? [])], `${plugin?.name ?? panel.pluginId} access`)}
          editing={layoutEditing}
          robotAssetCatalog={robotAssetCatalog}
          updateExperimentRobotBindings={actions.updateRobotBindings}
          updateExperimentRobotBindingsDisabledReason={actions.updateRobotBindingsDisabledReason}
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
            start:async () => {
              const started = await actions.startPanel(panel.id,panelWorkflowRunInputOverrides());
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
          automationFallback={panelAutomation}
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

function PanelWorkflowHeaderControl({
  panel,actions,automationFallback,executionTargetId,experimentId,editing,fullRunRelations,runInputOverrides,
}: {
  panel:PanelInstance;
  actions:ExperimentDashboardActions;
  automationFallback:AutomationPanelContext['automation'];
  executionTargetId:string;
  experimentId?:string;
  editing:boolean;
  fullRunRelations?:FullRunRelationsSnapshot;
  runInputOverrides:() => Record<string,unknown>;
}) {
  const [pending,setPending] = useState<'run'|'stop'|''>('');
  const [pendingSelectionIdentity,setPendingSelectionIdentity] = useState('');
  const [localSelectionByRunId,setLocalSelectionByRunId] = useState<ReadonlyMap<string,string>>(() => new Map());
  const [locallyStoppedRunIds,setLocallyStoppedRunIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedRobotIds] = useRobotSelection({ experimentId,shared:'experiment' });
  const automation = usePanelAutomationRuntime(executionTargetId,automationFallback);
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
  if (!binding) return null;
  const fullRunStarting=!selectionScoped && Boolean(binding.managed) && actions.startInFlight;
  const runOverrides=runInputOverrides();
  const selectedParams=selectionScoped
    ? canonicalRobotSelectionParameters(selectedRobotIds)
    : canonicalRobotSelectionParameters(
      Array.isArray(runOverrides.robotIds) ? runOverrides.robotIds as string[] : [],
    );
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
    panelRoots,exactRunDetails,localSelectionByRunId,locallyStoppedRunIds,
  ).filter((coverage) => !coverage.coversAll || !slotGroupsKnown) : [];
  const liveSelectedSlots=selectionScoped ? liveInstrumentSlotStops(
    exactRunDetails,slotParentRunIds,new Set(selectedParams.robotIds),locallyStoppedRunIds,
  ) : [];
  if (liveSelectedSlots.length > 0) {
    instrumentCoverages.push({
      robotIds:liveSelectedSlots.map((slot) => slot.itemKey),
      coversAll:false,
    });
  }
  const connectedIds=connectedRobotIdsForSelection(selectedParams.robotIds,instrumentCoverages);
  const partition=partitionSelectedRobotConnection(selectedParams.robotIds,connectedIds);
  const slotStops=selectionScoped ? liveInstrumentSlotStops(
    exactRunDetails,slotParentRunIds,new Set(partition.toDisconnect),locallyStoppedRunIds,
  ) : [];
  const containedDisconnectRoots=selectionScoped ? panelRoots.filter((root) => {
    if (locallyStoppedRunIds.has(root.id)) return false;
    const coverage=instrumentConnectionCoverageFromRoot(
      exactRun(actions,automation,root.id) ?? undefined,
      localSelectionByRunId.get(root.id),
    );
    return Boolean(coverage && !coverage.coversAll && coverage.robotIds.length > 0
      && coverage.robotIds.every((id) => partition.toDisconnect.includes(id)));
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
  const roots=selectionScoped ? containedDisconnectRoots : panelRoots;
  const projectedRoots=roots.filter((root) => !locallyStoppedRunIds.has(root.id));
  const projectedChildren=fullProjection.children.filter((child) => !locallyStoppedRunIds.has(child.childRunId));
  const projectionUnavailable=!selectionScoped && fullManaged
    && fullProjection.state==='unavailable' && projectedRoots.length===0;
  const active = projectedRoots.length > 0
    || (!selectionScoped && (projectedChildren.length > 0 || projectionUnavailable))
    || fullRunStarting
    || (!selectionScoped && Boolean(binding.managed) && actions.stopAllInFlight)
    || pending === 'stop'
    || (pending === 'run' && (!selectionScoped || pendingSelectionIdentity===currentSelectionIdentity));
  const busy = editing || Boolean(pending) || actions.stopAllInFlight || projectionUnavailable
    || (selectionScoped && unresolvedSelectionRoot);
  const stopDisabled = editing || pending === 'stop' || actions.stopAllInFlight;
  const stop = async () => {
    if (selectionScoped && partition.toDisconnect.length===0) return;
    const abortAdmission = fullRunStarting || pending === 'run' || projectionUnavailable;
    setPending('stop');
    try {
      let stoppedRunIds:string[]=[];
      if (selectionScoped) {
        const rootStops=containedDisconnectRoots.filter((root) => !locallyStoppedRunIds.has(root.id));
        if (rootStops.length > 0) {
          await Promise.all(rootStops.map((root) => actions.stopPanelAction(
            root,`Stop Panel ${panel.id}`,
          )));
          stoppedRunIds=rootStops.map((root) => root.id);
        }
        const remaining=new Set(partition.toDisconnect);
        rootStops.forEach((root) => {
          instrumentConnectionCoverageFromRoot(
            exactRun(actions,automation,root.id) ?? undefined,
            localSelectionByRunId.get(root.id),
          )?.robotIds.forEach((id) => remaining.delete(id));
        });
        const remainingSlots=slotStops.filter((slot) => remaining.has(slot.itemKey));
        if (remainingSlots.length > 0) {
          await Promise.all(remainingSlots.map((slot) => stopPanelChild(
            automation,slot.child,panel.id,exactRunDetails,
          )));
          stoppedRunIds=[...stoppedRunIds,...remainingSlots.map((slot) => slot.child.childRunId)];
        }
      } else if (projectedRoots.length > 0) {
        await Promise.all(projectedRoots.map((root) => actions.stopPanelAction(
          root,`Stop Panel ${panel.id}`,
        )));
        stoppedRunIds=projectedRoots.map((root) => root.id);
      } else if (projectedChildren.length > 0) {
        await Promise.all(projectedChildren.map((child) => stopPanelChild(
          automation,child,panel.id,exactRunDetails,
        )));
        stoppedRunIds=projectedChildren.map((child) => child.childRunId);
      } else if (abortAdmission) {
        await actions.stopExperiment();
      }
      if (stoppedRunIds.length > 0) {
        setLocallyStoppedRunIds((current) => new Set([...current,...stoppedRunIds]));
      }
    } finally {
      setPending('');
    }
  };
  const start = () => {
    if (selectionScoped) {
      if (partition.toConnect.length===0) return;
      const overrides=canonicalRobotSelectionParameters(partition.toConnect);
      const selectionIdentity=JSON.stringify([overrides.selectionKey,overrides.robotIds]);
      setPending('run');
      setPendingSelectionIdentity(selectionIdentity);
      void actions.startPanel(panel.id,overrides).then((started) => {
        setLocalSelectionByRunId((current) => new Map(current).set(started.id,selectionIdentity));
      }).catch(() => undefined).finally(() => {
        setPending('');
        setPendingSelectionIdentity('');
      });
      return;
    }
    setPending('run');
    setPendingSelectionIdentity('');
    void actions.startPanel(panel.id,runInputOverrides()).catch(() => undefined).finally(() => {
      setPending((current) => current === 'run' ? '' : current);
    });
  };
  if (selectionScoped) {
    const hasSelection=partition.selected.length > 0;
    const connectDisabled = busy || !hasSelection || partition.toConnect.length===0 || !actions.runMode;
    const disconnectDisabled = busy || !hasSelection || partition.toDisconnect.length===0 || !canDisconnectSelection;
    const connectTitle = !hasSelection
      ? 'Select robots to connect'
      : partition.toConnect.length===0
        ? 'Selected robots already connected'
        : partition.toDisconnect.length > 0
          ? 'Connect remaining selected robots'
          : 'Connect selected robots';
    const disconnectTitle = !hasSelection
      ? 'Select robots to disconnect'
      : partition.toDisconnect.length===0
        ? 'Selected robots are not connected'
        : !canDisconnectSelection
          ? 'Cannot disconnect selected robots without stopping others'
          : partition.toConnect.length > 0
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
      </span>
    );
  }
  return active ? (
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
    <ControlButton
      className="xgc-panel-runtime-action"
      size="compact"
      appearance="raised"
      iconOnly
      title="Run Panel workflow"
      aria-label={`Run ${panel.title} workflow`}
      dataXgcRole="panel-workflow-run"
      dataXgcId={panel.id}
      data-xgc-status="stopped"
      disabled={busy || !actions.runMode}
      onClick={(event) => { event.stopPropagation();start(); }}
    >
      <Play size={13} aria-hidden="true" />
    </ControlButton>
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
  locallyStoppedRunIds:ReadonlySet<string>,
) {
  return roots.flatMap((root) => {
    if (locallyStoppedRunIds.has(root.id)) return [];
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

export type FullRunRelationsSnapshot = {
  rootId:string;
  rootRevision:number;
  loading:boolean;
  error:string;
  relations?:AutomationExecutionRelations;
};

function useFullRunRelations(actions:ExperimentDashboardActions):FullRunRelationsSnapshot|undefined {
  const roots=actions.activeRuns.filter((run) => run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run);
  const root=roots.length===1 ? roots[0] : undefined;
  const cachedDetail=root ? actions.runDetailsById[root.id] : undefined;
  const cached=root && cachedDetail?.run?.revision===root.revision ? cachedDetail.relations : undefined;
  const [snapshot,setSnapshot]=useState<FullRunRelationsSnapshot>();
  const rootId=root?.id ?? '';
  const rootRevision=root?.revision ?? 0;
  const rootTargetId=root?.targetId ?? '';
  useEffect(() => {
    if (!rootId) {
      setSnapshot(undefined);
      return undefined;
    }
    if (cached) {
      setSnapshot({ rootId,rootRevision,loading:false,error:'',relations:cached });
      return undefined;
    }
    const controller=new AbortController();
    setSnapshot({ rootId,rootRevision,loading:true,error:'' });
    void getAutomationExecutionRelations(rootTargetId,rootId,{ signal:controller.signal }).then((relations) => {
      if (!controller.signal.aborted) {
        setSnapshot({ rootId,rootRevision,loading:false,error:'',relations });
      }
    }).catch((cause:unknown) => {
      if (!controller.signal.aborted) {
        setSnapshot({
          rootId,rootRevision,loading:false,
          error:cause instanceof Error && cause.message.trim() ? cause.message : 'Panel workflow state is unavailable.',
        });
      }
    });
    return () => controller.abort();
  },[cached,rootId,rootRevision,rootTargetId]);
  if (!root) return undefined;
  if (snapshot?.rootId===root.id && snapshot.rootRevision===root.revision) return snapshot;
  return { rootId:root.id,rootRevision:root.revision,loading:true,error:'' };
}

function mergeRunDetailsById(
  ...sources:(Readonly<Record<string,AutomationRunDetail>>|undefined)[]
) {
  const merged:Record<string,AutomationRunDetail>={};
  sources.forEach((source) => Object.entries(source ?? {}).forEach(([id,detail]) => {
    const previous=merged[id];
    const previousRun=previous?.run;
    const nextRun=detail.run;
    if (!previous || (!previousRun && nextRun)
      || (previousRun && nextRun && nextRun.revision>=previousRun.revision)) {
      merged[id]=detail;
    }
  }));
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
    const child=snapshot.relations?.childRuns.find((candidate) => candidate.childRunId===member.childRunId);
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
  await automation.stopRunSet({ id:child.childRunId,status,revision },{
    includeAnchor:true,includeDetached:true,reason:`Stop Panel ${panelId}`,
  });
}

function ExperimentPanelRuntimeContent({ automationFallback,executionTargetId = 'local',...props }:
  Omit<Parameters<typeof ExperimentPanelContent>[0],'automation'> & {
    automationFallback:AutomationPanelContext['automation'];
  }) {
  const automation = usePanelAutomationRuntime(executionTargetId,automationFallback);
  return <ExperimentPanelContent {...props} executionTargetId={executionTargetId} automation={automation} />;
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
