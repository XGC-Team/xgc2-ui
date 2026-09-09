import { useCallback,useEffect,useRef,useState } from 'react';
import { flushSync } from 'react-dom';
import type { AutomationRunControl,AutomationRunDetail } from '../../automation/automationPublic';
import { useGroundStationErrorNotification } from '../../groundStationInteraction/groundStationInteractionPublic';
import { type ExperimentDocument } from '../experimentModel';
import {
  SYSTEM_EXPERIMENT_RUNNER,
} from '../experimentWorkflowService';
import type { ExperimentRunView,ExperimentSessionView } from '../experimentWorkflowModel';
import { createExperimentRobotBindingActions } from './experimentRobotBindingActions';
import { createExperimentWorkflowPresetActions } from './experimentWorkflowPresetActions';
import { emptyActionState,messageOf } from './experimentDashboardActionMessages';

export type ExperimentRuntimeProjection = {
  loading: boolean;
  error: string;
  stateLoading?: boolean;
  stateResolved?: boolean;
  stateError?: string;
  activeRun?: ExperimentRunView;
  activeRuns?: readonly ExperimentRunView[];
  sessionActive?: boolean;
  sessionViews?:readonly ExperimentSessionView[];
  runDetailsById?: Readonly<Record<string,AutomationRunDetail>>;
  observedRunIds?: ReadonlySet<string>;
  refresh: () => Promise<void>;
  convergeStoppedSession: () => Promise<void>;
};

export type ExperimentDashboardActions = ReturnType<typeof useExperimentDashboardActions>;
type DashboardLifecycleKind = 'start' | 'stop';
export type DashboardActionState = {
  epoch: number;
  error: string;
  lifecycle?: { token: symbol;kind: DashboardLifecycleKind };
  pendingRun?: ExperimentRunView;
};

/**
 * Experiment lifecycle is the lifecycle of the exact Experiment-sourced
 * System Runner Automation root. Session children remain ordinary Automation
 * relations and Total Stop uses the generic stop-set policy.
 */
