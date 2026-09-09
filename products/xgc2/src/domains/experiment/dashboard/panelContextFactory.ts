import type {
  AutomationPanelContext,
  AnyPanelPluginDefinition,
  PanelActionInvocation,
  PanelActionPortDefinition,
  PanelAuthoringPortDefinition,
  PanelBaseContext,
  PanelPluginContext,
  PanelPortsContext,
} from '../../../panels/types';
import {
  automationActionById,
  automationActionWorkNodes,
  automationWorkNodeOccupancy,
  isAutomationExecutionRunActive,
  isFailedWorkflowRunStatus,
  type AutomationAction,
  type AutomationDocument,
  type AutomationRun,
  type AutomationRunSummaryView,
} from '../../automation/automationPublic';
import {
  isSystemExperimentRunnerRoot,
  SYSTEM_EXPERIMENT_RUNNER,
  type ExperimentRunView,
  type ExperimentSessionView,
} from '../experimentPublic';
import type {
  ExperimentDocument,
  ExperimentLocalizationOffset,
  ExperimentRobotBinding,
  PanelActionPortBinding,
  PanelAuthoringPortBinding,
  PanelInstance,
  PanelPortBinding,
  PanelWorkflowPortBinding,
} from '../experimentModel';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import type { ProcessInstance } from '../../execution/executionPublic';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,experimentProcessRuntimeProjection,experimentDescendantRunIds,experimentOwnedProcessInstances,processReady } from '../experimentProcessRuntime';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import { rosBasicServiceCallNodeId } from '../../../panels/ros/rosBasicServicesPanelProjection';
import {
  isRosPanelCallParent,
  isRosTotalRunPanelParent,
  pickRosTotalRunServiceChild,
} from '../../../panels/ros/rosBasicServicesTotalRunChild';
import { isRobotInstrumentPanel } from './robotInstrumentModel';

