import { Columns3,LoaderCircle,Maximize2,Minimize2,Play,Plus,Save,Square } from 'lucide-react';
import { ControlButton } from '../../../components/controls/ControlButton';
import { SelectControl } from '../../../components/controls/SelectControl';
import { DashboardTabs } from '../../../components/DashboardTabs';
import { StatusText } from '@xgc2/ui-react';
import {
  type ExperimentDashboard,
  type ExperimentDocument,
  type ExperimentRunMode,
} from '../experimentModel';
import { useExperimentText } from '../experimentMessages';
import { experimentRobotComposition } from '../experimentRunModePresentation';
import type { ExperimentDashboardActions } from './useExperimentDashboardActions';
import type { ExperimentRunModeControl } from './useExperimentRunMode';

export type DashboardTopbarEditSession = {
  visibleExperiment?: ExperimentDocument;
  editing: boolean;
  readOnly: boolean;
  saving: boolean;
  start: () => void;
  requestExit: () => void;
};

export type DashboardTopbarNavigation = {
  items: ExperimentDashboard[];
  selected: ExperimentDashboard;
  select: (id: string) => void;
  rename: (id: string, name: string) => void;
  requestDelete: (id: string) => void;
  create: () => void;
  reorder: (orderedIds: string[]) => void;
};

export type DashboardTopbarPanelActions = {
  openLibrary: () => void;
};

