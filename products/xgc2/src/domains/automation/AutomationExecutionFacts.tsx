import { ControlButton } from '../../components/controls/ControlButton';
import { EmptyState } from '@xgc2/ui-react';
import { useAutomationExecutionText } from './automationExecutionMessages';
import { AutomationRuntimeValuePanel } from './AutomationRuntimePanels';
import { automationRuntimeFailure } from './automationRuntimeResultModel';
import type {
  AutomationNodeExecutionSummary,
} from './automationExecutionContracts';
import type { AutomationRunSnapshot } from './automationRunContracts';
import {
  automationRunAdmissionSummary,
  automationRunEntrySummary,
  automationRunRelationshipSummary,
  automationRunVersionSummary,
  formatAutomationExecutionTimestamp,
  shortAutomationExecutionId,
} from './automationExecutionHistoryPresentation';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';
import { AutomationExecutionStatus } from './AutomationExecutionStatus';

export function AutomationRunSummaryLoading({ summary }: { summary: AutomationExecutionRunSummary }) {
  const t = useAutomationExecutionText();
  return (
    <article className="automation-execution-detail" data-xgc-role="automation-execution-detail-loading" data-xgc-id={summary.id}>
      <div className="automation-execution-summary automation-execution-facts">
        <div><span>Status</span><AutomationExecutionStatus status={summary.status} /></div>
        <AutomationExecutionFact label="Target" value={summary.targetId} />
        <AutomationExecutionFact label="Accepted" value={formatAutomationExecutionTimestamp(summary.acceptedAt)} />
        {summary.startedAt && <AutomationExecutionFact label="Started" value={formatAutomationExecutionTimestamp(summary.startedAt)} />}
        {summary.finishedAt && <AutomationExecutionFact label="Finished" value={formatAutomationExecutionTimestamp(summary.finishedAt)} />}
        <AutomationExecutionFact label="Entry" value={automationRunEntrySummary(summary)} />
      </div>
      <AutomationRunTechnicalDetails run={summary} />
      <EmptyState appearance="plain" density="compact" title={t('Loading authoritative Run detail…')} />
    </article>
  );
}

export function AutomationRunTechnicalDetails({ run,correlationId,snapshot }: {
  run: AutomationExecutionRunSummary;
  correlationId?: string;
  snapshot?: AutomationRunSnapshot;
}) {
  const t = useAutomationExecutionText();
  return (
    <details
      className="automation-run-technical-details"
      data-xgc-role="automation-run-technical-details"
      data-xgc-id={run.id}
    >
      <summary>{t('Technical details')}</summary>
      <div className="automation-execution-summary automation-execution-facts automation-run-technical-facts">
        <div data-xgc-role="automation-run-id" data-xgc-id={run.id}>
          <span>{t('Run ID')}</span><code title={run.id}>{run.id}</code>
        </div>
        <AutomationExecutionFact label="Engine status" value={run.status} />
        <AutomationExecutionFact label="Updated" value={formatAutomationExecutionTimestamp(run.updatedAt)} />
        <AutomationExecutionFact label="Admission" value={automationRunAdmissionSummary(run)} />
        <AutomationExecutionFact label="Version" value={automationRunVersionSummary(run)} />
        <AutomationExecutionFact label="Relationship" value={automationRunRelationshipSummary(run)} />
        {run.depth !== undefined && <AutomationExecutionFact label="Call depth" value={String(run.depth)} />}
        <AutomationExecutionFact label="Termination" value={run.terminationKind ?? '—'} />
        {run.callNodeId && (
          <div data-xgc-role="automation-run-call-node" data-xgc-id={run.id}>
            <span>{t('Call node')}</span><code>{run.callNodeId}</code>
          </div>
        )}
        {correlationId && (
          <div data-xgc-role="automation-run-correlation" data-xgc-id={run.id}>
            <span>{t('Correlation')}</span><code title={correlationId}>{correlationId}</code>
          </div>
        )}
        {snapshot && (
          <>
            <AutomationExecutionFact label="Pinned version" value={String(snapshot.automationRef.version)} />
            <div data-xgc-role="automation-run-snapshot-commit" data-xgc-id={run.id}>
              <span>{t('Pinned commit')}</span><code title={snapshot.automationRef.commitId}>{snapshot.automationRef.commitId}</code>
            </div>
          </>
        )}
        <AutomationRunDigestFact runId={run.id} label="Config digest" kind="config" value={run.configDigest} />
        <AutomationRunDigestFact runId={run.id} label="Plan digest" kind="plan" value={run.executionPlanDigest} />
        <AutomationRunDigestFact runId={run.id} label="Registry digest" kind="registry" value={run.registryDigest} />
        <AutomationRunDigestFact runId={run.id} label="Definition digest" kind="definition" value={run.definitionDigest} />
      </div>
      <AutomationRunTriggerInvocation run={run} />
    </details>
  );
}