export function useExperimentDashboardActions({
  visibleExperiment,
  runtimeProjection,
  executionTargetId = 'local',
  startWorkflow,
  stopWorkflow,
  startPanelWorkflow,
  invokePanelActionWorkflow,
  stopPanelActionWorkflow,
  saveExperimentDraft,
  applyExperimentDraft,
  beginExperimentEdit,
  runMode = '',
  dashboardEditing = false,
  dashboardSaving = false,
  externalAdmissionDisabledReason = '',
}: {
  visibleExperiment?: ExperimentDocument;
  runtimeProjection: ExperimentRuntimeProjection;
  executionTargetId?: string;
  startWorkflow: (
    targetId: string,experiment: ExperimentDocument,runMode: string,
  ) => Promise<ExperimentRunView>;
  stopWorkflow: (
    targetId: string,experiment: ExperimentDocument,
  ) => Promise<unknown>;
  startPanelWorkflow?: (
    targetId:string,experiment:ExperimentDocument,runMode:string,panelId:string,
    inputOverrides:Record<string,unknown>,
  ) => Promise<ExperimentRunView>;
  invokePanelActionWorkflow?: (
    targetId:string,experiment:ExperimentDocument,runMode:string,panelId:string,presetId:string,
    inputOverrides:Record<string,unknown>,reason?:string,
  ) => Promise<ExperimentRunView>;
  stopPanelActionWorkflow?: (
    targetId:string,root:AutomationRunControl,reason:string,
  ) => Promise<unknown>;
  saveExperimentDraft?: (experiment: ExperimentDocument,reason?: string) => Promise<ExperimentDocument>;
  applyExperimentDraft?: (experiment: ExperimentDocument) => void;
  beginExperimentEdit?: (experiment: ExperimentDocument) => void;
  runMode?: string;
  dashboardEditing?: boolean;
  dashboardSaving?: boolean;
  externalAdmissionDisabledReason?: string;
}) {
  const scopeKey = JSON.stringify([
    executionTargetId,
    visibleExperiment?.head.resourceId ?? '',
    visibleExperiment?.branch.headCommitId ?? '',
  ]);
  const controller = useRef({
    scopeKey,
    epoch: 0,
    mounted: true,
    abortStart: false,
    startWork: undefined as Promise<ExperimentRunView | undefined> | undefined,
    lifecycle: undefined as DashboardActionState['lifecycle'],
  });
  if (controller.current.scopeKey !== scopeKey) {
    controller.current.scopeKey = scopeKey;
    controller.current.epoch += 1;
    controller.current.lifecycle = undefined;
    controller.current.abortStart = false;
    controller.current.startWork = undefined;
  }
  const submittedActions = useRef({ scopeKey,ids:new Set<string>() });
  if (submittedActions.current.scopeKey !== scopeKey) {
    submittedActions.current = { scopeKey,ids:new Set<string>() };
  }
  const epoch = controller.current.epoch;
  const [stored,setStored] = useState<DashboardActionState>(() => emptyActionState(epoch));
  const actionState = stored.epoch === epoch ? stored : emptyActionState(epoch);
  const updateActionState = useCallback((update: Partial<Omit<DashboardActionState,'epoch'>>) => {
    if (!controller.current.mounted || controller.current.epoch !== epoch) return;
    setStored((current) => ({
      ...(current.epoch === epoch ? current : emptyActionState(epoch)),
      ...update,
      epoch,
    }));
  },[epoch]);
  useEffect(() => {
    const lifecycle = controller.current;
    lifecycle.mounted = true;
    return () => { lifecycle.mounted = false; };
  },[]);

  useEffect(() => {
    for (const id of submittedActions.current.ids) {
      const run = runtimeProjection.runDetailsById?.[id]?.run;
      if (!run || !['succeeded','failed','canceled','stopped','rejected'].includes(run.status)) continue;
      submittedActions.current.ids.delete(id);
      if (run.status === 'failed' || run.status === 'rejected') {
        updateActionState({ error:run.primaryError || run.reason || 'Panel Action failed.' });
      }
    }
  },[runtimeProjection.runDetailsById,updateActionState,stored]);

  const projectedRun = runtimeProjection.stateResolved ? runtimeProjection.activeRun : undefined;
  const projectedRuns = runtimeProjection.stateResolved
    ? runtimeProjection.activeRuns ?? (projectedRun ? [projectedRun] : [])
    : [];
  const startInFlight = actionState.lifecycle?.kind === 'start';
  const stopAllInFlight = actionState.lifecycle?.kind === 'stop';
  // Total Stop owns every active command root in the Session, not only the
  // primary root shown in the top bar. Project that phase to Panel consumers
  // immediately so they release run-scoped transports before stop-set removes
  // the corresponding backend projections.
  const activeRuns = stopAllInFlight
    ? projectedRuns.map((run) => ({ ...run,status:'stopping' as const }))
    : projectedRuns;
  const pendingRun = actionState.pendingRun
    && !projectedRun
    && !runtimeProjection.observedRunIds?.has(actionState.pendingRun.id)
    ? actionState.pendingRun
    : undefined;
  const activeWorkflowRun = projectedRun ?? pendingRun;
  // The initiating browser knows Stop has been durably requested before the
  // synchronous HTTP call returns. Project that exact lifecycle phase until
  // the Automation execution event advances the durable summary.
  const activeRun = activeWorkflowRun && stopAllInFlight
    && !(['succeeded','failed','canceled','stopped','rejected'] as readonly string[])
      .includes(activeWorkflowRun.status)
    ? { ...activeWorkflowRun,status:'stopping' as const }
    : activeWorkflowRun;
  const experimentIsRunning = Boolean(runtimeProjection.sessionActive)
    || projectedRuns.length > 0
    || Boolean(activeWorkflowRun)
    || startInFlight;
  const experimentAdmissionDisabledReason = externalAdmissionDisabledReason;
  const lifecycleStateLoading = Boolean(runtimeProjection.stateLoading || runtimeProjection.loading);
  const actionOrProjectionError = actionState.error || runtimeProjection.stateError || runtimeProjection.error;
  const robotBindingsBaseRef = useRef(visibleExperiment);
  if (visibleExperiment) {
    const current = robotBindingsBaseRef.current;
    if (
      !current
      || current.head.resourceId !== visibleExperiment.head.resourceId
      || visibleExperiment.branch.headVersion >= current.branch.headVersion
    ) {
      robotBindingsBaseRef.current = visibleExperiment;
    }
  } else {
    robotBindingsBaseRef.current = undefined;
  }
  const robotBindingActions = createExperimentRobotBindingActions({
    getRendered: () => robotBindingsBaseRef.current,
    rememberSaved: (saved) => {
      robotBindingsBaseRef.current = saved;
    },
    runtimeActive: experimentIsRunning,
    dashboardEditing,
    save: saveExperimentDraft,
    applyDraft: applyExperimentDraft,
    beginEdit: beginExperimentEdit,
    saving: dashboardSaving,
  });
  const workflowPresetActions = createExperimentWorkflowPresetActions({
    getRendered: () => robotBindingsBaseRef.current,
    rememberSaved: (saved) => {
      robotBindingsBaseRef.current = saved;
    },
    runtimeActive: experimentIsRunning,
    dashboardEditing,
    save: saveExperimentDraft,
    applyDraft: applyExperimentDraft,
  });
  useGroundStationErrorNotification(executionTargetId,actionOrProjectionError,{
    title: 'Experiment',
    source: visibleExperiment?.head.resourceId || 'experiments',
    dedupeKey: 'experiment-workflow:action',
  });

  async function startExperiment() {
    const refusal = startDisabledReason();
    if (!visibleExperiment || refusal) return undefined;
    return startOwnedWorkflow(() => startWorkflow(
      executionTargetId,
      visibleExperiment,
      runMode,
    ));
  }

  async function startOwnedWorkflow(submit:() => Promise<ExperimentRunView>) {
    const lifecycleToken = acquireLifecycle('start');
    if (!lifecycleToken) return undefined;
    controller.current.abortStart = false;
    // An idle dashboard has no System Runner history to retain. Arm the
    // explicit action-boundary reconciliation before submitting Start so its
    // lifecycle SSE cannot arrive while that history is still unobserved. The
    // accepted-Run refresh below then reads again after any joined stale
    // request has completed.
    const observationWork = runtimeProjection.refresh().catch(() => undefined);
    const work = submit();
    controller.current.startWork = work;
    try {
      const started = await work;
      if (!started) return undefined;
      if (controller.current.abortStart || !ownsLifecycle(lifecycleToken)) return started;
      updateActionState({ pendingRun: started });
      releaseLifecycle(lifecycleToken);
      await observationWork;
      await runtimeProjection.refresh();
      return started;
    } catch (cause) {
      if (ownsLifecycle(lifecycleToken)) updateActionState({ error: messageOf(cause),pendingRun: undefined });
      throw cause;
    } finally {
      if (controller.current.startWork === work) controller.current.startWork = undefined;
      releaseLifecycle(lifecycleToken);
    }
  }

  async function stopExperiment() {
    if (stopAllInFlight) return undefined;
    controller.current.abortStart = true;
    let lifecycleToken: symbol|undefined;
    // The backend can remove Robot projections as soon as stop-set begins.
    // Commit the local stopping phase first so Panel layout-effect cleanup
    // closes SSE and aborts any snapshot refresh before that request is sent.
    flushSync(() => {
      lifecycleToken = acquireLifecycle('stop',{ preempt: true });
    });
    if (!lifecycleToken) return undefined;
    try {
      const started = activeWorkflowRun
        ?? projectedRuns[0]
        ?? actionState.pendingRun
        ?? await controller.current.startWork;
      if ((!started && !runtimeProjection.sessionActive) || !visibleExperiment) {
        updateActionState({ pendingRun: undefined });
        return undefined;
      }
      const stopped = await stopWorkflow(executionTargetId,visibleExperiment);
      if (!ownsLifecycle(lifecycleToken)) return undefined;
      updateActionState({ pendingRun: undefined });
      await runtimeProjection.convergeStoppedSession();
      return stopped;
    } catch (cause) {
      if (ownsLifecycle(lifecycleToken)) updateActionState({ error: messageOf(cause) });
      throw cause;
    } finally {
      releaseLifecycle(lifecycleToken);
    }
  }

  async function startPanel(panelId:string,inputOverrides:Record<string,unknown> = {}) {
    if (!visibleExperiment || !startPanelWorkflow) {
      throw new Error('Panel Run orchestration is unavailable.');
    }
    if (!runMode) throw new Error('Select an Experiment run mode before running a Panel.');
    if (stopAllInFlight) throw new Error('The Experiment is stopping.');
    const started = await startOwnedWorkflow(() => startPanelWorkflow(
      executionTargetId,visibleExperiment,runMode,panelId,inputOverrides,
    ));
    if (!started) throw new Error('Another Experiment lifecycle action is already in progress.');
    return started;
  }

  async function invokePanelAction(
    panelId:string,presetId:string,inputOverrides:Record<string,unknown>,reason?:string,
  ) {
    if (!visibleExperiment || !invokePanelActionWorkflow) {
      throw new Error('Panel Action orchestration is unavailable.');
    }
    if (!runMode) throw new Error('Select an Experiment run mode before invoking Panel Actions.');
    if (stopAllInFlight) throw new Error('The Experiment is stopping.');
    const submit = () => invokePanelActionWorkflow(
      executionTargetId,visibleExperiment,runMode,panelId,presetId,inputOverrides,reason,
    );
    // Discrete Panel Actions (remote intent) must not take the Total Run
    // lifecycle lock or refresh Experiment history on every click. That path
    // is for starting a Session, not for a latched joystick.
    if (runtimeProjection.sessionActive || projectedRuns.length > 0) {
      const invoked = await submit();
      if (!invoked) throw new Error('Panel Action orchestration is unavailable.');
      if (controller.current.epoch === epoch) submittedActions.current.ids.add(invoked.id);
      updateActionState({ error:'' });
      return invoked;
    }
    const invoked = await startOwnedWorkflow(submit);
    if (!invoked) throw new Error('Another Experiment lifecycle action is already in progress.');
    if (controller.current.epoch === epoch) submittedActions.current.ids.add(invoked.id);
    return invoked;
  }

  async function stopPanelAction(root:AutomationRunControl,reason:string) {
    if (!stopPanelActionWorkflow) throw new Error('Panel Action Stop is unavailable.');
    try {
      const stopped = await stopPanelActionWorkflow(executionTargetId,root,reason);
      await runtimeProjection.refresh();
      return stopped;
    } catch (cause) {
      updateActionState({ error:messageOf(cause) });
      throw cause;
    }
  }


  function acquireLifecycle(kind: DashboardLifecycleKind,options: { preempt?: boolean } = {}) {
    if (!controller.current.mounted || controller.current.epoch !== epoch) return undefined;
    const held = controller.current.lifecycle;
    if (held && !(options.preempt && kind === 'stop' && held.kind !== 'stop')) return undefined;
    const token = Symbol('experiment-workflow-lifecycle');
    controller.current.lifecycle = { token,kind };
    updateActionState({ lifecycle: { token,kind },error: '' });
    return token;
  }

  function releaseLifecycle(token: symbol) {
    if (!ownsLifecycle(token)) return;
    controller.current.lifecycle = undefined;
    updateActionState({ lifecycle: undefined });
  }

  function ownsLifecycle(token: symbol) {
    return controller.current.mounted
      && controller.current.epoch === epoch
      && controller.current.lifecycle?.token === token;
  }

  function startDisabledReason() {
    if (!visibleExperiment) return 'The current Experiment is unavailable.';
    if (experimentAdmissionDisabledReason) return experimentAdmissionDisabledReason;
    if (!runMode) return 'Select an Experiment run mode.';
    if (runtimeProjection.stateLoading) return 'The Experiment state is being restored.';
    if (runtimeProjection.stateError) {
      return `The Experiment state is unavailable: ${runtimeProjection.stateError}`;
    }
    if (runtimeProjection.loading) return 'The Experiment is still loading.';
    if (stopAllInFlight || activeRun?.status === 'stopping') return 'The Experiment is stopping.';
    if (startInFlight || projectedRuns.some((run) => run.actionId === SYSTEM_EXPERIMENT_RUNNER.actions.run)) {
      return 'The full Experiment Run is already active.';
    }
    return '';
  }

  return {
    experimentIsRunning,
    activeRun,
    activeRuns,
    sessionViews:runtimeProjection.sessionViews ?? [],
    runDetailsById:runtimeProjection.runDetailsById ?? {},
    runMode,
    stopAllInFlight,
    startInFlight,
    lifecycleStateLoading,
    actionError: actionState.error,
    startDisabledReason: startDisabledReason(),
    canStartExperiment: !startDisabledReason(),
    canStopExperiment: (experimentIsRunning || startInFlight) && !stopAllInFlight,
    updateRobotBindings: robotBindingActions.update,
    updateRobotBindingsDisabledReason: robotBindingActions.disabledReason,
    updateLocalizationOffset: robotBindingActions.updateLocalizationOffset,
    updateLocalizationOffsetDisabledReason: robotBindingActions.localizationOffsetDisabledReason,
    updateWorkflowPresetInputs: workflowPresetActions.updatePresetInputs,
    updateWorkflowPresetInputsDisabledReason: workflowPresetActions.disabledReason,
    startExperiment,
    stopExperiment,
    startPanel,
    invokePanelAction,
    stopPanelAction,
  };
}