export type PanelContextActions = {
  experiment?: ExperimentDocument;
  automation: AutomationPanelContext['automation'];
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
  executionRuntime?: {
    targetId:string;
    processInstances:ProcessInstance[];
    loading:boolean;
    error:string;
  };
  robotAssetCatalog?: { assets: readonly RobotAssetDocument[];loading: boolean;error: string };
  updateExperimentRobotBindings?: (
    bindings: ExperimentRobotBinding[],expectedHeadCommitId: string,reason?: string,
  ) => Promise<ExperimentDocument>;
  updateExperimentRobotBindingsDisabledReason?: () => string;
  updateExperimentLocalizationOffset?: (
    offset: ExperimentLocalizationOffset,expectedHeadCommitId: string,reason?: string,
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
};

export type PanelWorkflowInvocationFallback = PanelActionInvocation & {
  rootRunId:string;
  targetId:string;
};

export function dataProjectionRequiresRunDetails(projection:string) {
  return projection===EXPERIMENT_PROCESS_RUNTIME_DATASOURCE
    || projection===workflowRuntimeDatasources.run
    || projection===workflowRuntimeDatasources.runLogs
    || projection==='camera.video.v1';
}

export function createPanelContext(
  plugin: AnyPanelPluginDefinition,
  panel: PanelInstance,
  baseContext: PanelBaseContext,
  host: PanelContextActions,
): PanelPluginContext {
  return {
    ...baseContext,
    ...(plugin.sharedStateScope ? { sharedStateScope: plugin.sharedStateScope } : {}),
    ports: createPanelPorts(plugin,panel,host),
  };
}

function createPanelPorts(
  plugin: AnyPanelPluginDefinition,
  panel: PanelInstance,
  host: PanelContextActions,
): PanelPortsContext {
  const panelWorkflow = workflowBinding(panel.portBindings);
  return {
    actions: Object.fromEntries(panelActionPortEntries(plugin,panel).map(({ definition,binding }) => {
      const resolved = binding && panelWorkflow && resolveActionBinding(binding,panelWorkflow,host);
      const disabledReason = !host.experiment
        ? 'The current Experiment is unavailable.'
        : resolved?.error
          ? resolved.error
          : '';
      const activeInvocation = binding && panelWorkflow && resolved?.document
        && resolved.action && resolved.preset && resolved.instance
        ? resolvePanelActionActiveInvocation({
          binding,panelWorkflow,panel,host,
          workflowResourceId:resolved.document.head.resourceId,
          workflowBranch:resolved.instance.ref.branch,
          actionId:resolved.action.id,
          presetId:resolved.preset.id,
          panelActionId:resolved.instance.actionPresets.find((preset) => (
            preset.id === panelWorkflow.presetId
          ))?.actionId ?? '',
        })
        : undefined;
      const latestInvocation = resolved?.document && resolved.action && resolved.preset
        ? resolvePanelActionReceipt(host,panel.id,resolved.preset.id,
          resolved.document.head.resourceId,resolved.action.id)
        : undefined;
      const progressInvocation = activeInvocation
        ?? (latestInvocation && isFailedWorkflowRunStatus(latestInvocation.status) ? latestInvocation : undefined);
      return [definition.id,{
        id:definition.id,
        label:definition.label,
        connected:Boolean(binding && resolved?.document && resolved.action && resolved.preset),
        disabledReason,
        ...(resolved?.action ? {
          action: {
            id:resolved.action.id,label:resolved.action.label,kind:resolved.action.kind,
            controls:resolved.action.controls,
          },
          inputSchema:resolved.action.inputSchema,
        } : {}),
        defaults:resolved?.preset?.inputs ?? {},
        ...(activeInvocation ? { activeInvocation } : {}),
        ...(progressInvocation
          ? { serviceStatus:panelActionRuntimeStatus(
            host,progressInvocation.id,resolved?.document,resolved?.action,
            isFailedWorkflowRunStatus(progressInvocation.status),
          ) }
          : {}),
        ...(latestInvocation ? { latestInvocation } : {}),
        invoke: async (overrides = {},reason) => {
          if (!host.experiment || !resolved?.document || !resolved.action || !resolved.preset) {
            throw new Error(disabledReason || `Panel Action port "${definition.id}" is not connected.`);
          }
          const invocationReason = reason?.trim() || `Invoke ${resolved.action.label} from panel ${panel.id}`;
          if (resolved.action.kind==='service' && binding?.presetId===panelWorkflow?.presetId
            && Object.keys(overrides).length===0) {
            const started=await host.experimentLifecycle.start();
            if (!started) throw new Error('Panel Workflow did not start.');
            return started;
          }
          if (!host.experimentLifecycle.invokeAction) {
            throw new Error('Panel Action orchestration is unavailable.');
          }
          return host.experimentLifecycle.invokeAction(
            panel.id,resolved.preset.id,overrides,invocationReason,
          );
        },
        control: async (target,control,reason) => {
          if (!resolved?.action?.controls.includes(control)) {
            throw new Error(`Action "${resolved?.action?.id ?? definition.id}" does not support ${control}.`);
          }
          if (control === 'signal') throw new Error('Signals require an Interaction port.');
          if (control === 'restart') {
            if (!host.experimentLifecycle.stopAction || !host.experimentLifecycle.invokeAction) {
              throw new Error('Panel Action lifecycle control is unavailable.');
            }
            await host.experimentLifecycle.stopAction(target,reason || `Restart ${definition.label}`);
            await host.experimentLifecycle.invokeAction(
              panel.id,resolved.preset!.id,{},reason || `Restart ${definition.label}`,
            );
            return;
          }
          if (!host.experimentLifecycle.stopAction) {
            throw new Error('Panel Action lifecycle control is unavailable.');
          }
          await host.experimentLifecycle.stopAction(target,reason || `${control} ${definition.label}`);
        },
        trace: {
          workflowInstanceId:panelWorkflow?.workflowInstanceId,
          presetId:binding?.presetId,
          automationResourceId:resolved?.document?.head.resourceId,
          actionId:resolved?.action?.id,
        },
      }];
    })),
    data: Object.fromEntries((plugin.dataPorts ?? []).map((definition) => {
      const binding = exactBinding(panel.portBindings,definition.id,'data');
      const matched = Boolean(binding && binding.projection === definition.contract);
      return [definition.id,{
        id:definition.id,label:definition.label,contract:definition.contract,
        connected:matched,
        value:matched && binding ? dataProjectionValue(binding.projection,host) : undefined,
        trace:{ projection:binding?.projection },
      }];
    })),
    authoring: Object.fromEntries((plugin.authoringPorts ?? []).map((definition) => {
      const binding = resolveAuthoringBinding(panel,definition);
      const workflow = workflowBinding(panel.portBindings);
      const preset = binding?.target === 'action-preset' && binding.presetId && workflow
        ? host.experiment?.spec.workflowInstances
          .find((candidate) => candidate.id === workflow.workflowInstanceId)
          ?.actionPresets.find((candidate) => candidate.id === binding.presetId)
        : undefined;
      const disabledReason = !binding
        ? `Authoring port "${definition.label}" is not connected.`
        : binding.target === 'experiment.robots'
          ? host.updateExperimentRobotBindingsDisabledReason?.() || ''
          : binding.target === 'experiment.localizationOffset'
            ? host.updateExperimentLocalizationOffsetDisabledReason?.()
              ?? host.updateExperimentRobotBindingsDisabledReason?.() ?? ''
            : binding.target === 'action-preset'
              ? host.updateWorkflowPresetInputsDisabledReason?.() || ''
              : 'Action preset defaults are edited by the dashboard Connections editor.';
      return [definition.id,{
        id:definition.id,label:definition.label,connected:Boolean(binding),disabledReason,
        value:binding?.target === 'experiment.robots'
          ? host.experiment?.spec.robots
          : binding?.target === 'experiment.localizationOffset'
            ? host.experiment?.spec.localizationOffset
            : binding?.target === 'action-preset'
              ? {
                headCommitId:host.experiment?.branch.headCommitId ?? '',
                runMode:host.experimentLifecycle.runMode,
                inputs:preset?.inputs ?? {},
              }
              : undefined,
        commit: async (value,expectedCommitId,reason) => {
          if (binding?.target === 'experiment.robots' && host.updateExperimentRobotBindings) {
            return host.updateExperimentRobotBindings(value as ExperimentRobotBinding[],expectedCommitId,reason);
          }
          if (binding?.target === 'experiment.localizationOffset' && host.updateExperimentLocalizationOffset) {
            return host.updateExperimentLocalizationOffset(
              value as ExperimentLocalizationOffset,expectedCommitId,reason,
            );
          }
          if (binding?.target === 'action-preset' && binding.presetId && workflow && host.updateWorkflowPresetInputs) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              throw new Error('Camera intrinsic authoring requires a field map.');
            }
            return host.updateWorkflowPresetInputs(
              workflow.workflowInstanceId,binding.presetId,value as Record<string,unknown>,expectedCommitId,reason,
            );
          }
          throw new Error('This authoring target is unavailable.');
        },
        trace:{ target:binding?.target,workflowInstanceId:workflow?.workflowInstanceId,presetId:binding?.presetId },
      }];
    })),
    interactions: Object.fromEntries((plugin.interactionPorts ?? []).map((definition) => {
      const binding = exactBinding(panel.portBindings,definition.id,'interaction');
      return [definition.id,{
        id:definition.id,label:definition.label,contract:definition.contract,connected:Boolean(binding),
        disabledReason:binding ? 'Interaction signaling is not available from this runtime projection.' : `Interaction port "${definition.label}" is not connected.`,
        signal: async () => { throw new Error('Interaction signaling is not available from this runtime projection.'); },
        trace:{ channel:binding?.channel },
      }];
    })),
  };
}

