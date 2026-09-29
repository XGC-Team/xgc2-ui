import type { ExperimentWorldBoundary } from '../experimentWorldBoundary';
import { createStandalonePanelActionPort } from './standalonePanelAction';
import type {
  AutomationPanelContext,
  AnyPanelPluginDefinition,
  PanelActionInvocation,
  PanelActionPortDefinition,
  PanelAuthoringPortDefinition,
  PanelBaseContext,
  PanelExecutionObserver,
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
  type AutomationRunDetail,
  type AutomationRunSummaryView,
} from '../../automation/automationPublic';
import {
  experimentSessionIsRunning,
  isSystemExperimentRunnerRoot,
  SYSTEM_EXPERIMENT_RUNNER,
  type ExperimentRunView,
  type ExperimentSessionView,
} from '../experimentPublic';
import type { ExperimentPlacement } from '../experimentWorkflowModel';
import type {
  ExperimentDocument,
  ExperimentLocalizationOffset,
  ExperimentRobotBinding,
  ExperimentScene,
  PanelActionPortBinding,
  PanelAuthoringPortBinding,
  PanelInstance,
  PanelPortBinding,
  PanelWorkflowPortBinding,
} from '../experimentModel';
import type { RobotAssetDocument } from '../../robot/robotAssetPublic';
import type { ProcessInstance } from '../../execution/executionPublic';
import { isRunStatusActive } from '../../../shared/executionStatusVocabulary';
import { EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,experimentProcessRuntimeProjection,experimentDescendantRunIds,experimentOwnedProcessInstances,processReady } from '../experimentProcessRuntime';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import { resolveRosBasicServiceRun } from '../../../panels/ros/rosBasicServicesPanelProjection';
import { isRobotInstrumentPanel } from './robotInstrumentModel';
import { createOfflineVideoActionPort } from './offlineVideoAction';
import { VIDEO_RENDER_ACTION_PORT } from '../../../panels/runtime/videoProduction/videoProductionModel';
import { SCIENTIFIC_GALLERY_PANEL_ID } from '../../../panels/runtime/scientificGalleryPanelModel';

