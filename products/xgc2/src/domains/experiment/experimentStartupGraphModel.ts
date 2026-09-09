import {
  projectAutomationGraphRuntime,
  type AutomationDocument,
  type AutomationEdge,
  type AutomationNode,
  type AutomationNodeCatalogEntry,
  type AutomationNodeExecutionSummary,
  type AutomationRunDetail,
  type AutomationRunSummaryView,
  type GraphNodeRuntimeFact,
} from '../automation/automationPublic';
import type { ExperimentProcessRuntimeProjection } from './experimentProcessRuntime';
import { experimentWorkflowRunIds } from './experimentProcessRuntime';

export const EXPERIMENT_STARTUP_GRAPH_ALL = 'all';

export type ExperimentStartupGraphOption = {
  value:string;
  label:string;
  group?:string;
  disabled:boolean;
};

export type ExperimentStartupGraphProjection = {
  nodes:AutomationNode[];
  edges:AutomationEdge[];
  catalog:AutomationNodeCatalogEntry[];
  nodeSummaries:AutomationNodeExecutionSummary[];
  nodeRuntimeFacts:Record<string,GraphNodeRuntimeFact>;
  activeRuntimeNodeIds:string[];
  options:ExperimentStartupGraphOption[];
  selectedId:string;
  executionRunId:string;
  empty:boolean;
  degraded:boolean;
  degradedReason:string;
};

export type ExperimentRunGraphSelection = {
  runId:string;
  automationResourceId?:string;
};

/**
 * Projects an immutable Automation snapshot and its execution ledger. It never
 * synthesizes Process nodes, component dependencies, or a product startup DAG.
 */
export function projectExperimentStartupGraph(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  selectedId = EXPERIMENT_STARTUP_GRAPH_ALL,
  workflowResourceIds:readonly string[] = [],
):ExperimentStartupGraphProjection {
  const workflowIds = workflowResourceIds.filter(uniqueNonEmpty);
  const options = graphOptions(runtime,workflowIds);
  const selectable = new Set(options.filter((option) => !option.disabled).map((option) => option.value));
  const selected = selectable.has(selectedId)
    ? selectedId
    : selectable.has(EXPERIMENT_STARTUP_GRAPH_ALL)
      ? EXPERIMENT_STARTUP_GRAPH_ALL
      : options.find((option) => !option.disabled)?.value ?? EXPERIMENT_STARTUP_GRAPH_ALL;
  const source = graphSource(runtime,selected);
  return graphProjection(runtime,options,selected,source);
}

export function projectExperimentRunGraph(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  selection:ExperimentRunGraphSelection,
):ExperimentStartupGraphProjection {
  const runId = selection.runId.trim();
  const source = exactRunGraphSource(runtime,runId,selection.automationResourceId?.trim() ?? '');
  return graphProjection(runtime,[],runId,source);
}

function graphProjection(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  options:ExperimentStartupGraphOption[],
  selectedId:string,
  source:WorkflowGraphSource,
):ExperimentStartupGraphProjection {
  if (!source.definition) {
    return emptyProjection(runtime,options,selectedId,source.reason);
  }

  const detail = source.detail;
  const nodeSummaries = detail?.nodeSummaries ?? [];
  const { nodeRuntimeFacts,activeRuntimeNodeIds } = projectAutomationGraphRuntime(detail);
  return {
    nodes:source.definition.nodes,
    edges:source.definition.edges,
    catalog:runtime?.catalog ?? [],
    nodeSummaries,
    nodeRuntimeFacts,
    activeRuntimeNodeIds,
    options,
    selectedId,
    executionRunId:source.run?.id ?? '',
    empty:source.definition.nodes.length === 0,
    degraded:source.degraded,
    degradedReason:source.reason,
  };
}

function exactRunGraphSource(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  runId:string,
  fallbackResourceId:string,
):WorkflowGraphSource {
  if (!runtime) return { degraded:false,reason:'Experiment workflow runtime is unavailable.' };
  const detail = runId ? runtime.runDetailsById[runId] : undefined;
  const run:WorkflowRunSummary|undefined = runId
    ? runtime.runSummaries.find((candidate) => candidate.id === runId) ?? detail?.run
    : undefined;
  const resourceId = run?.automationResourceId || fallbackResourceId;
  if (detail?.snapshot?.automationSpec) {
    return { definition:detail.snapshot.automationSpec,detail,run,degraded:false,reason:'' };
  }
  const branch = run?.sourceRef?.domain === 'automation' ? run.sourceRef.branch : undefined;
  const document = workflowDocument(runtime.documents,resourceId,branch);
  if (document) {
    return {
      definition:document.spec,detail,run,degraded:Boolean(run),
      reason:run ? 'Live immutable Run snapshot is not loaded; showing the current authored definition.' : '',
    };
  }
  if (!runId) return { degraded:false,reason:'No Panel Workflow Run is available.' };
  return {
    detail,run,degraded:Boolean(run),
    reason:run
      ? 'The selected Run has no immutable snapshot or matching authored definition.'
      : 'The selected Panel Workflow Run is unavailable.',
  };
}

