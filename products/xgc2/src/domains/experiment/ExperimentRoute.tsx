import { useEffect,useLayoutEffect } from 'react';
import { useNavigation } from '../../app/navigationContext';
import { useDeferRouteReady } from '../../shared/routeReady';
import { ControlButton } from '../../components/controls/ControlButton';
import { EmptyState,Notice } from '@xgc2/ui-react';
import '../../styles/dashboard.css';
import '../../styles/panels.css';
import '../../styles/panel-config.css';
import '../../styles/robot.css';
import '../../styles/gazebo-scene-panel.css';
import '../../styles/process.css';
import { useAutomationWorkspace } from '../automation/automationPublic';
import type { AutomationPanelContext } from '../../panels/types';
import { selectedExecutionTargetId } from '../execution/executionPublic';
import { GroundStationActivityScopeProvider,useGroundStationErrorNotification } from '../groundStationInteraction/groundStationInteractionPublic';
import { useCoreNodes } from '../core/corePublic';
import { isLocalCore } from '../../shared/utils/controlPlane';
import {
  robotAssetExperimentDisabledReason,
  useRobotAssetStore,
  useRobotAssetKindComposition,
  type RobotAssetDocument,
  type RobotAssetKindComposition,
} from '../robot/robotAssetPublic';
import type { ExperimentDocument } from './experimentModel';
import { resolveLegacyDevFixtureDeepLink } from './experimentLegacyDeepLink';
import { useExperimentCatalog } from './useExperimentCatalog';
import { useExperimentLocation } from './useExperimentLocation';
import { otherExperimentRunDisabledReason } from './experimentStationOccupancy';
import { useStationExperimentOccupancy } from './useExperimentListRunningIds';
import {
  ExperimentDashboardRoute,
} from './routes/ExperimentDashboardRoute';
import { ExperimentListRoute } from './routes/ExperimentListRoute';
import { ExperimentSurfaceVisibilityProvider } from './experimentSurfaceVisibility';

