import type { AnyPanelPluginDefinition } from '../../../panels/types';
import { workflowRuntimeDatasources } from '../../../shared/workflowRuntimeProtocol';
import type {
  AutomationExecutionRelations,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../../automation/automationPublic';
import type { ExperimentDocument,PanelInstance } from '../experimentModel';
import type { ExperimentRunView,ExperimentSessionView } from '../experimentWorkflowModel';
import type {
  DashboardRunSnapshot,
  PanelAutomationRuntime,
  PanelAutomationRuntimeMap,
} from './dashboardRunStore';

/**
 * Which Panel a Run belongs to, so a Run event re-renders only the Panels it
 * concerns. A Run belongs to a Panel when it is that Panel's Session member,
 * Panel root (run/invoke/standalone selector naming the Panel), full-Run
 * workflow child (the Runner's `run-panels` item for the Panel's workflow
 * instance), or a descendant of one of those. Everything else (the Runner
 * roots, System workflows such as world services, other Experiments'
 * history) belongs to no Panel and stays visible to every Panel.
 *
 * A Panel's scoped runtime drops only Runs that belong exclusively to other
 * Panels. Its own Runs, shared Runs and unowned Runs keep their summaries and
 * details, so Action resolution and Experiment-closure consumers see exactly
 * what they saw before for everything they select. Runtimes that browse the
 * whole target history (run, run-log and camera-video datasources) are not
 * scoped at all.
 */
export type PanelRunOwners = ReadonlyMap<string,readonly string[]>;

type RunRecord = Pick<AutomationRunSummaryView,'id'|'parentRunId'|'rootRunId'> & {
  experimentSelector?: { panelId?: string };
  panelAction?: { panelId?: string };
  parameters?: Record<string,unknown>;
  panelId?: string;
};

const RUN_PANELS_PRODUCER_NODE_ID = 'run-panels';

/** Datasources that expose target-wide workflow history, not a Panel's own Runs. */
const TARGET_HISTORY_CONTRACTS = new Set<string>([
  workflowRuntimeDatasources.run,
  workflowRuntimeDatasources.runLogs,
  'camera.video.v1',
]);

export function panelRunScopeApplies(plugin: AnyPanelPluginDefinition) {
  return !(plugin.dataPorts ?? []).some((port) => TARGET_HISTORY_CONTRACTS.has(port.contract));
}

function rootPanelId(run: RunRecord) {
  if (run.parentRunId || (run.rootRunId && run.rootRunId !== run.id)) return undefined;
  const parameterPanelId = typeof run.parameters?.panelId === 'string' ? run.parameters.panelId : undefined;
  return run.panelAction?.panelId ?? run.experimentSelector?.panelId ?? run.panelId ?? parameterPanelId;
}

/**
 * Run -> owning Panel ids for one Run snapshot. Panel ids and workflow
 * instances come from every dashboard of the Experiment, so a Run owned by a
 * Panel on another dashboard is not mistaken for a System Run. A Run naming
 * a Panel outside the Experiment stays unowned (visible to every Panel).
 */
export function panelRunOwners(input: {
  panels: readonly Pick<PanelInstance,'id'|'portBindings'>[];
  activeRuns: readonly ExperimentRunView[];
  sessionViews: readonly ExperimentSessionView[];
  fullRunRelations?: AutomationExecutionRelations;
  observations: readonly {
    runSummaries: readonly AutomationRunSummaryView[];
    runDetailsById: Readonly<Record<string,AutomationRunDetail>>;
  }[];
}): PanelRunOwners {
  const panelIds = new Set(input.panels.map((panel) => panel.id));
  const panelsByWorkflow = new Map<string,string[]>();
  input.panels.forEach((panel) => panel.portBindings.forEach((binding) => {
    if (binding.kind !== 'workflow') return;
    const bound = panelsByWorkflow.get(binding.workflowInstanceId) ?? [];
    if (!bound.includes(panel.id)) bound.push(panel.id);
    panelsByWorkflow.set(binding.workflowInstanceId,bound);
  }));
  const owners = new Map<string,string[]>();
  // Runs whose owner list grew and must hand it on to their children.
  const pending: string[] = [];
  const own = (runId: string, panels: readonly string[] | undefined) => {
    if (!runId || !panels?.length) return;
    const current = owners.get(runId);
    if (!current) {
      owners.set(runId,[...panels]);
      pending.push(runId);
      return;
    }
    let grew = false;
    panels.forEach((panelId) => {
      if (current.includes(panelId)) return;
      current.push(panelId);
      grew = true;
    });
    if (grew) pending.push(runId);
  };
  // Parent -> child links from the summaries and the retained relation ledgers.
  const children = new Map<string,string[]>();
  const link = (parentRunId: string | undefined, childRunId: string) => {
    if (!parentRunId || !childRunId) return;
    const known = children.get(parentRunId);
    if (known) known.push(childRunId);
    else children.set(parentRunId,[childRunId]);
  };
  const seedRoot = (run: RunRecord) => {
    const panelId = rootPanelId(run);
    if (panelId && panelIds.has(panelId)) own(run.id,[panelId]);
  };
  input.activeRuns.forEach(seedRoot);
  // Target runtimes share their Run lists and details with the dashboard
  // runtime they extend; walk each list and record once.
  const walked = new Set<unknown>();
  input.observations.forEach((observation) => {
    if (!walked.has(observation.runSummaries)) {
      walked.add(observation.runSummaries);
      observation.runSummaries.forEach((run) => {
        seedRoot(run);
        link(run.parentRunId,run.id);
      });
    }
    if (walked.has(observation.runDetailsById)) return;
    walked.add(observation.runDetailsById);
    Object.values(observation.runDetailsById).forEach((detail) => {
      const run = detail.run;
      if (run) {
        seedRoot(run);
        link(run.parentRunId,run.id);
      }
      detail.relations?.childRuns.forEach((child) => link(child.parentRunId,child.childRunId));
    });
  });
  const relations = input.fullRunRelations;
  if (relations) {
    const panelGroups = new Set(relations.childRunGroups
      .filter((group) => group.producerNodeId === RUN_PANELS_PRODUCER_NODE_ID)
      .map((group) => group.id));
    relations.childRunGroupMembers.forEach((member) => {
      if (panelGroups.has(member.groupId)) own(member.childRunId,panelsByWorkflow.get(member.itemKey));
    });
  }
  input.sessionViews.forEach((view) => view.members.forEach((member) => {
    if (member.kind === 'workflow_run') own(member.ownerId,panelsByWorkflow.get(member.bindingId));
  }));
  // Descendants of an owned Run belong to the same Panels.
  for (let index = 0; index < pending.length; index += 1) {
    const runId = pending[index]!;
    const panels = owners.get(runId);
    children.get(runId)?.forEach((childRunId) => own(childRunId,panels));
  }
  return owners;
}

const snapshotOwners = new WeakMap<DashboardRunSnapshot,{ experiment?: ExperimentDocument;owners: PanelRunOwners }>();

/** What Run attribution is derived from, besides the Experiment's Panels. */
type OwnerInputs = {
  activeRuns: readonly ExperimentRunView[];
  sessionViews: readonly ExperimentSessionView[];
  relations?: AutomationExecutionRelations;
  lists: readonly (readonly AutomationRunSummaryView[])[];
  records: readonly Readonly<Record<string,AutomationRunDetail>>[];
};

/** The latest attribution per Experiment, so an unchanged one keeps its owners map. */
const latestOwners = new WeakMap<ExperimentDocument,{ inputs: OwnerInputs;owners: PanelRunOwners }>();
/** Runs whose owners differ between an owners map and the one it replaced. */
const ownerChanges = new WeakMap<PanelRunOwners,{ previous: PanelRunOwners;runIds: readonly string[] }>();
/** Without a saved Experiment there are no Panels to own a Run. */
const NO_OWNERS: PanelRunOwners = new Map();
const NO_RUNS: readonly AutomationRunSummaryView[] = [];
const NO_DETAILS: Readonly<Record<string,AutomationRunDetail>> = {};

function ownerInputs(snapshot: DashboardRunSnapshot): OwnerInputs {
  // Target runtimes share their Run lists and details with the dashboard
  // runtime they extend; each list and record counts once.
  const lists: (readonly AutomationRunSummaryView[])[] = [];
  const records: Readonly<Record<string,AutomationRunDetail>>[] = [];
  [...snapshot.runtimes.values(),snapshot.automation,snapshot.localAutomation].forEach((runtime) => {
    if (!lists.includes(runtime.runSummaries)) lists.push(runtime.runSummaries);
    if (!records.includes(runtime.runDetailsById)) records.push(runtime.runDetailsById);
  });
  if (!records.includes(snapshot.actions.runDetailsById)) records.push(snapshot.actions.runDetailsById);
  return {
    activeRuns: snapshot.actions.activeRuns,
    sessionViews: snapshot.actions.sessionViews,
    relations: snapshot.fullRunRelations?.relations,
    lists,
    records,
  };
}

/**
 * Owners for one published Run snapshot, computed once and shared by every
 * Panel of the dashboard. Panels come from every dashboard of the saved
 * Experiment; a draft Panel not saved yet owns nothing, so its Runs stay
 * visible to everyone (never hidden from their own Panel). A snapshot whose
 * Runs only changed state (same Runs, parents, Panel selectors and child
 * links) keeps the previous owners map without walking every Run again.
 */
export function snapshotPanelRunOwners(snapshot: DashboardRunSnapshot, experiment: ExperimentDocument | undefined) {
  if (!experiment) return NO_OWNERS;
  const cached = snapshotOwners.get(snapshot);
  if (cached && cached.experiment === experiment) return cached.owners;
  const inputs = ownerInputs(snapshot);
  const latest = latestOwners.get(experiment);
  let owners: PanelRunOwners;
  if (latest && sameAttribution(latest.inputs,inputs)) {
    owners = latest.owners;
  } else {
    const computed = panelRunOwners({
      panels: experiment.spec.dashboards.flatMap((dashboard) => dashboard.panels),
      activeRuns: inputs.activeRuns,
      sessionViews: inputs.sessionViews,
      fullRunRelations: inputs.relations,
      observations: [
        ...inputs.lists.map((runSummaries) => ({ runSummaries,runDetailsById: NO_DETAILS })),
        ...inputs.records.map((runDetailsById) => ({ runSummaries: NO_RUNS,runDetailsById })),
      ],
    });
    owners = computed;
    if (latest) {
      const runIds = changedOwnerRunIds(latest.owners,computed);
      if (runIds.length === 0) owners = latest.owners;
      else ownerChanges.set(computed,{ previous: latest.owners,runIds });
    }
  }
  latestOwners.set(experiment,{ inputs,owners });
  snapshotOwners.set(snapshot,{ experiment,owners });
  return owners;
}

/**
 * Whether two snapshots attribute Runs alike: the same Panel roots, Session
 * workflow members and run-panels children, and Runs that only changed state
 * (same ids, parents, Panel selectors and child links).
 */
function sameAttribution(previous: OwnerInputs, next: OwnerInputs) {
  if (previous.lists.length !== next.lists.length
    || previous.records.length !== next.records.length
    || !sameList(previous.activeRuns,next.activeRuns,sameRunAttribution)
    || !sameList(workflowMembers(previous.sessionViews),workflowMembers(next.sessionViews),(before,after) => (
      before.ownerId === after.ownerId && before.bindingId === after.bindingId
    ))
    || !samePanelChildren(previous.relations,next.relations)) return false;
  return next.lists.every((list,index) => {
    const edits = runListEdits(previous.lists[index]!,list);
    return Boolean(edits) && edits!.inserted.length === 0 && edits!.removed.length === 0
      && edits!.replacedRuns.every(([before,after]) => sameRunAttribution(before,after));
  }) && next.records.every((record,index) => {
    const before = previous.records[index]!;
    const edits = runDetailEdits(before,record);
    return edits.inserted.length === 0 && edits.removed.length === 0
      && edits.replaced.every((runId) => sameDetailAttribution(before[runId]!,record[runId]!));
  });
}

function workflowMembers(views: readonly ExperimentSessionView[]) {
  return views.flatMap((view) => view.members.filter((member) => member.kind === 'workflow_run'));
}

function samePanelChildren(before?: AutomationExecutionRelations, after?: AutomationExecutionRelations) {
  if (before === after) return true;
  if (!before || !after) return false;
  const panelGroups = (relations: AutomationExecutionRelations) => relations.childRunGroups
    .filter((group) => group.producerNodeId === RUN_PANELS_PRODUCER_NODE_ID)
    .map((group) => group.id);
  return sameItems(panelGroups(before),panelGroups(after))
    && sameList(before.childRunGroupMembers,after.childRunGroupMembers,(left,right) => (
      left.groupId === right.groupId && left.itemKey === right.itemKey && left.childRunId === right.childRunId
    ));
}

function sameList<T>(before: readonly T[], after: readonly T[], same: (left: T, right: T) => boolean) {
  return before === after || (before.length === after.length && before.every((item,index) => same(item,after[index]!)));
}

function sameRunAttribution(before: RunRecord, after: RunRecord) {
  return before.id === after.id
    && before.parentRunId === after.parentRunId
    && before.rootRunId === after.rootRunId
    && rootPanelId(before) === rootPanelId(after);
}

function sameDetailAttribution(before: AutomationRunDetail, after: AutomationRunDetail) {
  if (before.run !== after.run && (!before.run || !after.run || !sameRunAttribution(before.run,after.run))) return false;
  const left = before.relations?.childRuns ?? [];
  const right = after.relations?.childRuns ?? [];
  return left === right || (left.length === right.length && left.every((child,index) => (
    child.parentRunId === right[index]!.parentRunId && child.childRunId === right[index]!.childRunId
  )));
}

function changedOwnerRunIds(previous: PanelRunOwners, next: PanelRunOwners) {
  const runIds: string[] = [];
  next.forEach((panels,runId) => {
    const before = previous.get(runId);
    if (!before || !sameItems(before,panels)) runIds.push(runId);
  });
  previous.forEach((_panels,runId) => {
    if (!next.has(runId)) runIds.push(runId);
  });
  return runIds;
}

/** Runs whose owners changed from `previous` to `next`, or undefined when unknown. */
function ownerChangesBetween(previous: PanelRunOwners, next: PanelRunOwners): readonly string[] | undefined {
  if (previous === next) return [];
  const change = ownerChanges.get(next);
  return change?.previous === previous ? change.runIds : undefined;
}

const panelsSeeingEveryRun = new WeakMap<PanelRunOwners,readonly string[] | 'all'>();

/** Whether no Run is hidden from the Panel: it owns or shares every owned Run, or nothing is owned. */
function seesEveryRun(owners: PanelRunOwners, panelId: string) {
  let seeing = panelsSeeingEveryRun.get(owners);
  if (!seeing) {
    let common: string[] | undefined;
    for (const panels of owners.values()) {
      if (!common) common = [...panels];
      else if (common.some((id) => !panels.includes(id))) common = common.filter((id) => panels.includes(id));
      if (common.length === 0) break;
    }
    seeing = common ?? 'all';
    panelsSeeingEveryRun.set(owners,seeing);
  }
  return seeing === 'all' || seeing.includes(panelId);
}

function visibleTo(owners: PanelRunOwners, panelId: string, runId: string) {
  const runOwners = owners.get(runId);
  return !runOwners || runOwners.includes(panelId);
}

/**
 * How one Run list or Run-detail record changed between two snapshots:
 * Runs replaced in place, inserted and removed. Everything else is the same
 * object in the same relative order.
 */
type RunEdits = { replaced: readonly string[];inserted: readonly string[];removed: readonly string[] };
type RunListEdits = RunEdits & {
  /** The replaced Runs as [before, after]. */
  replacedRuns: readonly (readonly [AutomationRunSummaryView,AutomationRunSummaryView])[];
};

const NO_EDITS: RunListEdits = { replaced: [],inserted: [],removed: [],replacedRuns: [] };
/** How far a Run list is searched for a Run displaced by insertions or removals. */
const RUN_LIST_LOOKAHEAD = 64;

// Edits are computed once per snapshot pair and shared by every Panel.
const runListEditCache = new WeakMap<readonly AutomationRunSummaryView[],{
  previous: readonly AutomationRunSummaryView[];
  edits: RunListEdits | undefined;
}>();
const runDetailEditCache = new WeakMap<Readonly<Record<string,AutomationRunDetail>>,{
  previous: Readonly<Record<string,AutomationRunDetail>>;
  edits: RunEdits;
  size: number;
}>();

function findRun(runs: readonly AutomationRunSummaryView[], from: number, runId: string) {
  const end = Math.min(runs.length,from + RUN_LIST_LOOKAHEAD);
  for (let index = from; index < end; index += 1) {
    if (runs[index]!.id === runId) return index;
  }
  return -1;
}

/** Edits between two Run lists, or undefined when Runs were reordered. */
function runListEdits(
  previous: readonly AutomationRunSummaryView[],
  next: readonly AutomationRunSummaryView[],
): RunListEdits | undefined {
  if (previous === next) return NO_EDITS;
  const cached = runListEditCache.get(next);
  if (cached?.previous === previous) return cached.edits;
  const replaced: string[] = [];
  const replacedRuns: (readonly [AutomationRunSummaryView,AutomationRunSummaryView])[] = [];
  const inserted: string[] = [];
  const removed: string[] = [];
  let before = 0;
  let after = 0;
  let edits: RunListEdits | undefined;
  for (;;) {
    if (before === previous.length || after === next.length) {
      for (; before < previous.length; before += 1) removed.push(previous[before]!.id);
      for (; after < next.length; after += 1) inserted.push(next[after]!.id);
      edits = { replaced,inserted,removed,replacedRuns };
      break;
    }
    const left = previous[before]!;
    const right = next[after]!;
    if (left === right || left.id === right.id) {
      if (left !== right) {
        replaced.push(right.id);
        replacedRuns.push([left,right]);
      }
      before += 1;
      after += 1;
      continue;
    }
    const reappears = findRun(next,after + 1,left.id);
    if (reappears >= 0) {
      for (; after < reappears; after += 1) inserted.push(next[after]!.id);
      continue;
    }
    const remains = findRun(previous,before + 1,right.id);
    if (remains >= 0) {
      for (; before < remains; before += 1) removed.push(previous[before]!.id);
      continue;
    }
    break;
  }
  runListEditCache.set(next,{ previous,edits });
  return edits;
}

function runDetailEdits(
  previous: Readonly<Record<string,AutomationRunDetail>>,
  next: Readonly<Record<string,AutomationRunDetail>>,
) {
  if (previous === next) return NO_EDITS;
  const cached = runDetailEditCache.get(next);
  if (cached?.previous === previous) return cached.edits;
  const replaced: string[] = [];
  const inserted: string[] = [];
  const removed: string[] = [];
  const nextIds = Object.keys(next);
  let kept = 0;
  nextIds.forEach((runId) => {
    const before = previous[runId];
    if (before === undefined && !Object.hasOwn(previous,runId)) {
      inserted.push(runId);
      return;
    }
    kept += 1;
    if (before !== next[runId]) replaced.push(runId);
  });
  const previousSize = runDetailEditCache.get(previous)?.size ?? Object.keys(previous).length;
  if (kept !== previousSize) {
    Object.keys(previous).forEach((runId) => {
      if (!Object.hasOwn(next,runId)) removed.push(runId);
    });
  }
  const edits = { replaced,inserted,removed };
  runDetailEditCache.set(next,{ previous,edits,size: nextIds.length });
  return edits;
}

/**
 * Whether edits leave a Panel's scoped view unchanged: every edited Run is
 * hidden from the Panel (before and after as it applies), and every other Run
 * whose owners changed is as visible to the Panel as it was.
 */
function viewUnchanged(
  edits: RunEdits | undefined,
  ownerChangeIds: readonly string[],
  before: PanelRunOwners,
  after: PanelRunOwners,
  panelId: string,
) {
  if (!edits) return false;
  if (edits.replaced.some((runId) => visibleTo(before,panelId,runId) || visibleTo(after,panelId,runId))) return false;
  if (edits.inserted.some((runId) => visibleTo(after,panelId,runId))) return false;
  if (edits.removed.some((runId) => visibleTo(before,panelId,runId))) return false;
  return ownerChangeIds.every((runId) => (
    edits.replaced.includes(runId) || edits.inserted.includes(runId) || edits.removed.includes(runId)
    || visibleTo(before,panelId,runId) === visibleTo(after,panelId,runId)
  ));
}

type ScopedRuntime = {
  source: PanelAutomationRuntime;
  owners: PanelRunOwners;
  runSummaries: AutomationRunSummaryView[];
  runDetailsById: Record<string,AutomationRunDetail>;
  value: PanelAutomationRuntime;
};

/**
 * Per-Panel memory of scoped runtimes: a new target snapshot whose visible
 * Runs are unchanged returns the previous scoped object, so the Panel's Run
 * selection stays referentially equal and the Panel does not re-render.
 */
export type PanelRunScopeCache = {
  /** Keyed by role and target: `map:<target>` for target runtimes, `fallback:<target>` otherwise. */
  byKey: Map<string,ScopedRuntime>;
  runtimes?: PanelAutomationRuntimeMap;
};

export function createPanelRunScopeCache(): PanelRunScopeCache {
  return { byKey: new Map() };
}

function scopedRunSummaries(
  source: readonly AutomationRunSummaryView[],
  previous: AutomationRunSummaryView[] | undefined,
  visible: (runId: string) => boolean,
) {
  const scoped = source.filter((run) => visible(run.id));
  return previous && sameItems(previous,scoped) ? previous : scoped;
}

function scopedRunDetails(
  source: Readonly<Record<string,AutomationRunDetail>>,
  previous: Record<string,AutomationRunDetail> | undefined,
  visible: (runId: string) => boolean,
) {
  const scoped: Record<string,AutomationRunDetail> = {};
  let count = 0;
  Object.keys(source).forEach((runId) => {
    if (!visible(runId)) return;
    scoped[runId] = source[runId]!;
    count += 1;
  });
  const same = previous && Object.keys(previous).length === count
    && Object.keys(scoped).every((runId) => previous[runId] === scoped[runId]);
  return same ? previous : scoped;
}

/**
 * The Panel's next Run list: the previous one while the edits are hidden from
 * it, the previous one with its replaced Runs swapped in when Runs only
 * changed in place, otherwise filtered again.
 */
function nextRunSummaries(
  previous: ScopedRuntime,
  source: readonly AutomationRunSummaryView[],
  ownerChangeIds: readonly string[],
  owners: PanelRunOwners,
  panelId: string,
) {
  const edits = runListEdits(previous.source.runSummaries,source);
  if (viewUnchanged(edits,ownerChangeIds,previous.owners,owners,panelId)) return previous.runSummaries;
  if (edits && ownerChangeIds.length === 0 && edits.inserted.length === 0 && edits.removed.length === 0) {
    const swaps = new Map<AutomationRunSummaryView,AutomationRunSummaryView>(edits.replacedRuns);
    return previous.runSummaries.map((run) => swaps.get(run) ?? run);
  }
  return scopedRunSummaries(source,previous.runSummaries,(runId) => visibleTo(owners,panelId,runId));
}

function nextRunDetails(
  previous: ScopedRuntime,
  source: Readonly<Record<string,AutomationRunDetail>>,
  ownerChangeIds: readonly string[],
  owners: PanelRunOwners,
  panelId: string,
) {
  const edits = runDetailEdits(previous.source.runDetailsById,source);
  if (viewUnchanged(edits,ownerChangeIds,previous.owners,owners,panelId)) return previous.runDetailsById;
  if (ownerChangeIds.length === 0 && edits.inserted.length === 0 && edits.removed.length === 0) {
    // Same Runs, same owners: the Panel sees exactly the replaced Runs it saw.
    const next = { ...previous.runDetailsById };
    edits.replaced.forEach((runId) => {
      if (Object.hasOwn(next,runId)) next[runId] = source[runId]!;
    });
    return next;
  }
  return scopedRunDetails(source,previous.runDetailsById,(runId) => visibleTo(owners,panelId,runId));
}

function scopePanelRuntime(
  cache: PanelRunScopeCache,
  key: string,
  source: PanelAutomationRuntime,
  owners: PanelRunOwners,
  panelId: string,
): PanelAutomationRuntime {
  const previous = cache.byKey.get(key);
  if (previous?.source === source && previous.owners === owners) return previous.value;
  // A Run event usually edits a few Runs: look at those and the Runs whose
  // owners changed, not at every Run.
  const ownerChangeIds = previous ? ownerChangesBetween(previous.owners,owners) : undefined;
  const visible = (runId: string) => visibleTo(owners,panelId,runId);
  const runSummaries = previous && ownerChangeIds
    ? nextRunSummaries(previous,source.runSummaries,ownerChangeIds,owners,panelId)
    : scopedRunSummaries(source.runSummaries,previous?.runSummaries,visible);
  const runDetailsById = previous && ownerChangeIds
    ? nextRunDetails(previous,source.runDetailsById,ownerChangeIds,owners,panelId)
    : scopedRunDetails(source.runDetailsById,previous?.runDetailsById,visible);
  const value = previous
    && previous.runSummaries === runSummaries
    && previous.runDetailsById === runDetailsById
    && sameRuntimeFields(previous.source,source)
    ? previous.value
    : { ...source,runSummaries,runDetailsById };
  cache.byKey.set(key,{ source,owners,runSummaries,runDetailsById,value });
  return value;
}

/**
 * The Panel's view of the Run snapshot's target runtimes: `automation` is its
 * own target (or fallback) runtime, `runtimes` every target runtime, both with
 * other Panels' Runs removed and identity kept while the view is unchanged.
 */
export function scopePanelRunRuntimes(
  cache: PanelRunScopeCache,
  automation: PanelAutomationRuntime,
  runtimes: PanelAutomationRuntimeMap,
  owners: PanelRunOwners,
  panelId: string,
) {
  if (seesEveryRun(owners,panelId)) {
    // Nothing to hide: the Panel sees the snapshot's runtimes themselves.
    cache.byKey.clear();
    cache.runtimes = undefined;
    return { automation,runtimes };
  }
  const scoped = new Map([...runtimes].map(([targetId,runtime]) => [
    targetId,scopePanelRuntime(cache,`map:${targetId}`,runtime,owners,panelId),
  ] as const));
  const previous = cache.runtimes;
  const scopedRuntimes = previous && previous.size === scoped.size
    && [...scoped].every(([targetId,runtime]) => previous.get(targetId) === runtime)
    ? previous : scoped;
  cache.runtimes = scopedRuntimes;
  const scopedAutomation = runtimes.get(automation.targetId) === automation
    ? scopedRuntimes.get(automation.targetId)!
    : scopePanelRuntime(cache,`fallback:${automation.targetId}`,automation,owners,panelId);
  return { automation: scopedAutomation,runtimes: scopedRuntimes };
}

function sameItems<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((item,index) => item === right[index]);
}

function sameRuntimeFields(left: PanelAutomationRuntime, right: PanelAutomationRuntime) {
  const leftRecord = left as unknown as Record<string,unknown>;
  const rightRecord = right as unknown as Record<string,unknown>;
  const keys = Object.keys(rightRecord);
  return keys.length === Object.keys(leftRecord).length && keys.every((key) => (
    key === 'runSummaries' || key === 'runDetailsById' || leftRecord[key] === rightRecord[key]
  ));
}
