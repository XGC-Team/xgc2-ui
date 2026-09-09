import { CircleAlert,X } from 'lucide-react';
import { Tabs } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { SelectControl } from '../../components/controls/SelectControl';
import '../../styles/automation-editor-run-inspector.css';
import { ExecutionLogStreams } from '../execution/executionPublic';
import { isAutomationExecutionRunActive } from './automationRunSummaryModel';
import { AutomationRuntimeValuePanel } from './AutomationRuntimePanels';
import { automationRuntimeFailure } from './automationRuntimeResultModel';
import {
  automationEditorExecutionSummary,
  automationEditorStatusSummary,
  formatAutomationEditorTime,
  formatAutomationEditorTimestamp,
  type AutomationDetailView,
  type AutomationLogSource,
  type AutomationNodeResult,
  type AutomationRunView,
  type AutomationSourceIssue,
} from './automationEditorLogModel';

export function AutomationEditorRunInspector({ run,result,activeView,issues,sources,selectedSource,onSelectView,onSelectSource,onClose }: {
  run: AutomationRunView;
  result?: AutomationNodeResult;
  activeView: AutomationDetailView;
  issues: AutomationSourceIssue[];
  sources: AutomationLogSource[];
  selectedSource?: AutomationLogSource;
  onSelectView: (view: AutomationDetailView) => void;
  onSelectSource: (sourceKey: string) => void;
  onClose: () => void;
}) {
  const contextID = `${run.id}:${result?.node.id ?? 'run'}`;
  const views: Array<{ id: AutomationDetailView;label: string }> = result
    ? [{ id: 'data',label: 'Data' },{ id: 'logs',label: 'Process logs' },{ id: 'errors',label: 'Errors' }]
    : [{ id: 'logs',label: 'Process logs' },{ id: 'errors',label: 'Errors' }];

  return (
    <section className="automation-editor-run-inspector" data-xgc-role="automation-editor-node-detail" data-xgc-id={contextID}>
      <header className="automation-editor-run-inspector-header">
        <div className="automation-editor-run-inspector-title">
          <div>
            <strong>{result?.node.displayName || 'Automation run'}</strong>
            <span>{result ? automationEditorStatusSummary(result.run?.status ?? 'Not run', result.run) : automationEditorExecutionSummary(run.status, run.startedAt, run.finishedAt ?? run.updatedAt)}</span>
          </div>
        </div>
        <Tabs
          ariaLabel="Execution detail view"
          className="automation-editor-run-inspector-tabs"
          onValueChange={(view) => onSelectView(view as AutomationDetailView)}
          options={views.map((view) => ({
            label: (
              <span
                className="automation-editor-run-inspector-tab-label"
                data-xgc-role="automation-editor-node-detail-tab"
                data-xgc-id={`${contextID}:${view.id}`}
              >
                {view.label}
                {view.id === 'errors' && issues.length > 0 && (
                  <span className="automation-editor-run-inspector-error-count" aria-label={`${issues.length} errors`}>
                    {issues.length}
                  </span>
                )}
              </span>
            ),
            value: view.id,
          }))}
          size="compact"
          value={activeView}
        />
        <ControlButton appearance="ghost" className="automation-editor-run-inspector-close" iconOnly size="compact" aria-label="Close execution details" onClick={onClose} dataXgcRole="automation-run-inspector-close" dataXgcId="automation-run-inspector-close"><X size={15} /></ControlButton>
      </header>

      <div className="automation-editor-run-inspector-body">
        {activeView === 'data' && result && <NodeData result={result} run={run} />}
        {activeView === 'logs' && (
          <ProcessConsole
            run={run}
            sources={sources}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
          />
        )}
        {activeView === 'errors' && <ContextIssues run={run} contextID={contextID} issues={issues} />}
      </div>
    </section>
  );
}

