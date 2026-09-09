import { EmptyState } from '@xgc2/ui-react';
import type { ReactNode } from 'react';
import { getPanelPlugin } from '../../../panels/builtinPanels';
import type { AutomationPanelContext,PanelActionInvocation,PanelBaseContext } from '../../../panels/types';
import type { ExperimentRunView,ExperimentSessionView } from '../experimentPublic';
import type {
  ExperimentDashboard,
  ExperimentDocument,
  ExperimentLocalizationOffset,
  ExperimentRobotBinding,
  PanelInstance,
} from '../experimentModel';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import { useExecutionTargets } from '../../execution/executionPublic';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE } from '../experimentProcessRuntime';
import { createPanelContext } from './panelContextFactory';
import type { PanelWorkflowInvocationFallback } from './panelContextFactory';
import { PanelPluginRenderer } from './panelPluginRenderer.helpers';
import {
  dataContractsDemandRunDetails,
  panelRunDetailDemands,
  usePanelRunDetailDemand,
} from './panelRunDetailDemand';

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
  updateExperimentLocalizationOffset,
  updateExperimentLocalizationOffsetDisabledReason,
  updateWorkflowPresetInputs,
  updateWorkflowPresetInputsDisabledReason,
  experimentLifecycle,
  automation,
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
    start: () => Promise<PanelActionInvocation | undefined>;
    stop: () => Promise<unknown>;
    invokeAction?:(panelId:string,presetId:string,inputOverrides:Record<string,unknown>,reason?:string) => Promise<PanelActionInvocation>;
    stopAction?:(invocation:PanelActionInvocation,reason:string) => Promise<unknown>;
  };
  automation: AutomationPanelContext['automation'];
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
      updateExperimentLocalizationOffset={updateExperimentLocalizationOffset}
      updateExperimentLocalizationOffsetDisabledReason={updateExperimentLocalizationOffsetDisabledReason}
      updateWorkflowPresetInputs={updateWorkflowPresetInputs}
      updateWorkflowPresetInputsDisabledReason={updateWorkflowPresetInputsDisabledReason}
      experimentLifecycle={experimentLifecycle}
      automation={automation}
    /> : <ExperimentPanelContentWithoutProcesses
      panel={panel} plugin={plugin} executionTargetId={executionTargetId} disabledReason={disabledReason}
      editing={editing}
      experiment={experiment} automation={automation} robotAssetCatalog={robotAssetCatalog}
      updateExperimentRobotBindings={updateExperimentRobotBindings}
      updateExperimentRobotBindingsDisabledReason={updateExperimentRobotBindingsDisabledReason}
      updateExperimentLocalizationOffset={updateExperimentLocalizationOffset}
      updateExperimentLocalizationOffsetDisabledReason={updateExperimentLocalizationOffsetDisabledReason}
      updateWorkflowPresetInputs={updateWorkflowPresetInputs}
      updateWorkflowPresetInputsDisabledReason={updateWorkflowPresetInputsDisabledReason}
      experimentLifecycle={experimentLifecycle}
    />;
  return <PanelRunDetailDemand
    panelId={panel.id}
    enabled={dataContractsDemandRunDetails(dataContracts)}
    experimentLifecycle={experimentLifecycle}
    automation={automation}
  >{content}</PanelRunDetailDemand>;
}

function ExperimentPanelContentWithoutProcesses({ plugin,...props }:
  Parameters<typeof ExperimentPanelContent>[0] & { plugin:NonNullable<ReturnType<typeof getPanelPlugin>> }) {
  const baseContext: PanelBaseContext = {
    executionTargetId:props.executionTargetId,
    disabledReason:props.disabledReason,
    editing:props.editing,
  };
  const context = createPanelContext(plugin,props.panel,baseContext,props);
  return <PanelPluginRenderer panel={props.panel} plugin={plugin} context={context} />;
}

function PanelRunDetailDemand({ panelId,enabled,experimentLifecycle,automation,children }: {
  panelId:string;
  enabled:boolean;
  experimentLifecycle:Parameters<typeof ExperimentPanelContent>[0]['experimentLifecycle'];
  automation:AutomationPanelContext['automation'];
  children:ReactNode;
}) {
  const demands=panelRunDetailDemands({
    panelId,targetId:automation.targetId,
    activeRuns:experimentLifecycle.activeRuns??[],
    fallback:experimentLifecycle.panelWorkflowInvocationFallback,
    enabled,
  });
  usePanelRunDetailDemand({ demands,automation });
  return children;
}

function ExperimentPanelContentWithProcesses(props: Parameters<typeof ExperimentPanelContent>[0]) {
  const targetId = props.executionTargetId || 'local';
  const requiredTargets = [...new Set([targetId,...(
    props.experimentLifecycle.activeRun?.workflowTargets
      .map((workflow) => workflow.executionTargetId) ?? []
  )])];
  const executions = useExecutionTargets(requiredTargets);
  const plugin = getPanelPlugin(props.panel.pluginId)!;
  const baseContext: PanelBaseContext = {
    executionTargetId:props.executionTargetId,
    disabledReason:props.disabledReason,
    editing:props.editing,
  };
  const context = createPanelContext(plugin,props.panel,baseContext,{
    experiment:props.experiment,
    automation:props.automation,
    robotAssetCatalog:props.robotAssetCatalog,
    updateExperimentRobotBindings:props.updateExperimentRobotBindings,
    updateExperimentRobotBindingsDisabledReason:props.updateExperimentRobotBindingsDisabledReason,
    updateExperimentLocalizationOffset:props.updateExperimentLocalizationOffset,
    updateExperimentLocalizationOffsetDisabledReason:props.updateExperimentLocalizationOffsetDisabledReason,
    updateWorkflowPresetInputs:props.updateWorkflowPresetInputs,
    updateWorkflowPresetInputsDisabledReason:props.updateWorkflowPresetInputsDisabledReason,
    experimentLifecycle:props.experimentLifecycle,
    executionRuntime:{
      targetId,
      processInstances:executions.flatMap((execution) => execution.processInstances),
      loading:executions.some((execution) => execution.loading),
      error:executions.map((execution) => execution.error).filter(Boolean).join(' · '),
    },
  });
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
