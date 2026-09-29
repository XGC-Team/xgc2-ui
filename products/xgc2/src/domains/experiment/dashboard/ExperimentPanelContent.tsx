import type { ExperimentWorldBoundary } from '../experimentWorldBoundary';
import { standalonePanelRunDetailDemands,useStandalonePanelActionHistory } from './standalonePanelAction';
import { EmptyState } from '@xgc2/ui-react';
import { useMemo,type ReactNode } from 'react';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type {
  AutomationPanelContext,
  PanelActionInvocation,
  PanelBaseContext,
  PanelExecutionObserver,
} from '../../../panels/types';
import type { ExperimentRunView,ExperimentSessionView } from '../experimentPublic';
import type { ExperimentPlacement } from '../experimentWorkflowModel';
import type {
  ExperimentDashboard,
  ExperimentDocument,
  ExperimentLocalizationOffset,
  ExperimentRobotBinding,
  ExperimentScene,
  PanelInstance,
} from '../experimentModel';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import { useExecutionTargets } from '../../execution/executionPublic';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../experimentProcessRuntime';
import { createPanelContext,panelAutomationObservations } from './panelContextFactory';
import type { PanelWorkflowInvocationFallback } from './panelContextFactory';
import { PanelPluginRenderer } from './panelPluginRenderer.helpers';
import { useStablePanelContext } from './stablePanelContext';
import {
  dataContractsDemandRunDetails,
  panelRunDetailDemands,
  usePanelRunDetailDemand,
} from './panelRunDetailDemand';
import { offlineVideoRunDetailDemands } from './offlineVideoAction';

/**
 * Panel plugins receive only their declared, resolved ports. Experiment and
 * workflow documents remain host-owned so a plugin cannot invent a parallel
 * orchestration path or depend on dashboard ordering.
 */
