import { useCallback,useEffect,useMemo,useState } from 'react';
import { createPortal } from 'react-dom';
import { useStableCallback } from '../../../hooks/useStableCallback';
import { isLocalCore } from '../../../shared/utils/controlPlane';
import { useNavigation } from '../../../app/navigationContext';
import { bindRobotInstrumentSshJump } from '../../robot/robotPublic';
import { requestTerminalRobotLogin } from '../../terminal/terminalPublic';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { AutomationPanelContext } from '../../../panels/types';
import type { CoreNode } from '../../core/corePublic';
import { panelToEditor,type ExperimentDashboard,type ExperimentDocument,type PanelInstance } from '../experimentModel';
import { ExperimentDashboardSurfaces } from '../dashboard/ExperimentDashboardSurfaces';
import { useExperimentSurfaceVisible } from '../experimentSurfaceVisibility';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import { ExperimentDashboardCanvas,type DashboardCanvasPanelWorkspace } from '../dashboard/ExperimentDashboardCanvas';
import { DashboardDeleteDialog,DashboardExitEditDialog } from '../dashboard/ExperimentDashboardLifecycleDialogs';
import { ExperimentDashboardTopbar } from '../dashboard/ExperimentDashboardTopbar';
import { PanelConfigDrawer } from '../dashboard/PanelConfigDrawer';
import { PanelLibraryDrawer } from '../dashboard/PanelLibraryDrawer';
import { useExperimentDashboardEditor } from '../dashboard/useExperimentDashboardEditor';
import { useExperimentDashboardActions } from '../dashboard/useExperimentDashboardActions';
import { useExperimentWorkflowRuntime } from '../dashboard/useExperimentWorkflowRuntime';
import { useExperimentRunMode } from '../dashboard/useExperimentRunMode';
import { useExperimentAgentViewCapture } from '../useExperimentAgentViewCapture';
import {
  invokeExperimentPanelAction,
  restartExperimentRun,
  startExperimentPanelRun,
  startExperimentRun,
  stopExperimentRun,
  stopExperimentRunnerRoot,
} from '../experimentPublic';
import type { ExperimentSessionView } from '../experimentWorkflowModel';

type ApiTargetOptions = {
  targetCoreId?: string;
};

export type ExperimentDashboardExperimentScope = {
  selectedExperiment?: ExperimentDocument;
  automationRuntime: AutomationPanelContext['automation'];
  localAutomationRuntime: AutomationPanelContext['automation'];
  saveExperimentDraft: (experiment: ExperimentDocument, reason?: string) => Promise<ExperimentDocument>;
  robotAssetCatalog: {
    assets: readonly RobotAssetDocument[];
    loading: boolean;
    error: string;
  };
  /** Product/admission fence resolved outside the dashboard lifecycle. */
  experimentAdmissionDisabledReason?: string;
  /** False until the bounded System Runner execution snapshot is known. */
  stationOccupancyResolved?: boolean;
  stationOccupancyError?: string;
  stationOccupancyActive?: boolean;
  stationSessions?: readonly ExperimentSessionView[];
  refreshStationOccupancy?: () => Promise<void>;
  convergeStoppedExperiment: (experimentResourceId:string) => Promise<void>;
  selectedDashboardId?: string;
  onSelectedDashboardIdChange?: (id: string) => void;
};

export type ExperimentDashboardEnvironmentScope = {
  selectedTargetCore?: CoreNode;
  coreNodes: CoreNode[];
  routedTargetCoreId?: string;
  apiTarget?: ApiTargetOptions;
  executionTargetId: string;
};

const NO_STATION_SESSIONS: readonly ExperimentSessionView[] = [];

