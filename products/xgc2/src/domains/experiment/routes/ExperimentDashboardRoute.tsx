import { useEffect,useMemo,useState } from 'react';
import { createPortal } from 'react-dom';
import { isLocalCore } from '../../../shared/utils/controlPlane';
import { useNavigation } from '../../../app/navigationContext';
import { bindRobotInstrumentSshJump } from '../../robot/robotPublic';
import { requestTerminalRobotLogin } from '../../terminal/terminalPublic';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { AutomationPanelContext } from '../../../panels/types';
import type { CoreNode } from '../../core/corePublic';
import { panelToEditor,type ExperimentDocument } from '../experimentModel';
import { ExperimentDashboardSurfaces } from '../dashboard/ExperimentDashboardSurfaces';
import { useExperimentSurfaceVisible } from '../experimentSurfaceVisibility';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import { ExperimentDashboardCanvas } from '../dashboard/ExperimentDashboardCanvas';
import { DashboardDeleteDialog,DashboardExitEditDialog } from '../dashboard/ExperimentDashboardLifecycleDialogs';
import { ExperimentDashboardTopbar } from '../dashboard/ExperimentDashboardTopbar';
import { PanelConfigDrawer } from '../dashboard/PanelConfigDrawer';
import { PanelLibraryDrawer } from '../dashboard/PanelLibraryDrawer';
import { useExperimentDashboardEditor } from '../dashboard/useExperimentDashboardEditor';
import { useExperimentDashboardActions } from '../dashboard/useExperimentDashboardActions';
import { useExperimentWorkflowRuntime } from '../dashboard/useExperimentWorkflowRuntime';
import { useExperimentRunMode } from '../dashboard/useExperimentRunMode';
import {
  invokeExperimentPanelAction,
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
    stationSessions = [],
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
  const nav = useNavigation();
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
  const workflowRuntime = useExperimentWorkflowRuntime(visibleExperiment,'local',{
    runSummaries:localAutomationRuntime.runSummaries,
    runDetailsById:localAutomationRuntime.runDetailsById,
    resolved:stationOccupancyResolved,
    error:stationOccupancyError,
    refreshExecutionHistory:localAutomationRuntime.refreshExecutionHistory,
    loadRunDetail:localAutomationRuntime.loadRunDetail,
    retainRunDetail:localAutomationRuntime.retainRunDetail,
    sessionViews:stationSessions,
    refreshSessions:refreshStationOccupancy,
    convergeStoppedExperiment,
  });
  const activeRun = workflowRuntime.activeRun;
  const runMode = useExperimentRunMode(
    visibleExperiment,
    activeRun,
  );
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
    runDetailsById:workflowRuntime.runDetailsById,
    observedRunIds:workflowRuntime.observedRunIds,
    refresh:workflowRuntime.refresh,
    convergeStoppedSession:workflowRuntime.convergeStoppedSession,
  }),[
    stationOccupancyResolved,workflowRuntime.activeRun,workflowRuntime.activeRuns,workflowRuntime.error,workflowRuntime.loading,
    workflowRuntime.runDetailsById,workflowRuntime.sessionActive,workflowRuntime.sessionViews,
    workflowRuntime.observedRunIds,workflowRuntime.resolved,
    workflowRuntime.refresh,workflowRuntime.convergeStoppedSession,
  ]);
  const actions = useExperimentDashboardActions({
    visibleExperiment,
    runtimeProjection,
    executionTargetId:'local',
    startWorkflow:startExperimentRun,
    stopWorkflow:stopExperimentRun,
    startPanelWorkflow:startExperimentPanelRun,
    invokePanelActionWorkflow:invokeExperimentPanelAction,
    stopPanelActionWorkflow:stopExperimentRunnerRoot,
    saveExperimentDraft,
    applyExperimentDraft: editor.session.updateDraft,
    beginExperimentEdit: (draft) => {
      editor.session.startWithDraft(draft);
      if (nav.gcsMode) nav.setGcsMode(false);
    },
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
      {(dashboard,selected) => <ExperimentDashboardCanvas
        session={selected ? editor.session : { ...editor.session,editing:false }}
        dashboard={dashboard}
        panels={selected ? editor.panels : { ...editor.panels,items:dashboard.panels.map(panelToEditor) }}
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
      />}
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
