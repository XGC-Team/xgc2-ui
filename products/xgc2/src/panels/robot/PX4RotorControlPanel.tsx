import { Activity,ArrowLeftRight,Lock,LockOpen,OctagonX,RotateCcw,type LucideIcon } from 'lucide-react';
import { useState,type ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { WorkflowStatusCard } from '../../components/WorkflowStatusCard';
import {
  isAutomationExecutionRunActive,
  isFailedWorkflowRunStatus,
} from '../../domains/automation/automationPublic';
import {
  experimentSessionIsRunning,
  useExperimentStationOccupancy,
  type ExperimentDocument,
} from '../../domains/experiment/experimentPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import {
  ensureOperatorControlSession,
  OperatorControlSessionNotice,
  useOperatorControlSession,
} from '../../domains/operatorAccess/operatorAccessPublic';
import { postUgvChassisHold,useRobotSelection,useRobotText,useUgvChassisHold } from '../../domains/robot/robotPublic';
import { workflowTileProgress } from '../../shared/measuredReadyProgress';
import { panelDashboardId } from '../../shared/panelDashboard';
import type { PanelActionInvocation,PanelActionPortRuntime,PanelPluginProps } from '../types';
import {
  PX4_SET_MODE_DEFAULT,
  PX4_SET_MODE_OPTIONS,
  PX4_SET_MODE_SHORTCUTS,
  px4RotorControlActions,
  type PX4SetModeOption,
} from './px4RotorControlPanelModel';
import { PREFLIGHT_ARM_TEST_WORKFLOW_SLOT } from './preflightStatusPanelModel';
import { useRobotControlFrame } from './robotPanelFrameContext';
import { PreflightArmTestDialog } from './PreflightArmTestDialog';
import { RobotRemoteControlManager } from './RobotRemoteControlManager';

export const PX4_ROTOR_CONTROL_PANEL_ITEM_COUNT = 4;

const PX4_ACTION_ICONS = {
  'set-flight-mode': ArrowLeftRight,
  arm: LockOpen,
  disarm: Lock,
  'force-disarm': OctagonX,
  'reboot-autopilot': RotateCcw,
  'preflight-arm-test': Activity,
} as const satisfies Record<string, LucideIcon>;

function px4ActionTitle(kind: keyof typeof PX4_ACTION_ICONS, label: string): ReactNode {
  const Icon = PX4_ACTION_ICONS[kind];
  return <span className="robot-px4-action-title">
    <Icon className="robot-px4-action-icon" aria-hidden="true" />
    {label}
  </span>;
}

