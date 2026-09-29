import { useCallback,useEffect,useMemo,useRef } from 'react';
import type {
  AutomationRun,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../../automation/automationPublic';
import type { ExperimentDocument } from '../experimentModel';
import {
  activeExperimentSessionCommandRootIds,
  activeExperimentRuns,
  experimentSessionCommandRootIds,
  experimentSessionIsRunning,
  isSystemExperimentRunnerRoot,
  SYSTEM_EXPERIMENT_RUNNER,
} from '../experimentWorkflowService';
import type { ExperimentRunRecord,ExperimentRunView,ExperimentSessionView } from '../experimentWorkflowModel';

const EMPTY_SESSION_VIEWS: readonly ExperimentSessionView[] = [];
const EMPTY_ACTIVE_RUNS: ExperimentRunView[] = [];

export type ExperimentWorkflowRuntimeSource = {
  runSummaries:readonly AutomationRunSummaryView[];
  runDetailsById:Readonly<Record<string,AutomationRunDetail>>;
  resolved:boolean;
  error:string;
  refreshExecutionHistory:(automationResourceId:string) => Promise<unknown>;
  retainRunObservation:(runId:string) => () => void;
  sessionViews?:readonly ExperimentSessionView[];
  refreshSessions?:() => Promise<unknown>;
  convergeStoppedExperiment:(experimentResourceId:string) => Promise<unknown>;
};

type SessionCommandRootDemand = {
  id:string;
  targetId:string;
  experimentResourceId:string;
  runMode:string;
  sessionId:string;
  sessionRevision:number;
  memberRevision:number;
};

/**
 * Projects Experiment lifecycle from the ordinary System Runner Automation
 * history. The initial bounded snapshot is owned by station occupancy. An
 * active Session retains its command roots in the shared bounded observation
 * so navigation restores their exact bound closure without per-Run requests; broader history/session refresh remains an explicit action.
 */
export function useExperimentWorkflowRuntime(
  experiment:ExperimentDocument|undefined,
  executionTargetId:string,
  source:ExperimentWorkflowRuntimeSource,
) {
  const refreshExecutionHistory = source.refreshExecutionHistory;
  const refreshSessions = source.refreshSessions;
  const convergeStoppedExperiment = source.convergeStoppedExperiment;
  const experimentResourceId = experiment?.head.resourceId ?? '';
  const experimentBranch = experiment?.branch.name ?? '';
  const candidateSessionCommandRootIds = useMemo(() => experimentResourceId
    ? experimentSessionCommandRootIds(
      source.sessionViews ?? [],experimentResourceId,executionTargetId,
    )
    : new Set<string>(),[
    executionTargetId,experimentResourceId,source.sessionViews,
  ]);
  const sessionCommandRootDemands = useMemo(() => sessionCommandRootDemandsForViews(
    source.sessionViews ?? [],experimentResourceId,executionTargetId,candidateSessionCommandRootIds,
  ),[
    candidateSessionCommandRootIds,executionTargetId,experimentResourceId,source.sessionViews,
  ]);
  const sessionCommandRootSignature = JSON.stringify(sessionCommandRootDemands);
  const stableSessionCommandRootDemands = useMemo<SessionCommandRootDemand[]>(() => (
    JSON.parse(sessionCommandRootSignature) as SessionCommandRootDemand[]
  ),[sessionCommandRootSignature]);
  const retainRunObservation=source.retainRunObservation;
  const rootIdsSignature=JSON.stringify(stableSessionCommandRootDemands.map((demand) => demand.id));
  useEffect(() => {
    const releases=(JSON.parse(rootIdsSignature) as string[]).map((id) => retainRunObservation(id));
    return () => releases.forEach((release) => release());
  },[retainRunObservation,rootIdsSignature]);
  const sessionCommandRootIds = useMemo(() => experimentResourceId
    ? activeExperimentSessionCommandRootIds(
      source.sessionViews ?? [],experimentResourceId,executionTargetId,
    )
    : new Set<string>(),[
    executionTargetId,experimentResourceId,source.sessionViews,
  ]);
  const computedProjectedRuns = useMemo(() => mergeSessionCommandRootRuns(
    source.runSummaries,
    source.runDetailsById,
    stableSessionCommandRootDemands,
    experimentBranch,
  ),[
    experimentBranch,source.runDetailsById,source.runSummaries,stableSessionCommandRootDemands,
  ]);
  // Element-wise reference reuse: a sync that leaves every merged run untouched
  // keeps the previous array so downstream projections do not recompute.
  const projectedRuns = useStableList(computedProjectedRuns);
  const observedRunIds = useMemo(() => new Set(projectedRuns.flatMap((run) => (
    experimentResourceId
      && isSystemExperimentRunnerRoot(run)
      && run.sourceRef?.resourceId === experimentResourceId
      && run.sourceRef.branch === experimentBranch
      ? [run.id]
      : []
  ))),[experimentBranch,experimentResourceId,projectedRuns]);
  const runViewCacheRef = useRef<{
    experiment:ExperimentDocument;
    targetId:string;
    byId:ReadonlyMap<string,{ run:ExperimentRunRecord;exact?:AutomationRun;view:ExperimentRunView }>;
    views:ExperimentRunView[];
  } | undefined>(undefined);
  // experimentRunView rebuilds every view object on each call. Reuse the
  // previous view per Run id while all four of its inputs (run record, exact
  // run, experiment, target) keep their references.
  const activeRuns = useMemo(() => {
    if (!experiment) return EMPTY_ACTIVE_RUNS;
    const cache=runViewCacheRef.current;
    const runsById=new Map(projectedRuns.map((run) => [run.id,run]));
    const byId=new Map<string,{ run:ExperimentRunRecord;exact?:AutomationRun;view:ExperimentRunView }>();
    const views=activeExperimentRuns(
      projectedRuns,experiment,executionTargetId,
      source.runDetailsById,sessionCommandRootIds,
    ).map((view) => {
      const run=runsById.get(view.id);
      const exact=source.runDetailsById[view.id]?.run;
      const cached=cache?.byId.get(view.id);
      const reused=cache?.experiment===experiment && cache.targetId===executionTargetId
        && cached && cached.run===run && cached.exact===exact ? cached.view : view;
      byId.set(view.id,{ run:run as ExperimentRunRecord,exact,view:reused });
      return reused;
    });
    const previous=cache?.views;
    const stable=previous && previous.length===views.length
      && views.every((view,index) => view===previous[index]) ? previous : views;
    runViewCacheRef.current={ experiment,targetId:executionTargetId,byId,views:stable };
    return stable;
  },[
    experiment,executionTargetId,sessionCommandRootIds,
    projectedRuns,source.runDetailsById,
  ]);
  const activeRun = experiment ? activeRuns[0] : undefined;
  const sessionActive = useMemo(() => experimentResourceId
    ? experimentSessionIsRunning(source.sessionViews ?? [],experimentResourceId)
    : false,[experimentResourceId,source.sessionViews]);
  const refresh = useCallback(async () => {
    await Promise.all([
      refreshExecutionHistory(SYSTEM_EXPERIMENT_RUNNER.resourceId),
      refreshSessions?.(),
    ]);
  },[refreshExecutionHistory,refreshSessions]);
  const convergeStoppedSession=useCallback(async () => {
    if (!experimentResourceId) throw new Error('Stopped Session convergence requires a selected Experiment.');
    await convergeStoppedExperiment(experimentResourceId);
    // The Session closes only after its owned roots have converged. Re-read
    // history at that boundary so a missed terminal SSE cannot retain a
    // stopping root after the authoritative Session snapshot becomes empty.
    await refreshExecutionHistory(SYSTEM_EXPERIMENT_RUNNER.resourceId);
  },[
    convergeStoppedExperiment,experimentResourceId,refreshExecutionHistory,
  ]);

  return {
    activeRun,
    activeRuns,
    sessionViews:source.sessionViews ?? EMPTY_SESSION_VIEWS,
    sessionActive,
    runDetailsById:source.runDetailsById,
    observedRunIds,
    loading:!source.resolved,
    resolved:source.resolved,
    error:source.error,
    refresh,
    convergeStoppedSession,
  };
}

function sessionCommandRootDemandsForViews(
  views:readonly ExperimentSessionView[],
  experimentResourceId:string,
  targetId:string,
  rootIds:ReadonlySet<string>,
):SessionCommandRootDemand[] {
  const demands = new Map<string,SessionCommandRootDemand>();
  views.forEach((view) => {
    if (view.session.experimentResourceId !== experimentResourceId
      || view.session.targetId !== targetId
      || !isActiveSessionState(view.session.state)) return;
    view.members.forEach((member) => {
      if (member.kind!=='workflow_command'
        || !rootIds.has(member.ownerId)
        || member.targetId !== targetId) return;
      const demand:SessionCommandRootDemand = {
        id:member.ownerId,
        targetId,
        experimentResourceId,
        runMode:view.session.runMode,
        sessionId:view.session.id,
        sessionRevision:view.session.revision,
        memberRevision:member.revision,
      };
      const previous=demands.get(demand.id);
      if (!previous || compareSessionCommandRootDemand(previous,demand)<0) {
        demands.set(demand.id,demand);
      }
    });
  });
  return [...demands.values()].sort((left,right) => left.id.localeCompare(right.id));
}

function isActiveSessionState(state:ExperimentSessionView['session']['state']) {
  return state==='opening' || state==='active' || state==='stopping';
}

/** Reuse the previous list reference while every element keeps its identity. */
function useStableList<T>(list:readonly T[]):readonly T[] {
  const ref=useRef(list);
  const current=ref.current;
  if (current.length!==list.length || list.some((item,index) => item!==current[index])) {
    ref.current=list;
  }
  return ref.current;
}

function compareSessionCommandRootDemand(left:SessionCommandRootDemand,right:SessionCommandRootDemand) {
  return left.sessionRevision-right.sessionRevision
    || left.memberRevision-right.memberRevision
    || left.sessionId.localeCompare(right.sessionId);
}

function mergeSessionCommandRootRuns(
  summaries:readonly AutomationRunSummaryView[],
  runDetailsById:Readonly<Record<string,AutomationRunDetail>>,
  demands:readonly SessionCommandRootDemand[],
  experimentBranch:string,
) {
  const runs = new Map<string,AutomationRun|AutomationRunSummaryView>(
    summaries.map((run) => [run.id,run]),
  );
  demands.forEach((demand) => {
    const exact=runDetailsById[demand.id]?.run;
    if (exact && exactRunMatchesSessionCommandRoot(exact,demand,experimentBranch)) {
      runs.set(exact.id,exact);
    }
  });
  return [...runs.values()];
}

function exactRunMatchesSessionCommandRoot(
  run:AutomationRun,
  demand:SessionCommandRootDemand,
  experimentBranch:string,
) {
  return run.id===demand.id
    && run.targetId===demand.targetId
    && run.sourceRef.domain==='experiment'
    && run.sourceRef.resourceId===demand.experimentResourceId
    && run.sourceRef.branch===experimentBranch
    && typeof run.parameters.runMode==='string'
    && run.parameters.runMode===demand.runMode
    && isSystemExperimentRunnerRoot(run);
}