function panelActionPortEntries(
  plugin: AnyPanelPluginDefinition,
  panel: PanelInstance,
): Array<{ definition:PanelActionPortDefinition;binding?:PanelActionPortBinding }> {
  const staticDefinitions = plugin.actionPorts ?? [];
  const staticIds = new Set(staticDefinitions.map((definition) => definition.id));
  const entries = staticDefinitions.map((definition) => ({
    definition,
    binding: actionBinding(panel.portBindings,definition.id),
  }));
  if (plugin.dynamicActionPorts?.source !== 'panel-action-bindings') return entries;
  panel.portBindings
    .filter((binding): binding is PanelActionPortBinding => binding.kind === 'action' && !staticIds.has(binding.portId))
    .forEach((binding) => {
      entries.push({
        definition:{ id:binding.portId,label:binding.portId },
        binding,
      });
    });
  return entries;
}

function exactBinding<K extends PanelPortBinding['kind']>(
  bindings: readonly PanelPortBinding[],portId: string,kind: K,
): Extract<PanelPortBinding,{ kind: K }> | undefined {
  const binding = bindings.find((candidate) => candidate.portId === portId);
  return binding?.kind === kind ? binding as Extract<PanelPortBinding,{ kind: K }> : undefined;
}

function resolveAuthoringBinding(
  panel: PanelInstance,
  definition: PanelAuthoringPortDefinition,
): PanelAuthoringPortBinding | undefined {
  const saved = exactBinding(panel.portBindings,definition.id,'authoring');
  if (saved) return saved;
  if (definition.target === 'experiment.localizationOffset') {
    return { portId:definition.id,kind:'authoring',target:definition.target };
  }
  if (definition.target === 'action-preset') {
    const workflow = workflowBinding(panel.portBindings);
    if (!workflow) return undefined;
    return {
      portId:definition.id,kind:'authoring',target:definition.target,presetId:workflow.presetId,
    };
  }
  return undefined;
}

