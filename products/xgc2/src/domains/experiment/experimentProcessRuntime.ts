import type {
  AutomationDocument,
  AutomationNodeCatalogEntry,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../automation/automationPublic';
import type { ProcessInstance } from '../execution/executionPublic';
import type { ExperimentRunView,ExperimentSessionView } from './experimentWorkflowModel';

/**
 * Read-only Experiment workflow truth exposed to panels. The Process snapshot
 * is intentionally unfiltered: consumers intersect it with the exact root and
 * child Run relation closure below before presenting any instance.
 */
export const EXPERIMENT_PROCESS_RUNTIME_DATASOURCE = 'experiment.runtime.v1';

export type ExperimentProcessRuntimeProjection = {
  targetId:string;
  activeRun?:ExperimentRunView;
  activeRuns?:readonly ExperimentRunView[];
  sessionViews?:readonly ExperimentSessionView[];
  processInstances:ProcessInstance[];
  documents:AutomationDocument[];
  catalog:AutomationNodeCatalogEntry[];
  runSummaries:AutomationRunSummaryView[];
  runDetailsById:Record<string,AutomationRunDetail>;
  loading:boolean;
  error:string;
};

export function experimentProcessRuntimeProjection(
  value:unknown,
):ExperimentProcessRuntimeProjection|undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentProcessRuntimeProjection>;
  return typeof candidate.targetId === 'string'
    && Array.isArray(candidate.processInstances)
    && (candidate.sessionViews === undefined || Array.isArray(candidate.sessionViews))
    && Array.isArray(candidate.documents)
    && Array.isArray(candidate.catalog)
    && Array.isArray(candidate.runSummaries)
    && isRecord(candidate.runDetailsById)
    && typeof candidate.loading === 'boolean'
    && typeof candidate.error === 'string'
    ? candidate as ExperimentProcessRuntimeProjection
    : undefined;
}

/** Exact active Session member owner for a stable Workflow instance binding. */
export function experimentWorkflowMemberOwnerRunId(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  bindingId:string,
) {
  const expectedBinding=bindingId.trim();
  if (!runtime || !expectedBinding) return undefined;
  const owners=(runtime.sessionViews ?? []).flatMap((view) => (
    view.session.targetId===runtime.targetId
    && (view.session.state==='opening' || view.session.state==='active')
      ? view.members.flatMap((member) => (
        member.targetId===runtime.targetId
        && member.bindingId===expectedBinding
        && member.kind==='workflow_run'
        && (member.status==='attached' || member.status==='running')
          ? [member.ownerId]
          : []
      ))
      : []
  ));
  return owners.length===1 ? owners[0] : undefined;
}

/** Exact root/child relation closure for the selected Experiment Session. */
export function experimentWorkflowRunIds(
  runtime:ExperimentProcessRuntimeProjection|undefined,
):ReadonlySet<string> {
  if (!runtime) return new Set();
  const activeRuns = runtime.activeRuns
    ?? (runtime.activeRun ? [runtime.activeRun] : []);
  if (activeRuns.length === 0) return new Set();
  const rootRunIds = new Set(activeRuns.map((run) => run.rootRunId || run.id));
  const runIds = new Set<string>(activeRuns.flatMap((run) => [
    run.rootRunId || run.id,run.id,
  ]));

  // rootRunId is persisted runtime truth, not a UI inference. Session-owned
  // command roots are included even when their command Run has completed but
  // an explicitly supervised descendant remains active. Relations fill
  // gaps while a child summary is still being reconciled over SSE.
  runtime.runSummaries.forEach((run) => {
    if (rootRunIds.has(run.id) || (run.rootRunId && rootRunIds.has(run.rootRunId))) {
      runIds.add(run.id);
    }
  });
  addRelatedChildRuns(runtime,runIds,rootRunIds);
  return runIds;
}

/**
 * Returns the selected Panel Workflow Runs and their exact descendants inside
 * this Experiment closure. No definition name, robot count, or product profile
 * participates in ownership.
 */
