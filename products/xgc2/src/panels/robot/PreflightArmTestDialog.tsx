import { Check,Circle,LoaderCircle,Minus,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import { Modal } from '../../components/Modal';
import { ControlButton } from '../../components/controls/ControlButton';
import { isAutomationExecutionRunActive } from '../../domains/automation/automationPublic';
import { useGroundStationDecisionPresentation,useGroundStationInteractionScope } from '../../domains/groundStationInteraction/groundStationInteractionPublic';
import { useRobotText } from '../../domains/robot/robotPublic';
import type { PanelActionInvocation,PanelActionPortRuntime } from '../types';
import { usePanelExecutionRunDetail } from '../panelExecutionObserver';
import { armTestRows,preflightChildRunId,preflightPhase,preflightRoster,type ArmTestRow } from './preflightArmTestModel';

export function PreflightArmTestDialog({ targetId,automation,port,invocation,robotIds,onClose }: {
  targetId:string;automation:NonNullable<PanelActionPortRuntime['execution']>;port:PanelActionPortRuntime;
  invocation:PanelActionInvocation;robotIds:readonly string[];onClose:() => void;
}) {
  const t = useRobotText();
  const { loadRunDetail,retainRunDetail } = automation;
  const outer = usePanelExecutionRunDetail(automation,invocation.id);
  const runId = preflightChildRunId(outer);
  const detail = usePanelExecutionRunDetail(automation,runId ?? '');
  const scope = useGroundStationInteractionScope(targetId);
  useGroundStationDecisionPresentation(targetId,runId);
  const [busy,setBusy] = useState(false);
  const [closing,setClosing] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    const release = retainRunDetail(invocation.id);
    void loadRunDetail(invocation.id).catch((cause:unknown) => setError(String(cause)));
    return release;
  },[invocation.id,loadRunDetail,retainRunDetail]);
  useEffect(() => {
    if (!runId || runId === invocation.id) return;
    const release = retainRunDetail(runId);
    void loadRunDetail(runId).catch((cause:unknown) => setError(String(cause)));
    return release;
  },[runId,loadRunDetail,retainRunDetail,invocation.id]);
  const current = [outer?.run,port.activeInvocation,port.latestInvocation,invocation]
    .filter((candidate):candidate is PanelActionInvocation => candidate?.id === invocation.id)
    .sort((left,right) => right.revision - left.revision)[0];
  const active = isAutomationExecutionRunActive(current);
  const phase = preflightPhase(detail);
  const arm = detail?.nodeSummaries.find((node) => node.nodeId === 'arm-observe');
  const cleanup = detail?.nodeSummaries.find((node) => node.nodeId === 'disarm-observe');
  const rows = armTestRows(arm);
  const roster = preflightRoster(detail ?? outer,robotIds);
  const displayRows:ArmTestRow[] = rows.length ? rows : roster.map((robotId) => ({ robotId,status:'pending' }));
  const cleanupByRobot = new Map(armTestRows(cleanup).map((row) => [row.robotId,row]));
  const decision = scope?.interactions.chatDecisions.find((item) => item.origin.runId === runId && item.status === 'open');
  const endOnly = decision && decision.payload.decision.approveLabel === decision.payload.decision.rejectLabel;
  const backendError = detail?.nodeSummaries.find((node) => node.error)?.error || outer?.error || detail?.error;
  const phaseText = !active ? t('Test ended') : closing || phase === 'cleanup' ? t('Disarming tested robots…')
    : phase === 'testing' ? t('Reading armed state · up to 5 seconds')
    : phase === 'rebooting' ? t('Rebooting failed robots…')
    : phase === 'results' ? t('Results retained · end the test to disarm') : t('Waiting for authorization');

  async function respond(action:'approved'|'rejected') {
    if (!decision || !scope || busy) return;
    setBusy(true);setError('');
    try { await scope.interactions.respond(decision,action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function close() {
    if (busy || closing && active) return;
    if (!active) { onClose();return; }
    if (decision && (phase === 'confirmation' || phase === 'results')) { await respond('rejected');return; }
    setBusy(true);setError('');
    try {
      await port.control(current,'cancel','End preflight arm test and disarm its tested robots');
      setClosing(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <Modal title={t('Arm test')} onClose={() => void close()} closeOnBackdrop={false}
    dismissible={!busy && !(closing && active)} dataXgcRole="preflight-arm-test-dialog" dataXgcId={invocation.id}
    actions={<div className="preflight-arm-test-actions">
      {!endOnly && <ControlButton disabled={busy || closing && active} onClick={() => void close()} dataXgcRole="preflight-arm-test-end" dataXgcId={invocation.id}>
        {active ? phase === 'confirmation' ? t('Cancel') : t('End and disarm') : t('Close')}
      </ControlButton>}
      {decision && !closing && <ControlButton tone="primary" disabled={busy || !active} onClick={() => void respond('approved')}
        dataXgcRole="preflight-arm-test-authorize" dataXgcId={decision.id}>
        {t(decision.payload.decision.approveLabel)}
      </ControlButton>}
    </div>}>
    <div className="preflight-arm-test-content">
      <p role="status" aria-live="polite">{phaseText}</p>
      {phase === 'confirmation' && active && <p>{t('The selected robots may spin their propellers and remain armed until the test ends. Confirm the area is clear.')}</p>}
      <ol className="preflight-arm-test-list" aria-label={t('Per-robot test results')}>
        {displayRows.map((row) => {
          const pending = row.status === 'pending';
          const spinning = pending && phase === 'testing' && active;
          const Icon = spinning ? LoaderCircle : pending ? Circle : row.status === 'passed' ? Check : row.status === 'failed' ? X : Minus;
          const cleanupRow = cleanupByRobot.get(row.robotId);
          const stateText = pending ? (spinning ? t('Testing…') : active ? t('Waiting for authorization') : t('Not tested'))
            : row.status === 'passed' ? t('Armed state confirmed')
            : row.status === 'failed' ? t('Not confirmed · may need reboot') : t('Excluded from this test');
          return <li key={row.robotId} data-xgc-role="preflight-arm-test-row" data-xgc-id={row.robotId} data-state={row.status}>
            <Icon aria-hidden="true" className={spinning ? 'preflight-arm-test-icon is-testing' : 'preflight-arm-test-icon'} />
            <div><strong>{row.robotId}</strong><span>{stateText}</span>
              {row.detail && row.status !== 'passed' && <small>{t(row.detail)}</small>}
              {cleanupRow && <small>{cleanupRow.status === 'passed' ? t('Disarmed state confirmed') : cleanupRow.status === 'pending' ? t('Disarming…') : t('Disarm not confirmed')}{cleanupRow.status === 'failed' && cleanupRow.detail ? `: ${t(cleanupRow.detail)}` : ''}</small>}
            </div>
          </li>;
        })}
      </ol>
      {(error || backendError) && <p role="alert">{error || backendError}</p>}
    </div>
  </Modal>;
}