function actionBinding(bindings:readonly PanelPortBinding[],portId:string) {
  const binding = bindings.find((candidate) => candidate.portId === portId);
  return binding?.kind === 'action' ? binding : undefined;
}

function workflowBinding(bindings:readonly PanelPortBinding[]) {
  return bindings.find((binding):binding is PanelWorkflowPortBinding => binding.kind === 'workflow');
}

function resolveActionBinding(
  binding:PanelActionPortBinding,
  owner:PanelWorkflowPortBinding,
  host:PanelContextActions,
) {
  const instance = host.experiment?.spec.workflowInstances.find((candidate) => candidate.id === owner.workflowInstanceId);
  if (!instance) return { error:`Workflow instance "${owner.workflowInstanceId}" is unavailable.` };
  const preset = instance.actionPresets.find((candidate) => candidate.id === binding.presetId);
  const document = host.automation.documents.find((candidate) => (
    candidate.head.resourceId === instance.ref.resourceId && candidate.branch.name === instance.ref.branch
  ));
  if (!document) return { error:`Workflow "${instance.ref.resourceId}" is unavailable.` };
  if (!preset) return { error:`Action preset "${binding.presetId}" is unavailable.` };
  const action = automationActionById(document.spec,preset.actionId);
  if (!action) return { error:`Workflow "${instance.id}" does not export Action "${preset.actionId}".` };
  return { instance,preset,document,action,error:'' };
}

function panelActionRuntimeStatus(
  host:PanelContextActions,
  runId:string,
  document:AutomationDocument|undefined,
  action:AutomationAction|undefined,
  failedRun:boolean,
) {
  const processes=panelServiceStatus(host,runId);
  if (processes.total>0) return processes;
  const occupancy=automationWorkNodeOccupancy(
    document ? automationActionWorkNodes(document.spec,action) : [],
    panelActionNodeSummaries(host,runId),
  );
  const failed=occupancy.failed || failedRun || Boolean(experimentProcessRuntimeProjection(
    dataProjectionValue(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,host),
  )?.error);
  const total=occupancy.total>0 ? occupancy.total : failed ? 1 : 0;
  const ready=failed ? Math.max(occupancy.ready,total>0 ? 1 : 0) : occupancy.ready;
  const state=failed ? 'degraded' as const
    : total>0 && ready===total ? 'running' as const : 'starting' as const;
  return { state,ready,total };
}

function panelActionNodeSummaries(host:PanelContextActions,runId:string) {
  const runtime=experimentProcessRuntimeProjection(dataProjectionValue(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,host));
  const ids=new Set(runtime ? experimentDescendantRunIds(runtime,[runId]) : [runId]);
  ids.add(runId);
  host.automation.runSummaries.forEach((run) => {
    if (run.parentRunId===runId || run.rootRunId===runId) ids.add(run.id);
  });
  Object.values(host.automation.runDetailsById).forEach((detail) => {
    const run=detail.run;
    if (run && (run.parentRunId===runId || run.rootRunId===runId || run.id===runId)) ids.add(run.id);
  });
  return [...ids].flatMap((id) => host.automation.runDetailsById[id]?.nodeSummaries ?? []);
}

function panelServiceStatus(host:PanelContextActions,runId:string) {
  const runtime=experimentProcessRuntimeProjection(dataProjectionValue(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,host));
  const processes=experimentOwnedProcessInstances(runtime,experimentDescendantRunIds(runtime,[runId]));
  const ready=processes.filter(processReady).length;
  const failed=processes.some((process) => ['failed','lost'].includes(process.observedState)
    || process.readiness.status==='failing');
  const state=failed || Boolean(runtime?.error) ? 'degraded' as const
    : processes.length>0 && ready===processes.length ? 'running' as const : 'starting' as const;
  return { state,ready,total:processes.length };
}