export function PX4RotorControlPanel({ panel,context }: PanelPluginProps<readonly ['visualization','experiment','automation']>) {
  const t = useRobotText();
  const frame = useRobotControlFrame(panel.id);
  const view = frame.view;
  const experiment = experimentDocument(context.ports.data.robots?.value);
  const [selectedRobotIds] = useRobotSelection({
    experimentId:experiment?.head.resourceId,dashboardId:panelDashboardId(panel),panelId:panel.id,shared:context.sharedStateScope,
  });
  const robots = experiment?.spec.robots ?? [];
  const px4Ids = new Set(robots.filter((binding) => binding.px4 !== undefined).map((binding) => binding.id));
  const selectedPX4 = selectedRobotIds.filter((id) => px4Ids.has(id));
  const px4SelectionRefusal = selectedPX4.length === 0
    ? t('Select at least one PX4 robot in Robot instruments.')
    : '';
  const occupancy = useExperimentStationOccupancy();
  const experimentRunningRefusal = experiment
    && experimentSessionIsRunning(occupancy.sessions,experiment.head.resourceId)
    ? ''
    : t('Start the Experiment before sending robot commands.');
  const [armTest,setArmTest] = useState<{ invocation:PanelActionInvocation;robotIds:readonly string[] }>();
  const [mode,setMode] = useState<PX4SetModeOption>(PX4_SET_MODE_DEFAULT);
  const [busy,setBusy] = useState<Record<string,boolean>>({});
  const [error,setError] = useState('');
  useGroundStationErrorNotification(context.executionTargetId || 'local',error,{
    title:t('Robot control'),source:panel.id,dedupeKey:`${panel.id}:action-error`,
  });
  // Motion-enabling commands verify the operator session first. Safety stops
  // (disarm, kill, chassis hold) are never delayed by it.
  const controlSession = useOperatorControlSession();
  const controlSessionRefusal = controlSession.phase === 'denied'
    ? t('Robot control needs a signed-in operator session on this browser.')
    : controlSession.phase === 'unavailable'
      ? t('The station could not confirm this browser; robot control is paused.')
      : '';

  async function invoke(port:PanelActionPortRuntime|undefined,id:string,inputs:Record<string,unknown>,requiresOperatorSession = false) {
    if (!port || busy[id]) return false;
    if (requiresOperatorSession && !await ensureOperatorControlSession()) {
      setError(controlSessionRefusal || t('Robot control needs a signed-in operator session on this browser.'));
      return false;
    }
    setBusy((current) => ({ ...current,[id]:true }));setError('');
    try {
      await port.invoke(inputs,`Invoke ${port.label} from Robot control`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally { setBusy((current) => ({ ...current,[id]:false })); }
  }

  function commandRefusal(port:PanelActionPortRuntime|undefined,label:string,requiresOperatorSession = false) {
    return context.disabledReason || px4SelectionRefusal || experimentRunningRefusal || port?.disabledReason
      || (requiresOperatorSession ? controlSessionRefusal : '')
      || (!port?.connected ? t('{action} is unavailable.',{ action:label }) : '')
      || (port?.activeInvocation ? t('{action} already has an active invocation.',{ action:label }) : '');
  }

  function actionCard(actionId:'arm'|'disarm'|'force-disarm'|'reboot-autopilot',title?:string) {
    const definition = px4RotorControlActions.find((candidate) => candidate.id === actionId)!;
    const port = context.ports.actions[actionId];
    const tile = experimentWorkflowTile(port,Boolean(busy[actionId]));
    const label = t(title || definition.label);
    const requiresOperatorSession = actionId === 'arm';
    const refusal = commandRefusal(port,label,requiresOperatorSession);
    const inputs:Record<string,unknown> = { robotIds:selectedPX4 };
    const kill = actionId === 'force-disarm';
    return <WorkflowStatusCard key={actionId} className="robot-px4-action-card" layout="tile" title={px4ActionTitle(actionId,label)}
      status={tile.status}
      appearance={kill ? 'solid' : 'default'}
      tone={kill ? 'danger' : 'neutral'} running={tile.active} busy={Boolean(busy[actionId])}
      metrics={{ primary: '' }}
      progress={tile.progress}
      dataXgcRole={`robot-operation-${actionId}`} dataXgcId={`${panel.id}:${actionId}`}
      runId={tile.runId} ariaLabel={label} titleAttr={refusal || t('Run {action}',{ action:label })}
      disabled={Boolean(refusal) || Boolean(busy[actionId])}
      onClick={() => void invoke(port,actionId,inputs,requiresOperatorSession)} />;
  }

  const preflight = context.ports.actions[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT];
  const preflightRefusal = preflight?.activeInvocation ? '' : commandRefusal(preflight,t('Arm test'),true);
  async function openArmTest() {
    if (!preflight || busy[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT]) return;
    if (preflight.activeInvocation) { setArmTest({ invocation:preflight.activeInvocation,robotIds:selectedPX4 });return; }
    if (!await ensureOperatorControlSession()) {
      setError(controlSessionRefusal || t('Robot control needs a signed-in operator session on this browser.'));
      return;
    }
    setBusy((current) => ({ ...current,[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT]:true }));setError('');
    try {
      const invocation = await preflight.invoke({ robotIds:selectedPX4 },'Open preflight arm test');
      setArmTest({ invocation,robotIds:[...selectedPX4] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy((current) => ({ ...current,[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT]:false })); }
  }

  const setModePort = context.ports.actions['set-flight-mode'];
  const setModeTile = experimentWorkflowTile(setModePort,Boolean(busy['set-flight-mode']));
  const setModePickerRefusal = context.disabledReason || px4SelectionRefusal || setModePort?.disabledReason
    || (!setModePort?.connected ? t('Set mode is unavailable.') : '')
    || (setModePort?.activeInvocation ? t('Set mode already has an active invocation.') : '')
    || (busy['set-flight-mode'] ? t('Set mode is already starting.') : '');
  const setModeApplyRefusal = commandRefusal(setModePort,t('Set mode'),true)
    || (busy['set-flight-mode'] ? t('Set mode is already starting.') : '');
  const armTestTile = experimentWorkflowTile(preflight,Boolean(busy[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT]));
  const armTestCard = (
    <WorkflowStatusCard className="robot-px4-action-card robot-px4-arm-test" layout="tile"
      title={px4ActionTitle('preflight-arm-test',t('Arm test'))}
      status={armTestTile.status}
      tone="neutral" running={armTestTile.active}
      busy={Boolean(busy[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT])}
      metrics={{ primary: '' }}
      progress={armTestTile.progress}
      dataXgcRole="robot-operation-arm-test" dataXgcId={panel.id}
      runId={armTestTile.runId}
      ariaLabel={t('Arm test')}
      disabled={Boolean(preflightRefusal) || Boolean(busy[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT])}
      titleAttr={preflightRefusal || t('Run preflight arm test')}
      onClick={() => void openArmTest()} />
  );

  return <>
    {view === 'ground' ? (
      <UgvEmergencyStopView panel={panel} context={context} experiment={experiment} />
    ) : (
      <div className="robot-control-panel robot-px4-control-panel" data-xgc-role="px4-multirotor-control" data-xgc-id={panel.id}>
        <OperatorControlSessionNotice />
        <div className="robot-px4-operator-layout">
          <div className="robot-px4-mode-group" data-xgc-role="px4-set-mode" data-xgc-id={panel.id}>
            <div className="robot-px4-mode-select" title={setModePickerRefusal || undefined}>
              <SelectControl
                fill
                value={mode}
                options={PX4_SET_MODE_OPTIONS.map((option) => ({ value: option,label: option }))}
                onChange={(next) => setMode(next as PX4SetModeOption)}
                ariaLabel={t('Flight mode')}
                dataXgcRole="px4-set-mode-select"
                dataXgcId={panel.id}
                disabled={Boolean(setModePickerRefusal)}
              />
            </div>
            <WorkflowStatusCard
              className="robot-px4-action-card robot-px4-mode-apply"
              layout="tile"
              title={px4ActionTitle('set-flight-mode',t('Set mode'))}
              status={setModeTile.status}
              tone="neutral"
              running={setModeTile.active}
              busy={Boolean(busy['set-flight-mode'])}
              metrics={{ primary: '' }}
              progress={setModeTile.progress}
              dataXgcRole="px4-set-mode-apply"
              dataXgcId={panel.id}
              runId={setModeTile.runId}
              ariaLabel={t('Set mode')}
              disabled={Boolean(setModeApplyRefusal) || Boolean(busy['set-flight-mode'])}
              titleAttr={setModeApplyRefusal || t('Set mode to {mode}',{ mode })}
              onClick={() => void invoke(setModePort,'set-flight-mode',{ robotIds:selectedPX4,mode },true)}
            />
            {armTestCard}
            <div className="robot-px4-mode-shortcuts" data-xgc-role="px4-mode-shortcuts" data-xgc-id={panel.id}>
              {PX4_SET_MODE_SHORTCUTS.map((shortcut) => (
                <ControlButton
                  key={shortcut.id}
                  size="compact"
                  appearance="ghost"
                  dataXgcRole="px4-set-mode-shortcut"
                  dataXgcId={`${panel.id}:${shortcut.mode}`}
                  aria-pressed={mode === shortcut.mode}
                  aria-description={setModePickerRefusal || undefined}
                  disabled={Boolean(setModePickerRefusal)}
                  title={setModePickerRefusal || t('Select {mode} in the flight-mode list',{ mode:shortcut.mode })}
                  onClick={() => setMode(shortcut.mode)}
                >{t(shortcut.label)}</ControlButton>
              ))}
            </div>
          </div>
          <div className="robot-px4-action-grid" data-xgc-role="px4-action-grid" data-xgc-id={panel.id} data-xgc-columns="4">
            {actionCard('arm')}{actionCard('disarm')}{actionCard('reboot-autopilot','Reboot')}{actionCard('force-disarm','Kill')}
          </div>
        </div>
      </div>
    )}
    {armTest && preflight?.execution && <PreflightArmTestDialog targetId={context.executionTargetId || 'local'} automation={preflight.execution}
      port={preflight} invocation={armTest.invocation} robotIds={armTest.robotIds} onClose={() => setArmTest(undefined)} />}
    <RobotRemoteControlManager panel={panel} context={context} />
  </>;
}

function UgvEmergencyStopView({
  panel,context,experiment,
}: {
  panel: PanelPluginProps<readonly ['visualization','experiment','automation']>['panel'];
  context: PanelPluginProps<readonly ['visualization','experiment','automation']>['context'];
  experiment: ExperimentDocument|undefined;
}) {
  const t = useRobotText();
  const [held,setHeld] = useUgvChassisHold({
    experimentId:experiment?.head.resourceId,dashboardId:panelDashboardId(panel),panelId:panel.id,shared:context.sharedStateScope,
  });
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useGroundStationErrorNotification(context.executionTargetId || 'local',error,{
    title:t('Robot control'),source:`${panel.id}:ugv-estop`,dedupeKey:`${panel.id}:ugv-estop`,
  });
  // Engaging the hold stops robots and is never delayed; releasing it resumes
  // live cmd_vel, so that direction verifies the operator session first.
  const controlSession = useOperatorControlSession();
  const controlSessionRefusal = controlSession.phase === 'denied'
    ? t('Robot control needs a signed-in operator session on this browser.')
    : controlSession.phase === 'unavailable'
      ? t('The station could not confirm this browser; robot control is paused.')
      : '';
  const refusal = context.disabledReason || (!experiment ? t('E-stop is unavailable.') : '')
    || (held ? controlSessionRefusal : '')
    || (busy ? t('{action} already has an active invocation.',{ action:t('E-stop') }) : '');
  const title = held
    ? t('Release chassis hold and resume live cmd_vel.')
    : t('Hold every connected Scout and Mecanum.');

  async function toggle() {
    if (refusal || !experiment) return;
    const next = !held;
    if (!next && !await ensureOperatorControlSession()) {
      setError(controlSessionRefusal || t('Robot control needs a signed-in operator session on this browser.'));
      return;
    }
    setBusy(true);setError('');
    try {
      const result = await postUgvChassisHold(context.executionTargetId || 'local',{
        experimentId:experiment.head.resourceId,held:next,
      });
      if ((result.failed ?? []).length > 0) {
        setError(t('{action} is unavailable.',{ action:t('E-stop') }));
        return;
      }
      setHeld(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return (
    <div className="robot-control-panel robot-px4-control-panel" data-xgc-role="ugv-control-view" data-xgc-id={panel.id}>
      <OperatorControlSessionNotice />
      <div className="robot-px4-operator-layout">
        <div className="robot-px4-action-grid" data-xgc-role="ugv-action-grid" data-xgc-id={panel.id} data-xgc-columns="4">
          <div className="robot-px4-estop-slot">
            <WorkflowStatusCard
              className="robot-px4-action-card"
              layout="tile"
              appearance="solid"
              pressed={held}
              title={px4ActionTitle('force-disarm', t('E-stop'))}
              status={busy ? 'running' : held ? 'held' : 'stopped'}
              tone="danger"
              running={busy}
              busy={busy}
              metrics={{ primary: '' }}
              progress={{ percent: held ? 100 : 0 }}
              dataXgcRole="ugv-chassis-hold"
              dataXgcId={panel.id}
              ariaLabel={t('E-stop')}
              titleAttr={refusal || title}
              disabled={Boolean(refusal)}
              onClick={() => void toggle()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function experimentDocument(value:unknown):ExperimentDocument|undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<ExperimentDocument>;
  return candidate.head && candidate.branch && candidate.spec ? candidate as ExperimentDocument : undefined;
}
function experimentWorkflowTile(port:PanelActionPortRuntime|undefined,busy:boolean) {
  const receipt = port?.latestInvocation;
  const active = port?.activeInvocation
    || (receipt && isAutomationExecutionRunActive(receipt) ? receipt : undefined);
  const failed = !busy && !active && Boolean(receipt && isFailedWorkflowRunStatus(receipt.status));
  return {
    active:Boolean(active),
    failed,
    status:failed ? 'failed' : busy ? (active ? 'stopping' : 'starting')
      : active ? (port?.serviceStatus?.state || active.status) : 'stopped',
    runId:active?.id ?? (failed ? receipt?.id : undefined),
    progress:workflowTileProgress({
      active:Boolean(active),
      busy,
      failed,
      occupancy:port?.serviceStatus,
    }),
  };
}
