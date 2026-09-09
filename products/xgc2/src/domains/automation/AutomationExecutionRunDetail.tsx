import { RefreshCw } from 'lucide-react';
import { EmptyState,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/automation-execution-admission.css';
import '../../styles/automation-execution-detail.css';
import '../../styles/automation-execution-snapshot.css';
import '../../styles/automation-occurrences.css';
import { useAutomationExecutionText } from './automationExecutionMessages';
import type { ProcessInstance } from '../execution/executionPublic';
import { AutomationExecutionRelationsView } from './AutomationExecutionRelations';
import {
  AutomationExecutionFact,
  AutomationNodeExecutionSummaryDetail,
  AutomationRunRelationships,
  AutomationRunTechnicalDetails,
} from './AutomationExecutionFacts';
import { AutomationGraph } from './AutomationGraphView';
import { AutomationIngressTransitionLedger } from './AutomationIngressExecutionDetail';
import { AutomationRuntimeValuePanel } from './AutomationRuntimePanels';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import type {
  AutomationNodeOccurrenceAggregate,
  AutomationRunDetail,
} from './automationExecutionContracts';
import {
  automationRunEntrySummary,
  executionEntryListLabel,
  formatAutomationExecutionTimestamp,
} from './automationExecutionHistoryPresentation';
import type {
  AutomationExecutionHistoryEntry,
  AutomationIngressTransitionLedger as AutomationIngressTransitionLedgerState,
  AutomationExecutionRunSummary,
} from './automationHistoryTypes';
import { activeWorkflowRuntimeNodeIds,automationRunPresentation } from './automationRunModel';
import { AutomationExecutionStatus } from './AutomationExecutionStatus';

export function AutomationExecutionRunDetail({
  selectedEntry,
  selectedRun,
  detail,
  catalog,
  processInstances,
  relatedRuns,
  occurrenceAggregates,
  selectedOccurrenceNodeId,
  busy,
  ingressTransitionLedger,
  onRefreshRun,
  onOpenOccurrenceNode,
  onOpenOccurrenceInvocation,
  onOpenRelatedRun,
  onOpenRunById,
  onLoadMoreIngressTransitions,
}: {
  selectedEntry?: AutomationExecutionHistoryEntry;
  selectedRun: AutomationExecutionRunSummary;
  detail?: AutomationRunDetail;
  catalog: AutomationNodeCatalogEntry[];
  processInstances: readonly ProcessInstance[];
  relatedRuns: AutomationExecutionRunSummary[];
  occurrenceAggregates: Readonly<Record<string,AutomationNodeOccurrenceAggregate>>;
  selectedOccurrenceNodeId: string;
  busy: boolean;
  ingressTransitionLedger?: AutomationIngressTransitionLedgerState;
  onRefreshRun: (runId: string) => void | Promise<unknown>;
  onOpenOccurrenceNode: (nodeId: string, invocationId?: string) => void;
  onOpenOccurrenceInvocation: (invocationId: string) => void;
  onOpenRelatedRun?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
  onOpenRunById?: (runId: string) => void | Promise<unknown>;
  onLoadMoreIngressTransitions?: (entryId: string) => void | Promise<unknown>;
}) {
  const t = useAutomationExecutionText();
  const exactSelectedRun = detail?.run?.id === selectedRun.id ? detail.run : undefined;
  const presentation = automationRunPresentation(selectedRun, detail);
  return (
    <article className="automation-execution-detail" data-xgc-role="automation-execution-detail" data-xgc-id={selectedRun.id}>

      <div className="automation-execution-runtime-detail">
        <div className="automation-execution-details-panel" data-xgc-role="automation-run-details" data-xgc-id={selectedRun.id}>
          <header className="automation-execution-panel-label"><strong>{t('Run details')}</strong></header>
          <div className="automation-execution-summary automation-execution-facts">
            <div>
              <span>{t('Status')}</span>
              <AutomationExecutionStatus
                status={presentation.status}
                role="automation-run-status"
                id={selectedRun.id}
                engineStatus={selectedRun.status}
              >{presentation.shortLabel}</AutomationExecutionStatus>
            </div>
            <AutomationExecutionFact label="Accepted" value={formatAutomationExecutionTimestamp(selectedRun.acceptedAt)} />
            {selectedRun.startedAt && <AutomationExecutionFact label="Started" value={formatAutomationExecutionTimestamp(selectedRun.startedAt)} />}
            {selectedRun.finishedAt && <AutomationExecutionFact label="Finished" value={formatAutomationExecutionTimestamp(selectedRun.finishedAt)} />}
            <AutomationExecutionFact
              label="Entry"
              value={selectedEntry ? t(executionEntryListLabel(selectedEntry)) : automationRunEntrySummary(selectedRun)}
            />
            {selectedRun.status === 'rejected' && (
              <Notice
                className="automation-execution-admission-rejection"
                density="compact"
                heading={t('Run rejected')}
                tone="danger"
                data-xgc-role="automation-run-rejection"
                data-xgc-id={selectedRun.id}
              >{t('This invocation was recorded, but admission policy did not allow it to start.')}</Notice>
            )}
          </div>

          <AutomationRunTechnicalDetails
            run={selectedRun}
            correlationId={detail?.run?.correlationId}
            snapshot={detail?.snapshot}
          />

          {selectedRun.terminationKind && selectedRun.terminationKind !== 'completed' && (
            <section className="automation-execution-run-termination" data-xgc-role="automation-run-termination" data-xgc-id={selectedRun.id}>
              <header><strong>Termination</strong><span>{selectedRun.terminationKind}</span></header>
              {exactSelectedRun?.reason && <p>{exactSelectedRun.reason}</p>}
              {exactSelectedRun?.primaryError && (
                <div data-xgc-role="automation-run-primary-error" data-xgc-id={selectedRun.id}>
                  <span>Primary error</span><code>{exactSelectedRun.primaryError}</code>
                </div>
              )}
              {exactSelectedRun?.cleanupErrors?.length ? (
                <div data-xgc-role="automation-run-cleanup-errors" data-xgc-id={selectedRun.id}>
                  <span>Cleanup errors</span>
                  <ul>{exactSelectedRun.cleanupErrors.map((message, index) => <li key={`${index}:${message}`}><code>{message}</code></li>)}</ul>
                </div>
              ) : null}
            </section>
          )}

          <AutomationRunRelationships run={selectedRun} runs={relatedRuns} onOpen={onOpenRelatedRun} />
          {selectedEntry?.ingress && (
            <AutomationIngressTransitionLedger entry={selectedEntry} ledger={ingressTransitionLedger} onLoadMore={onLoadMoreIngressTransitions} />
          )}
          {detail?.relations && (
            <AutomationExecutionRelationsView relations={detail.relations} onOpenRun={onOpenRunById} onOpenInvocation={onOpenOccurrenceInvocation} />
          )}
          {detail?.run?.result !== undefined && (
            <section className="automation-execution-result" data-xgc-role="automation-run-result" data-xgc-id={selectedRun.id}>
              <AutomationRuntimeValuePanel title="Result" pane="output" role="automation-run-result-value" id={selectedRun.id} value={detail.run.result} empty="No public result." />
            </section>
          )}
        </div>

      {detail?.snapshot && (
        <section className="automation-execution-snapshot-view" aria-label={t('Pinned workflow snapshot')} data-xgc-role="automation-run-snapshot" data-xgc-id={selectedRun.id}>
          <div className="automation-execution-snapshot-canvas">
            <AutomationGraph
              definition={detail.snapshot.automationSpec}
              catalog={catalog}
              nodeSummaries={detail.nodeSummaries}
              nodeAggregates={occurrenceAggregates}
              activeRuntimeNodeIds={activeWorkflowRuntimeNodeIds(selectedRun, detail, detail.snapshot.automationSpec, processInstances)}
              selectedNodeId={selectedOccurrenceNodeId}
              onNodeSelect={onOpenOccurrenceNode}
              editable={false}
              controlsId={`execution-${selectedRun.id}`}
            />
          </div>
        </section>
      )}

        <section
          className="automation-execution-nodes"
          aria-label={t('Node execution summaries')}
          data-xgc-role="automation-step-logs"
          data-xgc-id={selectedRun.id}
        >
          {!detail?.snapshot && (
            <section
              className="automation-occurrences-section"
              aria-label={t('Node invocations')}
              data-xgc-role="automation-node-occurrences"
              data-xgc-id={selectedRun.id}
            >
              <header><strong>{t('Node invocations')}</strong><span>{detail?.invocations.length ?? 0}</span></header>
              {!detail?.loading && !detail?.error && (detail?.invocations.length ?? 0) === 0 && (
                <EmptyState appearance="plain" density="compact" title={t('No node invocation')} description={t('No invocation has been recorded for this Run.')} />
              )}
              <div className="automation-occurrences-aggregate-list">
                {Object.values(occurrenceAggregates)
                  .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
                  .map((aggregate) => {
                    const nodeSummary = detail?.nodeSummaries.find((node) => node.nodeId === aggregate.nodeId);
                    return (
                      <ControlButton
                        type="button"
                        data-xgc-role="automation-node-occurrence-open"
                        data-xgc-id={`${selectedRun.id}:${aggregate.nodeId}`}
                        key={aggregate.nodeId}
                        onClick={() => onOpenOccurrenceNode(aggregate.nodeId)}
                      >
                        <span><strong>{aggregate.nodeId}</strong>{nodeSummary && <code>{nodeSummary.kind}</code>}</span>
                        <span>
                          <AutomationExecutionStatus status={aggregate.latestStatus} />
                          <small>{aggregate.total} total · {aggregate.active} active · {aggregate.failed} failed</small>
                        </span>
                      </ControlButton>
                    );
                  })}
              </div>
            </section>
          )}
          <header><strong>{t('Step logs')}</strong><span>{detail?.nodeSummaries.length ?? 0}</span></header>
          {detail?.loading && <EmptyState appearance="plain" density="compact" title={t('Loading node state…')} />}
          {detail?.error && (
            <Notice
              actions={<ControlButton
                type="button"
                data-xgc-role="automation-run-detail-refresh"
                data-xgc-id={selectedRun.id}
                disabled={busy}
                onClick={() => void onRefreshRun(selectedRun.id)}
              ><RefreshCw size={14} />{t('Retry')}</ControlButton>}
              density="compact"
              heading={t('Unable to load node state')}
              tone="danger"
            >{detail.error}</Notice>
          )}
          {!detail?.loading && !detail?.error && (detail?.nodeSummaries.length ?? 0) === 0 && (
            <EmptyState appearance="plain" density="compact" title={t('No node state')} description={t('No node state has been recorded.')} />
          )}
          {(detail?.nodeSummaries ?? []).map((node) => (
            <AutomationNodeExecutionSummaryDetail
              key={node.nodeId}
              run={selectedRun}
              node={node}
              displayName={detail?.snapshot?.automationSpec.nodes.find((item) => item.id === node.nodeId)?.displayName}
            />
          ))}
        </section>

      </div>
    </article>
  );
}
