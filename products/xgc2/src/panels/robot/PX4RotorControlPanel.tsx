import { Activity,ArrowLeftRight,Lock,LockOpen,OctagonX,RotateCcw,type LucideIcon } from 'lucide-react';
import { useState,type ReactNode } from 'react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import { WorkflowStatusCard } from '../../components/WorkflowStatusCard';
import {
  isAutomationExecutionRunActive,
  isFailedWorkflowRunStatus,
} from '../../domains/automation/automationPublic';
import type { ExperimentDocument } from '../../domains/experiment/experimentPublic';
import { useGroundStationErrorNotification } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { postUgvChassisHold,useRobotSelection,useRobotText,useUgvChassisHold } from '../../domains/robot/robotPublic';
import { workflowTileProgress } from '../../shared/measuredReadyProgress';
import { panelDashboardId } from '../../shared/panelDashboard';
import type { PanelActionPortRuntime,PanelPluginProps } from '../types';
import {
  PX4_SET_MODE_DEFAULT,
  PX4_SET_MODE_OPTIONS,
  PX4_SET_MODE_SHORTCUTS,
  px4RotorControlActions,
  type PX4SetModeOption,
} from './px4RotorControlPanelModel';
import { PREFLIGHT_ARM_TEST_WORKFLOW_SLOT } from './preflightStatusPanelModel';
import { useRobotControlFrame } from './robotPanelFrameContext';
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
  const [mode,setMode] = useState<PX4SetModeOption>(PX4_SET_MODE_DEFAULT);
  const [busy,setBusy] = useState<Record<string,boolean>>({});
  const [error,setError] = useState('');
  useGroundStationErrorNotification(context.executionTargetId || 'local',error,{
    title:t('Robot control'),source:panel.id,dedupeKey:`${panel.id}:action-error`,
  });

  async function invoke(port:PanelActionPortRuntime|undefined,id:string,inputs:Record<string,unknown>) {
    if (!port || busy[id]) return false;
    setBusy((current) => ({ ...current,[id]:true }));setError('');
    try {
      await port.invoke(inputs,`Invoke ${port.label} from Robot control`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally { setBusy((current) => ({ ...current,[id]:false })); }
  }

  function commandRefusal(port:PanelActionPortRuntime|undefined,label:string) {
    return context.disabledReason || px4SelectionRefusal || port?.disabledReason
      || (!port?.connected ? t('{action} is unavailable.',{ action:label }) : '')
      || (port?.activeInvocation ? t('{action} already has an active invocation.',{ action:label }) : '');
  }

  function actionCard(actionId:'arm'|'disarm'|'force-disarm'|'reboot-autopilot',title?:string) {
    const definition = px4RotorControlActions.find((candidate) => candidate.id === actionId)!;
    const port = context.ports.actions[actionId];
    const tile = experimentWorkflowTile(port,Boolean(busy[actionId]));
    const label = t(title || definition.label);
    const refusal = commandRefusal(port,label);
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
      onClick={() => void invoke(port,actionId,inputs)} />;
  }

  const preflight = context.ports.actions[PREFLIGHT_ARM_TEST_WORKFLOW_SLOT];
  const preflightRefusal = commandRefusal(preflight,t('Arm test'));

  const setModePort = context.ports.actions['set-flight-mode'];
  const setModeTile = experimentWorkflowTile(setModePort,Boolean(busy['set-flight-mode']));
  const setModeRefusal = context.disabledReason || px4SelectionRefusal || setModePort?.disabledReason
    || (!setModePort?.connected ? t('Set mode is unavailable.') : '')
    || (setModePort?.activeInvocation ? t('Set mode already has an active invocation.') : '')
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
      onClick={() => void invoke(preflight,PREFLIGHT_ARM_TEST_WORKFLOW_SLOT,{ robotIds:selectedPX4 })} />
  );

  return <>
    {view === 'ground' ? (
      <UgvEmergencyStopView panel={panel} context={context} experiment={experiment} />
    ) : (
      <div className="robot-control-panel robot-px4-control-panel" data-xgc-role="px4-multirotor-control" data-xgc-id={panel.id}>
        <div className="robot-px4-operator-layout">
          <div className="robot-px4-mode-group" data-xgc-role="px4-set-mode" data-xgc-id={panel.id}>
            <div className="robot-px4-mode-select" title={setModeRefusal || undefined}>
              <SelectControl
                fill
                value={mode}
                options={PX4_SET_MODE_OPTIONS.map((option) => ({ value: option,label: option }))}
                onChange={(next) => setMode(next as PX4SetModeOption)}
                ariaLabel={t('Flight mode')}
                dataXgcRole="px4-set-mode-select"
                dataXgcId={panel.id}
                disabled={Boolean(setModeRefusal)}
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
              disabled={Boolean(setModeRefusal) || Boolean(busy['set-flight-mode'])}
              titleAttr={setModeRefusal || t('Set mode to {mode}',{ mode })}
              onClick={() => void invoke(setModePort,'set-flight-mode',{ robotIds:selectedPX4,mode })}
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
                  aria-description={setModeRefusal || undefined}
                  disabled={Boolean(setModeRefusal)}
                  title={setModeRefusal || t('Select {mode} in the flight-mode list',{ mode:shortcut.mode })}
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
  const refusal = context.disabledReason || (!experiment ? t('E-stop is unavailable.') : '')
    || (busy ? t('{action} already has an active invocation.',{ action:t('E-stop') }) : '');
  const title = held
    ? t('Release chassis hold and resume live cmd_vel.')
    : t('Hold every connected Scout and Mecanum.');

  async function toggle() {
    if (refusal || !experiment) return;
    const next = !held;
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
