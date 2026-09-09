import {
  isAutomationExecutionRunActive,
  type AutomationChildRunRelation,
  type AutomationRunDetail,
  type AutomationRunSummaryView,
} from '../automation/automationPublic';
import { EXPERIMENT_STARTUP_GRAPH_ALL } from './experimentStartupGraphModel';
import {
  type ExperimentProcessRuntimeProjection,
} from './experimentProcessRuntime';

export type PanelWorkflowRunTreeNode = {
  runId:string;
  action:string;
  automation:string;
  workflow:string;
  target:string;
  status:string;
  progress:string;
  error:string;
  children:PanelWorkflowRunTreeNode[];
};

export type PanelWorkflowRunTreeSelectorOption = {
  value:string;
  label:string;
  disabled:boolean;
  runId:string;
  automationResourceId:string;
  depth:number;
};

export type RunRelationHydrationKey = {
  runId:string;
  runRevision:number;
  relationRevision:number;
};

/** Detached, abandoned, or remote targetRoot children are disconnected — do not hydrate or render. */
export function isDisconnectedChildRun(child:Pick<
  AutomationChildRunRelation,
  'relation' | 'launchAbandonedAt' | 'targetRoot'
>):boolean {
  return child.relation === 'detached' || Boolean(child.launchAbandonedAt) || child.targetRoot === true;
}

/**
 * Panel Workflow run ids for this panel's authored workflows only.
 * Never the Experiment System Runner, never sibling Panel resource ids
 * that were not passed in.
 */
export function panelWorkflowTreeRootRunIds(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  workflowResourceIds:readonly string[] = [],
):string[] {
  if (!runtime) return [];
  const allowed = workflowResourceIds.map((id) => id.trim()).filter((id) => (
    id && id !== EXPERIMENT_STARTUP_GRAPH_ALL
  ));
  if (allowed.length === 0) return [];
  const lifecycleRoots = runtime.activeRuns
    ?? (runtime.activeRun ? [runtime.activeRun] : []);
  if (lifecycleRoots.length === 0) return [];
  const runs = exactRuntimeRuns(runtime);
  const roots:string[] = [];
  const seen = new Set<string>();
  lifecycleRoots.forEach((lifecycleRoot) => {
    allowed.forEach((resourceId) => {
      const run = runs
        .filter((candidate) => (
          candidate.parentRunId === lifecycleRoot.id
          && candidate.automationResourceId === resourceId
        ))
        .sort(compareRuns)[0];
      if (!run || seen.has(run.id)) return;
      seen.add(run.id);
      roots.push(run.id);
    });
  });
  return roots;
}

export function projectPanelWorkflowRunTree(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  rootRunId:string,
):PanelWorkflowRunTreeNode|undefined {
  const runId = rootRunId.trim();
  if (!runtime || !runId) return undefined;
  const visited = new Set<string>();
  return projectNode(runtime,runId,undefined,visited);
}

export function projectPanelWorkflowRunTrees(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  workflowResourceIds:readonly string[] = [],
):PanelWorkflowRunTreeNode[] {
  return panelWorkflowTreeRootRunIds(runtime,workflowResourceIds).flatMap((runId) => {
    const node = projectPanelWorkflowRunTree(runtime,runId);
    return node ? [node] : [];
  });
}

export function panelWorkflowRunTreeSelectorOptions(
  nodes:readonly PanelWorkflowRunTreeNode[],
):PanelWorkflowRunTreeSelectorOption[] {
  const options:PanelWorkflowRunTreeSelectorOption[] = [];
  const append = (node:PanelWorkflowRunTreeNode,depth:number) => {
    const indent = depth === 0 ? '' : `${'↳ '.repeat(depth)}`;
    options.push({
      value:node.runId,
      label:`${indent}${node.workflow || node.automation || 'Workflow'} · ${node.action || '—'} · ${node.target || '—'} · ${node.status || '—'}`,
      disabled:false,
      runId:node.runId,
      automationResourceId:node.automation,
      depth,
    });
    node.children.forEach((child) => append(child,depth + 1));
  };
  nodes.forEach((node) => append(node,0));
  return options;
}

