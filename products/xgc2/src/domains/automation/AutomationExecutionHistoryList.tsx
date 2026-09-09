import { StatusText } from '@xgc2/ui-react';
import { RefreshCw } from 'lucide-react';
import { ControlButton } from '../../components/controls/ControlButton';
import { useAutomationExecutionText } from './automationExecutionMessages';
import type { ExecutionStreamState } from '../execution/executionPublic';
import {
  AutomationExecutionFilters,
  type ExecutionRelationshipFilter,
  type ExecutionStatusFilter,
} from './AutomationExecutionFilters';
import { ingressStatusLabel } from './automationExecutionFilterModel';
import type { AutomationRunDetail } from './automationExecutionContracts';
import {
  executionEntryStatus,
  executionEntryListLabel,
  executionStreamStateDescription,
  executionStreamStateLabel,
  formatAutomationExecutionListTimestamp,
} from './automationExecutionHistoryPresentation';
import type { AutomationExecutionHistoryEntry } from './automationHistoryTypes';
import { automationRunPresentation } from './automationRunModel';
import { AutomationExecutionStatus } from './AutomationExecutionStatus';

export function AutomationExecutionHistoryList({
  resourceId,
  orderedEntries,
  visibleEntries,
  selectedEntry,
  runDetailsById,
  statusFilter,
  relationshipFilter,
  streamState,
  complete,
  unavailableSources,
  hasMoreRuns,
  loadingMore,
  onStatusFilterChange,
  onRelationshipFilterChange,
  onSelect,
  onLoadMore,
}: {
  resourceId: string;
  orderedEntries: AutomationExecutionHistoryEntry[];
  visibleEntries: AutomationExecutionHistoryEntry[];
  selectedEntry?: AutomationExecutionHistoryEntry;
  runDetailsById: Readonly<Record<string,AutomationRunDetail>>;
  statusFilter: ExecutionStatusFilter;
  relationshipFilter: ExecutionRelationshipFilter;
  streamState?: ExecutionStreamState;
  complete: boolean;
  unavailableSources: readonly 'agent'[];
  hasMoreRuns: boolean;
  loadingMore: boolean;
  onStatusFilterChange: (filter: ExecutionStatusFilter) => void;
  onRelationshipFilterChange: (filter: ExecutionRelationshipFilter) => void;
  onSelect: (entryId: string) => void;
  onLoadMore?: () => void | Promise<unknown>;
}) {
  const t = useAutomationExecutionText();
  const selectedRunHidden = Boolean(
    selectedEntry && !visibleEntries.some((entry) => entry.id === selectedEntry.id),
  );
  const activeFilterCount = Number(statusFilter !== 'all') + Number(relationshipFilter !== 'all');
  return (
    <aside className="automation-execution-list" aria-label={t('Execution history')} data-xgc-role="automation-execution-list" data-xgc-id={resourceId}>
      <div className="automation-execution-list-chrome">
        <details
          className="automation-execution-filter-disclosure"
          open={activeFilterCount > 0 || undefined}
          data-xgc-role="automation-execution-filter-disclosure"
          data-xgc-id={resourceId}
        >
          <summary>
            <span>{t('Filters')}</span>
            <span className="automation-execution-list-indicators">
              {(streamState === 'connecting' || streamState === 'disconnected' || streamState === 'replaying') && (
                <span
                  title={executionStreamStateDescription(streamState)}
                  data-xgc-role="automation-execution-stream-state"
                  data-xgc-id={resourceId}
                >{executionStreamStateLabel(streamState)}</span>
              )}
              <span data-xgc-role="automation-execution-visible-count" data-xgc-id={resourceId}>
                {visibleEntries.length === orderedEntries.length
                  ? orderedEntries.length
                  : `${visibleEntries.length} / ${orderedEntries.length}`}
              </span>
            </span>
          </summary>
          <AutomationExecutionFilters
            resourceId={resourceId}
            statusFilter={statusFilter}
            relationshipFilter={relationshipFilter}
            selectedRunHidden={selectedRunHidden}
            selectedEntryId={selectedEntry?.id}
            onStatusFilterChange={onStatusFilterChange}
            onRelationshipFilterChange={onRelationshipFilterChange}
          />
        </details>
        {!complete && unavailableSources.includes('agent') && (
          <p
            className="automation-execution-availability"
            role="status"
            data-xgc-role="automation-execution-history-partial"
            data-xgc-id={resourceId}
          ><StatusText status="warning">{t('Partial history')}</StatusText><span>{t('Agent execution history is temporarily unavailable. Core ingress records shown below are partial.')}</span></p>
        )}
      </div>
      <div className="automation-execution-list-body automation-execution-rows">
        {visibleEntries.map((entry) => {
          const selected = entry.id === selectedEntry?.id;
          const status = executionEntryStatus(entry);
          const presentation = entry.run
            ? automationRunPresentation(entry.run, runDetailsById[entry.run.id])
            : undefined;
          const displayStatus = presentation?.status ?? status;
          return (
            <ControlButton
              appearance={selected ? 'default' : 'ghost'}
              className="automation-execution-row"
              type="button"
              key={entry.id}
              aria-current={selected ? 'true' : undefined}
              data-xgc-role="automation-execution-row"
              data-xgc-id={entry.id}
              data-xgc-phase={entry.phase}
              onClick={() => onSelect(entry.id)}
            >
              <span className="automation-execution-row-title">
                <strong data-xgc-role="automation-execution-row-time" data-xgc-id={entry.id}>
                  <time dateTime={entry.acceptedAt}>{formatAutomationExecutionListTimestamp(entry.acceptedAt)}</time>
                </strong>
              </span>
              <span className="automation-execution-meta">
                <AutomationExecutionStatus
                  status={displayStatus}
                  role="automation-run-status"
                  id={entry.id}
                  engineStatus={entry.run?.status}
                >{presentation?.shortLabel ?? ingressStatusLabel(entry.ingress!.status)}</AutomationExecutionStatus>
                <span data-xgc-role="automation-run-entry" data-xgc-id={entry.id}>
                  <span data-xgc-role="automation-run-relation" data-xgc-id={entry.id}>
                    {entry.run?.parentRunId ? (
                      <span data-xgc-role="automation-child-run-label" data-xgc-id={entry.id}>
                        {t(executionEntryListLabel(entry))}
                      </span>
                    ) : t(executionEntryListLabel(entry))}
                  </span>
                </span>

              </span>
            </ControlButton>
          );
        })}
        {orderedEntries.length > 0 && visibleEntries.length === 0 && (
          <div className="automation-execution-filter-empty" data-xgc-role="automation-execution-filter-empty" data-xgc-id={resourceId}>
            <strong>{t('No matching executions')}</strong>
            <span>{t('Change a filter to show cached runs.')}</span>
          </div>
        )}
        {hasMoreRuns && onLoadMore && (
          <ControlButton
            className="automation-execution-load-more"
            type="button"
            data-xgc-role="automation-execution-load-more"
            data-xgc-id={resourceId}
            disabled={loadingMore}
            aria-busy={loadingMore}
            onClick={() => void onLoadMore()}
          >
            <RefreshCw data-xgc-spinning={loadingMore ? 'true' : undefined} size={14} />
            {t('Load older executions')}
          </ControlButton>
        )}
      </div>
    </aside>
  );
}