export function ExperimentRoute() {
  const nav = useNavigation();
  const { gcsMode } = nav;
  const coreNodes = useCoreNodes();
  const robotKindComposition = useRobotAssetKindComposition();
  const selectedTargetCore = coreNodes.find((core) => core.id === nav.targetCoreId) ?? coreNodes[0];
  const routedTargetCoreId = selectedTargetCore && !isLocalCore(selectedTargetCore) ? selectedTargetCore.id : undefined;
  const apiTarget = routedTargetCoreId ? { targetCoreId: routedTargetCoreId } : undefined;
  const executionTargetId = selectedExecutionTargetId({ managedHostId: nav.managedHostId,selectedTargetCore });
  const automation = useAutomationWorkspace(executionTargetId);
  // Experiment occupancy and the System Runner always belong to this Core.
  // Panel Workflows may independently target Agents; selecting one must never
  // move the station-wide safety lock onto that Agent.
  const localAutomation = useAutomationWorkspace('local');
  const location = useExperimentLocation(nav.page, executionTargetId);
  const catalog = useExperimentCatalog();
  const robotBindings = useRobotAssetStore(undefined, robotKindComposition);
  const {
    view,selectedExperimentId,setSelectedExperimentId,selectedDashboardId,setSelectedDashboardId,setView,
    replaceDetailResourceId,replaceInvalidDetailWithList,
  } = location;
  const occupancy = useStationExperimentOccupancy('local');
  const occupancyReason = otherExperimentRunDisabledReason(
    selectedExperimentId,
    occupancy.runningExperimentIds,
    occupancy.resolved,
  );
  const selectedExperiment = catalog.experiments.find(
    (item) => item.head.resourceId === selectedExperimentId,
  );
  const bindingIssue = experimentBindingIssue(
    selectedExperiment,
    robotBindings.assets,
    robotKindComposition,
  );
  const robotAdmissionDisabledReason = experimentRobotAdmissionDisabledReason(
    selectedExperiment,
    robotBindings.assets,
    robotBindings.loading,
    robotBindings.error,
    robotKindComposition,
  );
  useGroundStationErrorNotification(executionTargetId, catalog.loaded ? catalog.error : '', {
    title: 'Experiments',source: 'experiment-catalog',dedupeKey: 'experiment-catalog:error',
  });
  useGroundStationErrorNotification(
    executionTargetId,
    !robotBindings.loading && robotBindings.error ? `Robot bindings: ${robotBindings.error}` : '',
    { title: 'Experiments',source: 'experiment-robot-bindings',dedupeKey: 'experiment-robot-bindings:error' },
  );
  const catalogResolutionPending = !catalog.experimentsResolved;
  useDeferRouteReady(catalogResolutionPending && !catalog.error);
  const parkDashboard = catalog.loaded && catalog.experimentsResolved && Boolean(selectedExperiment);
  const dashboardVisible = parkDashboard && view === 'detail' && nav.page === 'experiment';
  useEffect(() => {
    if (!catalog.experimentsResolved || view !== 'detail' || !selectedExperimentId) return;
    if (catalog.experiments.some((item) => item.head.resourceId === selectedExperimentId)) return;
    const replacement = resolveLegacyDevFixtureDeepLink(
      selectedExperimentId,
      selectedDashboardId,
      catalog.experiments,
    );
    if (replacement) {
      replaceDetailResourceId(replacement);
      return;
    }
    replaceInvalidDetailWithList();
  }, [
    catalog.experiments,catalog.experimentsResolved,replaceDetailResourceId,
    replaceInvalidDetailWithList,selectedDashboardId,selectedExperimentId,view,
  ]);
  useEffect(() => {
    if (nav.page !== 'experiment' || !gcsMode || view !== 'detail') return undefined;
    const preventZoom = (event: WheelEvent) => { if (event.ctrlKey || event.metaKey) event.preventDefault(); };
    const preventKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(event.key)) event.preventDefault();
    };
    window.addEventListener('wheel', preventZoom, { passive: false });
    window.addEventListener('keydown', preventKeys, true);
    return () => {
      window.removeEventListener('wheel', preventZoom);
      window.removeEventListener('keydown', preventKeys, true);
    };
  }, [gcsMode,nav.page,view]);
  useLayoutEffect(() => {
    if (nav.page !== 'experiment') return;
    window.dispatchEvent(new CustomEvent('xgc:experiment-breadcrumb', {
      detail: view === 'detail'
        ? { view: 'detail',name: selectedExperiment?.spec.name }
        : { view: 'list' },
    }));
  }, [nav.page,selectedExperiment?.spec.name,view]);

  return (
    <>
      {catalogResolutionPending && catalog.error ? (
        <EmptyState
          as="section"
          className="xgc-workspace-full-span"
          title="Experiments unavailable"
          description={catalog.error}
          actions={(
            <ControlButton
              tone="primary"
              dataXgcRole="experiment-catalog-retry"
              dataXgcId={executionTargetId}
              onClick={() => { void catalog.refresh(); }}
            >
              Retry
            </ControlButton>
          )}
          role="alert"
          data-xgc-role="experiment-catalog-unavailable"
          data-xgc-id={executionTargetId}
        />
      ) : null}
      {catalog.loaded && catalog.experimentsResolved && view === 'list' && (
        <ExperimentListRoute
            key={executionTargetId}
            catalog={catalog}
            targetId={executionTargetId}
            selectedExperimentId={selectedExperimentId}
            runningExperimentIds={occupancy.runningExperimentIds}
            setSelectedExperimentId={setSelectedExperimentId}
            openDashboard={() => setView('detail')}
        />
      )}
      {catalog.loaded && catalog.experimentsResolved && view === 'detail' && !selectedExperiment && (
        <Notice tone="danger" data-xgc-role="experiment-detail-unavailable" data-xgc-id="experiment-detail-unavailable">
          This experiment is no longer available. Return to Experiments and select another experiment.
        </Notice>
      )}
      {parkDashboard && selectedExperiment && (
        <div
          hidden={!dashboardVisible}
          inert={!dashboardVisible ? true : undefined}
          aria-hidden={!dashboardVisible}
          data-xgc-role="experiment-dashboard-surface"
          data-xgc-id={selectedExperiment.head.resourceId}
        >
          <ExperimentSurfaceVisibilityProvider visible={dashboardVisible}>
            <GroundStationActivityScopeProvider experimentId={selectedExperiment.head.resourceId} visible={dashboardVisible}>
            {bindingIssue && dashboardVisible && (
              <Notice
                className="dashboard-experiment-health-warning"
                tone="warning"
                data-xgc-role={bindingIssue.kind === 'admission'
                  ? 'experiment-robot-admission-disabled'
                  : 'experiment-binding-warning'}
                data-xgc-id={selectedExperiment.head.resourceId}
              >
                {bindingIssue.message} The saved dashboard remains open in degraded mode so the binding can be repaired.
              </Notice>
            )}
            <ExperimentDashboardRoute
              experiment={{
                selectedExperiment,
                automationRuntime: panelAutomationRuntime(automation),
                localAutomationRuntime:panelAutomationRuntime(localAutomation),
                saveExperimentDraft: catalog.saveExperimentDraft,
                robotAssetCatalog: {
                  assets: robotBindings.assets,
                  loading: robotBindings.loading,
                  error: robotBindings.error,
                },
                experimentAdmissionDisabledReason: occupancyReason || robotAdmissionDisabledReason,
                stationOccupancyResolved: occupancy.resolved,
                stationOccupancyError: occupancy.error,
                stationSessions: occupancy.sessions,
                refreshStationOccupancy: occupancy.refresh,
                convergeStoppedExperiment: occupancy.convergeStoppedExperiment,
                selectedDashboardId,
                onSelectedDashboardIdChange: setSelectedDashboardId,
              }}
              environment={{
                selectedTargetCore,
                coreNodes,
                routedTargetCoreId,
                apiTarget,
                executionTargetId,
              }}
            />
            </GroundStationActivityScopeProvider>
          </ExperimentSurfaceVisibilityProvider>
        </div>
      )}
    </>
  );
}