function dataProjectionValue(projection: string,host: PanelContextActions) {
  if (projection === 'experiment.robots' || projection === 'experiment.robots.v1') {
    return host.experiment;
  }
  if (projection === 'recording.artifacts.v1') {
    return { experimentResourceId: host.experiment?.head.resourceId ?? '' };
  }
  if (projection === 'robot.assets.v1') return host.robotAssetCatalog;
  if (projection === EXPERIMENT_PROCESS_RUNTIME_DATASOURCE) {
    const activeRun = host.experimentLifecycle.activeRun;
    // Consumers receive the target snapshots plus the exact Automation
    // relation graph and must intersect them. Filtering only by the root owner
    // here would silently discard child-owned Panel processes; returning a
    // guessed component list would leak unrelated host processes.
    const processInstances = host.executionRuntime?.processInstances ?? [];
    return {
      targetId:host.executionRuntime?.targetId ?? '',
      activeRun,
      activeRuns:host.experimentLifecycle.activeRuns
        ?? (activeRun ? [activeRun] : []),
      sessionViews:host.experimentLifecycle.sessionViews ?? [],
      processInstances,
      documents:host.automation.documents,
      catalog:host.automation.catalog,
      runSummaries:host.automation.runSummaries,
      runDetailsById:host.automation.runDetailsById,
      loading:host.executionRuntime?.loading ?? false,
      error:host.executionRuntime?.error ?? '',
    };
  }
  if (projection === 'camera.calibration.intrinsic.v1') {
    const { targetId,documents,catalog,loading,error } = host.automation;
    return {
      targetId,documents,catalog,loading,error,
      experimentResourceId:host.experiment?.head.resourceId ?? '',
    };
  }
  if (projection === workflowRuntimeDatasources.run
    || projection === workflowRuntimeDatasources.runLogs
    || projection === 'camera.video.v1') {
    const { targetId,documents,catalog,runSummaries,runDetailsById,loading,error } = host.automation;
    return {
      targetId,documents,catalog,runSummaries,runDetailsById,loading,error,
      experimentResourceId:host.experiment?.head.resourceId ?? '',
      loadRunDetail:host.automation.loadRunDetail,
      refreshExecutionHistory:host.automation.refreshExecutionHistory,
    };
  }
  return undefined;
}

function invocation(run: { id:string;status:PanelActionInvocation['status'];revision:number }): PanelActionInvocation {
  return { id:run.id,status:run.status,revision:run.revision };
}

function panelActionRuns(host:PanelContextActions):AutomationRunSummaryView[] {
  const candidates=new Map<string,AutomationRunSummaryView>(host.automation.runSummaries.map((run) => [run.id,run]));
  // Fresh browsers restore Session command roots as retained details, before
  // any history has been opened. They must project the same buttons as SSE.
  Object.values(host.automation.runDetailsById).forEach(({ run }) => {
    if (!run) return;
    if ((candidates.get(run.id)?.revision ?? -1)>run.revision) return;
    const parameters=run.parameters;
    candidates.set(run.id,{
      ...run,
      ...(typeof parameters.runMode==='string' ? { experimentSelector:{
        runMode:parameters.runMode,
        ...(typeof parameters.panelId==='string' ? { panelId:parameters.panelId } : {}),
        ...(typeof parameters.presetId==='string' ? { presetId:parameters.presetId } : {}),
      } } : {}),
    });
  });
  return [...candidates.values()];
}

// Retain the exact command receipt after it leaves activeRuns, including
// actions issued by another browser. The receipt is not a process-ready flag.
function resolvePanelActionReceipt(
  host:PanelContextActions,panelId:string,presetId:string,workflowResourceId:string,actionId:string,
):PanelActionInvocation|undefined {
  const experiment=host.experiment;
  if (!experiment) return undefined;
  const runs=panelActionRuns(host).filter((run) => (
    directTargetRootIdentity(run,experiment,host.automation.targetId,
      host.experimentLifecycle.runMode,panelId,presetId,workflowResourceId,actionId)
    || (isSystemExperimentRunnerRoot(run)
      && run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
      && run.sourceRef?.resourceId===experiment.head.resourceId
      && run.sourceRef.branch===experiment.branch.name
      && run.sourceRef.commitId===experiment.head.mainCommitId
      && run.sourceRef.digest===experiment.head.digest
      && run.experimentSelector?.runMode===host.experimentLifecycle.runMode
      && run.experimentSelector.panelId===panelId
      && run.experimentSelector.presetId===presetId)
  )).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.revision-a.revision);
  return runs[0] ? invocation(runs[0]) : undefined;
}