export function ExperimentDashboardTopbar({
  session,
  dashboards,
  panels,
  actions,
  runMode: runModeControl,
  gcsMode,
  onGcsModeChange,
}: {
  session: DashboardTopbarEditSession;
  dashboards: DashboardTopbarNavigation;
  panels: DashboardTopbarPanelActions;
  actions: ExperimentDashboardActions;
  runMode: ExperimentRunModeControl;
  gcsMode: boolean;
  onGcsModeChange: (next: boolean | ((current: boolean) => boolean)) => void;
}) {
  const t = useExperimentText();
  const experimentId = session.visibleExperiment?.head.resourceId ?? '';
  // The Experiment-sourced System Runner owns its frozen run mode until terminal.
  const runModes = runModeControl.options;
  const runMode = runModeControl.value;
  const experimentStructureLocked = actions.experimentIsRunning
    || Boolean(actions.activeRun)
    || actions.startInFlight
    || actions.stopAllInFlight;
  // Session occupancy bridges the hand-off from the optimistic Start state to
  // the hydrated Automation Run. Keep the mode frozen across that projection
  // gap instead of briefly enabling the selector between the two snapshots.
  const runModeDisabled = runModeControl.locked || experimentStructureLocked
    || session.editing || !experimentId;
  // A native Run freezes its mode. If the Experiment no longer
  // declares that label, showing the first declared option instead would claim
  // declares it, name the actual frozen value and mark it.
  const runModeUndeclared = Boolean(runMode)
    && !(runModes as readonly string[]).includes(runMode);
  const runModeTitle = runModeUndeclared
    ? t('This Experiment Run is frozen in run mode {mode}, which this Experiment no longer declares.', {
      mode: `"${runMode}"`,
    })
    : undefined;
  const robotComposition = experimentRobotComposition(
    runMode,
    session.visibleExperiment?.spec.robots ?? [],
  );
  const mixedCompositionTitle = robotComposition === 'mixed'
    ? t('Hybrid Experiment Run: each robot uses its frozen simulation or physical source partition.')
    : undefined;

  const canManageDashboards = Boolean(session.visibleExperiment)
    && !session.readOnly
    && !experimentStructureLocked;
  // Dashboard structure is mutable only inside the explicit edit draft.
  const tabsReadOnly = !canManageDashboards || gcsMode || !session.editing;
  const showCreateDashboard = canManageDashboards && session.editing && !gcsMode;
  const dashboardEditDisabledReason = session.saving
    ? t('Saving')
    : !session.visibleExperiment
      ? t('The current Experiment is unavailable.')
      : session.readOnly
        ? t('This Experiment is read only.')
        : experimentStructureLocked
          ? t('Dashboard editing is unavailable while the Experiment is running.')
          : '';

  const toggleDashboardEdit = () => {
    if (dashboardEditDisabledReason) return;
    if (!session.editing) {
      if (gcsMode) onGcsModeChange(false);
      session.start();
      return;
    }
    session.requestExit();
  };

  const handleCreateDashboard = () => {
    if (!showCreateDashboard) return;
    dashboards.create();
  };

  // One control: Run only when no Experiment-owned workflow is active or being admitted.
  const showStop = actions.experimentIsRunning || actions.startInFlight || actions.stopAllInFlight;
  const restoringState = actions.lifecycleStateLoading && !showStop;
  const runStopping = actions.activeRun?.status === 'stopping' || actions.stopAllInFlight;
  const runStopDisabled = showStop
    ? !actions.canStopExperiment
    : !actions.canStartExperiment || session.editing;
  const handleRunStop = () => {
    if (showStop) void actions.stopExperiment().catch(() => undefined);
    else void actions.startExperiment().catch(() => undefined);
  };
  // A disabled Run has to name its blocker; a held panel command token used to
  // leave this control enabled and inert.
  const runStopTitle = showStop
    ? (runStopping
      ? t('The Experiment is stopping.')
      : t('Stop this Experiment Run and its owned process closure'))
    : actions.startDisabledReason.startsWith('The Experiment state is unavailable: ')
      ? t('The Experiment state is unavailable: {error}', {
        error: actions.startDisabledReason.slice('The Experiment state is unavailable: '.length),
      })
      : t(actions.startDisabledReason || 'Run this Experiment');
  const runStopLabel = t(restoringState ? 'Checking' : showStop ? 'Stop' : 'Run');

  return (
    <>
      <div className="experiment-topbar-context">
        <DashboardTabs
          dashboards={dashboards.items}
          activeDashboardId={dashboards.selected.id}
          onChange={dashboards.select}
          onRename={dashboards.rename}
          onDelete={dashboards.requestDelete}
          onCreate={handleCreateDashboard}
          onReorder={tabsReadOnly ? undefined : dashboards.reorder}
          readOnly={tabsReadOnly}
          showCreate={showCreateDashboard}
          text={t}
        />
      </div>
      <div className="topbar-actions experiment-topbar-actions" data-xgc-role="experiment-topbar-actions" data-xgc-id={experimentId || undefined}>
        <div
          className="experiment-run-mode-control"
          data-xgc-role="experiment-run-mode"
          data-xgc-id={experimentId || undefined}
          data-xgc-value={runMode || undefined}
          data-xgc-state={runModeUndeclared ? 'undeclared' : undefined}
          title={runModeTitle}
        >
          <SelectControl
            className="experiment-run-mode-select"
            compact
            fill
            value={runMode || (runModes[0] ?? '')}
            options={runModes.map((mode) => ({ value: mode,label: mode }))}
            placeholder={runModeUndeclared ? `${t('Frozen')}: ${runMode}` : undefined}
            onChange={(next) => runModeControl.select(next as ExperimentRunMode)}
            ariaLabel={t('Run mode')}
            aria-invalid={runModeUndeclared || undefined}
            dataXgcRole="experiment-run-mode-select"
            dataXgcId={experimentId || undefined}
            disabled={runModeDisabled || runModes.length === 0}
            menuAlign="end"
          />
        </div>
        {robotComposition === 'mixed' && (
          <StatusText
            status="mixed"
            data-xgc-role="experiment-run-mode-composition"
            data-xgc-id={experimentId || undefined}
            title={mixedCompositionTitle}
          >
            {t('Mixed')}
          </StatusText>
        )}
        <ControlButton
          className="experiment-topbar-command"
          tone={showStop ? 'default' : 'primary'}
          title={runStopTitle}
          aria-label={t(restoringState ? 'Checking experiment state' : showStop ? 'Stop experiment' : 'Run experiment')}
          dataXgcRole={restoringState ? 'experiment-state-loading' : showStop ? 'experiment-stop' : 'experiment-run'}
          dataXgcId={session.visibleExperiment?.head.resourceId}
          data-xgc-mode={restoringState ? 'loading' : showStop ? 'stop' : 'run'}
          aria-busy={restoringState || undefined}
          disabled={runStopDisabled}
          onClick={handleRunStop}
        >
          {restoringState ? <LoaderCircle size={14} /> : showStop ? <Square size={14} /> : <Play size={14} />}
          {runStopLabel}
        </ControlButton>
        <ControlButton
          className="experiment-topbar-command"
          dataXgcRole="experiment-gcs-mode"
          dataXgcId="global"
          tone={gcsMode ? 'primary' : 'default'}
          aria-pressed={gcsMode}
          disabled={session.editing || session.saving}
          onClick={() => onGcsModeChange((current) => !current)}
        >{gcsMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}GCS</ControlButton>
        <ControlButton
          className="experiment-topbar-command"
          dataXgcRole="experiment-dashboard-edit"
          dataXgcId={dashboards.selected.id}
          tone={session.editing ? 'primary' : 'default'}
          disabled={Boolean(dashboardEditDisabledReason)}
          title={dashboardEditDisabledReason || t(session.editing ? 'Exit edit' : 'Edit')}
          aria-label={t(session.editing ? (session.saving ? 'Saving' : 'Exit edit') : 'Edit')}
          aria-pressed={session.editing}
          onClick={toggleDashboardEdit}
        >
          {session.editing ? <Save size={15} /> : <Columns3 size={15} />}
          {t('Edit')}
        </ControlButton>
        {session.editing && !session.readOnly && !experimentStructureLocked
          && <ControlButton onClick={panels.openLibrary} dataXgcRole="dashboard-panel-library" dataXgcId="dashboard-panel-library"><Plus size={15} />{t('Panel library')}</ControlButton>}
      </div>
    </>
  );
}