export function AutomationRunTriggerInvocation({ run }: { run: AutomationExecutionRunSummary }) {
  const t = useAutomationExecutionText();
  const invocation = run.triggerInvocation;
  if (!invocation) return null;
  return (
    <section className="automation-execution-relationships" aria-label={t('Trigger invocation')} data-xgc-role="automation-run-trigger-invocation" data-xgc-id={run.id}>
      <header><strong>{t('Trigger invocation')}</strong></header>
      <dl className="automation-execution-node-facts">
        <div><dt>Event</dt><dd><code title={invocation.eventId}>{invocation.eventId}</code></dd></div>
        <div><dt>Entrypoint</dt><dd><code>{invocation.nodeId}</code></dd></div>
        <div><dt>Kind</dt><dd><code>{invocation.kind}</code></dd></div>
        {invocation.sessionId && <div><dt>Session</dt><dd><code title={invocation.sessionId}>{invocation.sessionId}</code></dd></div>}
        <div><dt>Occurred</dt><dd>{formatAutomationExecutionTimestamp(invocation.occurredAt)}</dd></div>
      </dl>
    </section>
  );
}

export function AutomationRunRelationships({ run,runs,onOpen }: {
  run: AutomationExecutionRunSummary;
  runs: AutomationExecutionRunSummary[];
  onOpen?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
}) {
  const relatedRootRunId = run.rootRunId && run.rootRunId !== run.id ? run.rootRunId : '';
  const childRuns = runs
    .filter((candidate) => candidate.parentRunId === run.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
  const hasRelationship = Boolean(
    run.parentRunId || relatedRootRunId || run.replacesRunId || childRuns.length,
  );
  if (!hasRelationship) return null;
  return (
    <section className="automation-execution-relationships" data-xgc-role="automation-run-relationships" data-xgc-id={run.id}>
      <header><strong>Workflow relationship</strong></header>
      <dl className="automation-execution-node-facts">
        {run.parentRunId && <AutomationRunRelationship label="Parent run" runId={run.parentRunId} runs={runs} onOpen={onOpen} />}
        {relatedRootRunId && <AutomationRunRelationship label="Root run" runId={relatedRootRunId} runs={runs} onOpen={onOpen} />}
        {run.replacesRunId && <AutomationRunRelationship label="Replaced run" runId={run.replacesRunId} runs={runs} onOpen={onOpen} />}
        {childRuns.map((child, index) => (
          <AutomationRunRelationship
            key={child.id}
            label={childRuns.length === 1 ? 'Child run' : `Child run ${index + 1}`}
            runId={child.id}
            runs={runs}
            onOpen={onOpen}
            openRole="automation-child-run-open"
          />
        ))}
      </dl>
    </section>
  );
}

function AutomationRunRelationship({ label,runId,runs,onOpen,openRole = 'automation-related-run-open' }: {
  label: string;
  runId: string;
  runs: AutomationExecutionRunSummary[];
  onOpen?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
  openRole?: string;
}) {
  const related = runs.find((candidate) => candidate.id === runId);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{related && onOpen ? (
        <ControlButton type="button" data-xgc-role={openRole} data-xgc-id={runId} onClick={() => void onOpen(related)}>
          Run {shortAutomationExecutionId(runId)}
        </ControlButton>
      ) : <code title={runId}>{shortAutomationExecutionId(runId)}</code>}</dd>
    </div>
  );
}

export function AutomationNodeExecutionSummaryDetail({ run,node,displayName }: {
  run: AutomationExecutionRunSummary;
  node: AutomationNodeExecutionSummary;
  displayName?: string;
}) {
  const nodeSummaryId = `${run.id}:${node.nodeId}`;
  return (
    <details className="automation-execution-node" data-xgc-status={node.status} data-xgc-role="automation-execution-node" data-xgc-id={nodeSummaryId}>
      <summary>
        <div>
          <strong>{displayName || node.nodeId}</strong>
          {displayName && <small>{node.nodeId}</small>}
          <code>{node.kind}</code>
          {node.error && <small className="automation-execution-node-error">{node.errorClass ? `${node.errorClass}: ` : ''}{node.error}</small>}
        </div>
        <div><AutomationExecutionStatus status={node.status} /><small>Attempt {node.attemptCount}</small></div>
      </summary>
      <dl className="automation-execution-node-facts">
        <div><dt>Route</dt><dd>{node.route || '—'}</dd></div>
        <div><dt>Revision</dt><dd>{node.revision}</dd></div>
      </dl>
      <div className="automation-execution-node-data">
        <AutomationRuntimeValuePanel title="Input" pane="input" role="automation-execution-node-input" id={nodeSummaryId} value={node.inputs} empty="No persisted input." />
        <AutomationRuntimeValuePanel title="Output" pane="output" role="automation-execution-node-output" id={nodeSummaryId} value={node.output} empty="No persisted output." failure={automationRuntimeFailure(node)} />
      </div>
    </details>
  );
}

export function AutomationExecutionFact({ label,value }: { label: string;value: string }) {
  const t = useAutomationExecutionText();
  return <div><span>{t(label)}</span><strong>{value || '—'}</strong></div>;
}

export function AutomationRunDigestFact({ runId,label,kind,value }: { runId: string;label: string;kind: string;value: string }) {
  const t = useAutomationExecutionText();
  return (
    <div data-xgc-role="automation-run-digest" data-xgc-id={`${runId}:${kind}`}>
      <span>{t(label)}</span><code title={value}>{value}</code>
    </div>
  );
}