function resolvePanelActionActiveInvocation({
  binding,panelWorkflow,panel,host,workflowResourceId,workflowBranch,actionId,presetId,panelActionId,
}: {
  binding:PanelActionPortBinding;
  panelWorkflow:PanelWorkflowPortBinding;
  panel:PanelInstance;
  host:PanelContextActions;
  workflowResourceId:string;
  workflowBranch:string;
  actionId:string;
  presetId:string;
  panelActionId:string;
}):PanelActionInvocation|undefined {
  const experiment=host.experiment;
  if (!experiment) return undefined;
  const lifecycleRoots=(host.experimentLifecycle.activeRuns
    ?? (host.experimentLifecycle.activeRun ? [host.experimentLifecycle.activeRun] : []))
    .filter((root) => exactLifecycleRoot(root,experiment,host.experimentLifecycle.runMode));
  const lifecycleRootIds=new Set(lifecycleRoots.map((root) => root.id));
  const runs=panelActionRuns(host);
  const roots=runs.filter((run) => (
    lifecycleRootIds.has(run.id)
    && exactSystemRootSelector(
      run,experiment,host.experimentLifecycle.runMode,panel.id,presetId,
      binding.presetId===panelWorkflow.presetId,
    )
  ));
  const directCandidates=runs.flatMap((run) => (
    exactDirectTargetRoot(
      run,experiment,host.automation.targetId,host.experimentLifecycle.runMode,
      panel.id,presetId,workflowResourceId,actionId,
    ) ? [{ rootId:run.id,rootActionId:'target-root',invocation:invocation(run) }] : []
  ));
  const rootCandidates=roots.flatMap((root) => runs.flatMap((run) => (
    run.targetId===host.automation.targetId
    && run.automationResourceId===workflowResourceId
    && run.actionId===actionId
    && run.sourceKind==='automation'
    && run.sourceRef?.domain==='automation'
    && run.sourceRef.resourceId===workflowResourceId
    && run.sourceRef.branch===workflowBranch
    && run.parentRunId===root.id
    && run.rootRunId===root.id
    && isAutomationExecutionRunActive(run)
      ? [{ rootId:root.id,rootActionId:root.actionId,invocation:invocation(run) }]
      : []
  )));
  const candidates=[...directCandidates,...rootCandidates];

  const fallback=host.experimentLifecycle.panelWorkflowInvocationFallback;
  if (fallback
    && fallback.targetId===host.automation.targetId
    && binding.presetId===panelWorkflow.presetId
    && lifecycleRoots.some((root) => (
      root.id===fallback.rootRunId && root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run
    ))) {
    const current=resolveFallbackInvocation({
      fallback,host,experiment,workflowResourceId,workflowBranch,actionId,
      panelId:panel.id,presetId,
    });
    if (isRobotInstrumentPanel(panel) && current) return current;
    const explicitRootIds=new Set(roots.flatMap((root) => (
      root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run ? [] : [root.id]
    )));
    // Once an explicit run-panel root exists, it owns the restart handoff. Do
    // not resurrect the full-Run member while its replacement child is still
    // materializing in the target-wide summaries.
    if (explicitRootIds.size>0) {
      return oneInvocation(rootCandidates.filter((candidate) => explicitRootIds.has(candidate.rootId)));
    }
    // The relation itemKey already selected this exact workflowInstance. Other
    // children under the same full root may legitimately reuse the same
    // Automation/action and are not candidates for this Panel.
    const exactCandidates=candidates.filter((candidate) => (
      candidate.rootId!==fallback.rootRunId && candidate.invocation.id!==fallback.id
    ));
    if (current) exactCandidates.push({
      rootId:fallback.rootRunId,
      rootActionId:SYSTEM_EXPERIMENT_RUNNER.actions.run,
      invocation:current,
    });
    return oneInvocation(exactCandidates);
  }
  const exact = oneInvocation(candidates);
  if (exact) return exact;
  if (binding.presetId === panelWorkflow.presetId || !panelActionId || panelActionId === actionId) {
    return undefined;
  }
  return resolveTotalRunServiceChildInvocation({
    host,workflowResourceId,workflowBranch,actionId,panelActionId,lifecycleRoots,lifecycleRootIds,
  });
}