function panelAutomationRuntime(
  automation: AutomationPanelContext['automation'],
): AutomationPanelContext['automation'] {
  return {
    targetId: automation.targetId,
    documents: automation.documents,
    catalog: automation.catalog,
    runSummaries: automation.runSummaries,
    runDetailsById: automation.runDetailsById,
    loading: automation.loading,
    error: automation.error,
    runDocument: automation.runDocument,
    runBoundAutomation: automation.runBoundAutomation,
    stop: automation.stop,
    stopRunSet: automation.stopRunSet,
    loadRunDetail: automation.loadRunDetail,
    retainRunDetail: automation.retainRunDetail,
    refreshExecutionHistory: automation.refreshExecutionHistory,
  };
}

function experimentBindingIssue(
  experiment: ExperimentDocument | undefined,
  robotAssets: readonly RobotAssetDocument[] | undefined,
  composition: RobotAssetKindComposition,
) {
  if (!experiment) return undefined;
  // Generic admission: any robot whose contribution refuses Experiment binding.
  const admissionRefusal = robotAssets && experiment.spec.robots.flatMap((binding) => {
    const asset = robotAssets.find((candidate) => (
      candidate.head.resourceId === binding.ref.resourceId
      && candidate.branch.name === binding.ref.branch
    ));
    if (!asset) return [];
    const reason = robotAssetExperimentDisabledReason(asset, composition);
    return reason ? [{ binding, asset, reason }] : [];
  })[0];
  if (admissionRefusal) {
    return {
      kind: 'admission' as const,
      message: `Robot binding ${admissionRefusal.binding.id} resolves to asset ${admissionRefusal.asset.spec.name}. ${admissionRefusal.reason}`,
    };
  }
  const missingRobot = robotAssets && experiment.spec.robots.find((binding) => (
    !robotAssets.some((asset) => (
      asset.head.resourceId === binding.ref.resourceId
      && asset.branch.name === binding.ref.branch
    ))
  ));
  if (missingRobot) {
    return {
      kind: 'unresolved' as const,
      message: `Robot binding ${missingRobot.id} (${missingRobot.ref.resourceId}@${missingRobot.ref.branch}) cannot be resolved at its current version.`,
    };
  }
  return undefined;
}

function experimentRobotAdmissionDisabledReason(
  experiment: ExperimentDocument | undefined,
  robotAssets: readonly RobotAssetDocument[],
  loading: boolean,
  error: string,
  composition: RobotAssetKindComposition,
) {
  if (!experiment || experiment.spec.robots.length === 0) return '';
  if (loading) return 'Robot Asset catalog is loading; Experiment start is disabled until every Robot binding is resolved.';
  if (error) return 'Robot Asset catalog is unavailable; Experiment start is disabled until every Robot binding is resolved.';
  const issue = experimentBindingIssue(experiment, robotAssets, composition);
  return issue?.kind === 'admission' || issue?.message.startsWith('Robot binding ')
    ? issue.message
    : '';
}