export function ExperimentPanelContent({
  panel,
  experiment,
  executionTargetId,
  disabledReason,
  editing,
  robotAssetCatalog,
  updateExperimentRobotBindings,
  updateExperimentRobotBindingsDisabledReason,
  updateExperimentScene,
  updateExperimentSceneDisabledReason,
  updateExperimentWorldBoundary,
  updateExperimentWorldBoundaryDisabledReason,
  updateExperimentLocalizationOffset,
  updateExperimentLocalizationOffsetDisabledReason,
  updateWorkflowPresetInputs,
  updateWorkflowPresetInputsDisabledReason,
  experimentLifecycle,
  automation,
  automationRuntimes,
  executionObserver,
}: {
  panel: PanelInstance;
  experiment?: ExperimentDocument;
  executionTargetId?: string;
  disabledReason?: string;
  editing?: boolean;
  robotAssetCatalog?: {
    assets: readonly RobotAssetDocument[];
    loading: boolean;
    error: string;
  };
  updateExperimentRobotBindings?: (
    bindings: ExperimentRobotBinding[],
    expectedHeadCommitId: string,
    reason?: string,
  ) => Promise<ExperimentDocument>;
  updateExperimentRobotBindingsDisabledReason?: () => string;
  updateExperimentScene?: (value:ExperimentScene | undefined,expectedHeadCommitId:string,reason?:string) => Promise<ExperimentDocument>;
  updateExperimentSceneDisabledReason?: () => string;
  updateExperimentWorldBoundary?: (value:ExperimentWorldBoundary | null,expectedHeadCommitId:string,reason?:string) => Promise<ExperimentDocument>;
  updateExperimentWorldBoundaryDisabledReason?: () => string;
  updateExperimentLocalizationOffset?: (
    offset: ExperimentLocalizationOffset,
    expectedHeadCommitId: string,
    reason?: string,
  ) => Promise<ExperimentDocument>;
  updateExperimentLocalizationOffsetDisabledReason?: () => string;
  updateWorkflowPresetInputs?: (
    workflowInstanceId: string,
    presetId: string,
    inputs: Record<string,unknown>,
    expectedHeadCommitId: string,
    reason?: string,
  ) => Promise<ExperimentDocument>;
  updateWorkflowPresetInputsDisabledReason?: () => string;
  experimentLifecycle: {
    activeRun?: ExperimentRunView;
    activeRuns?:readonly ExperimentRunView[];
    sessionViews?:readonly ExperimentSessionView[];
    panelWorkflowInvocationFallback?:PanelWorkflowInvocationFallback;
    runMode:string;
    placement?:ExperimentPlacement;
    start: () => Promise<PanelActionInvocation | undefined>;
    stop: () => Promise<unknown>;
    invokeAction?:(panelId:string,presetId:string,inputOverrides:Record<string,unknown>,reason?:string) => Promise<PanelActionInvocation>;
    stopAction?:(invocation:PanelActionInvocation,reason:string,targetId?:string) => Promise<unknown>;
  };
  automation: AutomationPanelContext['automation'];
  automationRuntimes?:ReadonlyMap<string,AutomationPanelContext['automation']>;
  /** Subscribable view of automation.runDetailsById handed to Action ports. */
  executionObserver: PanelExecutionObserver;
}) {
  const plugin = getPanelPlugin(panel.pluginId);
  if (!plugin) {
    return (
      <EmptyState
        appearance="plain"
        fill
        title="Panel unavailable"
        description={`Panel plugin "${panel.pluginId}" is not registered.`}
      />
    );
  }

  const dataContracts=plugin.dataPorts?.map(({ contract }) => contract)??[];
  // Dynamic Action tiles may own resident services; their status needs the
  // same Process truth as ROS, even without a visualization data binding.
  const needsExperimentProcesses = dataContracts.includes(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE)
    || Boolean(plugin.dynamicActionPorts);
  const content=needsExperimentProcesses ? <ExperimentPanelContentWithProcesses
      panel={panel}
      experiment={experiment}
      executionTargetId={executionTargetId}
      disabledReason={disabledReason}
      editing={editing}
      robotAssetCatalog={robotAssetCatalog}
      updateExperimentRobotBindings={updateExperimentRobotBindings}
      updateExperimentRobotBindingsDisabledReason={updateExperimentRobotBindingsDisabledReason}
      updateExperimentScene={updateExperimentScene}
      updateExperimentSceneDisabledReason={updateExperimentSceneDisabledReason}
      updateExperimentWorldBoundary={updateExperimentWorldBoundary}
      updateExperimentWorldBoundaryDisabledReason={updateExperimentWorldBoundaryDisabledReason}
      updateExperimentLocalizationOffset={updateExperimentLocalizationOffset}
      updateExperimentLocalizationOffsetDisabledReason={updateExperimentLocalizationOffsetDisabledReason}
      updateWorkflowPresetInputs={updateWorkflowPresetInputs}
      updateWorkflowPresetInputsDisabledReason={updateWorkflowPresetInputsDisabledReason}
      experimentLifecycle={experimentLifecycle}
      automation={automation}
      automationRuntimes={automationRuntimes}
      executionObserver={executionObserver}
    /> : <ExperimentPanelContentWithoutProcesses
      panel={panel} plugin={plugin} executionTargetId={executionTargetId} disabledReason={disabledReason}
      editing={editing}
      experiment={experiment} automation={automation} automationRuntimes={automationRuntimes} robotAssetCatalog={robotAssetCatalog}
      updateExperimentRobotBindings={updateExperimentRobotBindings}
      updateExperimentRobotBindingsDisabledReason={updateExperimentRobotBindingsDisabledReason}
      updateExperimentScene={updateExperimentScene}
      updateExperimentSceneDisabledReason={updateExperimentSceneDisabledReason}
      updateExperimentWorldBoundary={updateExperimentWorldBoundary}
      updateExperimentWorldBoundaryDisabledReason={updateExperimentWorldBoundaryDisabledReason}
      updateExperimentLocalizationOffset={updateExperimentLocalizationOffset}
      updateExperimentLocalizationOffsetDisabledReason={updateExperimentLocalizationOffsetDisabledReason}
      updateWorkflowPresetInputs={updateWorkflowPresetInputs}
      updateWorkflowPresetInputsDisabledReason={updateWorkflowPresetInputsDisabledReason}
      experimentLifecycle={experimentLifecycle}
      executionObserver={executionObserver}
    />;
  return <PanelRunDetailDemand
    panel={panel}
    experiment={experiment}
    enabled={dataContractsDemandRunDetails(dataContracts)}
    experimentLifecycle={experimentLifecycle}
    automation={automation}
    automationRuntimes={automationRuntimes}
  >{content}</PanelRunDetailDemand>;
}

function ExperimentPanelContentWithoutProcesses({ plugin,...props }:
  Parameters<typeof ExperimentPanelContent>[0] & { plugin:NonNullable<ReturnType<typeof getPanelPlugin>> }) {
  const baseContext: PanelBaseContext = {
    executionTargetId:props.executionTargetId,
    disabledReason:props.disabledReason,
    editing:props.editing,
  };
  const context = useStablePanelContext(createPanelContext(plugin,props.panel,baseContext,{
    ...props,execution:props.executionObserver,
  }));
  return <PanelPluginRenderer panel={props.panel} plugin={plugin} context={context} />;
}

