import { useEffect,useState } from 'react';
import { Button,Drawer,EmptyState,StatusText } from '@xgc2/ui-react';
import { InputControl } from '../../components/controls/TextControls';
import { FormField } from '../../components/FormPrimitives';
import { cancelAutomationRun,isAutomationRunActive,type AutomationRun } from '../../domains/automation/automationPublic';
import { useManagedHosts } from '../../domains/managedHost/managedHostPublic';
import {
  panelAutomationRuntime,
  useDashboardRunSelection,
  usePanelExecutionObserver,
} from '../../domains/experiment/experimentPublic';
import {
  applyExperimentRadio,
  createExperimentEnvironment,
  environmentInstanceConnected,
  environmentInstanceWithLiveHost,
  environmentProfileLabel,
  experimentEnvironmentIdentity,
  experimentProcessRuntimeProjection,
  getExperimentEnvironmentOptions,
  availableWorldImage,
  listExperimentEnvironments,
  startContainerLifecycle,
  type ContainerLifecycleAction,
  type EnvironmentRadioState,
  type ExperimentEnvironment,
  type ExperimentEnvironmentOptions,
  type RadioSettings,
} from '../../domains/experiment/experimentPublic';
import { usePanelExecutionRunDetail } from '../panelExecutionObserver';
import { HostFilesWorkspace,HostSettingsPanel } from '../../domains/host/hostPublic';
import {
  defineTerminalComposition,
  TerminalLocalShellLeaf,
  TerminalPage,
} from '../../domains/terminal/terminalPublic';
import type { PanelPluginProps } from '../types';
import { useExperimentText } from '../../domains/experiment/experimentPublic';
import { useExperimentEnvironmentFrame } from './experimentEnvironmentFrameContext';
import './experimentEnvironmentPanel.css';

const agentTerminal = defineTerminalComposition({ LocalShell: TerminalLocalShellLeaf });
/** Embedded panel has no Terminal tabs; keep a stable no-op for TerminalPage. */
const ignoreTerminalTabChange = () => undefined;

type EnvironmentInstanceView = ExperimentEnvironment['instances'][number];

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Backend phase enum is prepared / powered / off / closed; never show it raw. */
function environmentPhaseWord(phase: string) {
  switch (phase) {
    case 'prepared': return 'Prepared';
    case 'powered': return 'Powered';
    case 'off': return 'Powered off';
    default: return 'unknown';
  }
}

/** Core derives each robot's radio state from its receipt; no receipt yet reads as not applied. */
function radioStateText(state: EnvironmentRadioState | undefined) {
  switch (state) {
    case 'applied': return 'Applied';
    case 'failed': return 'Apply failed';
    default: return 'Not applied';
  }
}

/**
 * One readable state per row; the raw enrollment/connectivity triple stays in Details.
 * A container Docker reports missing or stopped says so; a running or unobserved
 * one reads from its Agent's connection.
 */
function environmentInstanceStateText(instance: EnvironmentInstanceView) {
  if (instance.role === 'centralized') return '';
  switch (instance.containerState) {
    case 'absent': return 'Container not created';
    case 'created':
    case 'exited':
    case 'dead': return 'Container stopped';
    default: return environmentInstanceConnected(instance) ? 'Agent connected' : 'Agent disconnected';
  }
}

function environmentInstanceName(
  instance: EnvironmentInstanceView,
  t: (text: string) => string,
) {
  if (instance.role === 'world') return t('Simulation world');
  const label = instance.displayName.trim();
  const name = label.includes('/') ? label.slice(label.lastIndexOf('/') + 1).trim() : label;
  return name || instance.slotId || instance.agentId;
}