/** Children of already-loaded run details that still need a generic loadRunDetail. */
export function runRelationChildrenToHydrate(
  detailsById:Readonly<Record<string,AutomationRunDetail>>,
  rootRunIds:readonly string[],
):RunRelationHydrationKey[] {
  const keys:RunRelationHydrationKey[] = [];
  const seen = new Set<string>();
  const visited=new Set<string>();
  const queue=rootRunIds.map((runId) => runId.trim()).filter(Boolean);
  while (queue.length>0) {
    const parentRunId=queue.shift()!;
    if (visited.has(parentRunId)) continue;
    visited.add(parentRunId);
    const detail=detailsById[parentRunId];
    detail?.relations?.childRuns.forEach((child) => {
      if (isDisconnectedChildRun(child) || !child.boundAt) return;
      const runRevision = child.runRevision;
      const relationRevision = child.revision;
      if (!Number.isSafeInteger(runRevision) || (runRevision ?? 0) < 1) return;
      if (!Number.isSafeInteger(relationRevision) || relationRevision < 1) return;
      const runId = child.childRunId.trim();
      if (!runId || seen.has(runId)) return;
      seen.add(runId);
      queue.push(runId);
      const loaded=detailsById[runId];
      if (loaded?.loading || (loaded?.run && loaded.run.revision>=runRevision! && loaded.relations)) return;
      keys.push({ runId,runRevision:runRevision!,relationRevision });
    });
  }
  return keys;
}

function projectNode(
  runtime:ExperimentProcessRuntimeProjection,
  runId:string,
  incoming:AutomationChildRunRelation|undefined,
  visited:Set<string>,
):PanelWorkflowRunTreeNode|undefined {
  if (visited.has(runId)) return undefined;
  visited.add(runId);
  const summary = runtime.runSummaries.find((run) => run.id === runId);
  const detail = runtime.runDetailsById[runId];
  const run = newestRun(summary,detail?.run);
  const automation = incoming?.childDefinitionId
    || run?.automationResourceId
    || '';
  const children = (detail?.relations?.childRuns ?? [])
    .filter((child) => !isDisconnectedChildRun(child))
    .sort((left,right) => left.ordinal - right.ordinal || left.callNodeId.localeCompare(right.callNodeId))
    .flatMap((child) => {
      const node = projectNode(runtime,child.childRunId,child,visited);
      return node ? [node] : [];
    });
  return {
    runId,
    action:run?.actionId || incoming?.callNodeId || '',
    automation,
    workflow:workflowName(runtime,automation,detail,run),
    target:run?.targetId || incoming?.targetId || '',
    status:run?.status || incoming?.runStatus || '',
    progress:progressLabel(detail),
    error:detail?.run?.primaryError || detail?.error || incoming?.observedReason || '',
    children,
  };
}

function exactRuntimeRuns(runtime:ExperimentProcessRuntimeProjection) {
  const runs = new Map<string,NonNullable<AutomationRunDetail['run']>|AutomationRunSummaryView>();
  runtime.runSummaries.forEach((run) => runs.set(run.id,run));
  Object.values(runtime.runDetailsById).forEach((detail) => {
    if (!detail.run) return;
    const current = runs.get(detail.run.id);
    if (!current || detail.run.revision >= current.revision) runs.set(detail.run.id,detail.run);
  });
  return [...runs.values()];
}

function newestRun(
  summary:AutomationRunSummaryView|undefined,
  exact:AutomationRunDetail['run']|undefined,
) {
  if (!summary) return exact;
  if (!exact) return summary;
  return exact.revision >= summary.revision ? exact : summary;
}

function workflowName(
  runtime:ExperimentProcessRuntimeProjection,
  automationResourceId:string,
  detail:AutomationRunDetail|undefined,
  run:AutomationRunDetail['run']|ExperimentProcessRuntimeProjection['runSummaries'][number]|undefined,
):string {
  const snapshotName = detail?.snapshot?.automationSpec.metadata.name?.trim();
  if (snapshotName) return snapshotName;
  if (!automationResourceId) return '';
  const branch = run?.sourceRef?.domain === 'automation' ? run.sourceRef.branch : '';
  const documents = runtime.documents.filter((document) => (
    document.head.resourceId === automationResourceId
    && (!branch || document.branch.name === branch)
  ));
  return documents.length === 1
    ? documents[0]!.spec.metadata.name || automationResourceId
    : automationResourceId;
}

function progressLabel(detail:AutomationRunDetail|undefined):string {
  const summaries = detail?.nodeSummaries ?? [];
  if (summaries.length === 0) return '';
  const total = summaries.reduce((sum,item) => sum + item.occurrenceCount,0);
  const completed = summaries.reduce((sum,item) => sum + item.completedOccurrenceCount,0);
  return total > 0 ? `${completed}/${total}` : '';
}

function compareRuns(
  left:Pick<AutomationRunSummaryView,'status' | 'revision' | 'updatedAt' | 'id'>,
  right:Pick<AutomationRunSummaryView,'status' | 'revision' | 'updatedAt' | 'id'>,
) {
  return Number(isAutomationExecutionRunActive(right)) - Number(isAutomationExecutionRunActive(left))
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.revision - left.revision
    || left.id.localeCompare(right.id);
}
