import { Square } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useAutomationExecutionText } from './automationExecutionMessages';
import { shortAutomationExecutionId } from './automationExecutionHistoryPresentation';
import type { AutomationExecutionRunSummary,AutomationRunControl } from './automationHistoryTypes';
import { automationRunPresentation } from './automationRunModel';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { AutomationExecutionStatus } from './AutomationExecutionStatus';

export function AutomationActiveRuns({ resourceId,runs,runDetailsById,busy,onStop }: {
  resourceId: string;
  runs: AutomationExecutionRunSummary[];
  runDetailsById: Readonly<Record<string,AutomationRunDetail>>;
  busy: boolean;
  onStop: (run: AutomationRunControl) => void | Promise<unknown>;
}) {
  const t = useAutomationExecutionText();
  if (runs.length === 0) return null;
  return (
    <div
      className="automation-active-runs"
      role="region"
      aria-label={`${runs.length} in-progress ${runs.length === 1 ? 'run' : 'runs'}`}
      data-xgc-role="automation-active-runs"
      data-xgc-id={resourceId}
    >
      {runs.map((run) => {
        const phase = automationRunPresentation(run, runDetailsById[run.id]);
        return (
          <section
            className="automation-active-run-bar"
            aria-label={`${phase.shortLabel} run ${shortAutomationExecutionId(run.id)}`}
            data-xgc-role="automation-active-run"
            data-xgc-id={run.id}
            data-xgc-status={phase.status}
            data-xgc-engine-status={run.status}
            key={run.id}
          >
            <div>
              <span className="automation-active-run-title">
                <strong>{phase.label}</strong>
                <code
                  title={run.id}
                  data-xgc-role="automation-active-run-id"
                  data-xgc-id={run.id}
                >Run {shortAutomationExecutionId(run.id)}</code>
              </span>
              <small>{phase.description}</small>
            </div>
            <div>
              <AutomationExecutionStatus status={phase.status}>{phase.shortLabel}</AutomationExecutionStatus>
              <ControlButton
                tone="danger"
                appearance="solid"
                type="button"
                title={run.status === 'stopping' ? t('This run is already stopping') : t('Stop run {id}', { id: shortAutomationExecutionId(run.id) })}
                aria-label={t('Stop run {id}', { id: shortAutomationExecutionId(run.id) })}
                data-xgc-role="automation-run-stop"
                data-xgc-id={run.id}
                disabled={busy || run.status === 'stopping'}
                onClick={() => void onStop(run)}
              ><Square size={14} />{t(run.status === 'stopping' ? 'Stopping' : 'Stop')}</ControlButton>
            </div>
          </section>
        );
      })}
    </div>
  );
}
