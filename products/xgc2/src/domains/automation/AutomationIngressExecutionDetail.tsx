import { RefreshCw } from 'lucide-react';
import { EmptyState,Notice } from '@xgc2/ui-react';
import { ControlButton } from '../../components/controls/ControlButton';
import '../../styles/automation-execution-ingress.css';
import { AutomationExecutionFact } from './AutomationExecutionFacts';
import { formatAutomationExecutionTimestamp } from './automationExecutionHistoryPresentation';
import type { AutomationExecutionHistoryEntry,AutomationIngressTransitionLedger } from './automationHistoryTypes';
import { AutomationExecutionStatus } from './AutomationExecutionStatus';

export function AutomationIngressExecutionDetail({ entry,transitionLedger,retrying,retryError,onRetry,onLoadMoreTransitions }: {
  entry: AutomationExecutionHistoryEntry;
  transitionLedger?: AutomationIngressTransitionLedger;
  retrying: boolean;
  retryError?: string;
  onRetry?: (entryId: string) => void | Promise<unknown>;
  onLoadMoreTransitions?: (entryId: string) => void | Promise<unknown>;
}) {
  const ingress = entry.ingress!;
  return (
    <article className="automation-execution-detail automation-ingress-detail" data-xgc-role="automation-ingress-detail" data-xgc-id={entry.id}>
      <div className="automation-execution-summary automation-execution-facts">
        <div><span>Status</span><AutomationExecutionStatus status={ingress.status} /></div>
        <AutomationExecutionFact label="Source" value={ingress.sourceKind} />
        <AutomationExecutionFact label="Entrypoint" value={ingress.entrypointNodeId} />
        <AutomationExecutionFact label="Trigger" value={ingress.triggerKind} />
        <AutomationExecutionFact label="Accepted" value={formatAutomationExecutionTimestamp(entry.acceptedAt)} />
        <AutomationExecutionFact label="Occurred" value={formatAutomationExecutionTimestamp(ingress.occurredAt)} />
      </div>
      <details
        className="automation-run-technical-details"
        data-xgc-role="automation-ingress-technical-details"
        data-xgc-id={entry.id}
      >
        <summary>Technical details</summary>
        <div className="automation-execution-summary automation-execution-facts automation-run-technical-facts">
          <div data-xgc-role="automation-ingress-run-id" data-xgc-id={entry.id}>
            <span>Run ID</span><code title={entry.runId}>{entry.runId}</code>
          </div>
          <div data-xgc-role="automation-ingress-event-id" data-xgc-id={entry.id}>
            <span>Event ID</span><code title={ingress.eventId}>{ingress.eventId}</code>
          </div>
          <AutomationExecutionFact label="Attempts" value={String(ingress.attemptCount)} />
          <AutomationExecutionFact label="Revision" value={String(ingress.revision)} />
          <AutomationExecutionFact label="Received" value={formatAutomationExecutionTimestamp(ingress.receivedAt)} />
          {ingress.sessionId && (
            <div data-xgc-role="automation-ingress-session-id" data-xgc-id={entry.id}>
              <span>Session</span><code title={ingress.sessionId}>{ingress.sessionId}</code>
            </div>
          )}
          {ingress.correlationId && (
            <div data-xgc-role="automation-ingress-correlation-id" data-xgc-id={entry.id}>
              <span>Correlation</span><code title={ingress.correlationId}>{ingress.correlationId}</code>
            </div>
          )}
        </div>
      </details>
      {ingress.status === 'dead_letter' && onRetry && (
        <div className="automation-execution-detail-actions">
          <ControlButton
            tone="primary"
            type="button"
            data-xgc-role="automation-ingress-retry"
            data-xgc-id={ingress.eventId}
            disabled={retrying}
            onClick={() => void onRetry(entry.id)}
          ><RefreshCw data-xgc-spinning={retrying ? 'true' : undefined} size={14} />{retrying ? 'Retrying' : 'Retry ingress'}</ControlButton>
        </div>
      )}
      {retryError && (
        <Notice density="compact" heading="Unable to retry ingress" tone="danger" data-xgc-role="automation-ingress-retry-error" data-xgc-id={ingress.eventId}>{retryError}</Notice>
      )}
      <AutomationIngressTransitionLedger
        entry={entry}
        ledger={transitionLedger}
        onLoadMore={onLoadMoreTransitions}
      />
      <p className="automation-runtime-value-empty">A detailed Run becomes available here after dispatch creates its durable execution record.</p>
    </article>
  );
}

