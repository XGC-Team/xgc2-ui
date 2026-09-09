import { useCallback,useEffect,useMemo,useRef } from 'react';
import type {
  AutomationRun,
  AutomationRunDetail,
  AutomationRunSummaryView,
} from '../../automation/automationPublic';
import type { ExperimentDocument } from '../experimentModel';
import {
  activeExperimentSessionCommandRootIds,
  activeExperimentRun,
  activeExperimentRuns,
  experimentSessionCommandRootIds,
  experimentSessionIsRunning,
  isSystemExperimentRunnerRoot,
  SYSTEM_EXPERIMENT_RUNNER,
} from '../experimentWorkflowService';
import type { ExperimentSessionView } from '../experimentWorkflowModel';

export type ExperimentWorkflowRuntimeSource = {
  runSummaries:readonly AutomationRunSummaryView[];
  runDetailsById:Readonly<Record<string,AutomationRunDetail>>;
  resolved:boolean;
  error:string;
  refreshExecutionHistory:(automationResourceId:string) => Promise<unknown>;
  loadRunDetail:(runId:string,expectedRevision?:number) => Promise<AutomationRunDetail>;
  retainRunDetail:(runId:string) => () => void;
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
 * active Session command root drives one retained, revision-bounded detail
 * hydration so navigation can restore its exact relation closure without
 * polling; broader history/session refresh remains an explicit action.
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
  useSessionCommandRootDetails({
    demands:stableSessionCommandRootDemands,
    runDetailsById:source.runDetailsById,
    loadRunDetail:source.loadRunDetail,
    retainRunDetail:source.retainRunDetail,
  });
  const sessionCommandRootIds = useMemo(() => experimentResourceId
    ? activeExperimentSessionCommandRootIds(
      source.sessionViews ?? [],experimentResourceId,executionTargetId,
    )
    : new Set<string>(),[
    executionTargetId,experimentResourceId,source.sessionViews,
  ]);
  const projectedRuns = useMemo(() => mergeSessionCommandRootRuns(
    source.runSummaries,
    source.runDetailsById,
    stableSessionCommandRootDemands,
    experimentBranch,
  ),[
    experimentBranch,source.runDetailsById,source.runSummaries,stableSessionCommandRootDemands,
  ]);
  const observedRunIds = useMemo(() => new Set(projectedRuns.flatMap((run) => (
    experimentResourceId
      && isSystemExperimentRunnerRoot(run)
      && run.sourceRef?.resourceId === experimentResourceId
      && run.sourceRef.branch === experimentBranch
      ? [run.id]
      : []
  ))),[experimentBranch,experimentResourceId,projectedRuns]);
  const activeRun = useMemo(() => experiment
    ? activeExperimentRun(
      projectedRuns,
      experiment,
      executionTargetId,
      source.runDetailsById,
      sessionCommandRootIds,
    )
    : undefined,[
    experiment,executionTargetId,sessionCommandRootIds,
    projectedRuns,source.runDetailsById,
  ]);
  const activeRuns = useMemo(() => experiment
    ? activeExperimentRuns(
      projectedRuns,experiment,executionTargetId,
      source.runDetailsById,sessionCommandRootIds,
    )
    : [],[
    experiment,executionTargetId,sessionCommandRootIds,
    projectedRuns,source.runDetailsById,
  ]);
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
    sessionViews:source.sessionViews ?? [],
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

function compareSessionCommandRootDemand(left:SessionCommandRootDemand,right:SessionCommandRootDemand) {
  return left.sessionRevision-right.sessionRevision
    || left.memberRevision-right.memberRevision
    || left.sessionId.localeCompare(right.sessionId);
}

function useSessionCommandRootDetails({
  demands,runDetailsById,loadRunDetail,retainRunDetail,
}: {
  demands:readonly SessionCommandRootDemand[];
  runDetailsById:Readonly<Record<string,AutomationRunDetail>>;
  loadRunDetail:(runId:string,expectedRevision?:number) => Promise<AutomationRunDetail>;
  retainRunDetail:(runId:string) => () => void;
}) {
  const attemptedRef=useRef(new Set<string>());
  const demandSignature=JSON.stringify(demands);
  useEffect(() => {
    const releases=demands.map((demand) => retainRunDetail(demand.id));
    return () => releases.forEach((release) => release());
  },[demandSignature,demands,retainRunDetail]);
  useEffect(() => {
    const activeAttemptKeys=new Set(demands.map((demand) => sessionCommandRootAttemptKey(
      demand,runDetailsById[demand.id]?.run?.revision,
    )));
    attemptedRef.current.forEach((key) => {
      if (!activeAttemptKeys.has(key)) attemptedRef.current.delete(key);
    });
    demands.forEach((demand) => {
      const detail=runDetailsById[demand.id];
      if (detail?.loading || (detail?.run && detail.relations)) return;
      const attemptKey=sessionCommandRootAttemptKey(demand,detail?.run?.revision);
      if (attemptedRef.current.has(attemptKey)) return;
      attemptedRef.current.add(attemptKey);
      void Promise.resolve(loadRunDetail(demand.id,detail?.run?.revision)).catch(() => undefined);
    });
  },[demandSignature,demands,loadRunDetail,runDetailsById]);
}

function sessionCommandRootAttemptKey(demand:SessionCommandRootDemand,runRevision?:number) {
  return `${demand.id}:${demand.sessionId}:${demand.sessionRevision}:${demand.memberRevision}:${runRevision ?? 0}`;
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
