import { CircleAlert,Terminal } from 'lucide-react';
import { StatusText } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/automation-editor-node-results.css';
import '../../styles/automation-editor-run-overview.css';
import type { AutomationRunDetail } from './automationExecutionContracts';
import {
  automationEditorExecutionSummary,
  automationEditorStatusSummary,
  formatAutomationEditorTime,
  formatAutomationEditorTimestamp,
  shortAutomationEditorRunId,
  type AutomationNodeResult,
  type AutomationRunView,
} from './automationEditorLogModel';

export function AutomationEditorRunOverview({ run,detail,targetId,reported,total,errorCount,compact,onOpenRunLogs }: {
  run: AutomationRunView;
  detail?: AutomationRunDetail;
  targetId: string;
  reported: number;
  total: number;
  errorCount: number;
  compact: boolean;
  onOpenRunLogs: () => void;
}) {
  return (
    <header className="automation-editor-run-overview" data-xgc-role="automation-editor-run-state" data-xgc-id={run.id}>
      <div className="automation-editor-run-primary">
        <div><strong title={run.id}>Run {shortAutomationEditorRunId(run.id)}</strong><span>{automationEditorExecutionSummary(run.status, run.startedAt, run.finishedAt ?? run.updatedAt)}</span></div>
        {detail?.error && (
          <span
            className="automation-editor-run-data-state"
            data-xgc-tone={detail.nodeSummaries.length > 0 ? 'warning' : 'danger'}
            title={detail.error}
            aria-label={detail.nodeSummaries.length > 0 ? 'Execution data refresh failed' : 'Execution data unavailable'}
          ><CircleAlert size={13} aria-hidden="true" /></span>
        )}
      </div>
      {!compact && (
        <div className="automation-editor-run-meta">
          <span>Target <strong>{targetId}</strong></span>
          <span>Started <strong>{formatAutomationEditorTimestamp(run.startedAt)}</strong></span>
          <span>Nodes <strong>{reported}/{total}</strong></span>
          {detail?.loading && <span>Data <strong>Refreshing…</strong></span>}
          {detail?.error && <span data-xgc-tone={detail.nodeSummaries.length > 0 ? 'warning' : 'danger'} title={detail.error}>Data <strong>{detail.nodeSummaries.length > 0 ? 'Refresh failed' : 'Unavailable'}</strong></span>}
          {errorCount > 0 && <span data-xgc-tone="danger">Errors <strong>{errorCount}</strong></span>}
        </div>
      )}
      <ControlButton
        size="compact"
        className="automation-editor-run-logs-button"
        aria-label="Open run logs"
        title="Open run logs"
        dataXgcRole="automation-editor-open-run-logs"
        dataXgcId={run.id}
        onClick={onOpenRunLogs}
      ><Terminal size={14} aria-hidden="true" /><span>{compact ? '' : 'Run logs'}</span></ControlButton>
    </header>
  );
}

export function AutomationEditorNodeResults({ run,detail,results,selectedNodeId,compact,onSelect }: {
  run: AutomationRunView;
  detail?: AutomationRunDetail;
  results: AutomationNodeResult[];
  selectedNodeId: string;
  compact: boolean;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <section className="automation-editor-node-results" data-xgc-role="automation-editor-node-results" data-xgc-id={run.id}>
      <header>
        <strong>Node</strong>
        {!compact && <><span>Status</span><span>Started</span><span>Attempt</span></>}
      </header>
      {results.length === 0 ? (
        <div className="automation-editor-node-results-empty">This run snapshot contains no nodes.</div>
      ) : (
        <ol role="tree" aria-label="Node execution results">
          {results.map((result) => (
            <NodeResultRow
              key={result.node.id}
              run={run}
              result={result}
              awaiting={!detail || detail.loading || Boolean(detail.error)}
              selected={selectedNodeId === result.node.id}
              compact={compact}
              onSelect={() => onSelect(result.node.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function NodeResultRow({ run,result,awaiting,selected,compact,onSelect }: {
  run: AutomationRunView;
  result: AutomationNodeResult;
  awaiting: boolean;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const nodeSummary = result.run;
  const status = nodeSummary?.status ?? (awaiting ? 'loading' : 'not-run');
  const statusLabel = nodeSummary?.status ?? (awaiting ? 'Awaiting' : 'Not run');
  const nodeSummaryID = `${run.id}:${result.node.id}`;
  return (
    <li
      className="automation-editor-node-result"
      role="treeitem"
      aria-selected={selected}
      data-xgc-status={status}
      data-xgc-role="automation-editor-node-result"
      data-xgc-id={nodeSummaryID}
    >
      <ControlButton appearance={selected ? 'default' : 'ghost'} className="automation-editor-node-result-action" onClick={onSelect} dataXgcRole="automation-editor-node-result-action" dataXgcId={nodeSummaryID}>
        <span className="automation-editor-node-name">
          <strong>{result.node.displayName || result.node.id}</strong>
          <code>{result.node.kind}</code>
        </span>
        {!compact && <StatusText className="automation-editor-node-status" status={status}>{nodeSummary?.error && <CircleAlert size={12} aria-hidden="true" />}{automationEditorStatusSummary(statusLabel, nodeSummary)}</StatusText>}
        {!compact && <time dateTime={nodeSummary?.startedAt}>{formatAutomationEditorTime(nodeSummary?.startedAt)}</time>}
        {!compact && <span className="automation-editor-node-attempt">{nodeSummary ? nodeSummary.attemptCount : '—'}</span>}
        {compact && nodeSummary?.error && <CircleAlert className="automation-editor-node-error-icon" size={13} aria-label="Node error" />}
      </ControlButton>
    </li>
  );
}