function PanelRunDetailDemand({ panel,experiment,enabled,experimentLifecycle,automation,automationRuntimes,children }: {
  panel:PanelInstance;
  experiment?:ExperimentDocument;
  enabled:boolean;
  experimentLifecycle:Parameters<typeof ExperimentPanelContent>[0]['experimentLifecycle'];
  automation:AutomationPanelContext['automation'];
  automationRuntimes?:ReadonlyMap<string,AutomationPanelContext['automation']>;
  children:ReactNode;
}) {
  const observations=panelAutomationObservations(automation,automationRuntimes);
  const demands=[...panelRunDetailDemands({
    panelId:panel.id,targetId:automation.targetId,
    activeRuns:experimentLifecycle.activeRuns??[],
    fallback:experimentLifecycle.panelWorkflowInvocationFallback,
    runDetailsById:observations.runDetailsById,
    rootDemands:panel.pluginId === 'ros-basic-services-control'
      ? (experimentLifecycle.sessionViews ?? []).flatMap((view) => (
        view.session.experimentResourceId === experiment?.head.resourceId
          && ['opening','active','stopping'].includes(view.session.state)
          ? view.members.filter((member) => member.kind === 'workflow_run' && member.bindingId === 'xgc-world-services')
            .map((member) => ({ id:member.ownerId,targetId:member.targetId,revision:member.revision }))
          : []
      )) : [],
    enabled,
  }),...offlineVideoRunDetailDemands(panel,{ experiment,automation }),
    ...standalonePanelRunDetailDemands(panel,{ experiment,automation })];
  usePanelRunDetailDemand({ demands,automation,runtimes:automationRuntimes });
  // Standalone discovery is gated by the panel's own bindings, not the data
  // contract predicate: pure-Action panels (e.g. Robot control) have no
  // run-type Data ports yet can still host standalone Actions.
  useStandalonePanelActionHistory(panel,{ experiment,automation },true);
  return children;
}

function ExperimentPanelContentWithProcesses(props: Parameters<typeof ExperimentPanelContent>[0]) {
  const targetId = props.executionTargetId || 'local';
  const requiredTargets = [...new Set([targetId,...(props.automationRuntimes?.keys() ?? []),...(
    props.experimentLifecycle.activeRun?.workflowTargets
      .map((workflow) => workflow.executionTargetId) ?? []
  )])];
  const executions = useExecutionTargets(requiredTargets);
  // useExecutionTargets keeps its snapshot array while no target changes;
  // derive the flattened runtime once per snapshot, not once per render.
  const executionRuntime = useMemo(() => ({
    targetId,
    processInstances:executions.flatMap((execution) => execution.processInstances),
    loading:executions.some((execution) => execution.loading),
    error:executions.map((execution) => execution.error).filter(Boolean).join(' · '),
  }),[executions,targetId]);
  const plugin = getPanelPlugin(props.panel.pluginId)!;
  const baseContext: PanelBaseContext = {
    executionTargetId:props.executionTargetId,
    disabledReason:props.disabledReason,
    editing:props.editing,
  };
  const context = useStablePanelContext(createPanelContext(plugin,props.panel,baseContext,{
    experiment:props.experiment,
    automation:props.automation,
    automationRuntimes:props.automationRuntimes,
    execution:props.executionObserver,
    robotAssetCatalog:props.robotAssetCatalog,
    updateExperimentRobotBindings:props.updateExperimentRobotBindings,
    updateExperimentRobotBindingsDisabledReason:props.updateExperimentRobotBindingsDisabledReason,
    updateExperimentScene:props.updateExperimentScene,
    updateExperimentSceneDisabledReason:props.updateExperimentSceneDisabledReason,
    updateExperimentWorldBoundary:props.updateExperimentWorldBoundary,
    updateExperimentWorldBoundaryDisabledReason:props.updateExperimentWorldBoundaryDisabledReason,
    updateExperimentLocalizationOffset:props.updateExperimentLocalizationOffset,
    updateExperimentLocalizationOffsetDisabledReason:props.updateExperimentLocalizationOffsetDisabledReason,
    updateWorkflowPresetInputs:props.updateWorkflowPresetInputs,
    updateWorkflowPresetInputsDisabledReason:props.updateWorkflowPresetInputsDisabledReason,
    experimentLifecycle:props.experimentLifecycle,
    executionRuntime,
  }));
  return <PanelPluginRenderer panel={props.panel} plugin={plugin} context={context} />;
}

export function DashboardEmptyState({ dashboard,editMode }: { dashboard: ExperimentDashboard;editMode: boolean }) {
  return (
    <EmptyState
      as="section"
      appearance="plain"
      fill
      className="xgc-workspace-full-span"
      data-xgc-role="dashboard-empty-state"
      data-xgc-id={dashboard.id}
      title={dashboard.name}
      description={editMode ? 'Use Add panel to compose this dashboard layout.' : 'Enter edit mode to add panels to this dashboard.'}
    />
  );
}