export type PanelContextActions = {
  updateExperimentScene?: (value:ExperimentScene | undefined,expectedCommitId:string,reason?:string) => Promise<ExperimentDocument>;
  updateExperimentSceneDisabledReason?: () => string;
  updateExperimentWorldBoundary?: (value:ExperimentWorldBoundary | null,expectedCommitId:string,reason?:string) => Promise<ExperimentDocument>;
  updateExperimentWorldBoundaryDisabledReason?: () => string;
  experiment?: ExperimentDocument;
  automation: AutomationPanelContext['automation'];
  automationRuntimes?:ReadonlyMap<string,AutomationPanelContext['automation']>;
  /** Subscribable view of automation.runDetailsById for Action ports. */
  execution: PanelExecutionObserver;
  experimentLifecycle: {
    activeRun?: ExperimentRunView;
    activeRuns?:readonly ExperimentRunView[];
    sessionViews?:readonly ExperimentSessionView[];
    panelWorkflowInvocationFallback?:PanelWorkflowInvocationFallback;
    runMode:string;
    placement?:ExperimentPlacement;
    start: (inputOverrides?:Record<string,unknown>,presetId?:string) => Promise<PanelActionInvocation | undefined>;
    stop: () => Promise<unknown>;
    invokeAction?:(panelId:string,presetId:string,inputOverrides:Record<string,unknown>,reason?:string) => Promise<PanelActionInvocation>;
    stopAction?:(invocation:PanelActionInvocation,reason:string,targetId?:string) => Promise<unknown>;
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
      if (plugin.id===SCIENTIFIC_GALLERY_PANEL_ID
        && panel.pluginId===plugin.id && definition.id===VIDEO_RENDER_ACTION_PORT) {
        return [definition.id,createOfflineVideoActionPort(panel,host)];
      }
      const resolved = binding && panelWorkflow && resolveActionBinding(binding,panelWorkflow,host);
      if (binding?.executionMode==='standalone' && panelWorkflow) {
        return [definition.id,createStandalonePanelActionPort({ panel,binding,owner:panelWorkflow,host,definition,
          resolved:resolved || { error:'The Action binding is unavailable.' } })];
      }
      const disabledReason = !host.experiment
        ? 'The current Experiment is unavailable.'
        : resolved?.error
          ? resolved.error
          : '';
      // The Experiment binding and exact Session/relation identify the running
      // invocation. A delayed authoring catalog must not erase that identity.
      const activeInvocation = binding && panelWorkflow
        && resolved?.preset && resolved.instance
        ? resolvePanelActionActiveInvocation({
          binding,panelWorkflow,panel,host,
          workflowResourceId:resolved.instance.ref.resourceId,
          workflowBranch:resolved.instance.ref.branch,
          actionId:resolved.preset.actionId,
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
        execution:host.execution,
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
          const merged = overlayDeclaredRunMode(
            resolved.action,host.experimentLifecycle.runMode,overrides,
          );
          if (resolved.action.kind==='service' && !experimentSessionIsOpen(host,host.experiment)) {
            const started=await host.experimentLifecycle.start(merged,resolved.preset.id);
            if (!started) throw new Error('Panel Workflow did not start.');
            return started;
          }
          if (!host.experimentLifecycle.invokeAction) {
            throw new Error('Panel Action orchestration is unavailable.');
          }
          return host.experimentLifecycle.invokeAction(
            panel.id,resolved.preset.id,merged,invocationReason,
          );
        },
        control: async (target,control,reason) => {
          if (!resolved?.action?.controls.includes(control)) {
            throw new Error(`Action "${resolved?.action?.id ?? definition.id}" does not support ${control}.`);
          }
          if (control === 'signal') throw new Error('Signals require an Interaction port.');
          if (!host.experimentLifecycle.stopAction
            || (control === 'restart' && !host.experimentLifecycle.invokeAction)) {
            throw new Error('Panel Action lifecycle control is unavailable.');
          }
          const runs=panelActionRuns(host);
          const child=runs.find((run) => run.id===target.id);
          const owner=child && runs.find((run) => (
            run.id===child.parentRunId && run.id===child.rootRunId
            && isSystemExperimentRunnerRoot(run)
            && run.experimentSelector?.panelId===panel.id
            && (
              run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
              || (
                run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
                && run.experimentSelector?.presetId===resolved.preset?.id
                && isAutomationExecutionRunActive(run)
              )
            )
          ));
          const stopTarget=owner ? invocation(owner) : target;
          const relationTarget=Object.values(panelAutomationObservations(host.automation,host.automationRuntimes).runDetailsById)
            .flatMap((detail) => detail.relations?.childRuns ?? [])
            .find((relation) => relation.childRunId===stopTarget.id && relation.boundAt
              && !relation.launchAbandonedAt && relation.relation!=='detached')?.targetId;
          const stopTargetId=(owner ?? child)?.targetId ?? relationTarget ?? host.automation.targetId;
          await host.experimentLifecycle.stopAction(stopTarget,reason || `${control} ${definition.label}`,stopTargetId);
          if (control === 'restart') {
            await host.experimentLifecycle.invokeAction!(
              panel.id,resolved.preset!.id,
              overlayDeclaredRunMode(resolved.action,host.experimentLifecycle.runMode,{}),
              reason || `Restart ${definition.label}`,
            );
          }
        },
        trace: {
          workflowInstanceId:panelWorkflow?.workflowInstanceId,
          presetId:binding?.presetId,
          automationResourceId:resolved?.instance?.ref.resourceId,
          actionId:resolved?.preset?.actionId,
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
          : binding.target === 'experiment.worldBoundary'
            ? host.updateExperimentWorldBoundaryDisabledReason?.() || ''
          : binding.target === 'experiment.scene'
            ? host.updateExperimentSceneDisabledReason?.() ?? 'This dashboard cannot save scene changes to the Experiment.'
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
          : binding?.target === 'experiment.worldBoundary'
            ? host.experiment?.spec.worldBoundary
          : binding?.target === 'experiment.localizationOffset'
            ? host.experiment?.spec.localizationOffset
          : binding?.target === 'experiment.scene'
            ? host.experiment?.spec.scene === undefined
              ? undefined
              : {
                ...host.experiment.spec.scene,
                ...(host.experiment.spec.scene.parameters === undefined
                  ? {}
                  : { parameters:structuredClone(host.experiment.spec.scene.parameters) }),
              }
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
          if (binding?.target === 'experiment.worldBoundary' && host.updateExperimentWorldBoundary) {
            return host.updateExperimentWorldBoundary(value as ExperimentWorldBoundary | null,expectedCommitId,reason);
          }
          if (binding?.target === 'experiment.scene' && host.updateExperimentScene) {
            return host.updateExperimentScene(value as ExperimentScene | undefined,expectedCommitId,reason);
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
  // Robot assets edits these on the experiment itself. Saved panels that
  // predate the port still resolve; do not require a layout migration.
  if (definition.target === 'experiment.localizationOffset' || definition.target === 'experiment.worldBoundary') {
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

function overlayDeclaredRunMode(
  action:AutomationAction,
  runMode:string,
  overrides:Record<string,unknown>,
):Record<string,unknown> {
  if (!runMode || Object.prototype.hasOwnProperty.call(overrides,'runMode')) return overrides;
  if (!action.inputSchema.fields.some((field) => field.name === 'runMode')) return overrides;
  return { runMode,...overrides };
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
  if (!preset) return { instance,error:`Action preset "${binding.presetId}" is unavailable.` };
  if (!document) return { instance,preset,error:'Workflow details have not been loaded.' };
  const action = automationActionById(document.spec,preset.actionId);
  if (!action) return { instance,preset,document,error:`Workflow "${instance.id}" does not export Action "${preset.actionId}".` };
  return { instance,preset,document,action,error:'' };
}

function panelActionRuntimeStatus(
  host:PanelContextActions,
  runId:string,
  document:AutomationDocument|undefined,
  action:AutomationAction|undefined,
  failedRun:boolean,
) {
  const occupancyRunId=panelActionOccupancyRunId(host,runId,document,action);
  const processes=panelServiceStatus(host,occupancyRunId);
  const occupancyRun=panelActionRuns(host).find((run) => run.id===occupancyRunId);
  const actionSummaries=occupancyRun && isSystemExperimentRunnerRoot(occupancyRun)
    ? [] : panelActionNodeSummaries(host,occupancyRunId);
  const occupancy=automationWorkNodeOccupancy(
    document ? automationActionWorkNodes(document.spec,action) : [],
    actionSummaries,
  );
  // Spec work-node count with no occupying summaries is not occupancy yet.
  // 0/N from the graph must not mask owned Process census after start/stop/start.
  const occupied=occupancy.failed || occupancy.ready>0;
  const work=occupied ? occupancy : { ready:0,total:0,failed:false };
  const failed=work.failed || processes.state === 'degraded' || failedRun || Boolean(experimentProcessRuntimeProjection(
    dataProjectionValue(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,host),
  )?.error);
  if (work.total === 0 && processes.total > 0) {
    return { ...processes,state:failed ? 'degraded' as const : processes.state };
  }
  const total=work.total>0 ? work.total : failed ? 1 : 0;
  const ready=failed ? Math.max(work.ready,total>0 ? 1 : 0) : work.ready;
  const state=failed ? 'degraded' as const
    : total>0 && ready===total && (processes.total === 0 || processes.state === 'running')
      ? 'running' as const : 'starting' as const;
  return { state,ready,total };
}

function panelActionNodeSummaries(host:PanelContextActions,runId:string) {
  // Node ids belong to one graph. Descendant graphs can reuse these ids and
  // must not replace the status of this Action's own nodes.
  return host.automation.runDetailsById[runId]?.nodeSummaries ?? [];
}

function panelActionOccupancyRunId(
  host:PanelContextActions,runId:string,document?:AutomationDocument,action?:AutomationAction,
) {
  const runs=panelActionRuns(host);
  const current=runs.find((run) => run.id===runId && run.targetId===host.automation.targetId);
  // The System Runner graph is not the authored Action graph. Its summaries
  // must never take over the progress denominator when they arrive later.
  if (!current || !isSystemExperimentRunnerRoot(current)) return runId;
  const children=(host.automation.runDetailsById[runId]?.relations?.childRuns ?? [])
    .filter((child) => (
      Boolean(child.boundAt) && !child.launchAbandonedAt && child.relation!=='detached'
      && child.targetId===host.automation.targetId && child.parentRunId===runId
      && child.rootRunId===runId && child.callNodeId==='invoke-selected-action'
      && (!document || child.childDefinitionId===document.head.resourceId)
    ));
  if (children.length===1) return children[0]!.childRunId;
  const candidates=runs.filter((run) => (
    run.targetId===host.automation.targetId && run.parentRunId===runId && run.rootRunId===runId
    && (!document || run.automationResourceId===document.head.resourceId)
    && (!action || run.actionId===action.id) && isAutomationExecutionRunActive(run)
  ));
  return candidates.length===1 ? candidates[0]!.id : runId;
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

type PanelRunObservations = Pick<AutomationPanelContext['automation'],'runSummaries'|'runDetailsById'>;
const relatedObservationCache = new WeakMap<ReadonlyMap<string,AutomationPanelContext['automation']>,PanelRunObservations>();

/** Merge already observed target records; this never opens an observer or routes a command. */
export function panelAutomationObservations(
  automation:AutomationPanelContext['automation'],
  runtimes?:ReadonlyMap<string,AutomationPanelContext['automation']>,
):PanelRunObservations {
  if (!runtimes || runtimes.size === 0) return automation;
  const cached = relatedObservationCache.get(runtimes);
  if (cached) return cached;
  const value = {
    runSummaries:[...runtimes.values()].flatMap((runtime) => runtime.runSummaries),
    runDetailsById:Object.assign({},...[...runtimes.values()].map((runtime) => runtime.runDetailsById)) as Record<string,AutomationRunDetail>,
  };
  relatedObservationCache.set(runtimes,value);
  return value;
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
    const observations = panelAutomationObservations(host.automation,host.automationRuntimes);
    return {
      targetId:host.executionRuntime?.targetId ?? '',
      activeRun,
      activeRuns:host.experimentLifecycle.activeRuns
        ?? (activeRun ? [activeRun] : []),
      sessionViews:host.experimentLifecycle.sessionViews ?? [],
      selectedRunMode:host.experimentLifecycle.runMode,
      ...(host.experimentLifecycle.placement === 'centralized'
        || host.experimentLifecycle.placement === 'per-robot'
        ? { selectedPlacement:host.experimentLifecycle.placement }
        : {}),
      processInstances,
      documents:host.automation.documents,
      catalog:host.automation.catalog,
      ...observations,
      loadRunDetail:host.automation.loadRunDetail,
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

const panelActionRunCache = new WeakMap<
  readonly AutomationRunSummaryView[],
  WeakMap<Readonly<Record<string,AutomationRunDetail>>,readonly AutomationRunSummaryView[]>
>();

/**
 * Summaries plus retained details as one Run list. Every Action port of every
 * Panel on a target asks for it; both inputs are immutable snapshots, so the
 * merge runs once per snapshot pair instead of once per port per render.
 */
function panelActionRuns(host:PanelContextActions):readonly AutomationRunSummaryView[] {
  const { runSummaries,runDetailsById } = panelAutomationObservations(host.automation,host.automationRuntimes);
  let byDetails = panelActionRunCache.get(runSummaries);
  if (!byDetails) {
    byDetails = new WeakMap();
    panelActionRunCache.set(runSummaries,byDetails);
  }
  const cached = byDetails.get(runDetailsById);
  if (cached) return cached;
  const candidates=new Map<string,AutomationRunSummaryView>(runSummaries.map((run) => [run.id,run]));
  // Fresh browsers restore Session command roots as retained details, before
  // any history has been opened. They must project the same buttons as SSE.
  Object.values(runDetailsById).forEach(({ run }) => {
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
  const runs=[...candidates.values()];
  byDetails.set(runDetailsById,runs);
  return runs;
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
  const invokeRoots=matchingInvokePanelActionRoots(
    runs,host,experiment,host.experimentLifecycle.runMode,panel.id,presetId,
  );
  const selectorRoots=uniqueRunsById([...roots,...invokeRoots]);
  const directCandidates=runs.flatMap((run) => (
    exactDirectTargetRoot(
      run,experiment,host.automation.targetId,host.experimentLifecycle.runMode,
      panel.id,presetId,workflowResourceId,actionId,
    ) ? [{ rootId:run.id,rootActionId:'target-root',...panelActionCandidate(run) }] : []
  ));
  // Full Experiment runs identify each panel through its bound item relation.
  const rootCandidates=selectorRoots.filter((root) => root.actionId!==SYSTEM_EXPERIMENT_RUNNER.actions.run)
    .flatMap((root) => panelActionChildrenUnderRoot(
      runs,host,workflowResourceId,workflowBranch,actionId,root,
    ));
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
      ...panelActionCandidate({ ...current,createdAt:'',updatedAt:'' }),
    });
    return oneInvocation(exactCandidates);
  }
  const exact = oneInvocation(candidates);
  if (exact) return exact;
  // Session-open Algorithm is invoke-panel-action join, not the Total Run
  // lifecycle lock. Occupancy must follow those invoke roots in summaries,
  // not only experimentLifecycle.activeRuns.
  const waitingInvokes = selectorRoots.filter((root) => (
    isAutomationExecutionRunActive(root)
    && root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
  ));
  if (waitingInvokes.length===1) return invocation(waitingInvokes[0]);
  if (waitingInvokes.length>1) {
    return oneInvocation(waitingInvokes.map((root) => ({
      rootId:root.id,rootActionId:root.actionId,...panelActionCandidate(root),
    })));
  }
  if (binding.presetId === panelWorkflow.presetId) {
    const owner = lifecycleRoots.find((root) => (
      isAutomationExecutionRunActive(root)
      && root.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.runPanel
      && root.panelId===panel.id
    ));
    return owner ? invocation(owner) : undefined;
  }
  if (!panelActionId || panelActionId === actionId) {
    return undefined;
  }
  const runtime = experimentProcessRuntimeProjection(dataProjectionValue(EXPERIMENT_PROCESS_RUNTIME_DATASOURCE,host));
  const serviceRun = resolveRosBasicServiceRun(runtime,{
    automationResourceId:workflowResourceId,actionId,
  },actionId);
  return serviceRun && isAutomationExecutionRunActive(serviceRun) ? invocation(serviceRun) : undefined;
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
  const summaries=panelActionRuns(host).filter((run) => (
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
  if (summaries.length===0) return isRunStatusActive(fallback.status) ? invocation(fallback) : undefined;
  const newestRevision=Math.max(...summaries.map((run) => run.revision));
  if (newestRevision<fallback.revision) return isRunStatusActive(fallback.status) ? invocation(fallback) : undefined;
  const newest=summaries.filter((run) => run.revision===newestRevision);
  const statuses=new Set(newest.map((run) => run.status));
  if (statuses.size!==1) return undefined;
  const current=newest[0];
  if (current.revision===fallback.revision && current.status!==fallback.status) return undefined;
  return isAutomationExecutionRunActive(current) ? invocation(current) : undefined;
}

function experimentSessionIsOpen(host:PanelContextActions,experiment:ExperimentDocument) {
  if (experimentSessionIsRunning(
    host.experimentLifecycle.sessionViews ?? [],experiment.head.resourceId,
  )) {
    return true;
  }
  const roots=host.experimentLifecycle.activeRuns
    ?? (host.experimentLifecycle.activeRun ? [host.experimentLifecycle.activeRun] : []);
  return roots.some((root) => (
    isAutomationExecutionRunActive(root)
    && exactLifecycleRoot(root,experiment,host.experimentLifecycle.runMode)
  ));
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

function matchingInvokePanelActionRoots(
  runs:readonly AutomationRunSummaryView[],
  host:PanelContextActions,
  experiment:ExperimentDocument,
  runMode:string,
  panelId:string,
  presetId:string,
) {
  const same=runs.filter((run) => (
    isSystemExperimentRunnerRoot(run)
    && run.actionId===SYSTEM_EXPERIMENT_RUNNER.actions.invokePanelAction
    && run.sourceRef?.resourceId===experiment.head.resourceId
    && run.sourceRef.branch===experiment.branch.name
    && run.sourceRef.commitId===experiment.head.mainCommitId
    && run.sourceRef.digest===experiment.head.digest
    && run.experimentSelector?.runMode===runMode
    && run.experimentSelector.panelId===panelId
    && run.experimentSelector.presetId===presetId
  ));
  // Each Run owns its own status/revision. A later failed or stopped command
  // cannot release another Run, even when both commands use the same preset.
  return same.filter((run) => {
    if (isAutomationExecutionRunActive(run)) return true;
    // join-later can succeed while the Algorithm service child is still
    // waiting. A succeeded root without a live child must not occupy.
    return run.status==='succeeded' && invokeRootHasActiveChild(runs,host,run);
  });
}

function invokeRootHasActiveChild(
  runs:readonly AutomationRunSummaryView[],
  host:PanelContextActions,
  root:AutomationRunSummaryView,
) {
  const relations=host.automation.runDetailsById[root.id]?.relations?.childRuns ?? [];
  const related=new Map(relations.map((child) => [child.childRunId,child]));
  if (runs.some((run) => {
    if (run.targetId!==host.automation.targetId || run.id===root.id || run.rootRunId!==root.id) return false;
    const child=related.get(run.id);
    return child ? isRunStatusActive(panelChildRunFact(runs,child)?.status)
      : isAutomationExecutionRunActive(run);
  })) return true;
  return relations.some((child) => (
    Boolean(child.boundAt) && !child.launchAbandonedAt && child.relation!=='detached'
    && child.targetId===host.automation.targetId && child.parentRunId===root.id
    && child.rootRunId===root.id
    && isRunStatusActive(panelChildRunFact(runs,child)?.status)
  ));
}

const runIndexes = new WeakMap<readonly AutomationRunSummaryView[],ReadonlyMap<string,AutomationRunSummaryView>>();

/**
 * The first Run with this id, as runs.find() returns it. Run lists are
 * immutable per snapshot and resolved for every child of every Panel root, so
 * one index per list replaces a scan per child (O(children x runs)).
 */
function runById(runs:readonly AutomationRunSummaryView[],id:string) {
  let index = runIndexes.get(runs);
  if (!index) {
    const byId = new Map<string,AutomationRunSummaryView>();
    runs.forEach((run) => { if (!byId.has(run.id)) byId.set(run.id,run); });
    index = byId;
    runIndexes.set(runs,index);
  }
  return index.get(id);
}

function panelChildRunFact(
  runs:readonly AutomationRunSummaryView[],
  child:{ childRunId:string;targetId:string;rootRunId:string;parentRunId:string;
    runStatus?:PanelActionInvocation['status'];runRevision?:number;
    observedStatus?:PanelActionInvocation['status'];observedRevision?:number },
):PanelActionInvocation|undefined {
  const status=child.runStatus ?? child.observedStatus;
  const revision=child.runRevision ?? child.observedRevision;
  const known=runById(runs,child.childRunId);
  if (known && (known.targetId!==child.targetId || known.rootRunId!==child.rootRunId
    || known.parentRunId!==child.parentRunId)) return undefined;
  if (known && (revision===undefined || known.revision>=revision)) {
    if (known.revision===revision && status!==undefined && known.status!==status) return undefined;
    return invocation(known);
  }
  return status!==undefined && revision!==undefined
    ? { id:child.childRunId,status,revision } : undefined;
}

function uniqueRunsById(runs:readonly AutomationRunSummaryView[]) {
  const byId=new Map<string,AutomationRunSummaryView>();
  runs.forEach((run) => {
    const previous=byId.get(run.id);
    if (!previous || run.revision>=previous.revision) byId.set(run.id,run);
  });
  return [...byId.values()];
}

function isPanelActionChild(
  run:AutomationRunSummaryView,
  host:PanelContextActions,
  workflowResourceId:string,
  workflowBranch:string,
  actionId:string,
) {
  return run.targetId===host.automation.targetId
    && run.automationResourceId===workflowResourceId
    && run.actionId===actionId
    && run.sourceKind==='automation'
    && run.sourceRef?.domain==='automation'
    && run.sourceRef.resourceId===workflowResourceId
    && run.sourceRef.branch===workflowBranch;
}

function panelActionChildrenUnderRoot(
  runs:readonly AutomationRunSummaryView[],
  host:PanelContextActions,
  workflowResourceId:string,
  workflowBranch:string,
  actionId:string,
  root:AutomationRunSummaryView,
) {
  const relations=new Map((host.automation.runDetailsById[root.id]?.relations?.childRuns ?? [])
    .map((child) => [child.childRunId,child]));
  const observed=runs.flatMap((run) => {
    const child=relations.get(run.id);
    if (!child) return [run];
    const fact=panelChildRunFact(runs,child);
    return fact ? [{ ...run,status:fact.status,revision:fact.revision }] : [];
  });
  const matching=observed.filter((run) => (
    isPanelActionChild(run,host,workflowResourceId,workflowBranch,actionId)
    && run.rootRunId===root.id
  ));
  const active=matching.filter((run) => (
    (run.parentRunId===root.id || run.rootRunId===root.id)
    && isAutomationExecutionRunActive(run)
  ));
  const chosen=active.length>0 ? active : observed.filter((run) => (
    matching.some((parent) => run.parentRunId===parent.id)
    && isAutomationExecutionRunActive(run)
  ));
  // Keep both candidates until oneInvocation merges their Run revisions.
  // An embedded relation fact can be newer than the matching retained detail.
  const fromRelations=invokeRelationChildren(host,root,workflowResourceId,workflowBranch,actionId);
  return [...chosen,...fromRelations].map((run) => ({
    rootId:root.id,rootActionId:root.actionId,...panelActionCandidate(run),
  }));
}

function invokeRelationChildren(
  host:PanelContextActions,
  root:AutomationRunSummaryView,
  workflowResourceId:string,
  workflowBranch:string,
  actionId:string,
):AutomationRunSummaryView[] {
  return (host.automation.runDetailsById[root.id]?.relations?.childRuns ?? []).flatMap((child) => {
    if (!child.boundAt || child.launchAbandonedAt || child.relation==='detached') return [];
    if (child.targetId!==host.automation.targetId || child.parentRunId!==root.id
      || child.rootRunId!==root.id) return [];
    const runs=panelActionRuns(host);
    const fact=panelChildRunFact(runs,child);
    if (!fact || !isRunStatusActive(fact.status)) return [];
    const known=runById(runs,child.childRunId);
    if (known) {
      return isPanelActionChild(known,host,workflowResourceId,workflowBranch,actionId)
        ? [{ ...known,status:fact.status,revision:fact.revision }] : [];
    }
    if (child.callNodeId!=='invoke-selected-action' || child.childDefinitionId!==workflowResourceId) {
      return [];
    }
    return [{
      id:child.childRunId,
      targetId:child.targetId || host.automation.targetId,
      automationResourceId:child.childDefinitionId,
      actionId,actionVersion:1,
      sourceKind:'automation' as const,
      sourceRef:{
        domain:'automation' as const,resourceId:workflowResourceId,branch:workflowBranch,
        commitId:child.childConfigDigest,version:child.childDefinitionVersion,digest:child.childDefinitionDigest,
      },
      status:fact.status,revision:fact.revision,
      parentRunId:root.id,rootRunId:root.id,
      createdAt:child.createdAt,updatedAt:child.updatedAt,
    }];
  });
}

function panelActionCandidate(run:{
  id:string;status:PanelActionInvocation['status'];revision:number;createdAt?:string;updatedAt?:string;
}) {
  return {
    invocation:invocation(run),
    createdAt:run.createdAt ?? '',
    updatedAt:run.updatedAt ?? '',
  };
}

function oneInvocation(candidates:readonly {
  invocation:PanelActionInvocation;createdAt?:string;updatedAt?:string;
}[]) {
  const byId=new Map<string,{ invocation:PanelActionInvocation;createdAt:string;updatedAt:string }>();
  let conflict=false;
  candidates.forEach((candidate) => {
    const active=candidate.invocation;
    const recency={
      invocation:active,createdAt:candidate.createdAt ?? '',updatedAt:candidate.updatedAt ?? '',
    };
    const previous=byId.get(active.id);
    if (!previous || active.revision>previous.invocation.revision) {
      byId.set(active.id,recency);
    } else if (active.revision===previous.invocation.revision && active.status!==previous.invocation.status) {
      conflict=true;
    }
  });
  if (conflict || byId.size===0) return undefined;
  if (byId.size===1) return [...byId.values()][0]!.invocation;
  const ranked=[...byId.values()].sort((left,right) => (
    right.createdAt.localeCompare(left.createdAt)
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.invocation.revision-left.invocation.revision
    || left.invocation.id.localeCompare(right.invocation.id)
  ));
  const newest=ranked[0]!;
  const second=ranked[1]!;
  if (newest.createdAt===second.createdAt
    && newest.updatedAt===second.updatedAt
    && newest.invocation.revision===second.invocation.revision) {
    return undefined;
  }
  return newest.invocation;
}