export function experimentPanelWorkflowRunIds(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  automationResourceId:string,
):ReadonlySet<string> {
  const resourceId = automationResourceId.trim();
  if (!runtime || !resourceId) return new Set();
  const experimentRunIds = experimentWorkflowRunIds(runtime);
  const selected = new Set(runtime.runSummaries.flatMap((run) => (
    experimentRunIds.has(run.id) && run.automationResourceId === resourceId ? [run.id] : []
  )));
  if (runtime.activeRun?.automationResourceId === resourceId) selected.add(runtime.activeRun.id);
  addDescendantRuns(runtime,selected,experimentRunIds);
  return selected;
}

/** Exact descendants of one or more already-selected Runs in this Session. */
export function experimentDescendantRunIds(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  anchorRunIds:readonly string[],
):ReadonlySet<string> {
  if (!runtime) return new Set();
  const experimentRunIds = experimentWorkflowRunIds(runtime);
  // Callers supply anchors already proven by an exact Panel Action summary or
  // System-root relation. A newly dispatched relation child can legitimately
  // precede target-wide history reconciliation, so requiring it to appear in
  // experimentRunIds a second time discards the stronger relation truth and
  // hides its already-owned Processes. Descendants remain bounded to the
  // selected Experiment closure below.
  const selected = new Set(anchorRunIds.filter((runId) => runId.trim()===runId && runId));
  addDescendantRuns(runtime,selected,experimentRunIds);
  return selected;
}

/** Process instances whose explicit owner is in the selected Run closure. */
export function experimentOwnedProcessInstances(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  runIds:ReadonlySet<string> = experimentWorkflowRunIds(runtime),
):ProcessInstance[] {
  if (!runtime || runIds.size === 0) return [];
  return runtime.processInstances.filter((instance) => (
    instance.ownerType === 'orchestration-run'
    && runIds.has(instance.ownerId)
  ));
}

export function experimentProcessInstanceReady(
  runtime:ExperimentProcessRuntimeProjection|undefined,
  definitionId:string,
  runIds:ReadonlySet<string> = experimentWorkflowRunIds(runtime),
):boolean {
  const process = experimentOwnedProcessInstances(runtime,runIds)
    .find((item) => item.definitionId === definitionId);
  return Boolean(process && processReady(process));
}

export function processReady(process:ProcessInstance) {
  return process.desiredState === 'running'
    && process.observedState === 'running'
    && process.readiness.status === 'passing';
}

function addRelatedChildRuns(
  runtime:ExperimentProcessRuntimeProjection,
  runIds:Set<string>,
  rootRunIds:ReadonlySet<string>,
) {
  let changed = true;
  while (changed) {
    changed = false;
    runtime.runSummaries.forEach((run) => {
      if (((run.rootRunId && rootRunIds.has(run.rootRunId))
        || (run.parentRunId && runIds.has(run.parentRunId)))
        && !runIds.has(run.id)) {
        runIds.add(run.id);changed = true;
      }
    });
    Object.values(runtime.runDetailsById).forEach((detail) => {
      detail.relations?.childRuns.forEach((relation) => {
        if ((rootRunIds.has(relation.rootRunId) || runIds.has(relation.parentRunId))
          && !runIds.has(relation.childRunId)) {
          runIds.add(relation.childRunId);changed = true;
        }
      });
    });
  }
}

function addDescendantRuns(
  runtime:ExperimentProcessRuntimeProjection,
  selected:Set<string>,
  experimentRunIds:ReadonlySet<string>,
) {
  let changed = true;
  while (changed) {
    changed = false;
    runtime.runSummaries.forEach((run) => {
      if (experimentRunIds.has(run.id) && run.parentRunId && selected.has(run.parentRunId)
        && !selected.has(run.id)) {
        selected.add(run.id);changed = true;
      }
    });
    Object.values(runtime.runDetailsById).forEach((detail) => {
      detail.relations?.childRuns.forEach((relation) => {
        if (experimentRunIds.has(relation.childRunId) && selected.has(relation.parentRunId)
          && !selected.has(relation.childRunId)) {
          selected.add(relation.childRunId);changed = true;
        }
      });
    });
  }
}

function isRecord(value:unknown):value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