export function ExperimentEnvironmentPanel({
  panel,
  context,
}: PanelPluginProps<readonly ['experiment']>) {
  const frame = useExperimentEnvironmentFrame();
  const t = useExperimentText();
  const identity = experimentEnvironmentIdentity(context.ports.data.robots?.value);
  const runtime = experimentProcessRuntimeProjection(context.ports.data['robot-runtime']?.value);
  const targetId = context.executionTargetId || runtime?.targetId || 'local';
  const liveHosts = useManagedHosts();
  const sharedRuntime = useDashboardRunSelection((snapshot) => {
    const runtime = panelAutomationRuntime(snapshot, targetId, 'dashboard');
    return {
      loadRunDetail: runtime.loadRunDetail,
      retainRunDetail: runtime.retainRunDetail,
      retainRunObservation: runtime.retainRunObservation,
    };
  });
  const execution = usePanelExecutionObserver(targetId, 'dashboard', sharedRuntime);
  const [environment,setEnvironment] = useState<ExperimentEnvironment | null>(null);
  const [listReady,setListReady] = useState(false);
  const [options,setOptions] = useState<ExperimentEnvironmentOptions | null>(null);
  const [selectedAgentId,setSelectedAgentId] = useState('');
  const [lifecycleRun,setLifecycleRun] = useState<Pick<AutomationRun,'id' | 'status' | 'revision'> | null>(null);
  const observedDetail = usePanelExecutionRunDetail(execution, lifecycleRun?.id ?? '');
  const observedRun = observedDetail?.run && observedDetail.run.id === lifecycleRun?.id
    && observedDetail.run.revision >= lifecycleRun.revision ? observedDetail.run : undefined;
  const lifecycleView = observedRun ?? lifecycleRun;
  const [radioDraft,setRadioDraft] = useState<{ base: string;value: RadioSettings } | null>(null);
  const [agentSettingsOpen,setAgentSettingsOpen] = useState(false);
  const [error,setError] = useState('');
  const visibleInstances = (environment?.instances ?? [])
    .map((instance) => environmentInstanceWithLiveHost(instance, liveHosts));
  const selected = visibleInstances.find((instance) => instance.agentId === selectedAgentId)
    ?? visibleInstances[0];
  const selectedState = selected ? environmentInstanceStateText(selected) : listReady && !environment ? 'Environment not prepared' : '';
  const selectedName = selected ? environmentInstanceName(selected, t) : '';
  const toolsOpen = Boolean(selected && selected.role !== 'centralized' && environmentInstanceConnected(selected));

  useEffect(() => {
    const experimentId = identity?.resourceId ?? '';
    if (!experimentId) return;
    let cancelled = false;
    setListReady(false);
    setEnvironment(null);
    setLifecycleRun(null);
    setOptions(null);
    listExperimentEnvironments(experimentId).then((views) => {
      if (cancelled) return;
      setEnvironment(views.find((view) => view.phase !== 'closed') ?? null);
      setError('');
      setListReady(true);
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(messageOf(cause));
        setListReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [identity?.resourceId]);

  useEffect(() => {
    const experimentId = identity?.resourceId ?? '';
    if (!listReady || environment || !experimentId) return;
    let cancelled = false;
    setOptions(null);
    getExperimentEnvironmentOptions(experimentId, runtime?.selectedPlacement).then((value) => {
      if (!cancelled) setOptions(value);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(messageOf(cause));
    });
    return () => { cancelled = true; };
  }, [environment,identity?.resourceId,listReady,runtime?.selectedPlacement]);

  const retainLifecycleRun = execution.retainRunObservation;
  useEffect(() => {
    if (!lifecycleRun?.id) return;
    return retainLifecycleRun(lifecycleRun.id);
  }, [lifecycleRun?.id,retainLifecycleRun]);

  const lifecycleRunId = lifecycleView?.id;
  const lifecycleStatus = lifecycleView?.status;
  useEffect(() => {
    const experimentId = identity?.resourceId ?? '';
    if (!lifecycleRunId || !lifecycleStatus || !experimentId || isAutomationRunActive({ status: lifecycleStatus })) return;
    let cancelled = false;
    listExperimentEnvironments(experimentId).then((views) => {
      if (cancelled) return;
      setEnvironment(views.find((view) => view.phase !== 'closed') ?? null);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(messageOf(cause));
    });
    return () => { cancelled = true; };
  }, [identity?.resourceId,lifecycleRunId,lifecycleStatus]);

  async function startLifecycleRun(start: () => Promise<AutomationRun>) {
    if (!experimentId || !generationId || lifecycleBusy) return;
    try {
      const run = await start();
      setLifecycleRun(run);
      setError('');
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function startLifecycle(action: ContainerLifecycleAction, slotIds?: string[]) {
    return startLifecycleRun(() => startContainerLifecycle(targetId, action, experimentId, generationId, slotIds));
  }

  /** Apply is a Run that stores and then shapes; a stored value alone is never "applied". */
  function applyRadio(settings: RadioSettings, slotIds?: string[]) {
    return startLifecycleRun(() => applyExperimentRadio(targetId, experimentId, generationId, settings, slotIds));
  }

  async function cancelLifecycle() {
    if (!lifecycleView) return;
    try {
      const run = await cancelAutomationRun(targetId, lifecycleView, 'Cancel container lifecycle');
      setLifecycleRun(run);
      setError('');
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function run(action: () => Promise<ExperimentEnvironment>) {
    try {
      setEnvironment(await action());
      setError('');
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const experimentId = identity?.resourceId ?? '';
  const generationId = environment?.generationId ?? '';
  const worldImage = availableWorldImage(options?.worldImage);
  const lifecycleBusy = Boolean(lifecycleView && isAutomationRunActive(lifecycleView));
  const prepareSlots = options?.slots ?? [];
  const selectedPlacement = runtime?.selectedPlacement;
  const profiles = options?.profiles ?? [];
  const perRobotSlotsReady = selectedPlacement !== 'per-robot' || (
    prepareSlots.length > 0 && prepareSlots.every((slot) => slot.imageReady)
  );
  // Only a simulator that hosts a world in the environment needs the world image.
  const worldRequired = options?.worldRequired !== false;
  const prepareReady = (!worldRequired || worldImage !== '') && prepareSlots.length > 0 && perRobotSlotsReady;
  const showPrepare = listReady && !environment && options !== null;
  const displayError = error || environment?.radioImpairment?.applyError || '';
  const selectedId = selected ? selected.slotId || selected.agentId : '';
  const storedRadio = environment?.radioImpairment;
  const radioSettings: RadioSettings = {
    delayMs: storedRadio?.delayMs ?? 0,
    lossPercent: storedRadio?.lossPercent ?? 0,
    reorderPercent: storedRadio?.reorderPercent ?? 0,
  };
  // The inputs start from the stored settings, so opening the page and pressing
  // Apply keeps them. An edit is a draft of those settings and is dropped once
  // they change, such as when an Apply Run stores new ones.
  const radioBase = `${generationId}:${radioSettings.delayMs}:${radioSettings.lossPercent}:${radioSettings.reorderPercent}`;
  const radioInputs = radioDraft?.base === radioBase ? radioDraft.value : radioSettings;
  const editRadio = (change: Partial<RadioSettings>) => setRadioDraft({ base: radioBase,value: { ...radioInputs,...change } });
  const radioRobots = visibleInstances.filter((instance) => instance.role === 'slot');
  const radioStatus = storedRadio?.applied
    ? `${storedRadio.delayMs} ms · ${storedRadio.lossPercent}% · ${storedRadio.reorderPercent}%`
    : t(radioRobots.some((instance) => instance.radio === 'failed') ? 'Apply failed' : 'Not applied');
  const lifecycleActions: { action: ContainerLifecycleAction;label: string }[] = [
    { action: 'power',label: t('Power environment') },
    { action: 'off',label: t('Power off environment') },
    { action: 'close',label: t('Close') },
    { action: 'rebuild',label: t('Rebuild environment') },
  ];
  // One container's actions leave the networks, the world, and the other
  // robots alone. A centralized robot has no container of its own.
  const instanceActions: { action: ContainerLifecycleAction;label: string }[] = [
    { action: 'power',label: t('Start container') },
    { action: 'off',label: t('Stop container') },
    { action: 'rebuild',label: t('Rebuild container') },
  ];
  const selectedContainer = selected && selected.role !== 'centralized' && selected.slotId ? selected : undefined;
  const toolsTitle = frame.view === 'files' ? t('Environment files')
    : frame.view === 'terminal' ? t('Environment terminal') : t('Environment network');

  return (
    <div className="experiment-environment-panel" data-xgc-role="experiment-environment" data-xgc-id={panel.id}>
      {environment ? frame.view === 'network' ? (
          <div className="experiment-environment-network" data-xgc-role="experiment-environment-radio" data-xgc-id={panel.id}>
            <span className="experiment-environment-disclosure-status" data-xgc-role="experiment-environment-radio-status" data-xgc-id={panel.id}>{radioStatus}</span>
            <div className="experiment-environment-radio-body">
              <FormField label={t('Radio delay')} htmlFor={`experiment-environment-radio-delay-${panel.id}`}>
                <InputControl id={`experiment-environment-radio-delay-${panel.id}`} aria-label={t('Radio delay')} unit="ms" dataXgcRole="experiment-environment-radio-field" dataXgcId="delay" value={String(radioInputs.delayMs)} onChange={(value) => editRadio({ delayMs: Number(value) || 0 })} />
              </FormField>
              <FormField label={t('Radio loss')} htmlFor={`experiment-environment-radio-loss-${panel.id}`}>
                <InputControl id={`experiment-environment-radio-loss-${panel.id}`} aria-label={t('Radio loss')} unit="%" dataXgcRole="experiment-environment-radio-field" dataXgcId="loss" value={String(radioInputs.lossPercent)} onChange={(value) => editRadio({ lossPercent: Number(value) || 0 })} />
              </FormField>
              <FormField label={t('Radio reorder')} htmlFor={`experiment-environment-radio-reorder-${panel.id}`}>
                <InputControl id={`experiment-environment-radio-reorder-${panel.id}`} aria-label={t('Radio reorder')} unit="%" dataXgcRole="experiment-environment-radio-field" dataXgcId="reorder" value={String(radioInputs.reorderPercent)} onChange={(value) => editRadio({ reorderPercent: Number(value) || 0 })} />
              </FormField>
              <Button
                uiSize="compact"
                data-xgc-role="experiment-environment-radio-apply"
                data-xgc-id={panel.id}
                disabled={lifecycleBusy}
                onClick={() => void applyRadio(radioInputs)}
              >
                {t('Apply radio impairment')}
              </Button>
              {lifecycleView ? (
                <span data-xgc-role="experiment-environment-radio-run" data-xgc-id={lifecycleView.id} data-xgc-status={lifecycleView.status}>
                  {t(lifecycleView.status)}
                </span>
              ) : null}
            </div>
            {environment.phase === 'powered' ? null : (
              <span className="experiment-environment-disclosure-status" data-xgc-role="experiment-environment-radio-pending" data-xgc-id={panel.id}>
                {t('Power the environment to apply these settings to its robots.')}
              </span>
            )}
            {radioRobots.length ? (
              <ul className="experiment-environment-radio-results" data-xgc-role="experiment-environment-radio-results" data-xgc-id={panel.id}>
                {radioRobots.map((instance) => (
                  <li
                    key={instance.slotId}
                    className="experiment-environment-radio-result"
                    data-xgc-role="experiment-environment-radio-result"
                    data-xgc-id={instance.slotId}
                    data-xgc-state={instance.radio ?? 'pending'}
                  >
                    <span className="experiment-environment-instance-name">{environmentInstanceName(instance, t)}</span>
                    <span className="experiment-environment-instance-state">{t(radioStateText(instance.radio))}</span>
                    {instance.radio === 'failed' ? (
                      <Button
                        appearance="ghost"
                        uiSize="compact"
                        data-xgc-role="experiment-environment-radio-retry"
                        data-xgc-id={instance.slotId}
                        disabled={lifecycleBusy}
                        onClick={() => void applyRadio(radioSettings, [instance.slotId])}
                      >
                        {t('Apply again')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
      ) : (
          <div className="experiment-environment-body">
            <div
              className="experiment-environment-instances"
              data-xgc-role="experiment-environment-instances"
              data-xgc-id={panel.id}
              data-xgc-connected={environment.connected ? 'true' : 'false'}
            >
              {visibleInstances.map((instance) => {
                const instanceId = instance.slotId || instance.agentId;
                return (
                  <button
                    key={instanceId}
                    type="button"
                    className="experiment-environment-instance"
                    data-xgc-role="experiment-environment-instance"
                    data-xgc-id={instanceId}
                    aria-pressed={instance.agentId !== '' && instance.agentId === selected?.agentId}
                    onClick={() => setSelectedAgentId(instance.agentId)}
                  >
                    <span className="experiment-environment-instance-name" data-xgc-role="experiment-environment-instance-name" data-xgc-id={instanceId}>
                      {environmentInstanceName(instance, t)}
                    </span>
                    <span className="experiment-environment-instance-state" data-xgc-role="experiment-environment-instance-state" data-xgc-id={instanceId}>
                      {t(environmentInstanceStateText(instance))}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="experiment-environment-detail-pane">
              {selected ? (
                <>
                  <div
                    className="experiment-environment-panel-tools"
                    data-xgc-role="experiment-environment-tools"
                    data-xgc-id={panel.id}
                    data-xgc-open={toolsOpen ? 'true' : 'false'}
                  >
                    {toolsOpen && frame.view === 'files' ? (
                      <HostFilesWorkspace
                        key={selected.agentId}
                        initialDirectory={selected.workspacePath}
                        targetCoreId={panel.targetCoreId}
                        managedHostId={selected.agentId}
                        executionTargetId={context.executionTargetId || runtime?.targetId || 'local'}
                        isRemoteManagedHost
                      />
                    ) : null}
                    {toolsOpen && frame.view === 'terminal' ? (
                      <TerminalPage
                        embedded
                        activeTab="terminal"
                        onTabChange={ignoreTerminalTabChange}
                        visible
                        targetCoreId={panel.targetCoreId}
                        managedHostId={selected.agentId}
                        agentLabel={selected.displayName || selected.slotId}
                        composition={agentTerminal}
                      />
                    ) : null}
                    {!toolsOpen ? (
                      <EmptyState
                        density="compact"
                        title={selected.role === 'centralized' ? t('No robot container') : t(selectedState)}
                        description={selected.role === 'centralized'
                          ? t('Choose Per robot and prepare a new environment to manage this robot.')
                          : environment.phase === 'prepared' || environment.phase === 'off'
                            ? t('Power the environment to connect to files and terminals.')
                            : t('Files and terminals become available when this Agent connects.')}
                        data-xgc-role="experiment-environment-tools-empty"
                        data-xgc-id={selectedId}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
      ) : showPrepare ? (
        <>
          <div className="experiment-environment-toolbar" data-xgc-role="experiment-environment-create" data-xgc-id={panel.id}>
            <StatusText status="unprepared" data-xgc-role="experiment-environment-phase" data-xgc-id={panel.id}>
              {t('Environment not prepared')}
            </StatusText>
            <Button
              uiSize="compact"
              data-xgc-role="experiment-environment-action"
              data-xgc-id={`${panel.id}:prepare`}
              disabled={!prepareReady}
              onClick={() => void run(() => createExperimentEnvironment(experimentId, {
                ...(selectedPlacement === 'centralized' || selectedPlacement === 'per-robot'
                  ? { placement: selectedPlacement }
                  : {}),
                slots: prepareSlots.map((slot) => ({ slotId: slot.slotId })),
              }))}
            >
              {t('Prepare')}
            </Button>
          </div>
          {frame.view === 'network' ? (
            <EmptyState density="compact" title={t('Environment network')} description={t('Prepare the environment to configure its network.')} data-xgc-role="experiment-environment-network-empty" data-xgc-id={panel.id} />
          ) : (
          <div className="experiment-environment-body">
            <div className="experiment-environment-prepare">
              {worldRequired ? (
                <div className="experiment-environment-slot" data-xgc-role="experiment-environment-world" data-xgc-id={panel.id}>
                  <span className="experiment-environment-instance-name">{t('Simulation world')}</span>
                  {options?.sceneName ? (
                    <span data-xgc-role="experiment-environment-scene" data-xgc-id={panel.id}>{options.sceneName}</span>
                  ) : null}
                  {worldImage ? null : (
                    <span data-xgc-role="experiment-environment-image-missing" data-xgc-id={panel.id}>
                      {t('no installed world image')}
                    </span>
                  )}
                </div>
              ) : null}
              {prepareSlots.map((slot) => {
                const profile = selectedPlacement === 'centralized' ? undefined : profiles.find((entry) => entry.id === slot.profile);
                return (
                  <div key={slot.slotId} className="experiment-environment-slot" data-xgc-role="experiment-environment-slot" data-xgc-id={slot.slotId}>
                    <span className="experiment-environment-instance-name" data-xgc-role="experiment-environment-robot" data-xgc-id={slot.slotId}>{slot.robotName || slot.slotId}</span>
                    {profile ? (
                      <span className="experiment-environment-instance-state" data-xgc-role="experiment-environment-profile" data-xgc-id={slot.slotId}>
                        {environmentProfileLabel(profile)}
                      </span>
                    ) : null}
                    {selectedPlacement !== 'centralized' ? <span
                      className="experiment-environment-instance-state"
                      data-xgc-role="experiment-environment-image"
                      data-xgc-id={slot.slotId}
                      data-xgc-image-ready={slot.imageReady ? 'true' : 'false'}
                    >
                      {t(slot.imageReady ? 'Image installed' : 'Image not installed')}
                    </span> : null}
                  </div>
                );
              })}
            </div>
            <div className="experiment-environment-detail-pane">
              <div className="experiment-environment-panel-tools" data-xgc-role="experiment-environment-tools" data-xgc-id={panel.id} data-xgc-open="false">
                <EmptyState
                  density="compact"
                  title={toolsTitle}
                  description={t('Prepare and power the environment to manage files and terminals.')}
                  data-xgc-role="experiment-environment-tools-empty"
                  data-xgc-id={panel.id}
                />
              </div>
            </div>
          </div>
          )}
        </>
      ) : null}
      <Drawer
        open={frame.operationsOpen}
        title={t('Environment operations')}
        onClose={() => frame.setOperationsOpen(false)}
        closeLabel={t('Close environment operations')}
        dialogProps={{ 'data-xgc-role': 'experiment-environment-operations-drawer','data-xgc-id': panel.id }}
      >
        {environment ? (
          <>
          <div className="experiment-environment-toolbar" data-xgc-role="experiment-environment-lifecycle" data-xgc-id={panel.id}>
            <StatusText status={environment.phase} data-xgc-role="experiment-environment-phase" data-xgc-id={generationId || panel.id}>
              {t(environmentPhaseWord(environment.phase))}
            </StatusText>
            {lifecycleActions.map(({ action,label }) => (
              <Button
                key={action}
                uiSize="compact"
                data-xgc-role="experiment-environment-action"
                data-xgc-id={`${panel.id}:${action}`}
                disabled={lifecycleBusy}
                onClick={() => void startLifecycle(action)}
              >
                {label}
              </Button>
            ))}
            {lifecycleView ? (
              <span data-xgc-role="experiment-environment-run" data-xgc-id={lifecycleView.id} data-xgc-status={lifecycleView.status}>
                {t(lifecycleView.status)}
              </span>
            ) : null}
            {lifecycleView && lifecycleBusy ? (
              <Button uiSize="compact" onClick={() => void cancelLifecycle()}>{t('Cancel')}</Button>
            ) : null}
          </div>
            {selectedContainer ? (
              <div
                className="experiment-environment-toolbar"
                role="group"
                aria-label={selectedName}
                data-xgc-role="experiment-environment-instance-actions"
                data-xgc-id={selectedContainer.slotId}
              >
                <span className="experiment-environment-instance-name">{selectedName}</span>
                {instanceActions.map(({ action,label }) => (
                  <Button
                    key={action}
                    uiSize="compact"
                    data-xgc-role="experiment-environment-instance-action"
                    data-xgc-id={`${selectedContainer.slotId}:${action}`}
                    disabled={lifecycleBusy}
                    onClick={() => void startLifecycle(action, [selectedContainer.slotId])}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : null}
            {selected && toolsOpen ? (
              <div className="experiment-environment-agent-options">
                <Button appearance="ghost" uiSize="compact" aria-expanded={agentSettingsOpen} data-xgc-role="experiment-environment-agent-toggle" data-xgc-id={selectedId} onClick={() => setAgentSettingsOpen((open) => !open)}>
                  {selectedName} · {t('Environment agent')}
                </Button>
                {agentSettingsOpen ? (
                  <>
                    {toolsOpen && selected ? (
                      <HostSettingsPanel
                        apiTarget={{ targetCoreId: panel.targetCoreId,managedHostId: selected.agentId }}
                        actionsEnabled
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : <EmptyState density="compact" title={t('Environment not prepared')} />}
      </Drawer>
      {displayError ? <span data-xgc-role="experiment-environment-error" data-xgc-id={panel.id}>{t(displayError)}</span> : null}
    </div>
  );
}