function NodeData({ result,run }: { result: AutomationNodeResult;run: AutomationRunView }) {
  const nodeSummary = result.run;
  const nodeSummaryID = `${run.id}:${result.node.id}`;
  const trigger = result.node.kind.startsWith('trigger.');
  return (
    <section className="automation-editor-node-data" data-xgc-role="automation-editor-node-data" data-xgc-id={nodeSummaryID}>
      {nodeSummary ? (
        <>
          <dl className="automation-editor-node-facts">
            <div><dt>Status</dt><dd>{nodeSummary.status}</dd></div>
            <div><dt>Attempts</dt><dd>{nodeSummary.attemptCount}</dd></div>
            <div><dt>Route</dt><dd>{nodeSummary.route || '—'}</dd></div>
            <div><dt>Started</dt><dd>{formatAutomationEditorTimestamp(nodeSummary.startedAt)}</dd></div>
            <div><dt>Finished</dt><dd>{formatAutomationEditorTimestamp(nodeSummary.finishedAt)}</dd></div>
          </dl>
          <div className="automation-editor-node-data-panes" data-xgc-trigger={trigger ? 'true' : 'false'}>
            {!trigger && <AutomationRuntimeValuePanel title="Input" pane="input" role="automation-editor-node-result-input" id={nodeSummaryID} value={nodeSummary.inputs} empty="No persisted input." />}
            <AutomationRuntimeValuePanel title="Output" pane="output" role="automation-editor-node-result-output" id={nodeSummaryID} value={nodeSummary.output} empty="No persisted output." failure={automationRuntimeFailure(nodeSummary)} />
          </div>
        </>
      ) : (
        <div className="automation-editor-detail-empty">No runtime result was recorded for this node.</div>
      )}
    </section>
  );
}

function ProcessConsole({ run,sources,selectedSource,onSelectSource }: {
  run: AutomationRunView;
  sources: AutomationLogSource[];
  selectedSource?: AutomationLogSource;
  onSelectSource: (sourceKey: string) => void;
}) {
  return (
    <section className="automation-editor-log-viewer" aria-label="Process logs" data-xgc-role="automation-editor-log-viewer" data-xgc-id={run.id}>
      <div className="automation-editor-log-toolbar">
        <SelectControl
          compact
          value={selectedSource?.key ?? ''}
          options={sources.map((source) => ({ value: source.key,label: `${source.label} · ${source.status}` }))}
          onChange={onSelectSource}
          ariaLabel="Log source"
          dataXgcRole="automation-editor-log-source"
          dataXgcId={run.id}
          disabled={sources.length === 0}
        />
        {selectedSource && <LogSourceDetail source={selectedSource} run={run} />}
      </div>
      {selectedSource ? (
        <ExecutionLogStreams
          key={selectedSource.key}
          targetId={selectedSource.targetId}
          entityType={selectedSource.entityType}
          entityId={selectedSource.entityId}
          follow={isAutomationExecutionRunActive(run)}
        />
      ) : <div className="automation-editor-detail-empty">No process log source is available.</div>}
    </section>
  );
}

function LogSourceDetail({ source,run }: { source: AutomationLogSource;run: AutomationRunView }) {
  const process = source.process;
  return (
    <div className="automation-editor-log-source-detail" data-xgc-role="automation-editor-log-source-detail" data-xgc-id={source.key}>
      <strong data-xgc-status={source.status}>{source.status}</strong>
      {process
        ? <><span>ready {process.readiness.status}</span><span>live {process.liveness.status}</span><span>{process.restartCount} restarts</span></>
        : <span>updated {formatAutomationEditorTime(run.updatedAt)}</span>}
    </div>
  );
}

function ContextIssues({ run,contextID,issues }: { run: AutomationRunView;contextID: string;issues: AutomationSourceIssue[] }) {
  return (
    <section
      className="automation-editor-log-source-issues"
      aria-label="Execution errors"
      data-xgc-role="automation-editor-log-source-errors"
      data-xgc-id={contextID}
    >
      {issues.length === 0 ? (
        <div className="automation-editor-detail-empty"><strong>No errors reported</strong><span>This node and its related processes did not report an error.</span></div>
      ) : (
        <ul>
          {issues.map((issue) => (
            <li key={issue.key} data-xgc-role="automation-editor-log-source-error" data-xgc-id={`${run.id}:${issue.key}`}>
              <CircleAlert size={15} aria-hidden="true" />
              <div><strong>{issue.label}</strong><span>{issue.message}</span></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