function resolveTotalRunServiceChildInvocation({
  host,workflowResourceId,workflowBranch,actionId,panelActionId,lifecycleRoots,lifecycleRootIds,
}: {
  host:PanelContextActions;
  workflowResourceId:string;
  workflowBranch:string;
  actionId:string;
  panelActionId:string;
  lifecycleRoots:readonly ExperimentRunView[];
  lifecycleRootIds:ReadonlySet<string>;
}):PanelActionInvocation|undefined {
  const callNodeId = rosBasicServiceCallNodeId(actionId);
  if (!callNodeId) return undefined;
  const expected = {
    automationResourceId:workflowResourceId,
    actionIds:[panelActionId,actionId],
    lifecycleRootIds,
    workflowBranch,
  };
  // Child Runs loaded through relation hydration live in runDetailsById; the
  // bounded Automation history list is intentionally rooted at the System
  // Runner and does not necessarily repeat those descendants. Project from
  // both stores, deduplicated by exact Run identity/revision.
  const runCandidates = new Map<string,AutomationRunSummaryView|AutomationRun>();
  host.automation.runSummaries.forEach((run) => runCandidates.set(run.id,run));
  Object.values(host.automation.runDetailsById).forEach((detail) => {
    const run = detail.run;
    if (!run) return;
    const previous = runCandidates.get(run.id);
    if (!previous || run.revision >= previous.revision) runCandidates.set(run.id,run);
  });
  const candidates = [...runCandidates.values()];
  const parents:AutomationRunSummaryView[] = candidates.filter((run) => (
    run.targetId === host.automation.targetId && isRosPanelCallParent(run,expected)
  ));
  const fallback = host.experimentLifecycle.panelWorkflowInvocationFallback;
  const pinned = host.automation.documents.find((document) => (
    document.head.resourceId === workflowResourceId && document.branch.name === workflowBranch
  ));
  if (fallback
    && pinned
    && fallback.targetId === host.automation.targetId
    && lifecycleRoots.some((root) => (
      root.id === fallback.rootRunId && root.actionId === SYSTEM_EXPERIMENT_RUNNER.actions.run
    ))
    && !parents.some((parent) => parent.id === fallback.id)) {
    const fallbackParent:AutomationRunSummaryView = {
      id:fallback.id,targetId:fallback.targetId,automationResourceId:workflowResourceId,
      actionId:panelActionId,actionVersion:1,status:fallback.status,revision:fallback.revision,
      parentRunId:fallback.rootRunId,rootRunId:fallback.rootRunId,
      sourceKind:'automation',
      sourceRef:{
        domain:'automation',resourceId:pinned.head.resourceId,branch:pinned.branch.name,
        commitId:pinned.head.mainCommitId,version:pinned.head.currentVersion,digest:pinned.head.digest,
      },
      createdAt:'',updatedAt:'',
    };
    if (isRosTotalRunPanelParent(fallbackParent,{
      automationResourceId:workflowResourceId,
      panelActionId,
      lifecycleRootIds,
      workflowBranch,
    })) parents.push(fallbackParent);
  }
  const picked = pickRosTotalRunServiceChild(
    callNodeId,
    parents,
    (parentId) => host.automation.runDetailsById[parentId]?.relations?.childRuns ?? [],
    (childRunId,status,revision) => {
      const summary = candidates.find((run) => (
        run.id === childRunId && isAutomationExecutionRunActive(run)
      ));
      return summary ? invocation(summary) : { id:childRunId,status,revision };
    },
  );
  return picked;
}