export function ExperimentDashboardRoute({ experiment, environment }: {
  experiment: ExperimentDashboardExperimentScope;
  environment: ExperimentDashboardEnvironmentScope;
}) {
  const {
    selectedExperiment,
    automationRuntime,
    localAutomationRuntime,
    saveExperimentDraft,
    robotAssetCatalog,
    experimentAdmissionDisabledReason,
    stationOccupancyResolved = true,
    stationOccupancyError = '',
    stationOccupancyActive = false,
    stationSessions = NO_STATION_SESSIONS,
    refreshStationOccupancy,
    convergeStoppedExperiment,
    selectedDashboardId,
    onSelectedDashboardIdChange,
  } = experiment;
  const {
    selectedTargetCore,
    coreNodes,
    routedTargetCoreId,
    executionTargetId,
  } = environment;
  const nav = useNavigation((state) => ({
    page: state.page,gcsMode: state.gcsMode,setGcsMode: state.setGcsMode,navigatePage: state.navigatePage,
    setPageSection: state.setPageSection,setTargetCoreId: state.setTargetCoreId,setManagedHostId: state.setManagedHostId,
  }));
  const surfaceVisible = useExperimentSurfaceVisible();
  useEffect(() => {
    if (!surfaceVisible) return;
    return bindRobotInstrumentSshJump((robotAssetId,assetTargetCoreId) => {
      const core = coreNodes.find((item) => assetTargetCoreId === 'local' ? isLocalCore(item) : item.id === assetTargetCoreId);
      if (!core) return;
      const targetCoreId = isLocalCore(core) ? undefined : core.id;
      requestTerminalRobotLogin(robotAssetId,{ targetCoreId });
      nav.setTargetCoreId(core.id);
      nav.setManagedHostId('local');
      nav.navigatePage('terminal');
      nav.setPageSection('terminal', 'terminal');
    });
  }, [coreNodes,nav,surfaceVisible]);
  const [topbarHost, setTopbarHost] = useState<HTMLElement | null>(null);
  const editor = useExperimentDashboardEditor({
    selectedExperiment,
    saveExperimentDraft,
    selectedDashboardId,
    onSelectedDashboardIdChange,
  });
  const visibleExperiment = editor.session.visibleExperiment;
  useExperimentAgentViewCapture(surfaceVisible ? visibleExperiment?.head.resourceId : undefined);
  const workflowRuntime = useExperimentWorkflowRuntime(visibleExperiment,'local',{
    runSummaries:localAutomationRuntime.runSummaries,
    runDetailsById:localAutomationRuntime.runDetailsById,
    resolved:stationOccupancyResolved,
    error:stationOccupancyError,
    refreshExecutionHistory:localAutomationRuntime.refreshExecutionHistory,
    retainRunObservation:localAutomationRuntime.retainRunObservation,
    sessionViews:stationSessions,
    refreshSessions:refreshStationOccupancy,
    convergeStoppedExperiment,
  });
  const activeRun = workflowRuntime.activeRun;
  const runMode = useExperimentRunMode(
    visibleExperiment,
    activeRun,
  );
  const runPlacement = activeRun
    ? activeRun.placement
    : visibleExperiment?.spec?.deployment?.placement;
  const runtimeProjection = useMemo(() => ({
    loading:workflowRuntime.loading,
    error:workflowRuntime.error,
    stateLoading:workflowRuntime.loading || (!stationOccupancyResolved && !workflowRuntime.activeRun),
    stateResolved:workflowRuntime.resolved,
    stateError:workflowRuntime.error,
    activeRun:workflowRuntime.activeRun,
    activeRuns:workflowRuntime.activeRuns,
    sessionViews:workflowRuntime.sessionViews,
    sessionActive:workflowRuntime.sessionActive,
    occupancyActive:stationOccupancyActive,
    runDetailsById:workflowRuntime.runDetailsById,
    observedRunIds:workflowRuntime.observedRunIds,
    refresh:workflowRuntime.refresh,
    convergeStoppedSession:workflowRuntime.convergeStoppedSession,
  }),[
    stationOccupancyResolved,stationOccupancyActive,workflowRuntime.activeRun,workflowRuntime.activeRuns,workflowRuntime.error,workflowRuntime.loading,
    workflowRuntime.runDetailsById,workflowRuntime.sessionActive,workflowRuntime.sessionViews,
    workflowRuntime.observedRunIds,workflowRuntime.resolved,
    workflowRuntime.refresh,workflowRuntime.convergeStoppedSession,
  ]);
  const beginExperimentEdit = useStableCallback((draft: ExperimentDocument) => {
    editor.session.startWithDraft(draft);
    if (nav.gcsMode) nav.setGcsMode(false);
  });
  const actions = useExperimentDashboardActions({
    visibleExperiment,
    runtimeProjection,
    executionTargetId:'local',
    startWorkflow:startExperimentRun,
    stopWorkflow:stopExperimentRun,
    startPanelWorkflow:startExperimentPanelRun,
    invokePanelActionWorkflow:invokeExperimentPanelAction,
    stopPanelActionWorkflow:stopExperimentRunnerRoot,
    restartWorkflow:restartExperimentRun,
    placement:runPlacement,
    saveExperimentDraft,
    applyExperimentDraft: editor.session.updateDraft,
    beginExperimentEdit,
    runMode: runMode.value,
    dashboardEditing: editor.session.editing,
    dashboardSaving: editor.session.saving,
    externalAdmissionDisabledReason: experimentAdmissionDisabledReason,
  });
  useEffect(() => {
    setTopbarHost(document.getElementById('xgc-experiment-topbar-slot'));
  }, []);
  const panelConfigAutomation = editor.panels.configTarget
    && getPanelPlugin(editor.panels.configTarget.pluginId)?.executionTargetPolicy === 'local'
    ? localAutomationRuntime
    : automationRuntime;

  // Visited-but-hidden dashboards keep one read-only session and one editor
  // projection per dashboard document, so their canvases see stable inputs and
  // do not re-clone every panel on each host render.
  const hiddenSession = useMemo(() => ({ ...editor.session,editing:false }),[editor.session]);
  const [hiddenPanelItems] = useState(() => new WeakMap<ExperimentDashboard,PanelInstance[]>());
  const hiddenPanels = useMemo(() => {
    const byDashboard = new WeakMap<ExperimentDashboard,DashboardCanvasPanelWorkspace>();
    return (dashboard: ExperimentDashboard) => {
      const cached = byDashboard.get(dashboard);
      if (cached) return cached;
      let items = hiddenPanelItems.get(dashboard);
      if (!items) {
        items = dashboard.panels.map(panelToEditor);
        hiddenPanelItems.set(dashboard,items);
      }
      const projected = { ...editor.panels,items };
      byDashboard.set(dashboard,projected);
      return projected;
    };
  },[editor.panels,hiddenPanelItems]);
  const renderDashboardSurface = useCallback((dashboard: ExperimentDashboard,selected: boolean) => (
    <ExperimentDashboardCanvas
      session={selected ? editor.session : hiddenSession}
      dashboard={dashboard}
      panels={selected ? editor.panels : hiddenPanels(dashboard)}
      drop={editor.drop}
      actions={actions}
      gcsMode={nav.gcsMode}
      coreNodes={coreNodes}
      selectedTargetCore={selectedTargetCore}
      routedTargetCoreId={routedTargetCoreId}
      executionTargetId={executionTargetId}
      automation={automationRuntime}
      localAutomation={localAutomationRuntime}
      robotAssetCatalog={robotAssetCatalog}
    />
  ),[
    actions,automationRuntime,coreNodes,editor.drop,editor.panels,editor.session,executionTargetId,
    hiddenPanels,hiddenSession,localAutomationRuntime,nav.gcsMode,robotAssetCatalog,routedTargetCoreId,
    selectedTargetCore,
  ]);

  return (
    <>
      {surfaceVisible && nav.page === 'experiment' && topbarHost && createPortal(
        <ExperimentDashboardTopbar
          session={editor.session}
          dashboards={editor.dashboards}
          panels={editor.panels}
          actions={actions}
          runMode={runMode}
          gcsMode={nav.gcsMode}
          onGcsModeChange={nav.setGcsMode}
        />,
        topbarHost,
      )}
      <ExperimentDashboardSurfaces key={visibleExperiment?.head.resourceId ?? 'none'}
        dashboards={editor.dashboards.items} selectedId={editor.dashboards.selected.id}>
      {renderDashboardSurface}
      </ExperimentDashboardSurfaces>
      {editor.session.editing && editor.dashboards.deleteTarget && (
        <DashboardDeleteDialog
          dashboard={editor.dashboards.deleteTarget}
          onClose={editor.dashboards.cancelDelete}
          onConfirm={editor.dashboards.confirmDelete}
        />
      )}
      {editor.session.editing && editor.session.exitConfirmationOpen && (
        <DashboardExitEditDialog
          saving={editor.session.saving}
          onClose={editor.session.cancelExit}
          onSave={() => void editor.session.save()}
          onDiscard={editor.session.discard}
        />
      )}
      {editor.session.editing && editor.panels.configTarget && (
        <PanelConfigDrawer
          key={`${editor.panels.configTarget.id}:${editor.session.visibleExperiment?.branch.headCommitId ?? 'no-head'}`}
          panel={editor.panels.configTarget}
          coreNodes={coreNodes}
          executionTargetId={executionTargetId}
          automationDocuments={panelConfigAutomation.documents}
          dashboardPanels={editor.panels.items}
          experiment={editor.session.visibleExperiment}
          onClose={editor.panels.closeConfig}
          onSave={(nextPanel,workflowInstances) => void editor.panels.saveConfig(nextPanel,workflowInstances)}
        />
      )}
      {editor.session.editing && editor.panels.libraryOpen && (
        <PanelLibraryDrawer
          dashboard={editor.dashboards.selected}
          onClose={editor.panels.closeLibrary}
          onAdd={(plugin) => void editor.panels.add(plugin)}
        />
      )}
    </>
  );
}