export function AutomationIngressTransitionLedger({ entry,ledger,onLoadMore }: {
  entry: AutomationExecutionHistoryEntry;
  ledger?: AutomationIngressTransitionLedger;
  onLoadMore?: (entryId: string) => void | Promise<unknown>;
}) {
  const ingress = entry.ingress!;
  return (
    <section className="automation-execution-ingress-transition-ledger" aria-label="Ingress transition ledger" data-xgc-role="automation-ingress-transition-ledger" data-xgc-id={entry.id}>
      <header><strong>Ingress transitions</strong><span>{ledger?.transitions.length ?? 0}</span></header>
      {!ledger || ledger.loading ? (
        <EmptyState appearance="plain" density="compact" title="Loading transition ledger…" data-xgc-role="automation-ingress-transitions-loading" data-xgc-id={ingress.eventId} />
      ) : ledger.error ? (
        <Notice density="compact" heading="Unable to load transition ledger" tone="danger" data-xgc-role="automation-ingress-transitions-error" data-xgc-id={ingress.eventId}>{ledger.error}</Notice>
      ) : !ledger.complete && ledger.unavailableSources?.includes('agent') ? (
        <div className="automation-execution-availability" role="status" data-xgc-role="automation-ingress-transitions-partial" data-xgc-id={ingress.eventId}>
          Agent ingress transitions are temporarily unavailable.
        </div>
      ) : ledger.transitions.length === 0 ? (
        <div className="automation-runtime-value-empty">No ingress transition has been recorded.</div>
      ) : (
        <div className="automation-execution-ingress-transition-list">
          {ledger.transitions.map((transition) => {
            const transitionId = `${transition.eventId}:${transition.revision}`;
            return (
              <article
                className="automation-execution-ingress-transition"
                data-xgc-status={transition.toStatus}
                data-xgc-role="automation-ingress-transition"
                data-xgc-id={transitionId}
                key={transition.revision}
              >
                <header>
                  <strong data-xgc-role="automation-ingress-transition-kind" data-xgc-id={transitionId}>{transition.kind}</strong>
                  <span data-xgc-role="automation-ingress-transition-revision" data-xgc-id={transitionId}>Revision {transition.revision}</span>
                </header>
                <dl>
                  <div><dt>State</dt><dd data-xgc-role="automation-ingress-transition-state" data-xgc-id={transitionId}><code>{transition.fromStatus ?? '∅'}</code> → <code>{transition.toStatus}</code></dd></div>
                  <div><dt>Attempt</dt><dd data-xgc-role="automation-ingress-transition-attempt" data-xgc-id={transitionId}>{transition.attemptCount}</dd></div>
                  <div><dt>Failure code</dt><dd data-xgc-role="automation-ingress-transition-failure" data-xgc-id={transitionId}><code>{transition.failureCode ?? '—'}</code></dd></div>
                  <div><dt>Actor</dt><dd data-xgc-role="automation-ingress-transition-actor" data-xgc-id={transitionId}><code>{transition.actor}</code></dd></div>
                  <div><dt>Time</dt><dd data-xgc-role="automation-ingress-transition-time" data-xgc-id={transitionId}><time dateTime={transition.occurredAt}>{formatAutomationExecutionTimestamp(transition.occurredAt)}</time></dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
      {ledger?.nextAfterRevision !== undefined && onLoadMore && (
        <ControlButton
          className="automation-execution-ingress-transitions-load-more"
          type="button"
          data-xgc-role="automation-ingress-transitions-load-more"
          data-xgc-id={ingress.eventId}
          disabled={ledger.loadingMore}
          onClick={() => void onLoadMore(entry.id)}
        ><RefreshCw data-xgc-spinning={ledger.loadingMore ? 'true' : undefined} size={14} />{ledger.loadingMore ? 'Loading transitions' : 'Load more transitions'}</ControlButton>
      )}
    </section>
  );
}