function resolveFallbackInvocation({
  fallback,host,experiment,workflowResourceId,workflowBranch,actionId,panelId,presetId,
}: {
  fallback:PanelWorkflowInvocationFallback;
  host:PanelContextActions;
  experiment:ExperimentDocument;
  workflowResourceId:string;
  workflowBranch:string;
  actionId:string;
  panelId:string;
  presetId:string;
}):PanelActionInvocation|undefined {
  const summaries=host.automation.runSummaries.filter((run) => (
    run.id===fallback.id
    && run.targetId===fallback.targetId
    && run.automationResourceId===workflowResourceId
    && run.actionId===actionId
    && (run.sourceKind==='automation'
      ? run.sourceRef?.domain==='automation'
        && run.sourceRef.resourceId===workflowResourceId
        && run.sourceRef.branch===workflowBranch
        && run.parentRunId===fallback.rootRunId
        && run.rootRunId===fallback.rootRunId
      : directTargetRootIdentity(
        run,experiment,host.automation.targetId,host.experimentLifecycle.runMode,
        panelId,presetId,workflowResourceId,actionId,
      ))
  ));
  if (summaries.length===0) return invocation(fallback);
  const newestRevision=Math.max(...summaries.map((run) => run.revision));
  if (newestRevision<fallback.revision) return invocation(fallback);
  const newest=summaries.filter((run) => run.revision===newestRevision);
  const statuses=new Set(newest.map((run) => run.status));
  if (statuses.size!==1) return undefined;
  const current=newest[0];
  if (current.revision===fallback.revision && current.status!==fallback.status) return undefined;
  return isAutomationExecutionRunActive(current) ? invocation(current) : undefined;
}

function exactLifecycleRoot(
  root:ExperimentRunView,
  experiment:ExperimentDocument,
  runMode:string,
) {
  return root.automationResourceId===SYSTEM_EXPERIMENT_RUNNER.resourceId
    && root.experimentRef.domain==='experiment'
    && root.experimentRef.resourceId===experiment.head.resourceId
    && root.experimentRef.branch===experiment.branch.name
    && root.rootRunId===root.id
    && root.runMode===runMode
    && (root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run
      || root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
      || root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction);
}

function exactSystemRootSelector(
  run:AutomationRunSummaryView,
  experiment:ExperimentDocument,
  runMode:string,
  panelId:string,
  presetId:string,
  panelWorkflowPreset:boolean,
) {
  if (!isSystemExperimentRunnerRoot(run)
    || run.sourceRef?.resourceId!==experiment.head.resourceId
    || run.sourceRef.branch!==experiment.branch.name
    || run.experimentSelector?.runMode!==runMode
    || !isAutomationExecutionRunActive(run)) return false;
  if (run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.run) {
    return panelWorkflowPreset
      && run.experimentSelector.panelId===undefined
      && run.experimentSelector.presetId===undefined;
  }
  if (run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel) {
    return panelWorkflowPreset
      && run.experimentSelector.panelId===panelId
      && run.experimentSelector.presetId===undefined;
  }
  return run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
    && run.experimentSelector.panelId===panelId
    && run.experimentSelector.presetId===presetId;
}

function exactDirectTargetRoot(
  run:AutomationRunSummaryView,
  experiment:ExperimentDocument,
  targetId:string,
  runMode:string,
  panelId:string,
  presetId:string,
  workflowResourceId:string,
  actionId:string,
) {
  return directTargetRootIdentity(
    run,experiment,targetId,runMode,panelId,presetId,workflowResourceId,actionId,
  ) && isAutomationExecutionRunActive(run);
}

function directTargetRootIdentity(
  run:AutomationRunSummaryView,
  experiment:ExperimentDocument,
  targetId:string,
  runMode:string,
  panelId:string,
  presetId:string,
  workflowResourceId:string,
  actionId:string,
) {
  return run.targetId===targetId
    && run.automationResourceId===workflowResourceId
    && run.actionId===actionId
    && run.sourceKind==='experiment'
    && run.sourceRef?.domain==='experiment'
    && run.sourceRef.resourceId===experiment.head.resourceId
    && run.sourceRef.branch===experiment.branch.name
    && run.sourceRef.commitId===experiment.head.mainCommitId
    && run.sourceRef.version===experiment.head.currentVersion
    && run.sourceRef.digest===experiment.head.digest
    && run.experimentSelector?.runMode===runMode
    && run.experimentSelector.panelId===panelId
    && run.experimentSelector.presetId===presetId
    && !run.parentRunId
    && (!run.rootRunId || run.rootRunId===run.id);
}

function oneInvocation(candidates:readonly { invocation:PanelActionInvocation }[]) {
  const byId=new Map<string,PanelActionInvocation>();
  let conflict=false;
  candidates.forEach(({ invocation:active }) => {
    const previous=byId.get(active.id);
    if (!previous || active.revision>previous.revision) {
      byId.set(active.id,active);
    } else if (active.revision===previous.revision && active.status!==previous.status) {
      conflict=true;
    }
  });
  return !conflict && byId.size===1 ? [...byId.values()][0] : undefined;
}