function graphSource(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  selectedId:string,
):WorkflowGraphSource {
  if (!runtime) return { degraded:false,reason:'Experiment workflow runtime is unavailable.' };
  const run = selectedId === EXPERIMENT_STARTUP_GRAPH_ALL
    ? rootRun(runtime)
    : latestWorkflowRun(runtime,selectedId);
  const resourceId = selectedId === EXPERIMENT_STARTUP_GRAPH_ALL
    ? run?.automationResourceId ?? runtime.activeRun?.automationResourceId ?? ''
    : selectedId;
  const branch = selectedId === EXPERIMENT_STARTUP_GRAPH_ALL
    ? undefined
    : runtime.activeRun?.workflowTargets.find((target) => (
      target.automationRef.resourceId === resourceId
    ))?.automationRef.branch;
  const detail = run ? runtime.runDetailsById[run.id] : undefined;
  if (detail?.snapshot?.automationSpec) {
    return {
      definition:detail.snapshot.automationSpec,
      detail,
      run,
      degraded:false,
      reason:'',
    };
  }

  const document = workflowDocument(runtime.documents,resourceId,branch);
  if (document) {
    return {
      definition:document.spec,
      detail,
      run,
      degraded:Boolean(run),
      reason:run ? 'Live immutable Run snapshot is not loaded; showing the current authored definition.' : '',
    };
  }
  return {
    detail,
    run,
    degraded:Boolean(run),
    reason:run
      ? 'The active workflow has no immutable snapshot or matching authored definition.'
      : 'No authored workflow is available for this selection.',
  };
}

function graphOptions(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  workflowResourceIds:readonly string[],
):ExperimentStartupGraphOption[] {
  const active = runtime?.activeRun;
  const allowed = new Set(workflowResourceIds);
  const targets = (active?.workflowTargets ?? []).filter((target) => (
    allowed.size === 0 || allowed.has(target.automationRef.resourceId)
  ));
  const targetIds = new Set(targets.map((target) => target.automationRef.resourceId));
  workflowResourceIds.forEach((resourceId) => targetIds.add(resourceId));
  const options:ExperimentStartupGraphOption[] = [{
    value:EXPERIMENT_STARTUP_GRAPH_ALL,
    label:active ? `Experiment runner · ${active.status}` : 'Experiment runner · stopped',
    disabled:!active,
  }];
  [...targetIds].forEach((resourceId) => {
    const run = runtime ? latestWorkflowRun(runtime,resourceId) : undefined;
    const target = targets.find((candidate) => candidate.automationRef.resourceId === resourceId);
    const document = workflowDocument(runtime?.documents ?? [],resourceId,target?.automationRef.branch);
    options.push({
      value:resourceId,
      label:`${document?.spec.metadata.name || target?.workflowInstanceId || resourceId}${run ? ` · ${run.status}` : ''}`,
      group:'Panel workflows',
      disabled:!document && !run,
    });
  });
  return options;
}

function rootRun(runtime:ExperimentProcessRuntimeProjection):WorkflowRunSummary|undefined {
  const active = runtime.activeRun;
  if (!active) return undefined;
  return runtime.runSummaries.find((run) => run.id === active.id) ?? {
    id:active.id,
    automationResourceId:active.automationResourceId,
    status:active.status,
    revision:active.revision,
    updatedAt:active.updatedAt,
  };
}

function latestWorkflowRun(
  runtime:ExperimentProcessRuntimeProjection,
  automationResourceId:string,
):AutomationRunSummaryView|undefined {
  const closure = experimentWorkflowRunIds(runtime);
  return runtime.runSummaries
    .filter((run) => closure.has(run.id) && run.automationResourceId === automationResourceId)
    .sort(compareRuns)[0];
}

function workflowDocument(
  documents:readonly AutomationDocument[],
  resourceId:string,
  branch?:string,
):AutomationDocument|undefined {
  const candidates = documents.filter((document) => document.head.resourceId === resourceId
    && (!branch || document.branch.name === branch));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function emptyProjection(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  options:ExperimentStartupGraphOption[],
  selectedId:string,
  reason:string,
):ExperimentStartupGraphProjection {
  return {
    nodes:[],edges:[],catalog:runtime?.catalog ?? [],nodeSummaries:[],nodeRuntimeFacts:{},
    activeRuntimeNodeIds:[],options,selectedId,executionRunId:'',empty:true,
    degraded:Boolean(runtime?.activeRun),degradedReason:reason,
  };
}

function compareRuns(left:AutomationRunSummaryView,right:AutomationRunSummaryView) {
  return right.revision - left.revision
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id);
}

function uniqueNonEmpty(value:string,index:number,values:readonly string[]) {
  return Boolean(value) && values.indexOf(value) === index;
}

type WorkflowRunSummary = Pick<
  AutomationRunSummaryView,
  'id' | 'automationResourceId' | 'status' | 'revision' | 'updatedAt' | 'sourceRef'
>;

type WorkflowGraphSource = {
  definition?:Pick<AutomationDocument['spec'],'nodes' | 'edges'>;
  detail?:AutomationRunDetail;
  run?:WorkflowRunSummary;
  degraded:boolean;
  reason:string;
};
