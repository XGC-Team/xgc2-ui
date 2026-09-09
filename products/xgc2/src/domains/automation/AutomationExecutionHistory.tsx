import { useEffect,useMemo,useState } from 'react';
import { EmptyState } from '@xgc2/ui-react';
import { useAutomationExecutionText } from './automationExecutionMessages';
import { useProductRouteVisible } from '../../shared/routeReady';
import type { AutomationSourceLocation } from './automationNavigation';
import type { ExecutionStreamState,ProcessInstance } from '../execution/executionPublic';
import '../../styles/automation-execution-history.css';
import { AutomationActiveRuns } from './AutomationActiveRuns';
import { AutomationExecutionHistoryList } from './AutomationExecutionHistoryList';
import { AutomationExecutionRunDetail } from './AutomationExecutionRunDetail';
import { AutomationRunSummaryLoading } from './AutomationExecutionFacts';
import { AutomationIngressExecutionDetail } from './AutomationIngressExecutionDetail';
import { AutomationNodeOccurrencesDrawer } from './AutomationNodeOccurrencesDrawer';
import type { ExecutionRelationshipFilter,ExecutionStatusFilter } from './AutomationExecutionFilters';
import type { AutomationNodeCatalogEntry } from './automationDefinitionContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import { automationNodeOccurrenceAggregates } from './automationInvocationModel';
import {
  automationRunSummaryIsActive,
  compareExecutionEntriesNewestFirst,
  executionEntryMatchesRelationshipFilter,
  executionEntryMatchesStatusFilter,
} from './automationExecutionHistoryPresentation';
import type {
  AutomationExecutionHistoryEntry,
  AutomationIngressTransitionLedger,
  AutomationExecutionRunSummary,
  AutomationRunControl,
} from './automationHistoryTypes';

export type AutomationExecutionHistoryProps = {
  resourceId: string;
  sourceLocation?: AutomationSourceLocation;
  entries: AutomationExecutionHistoryEntry[];
  selectedEntry?: AutomationExecutionHistoryEntry;
  selectedRun?: AutomationExecutionRunSummary;
  detail?: AutomationRunDetail;
  runDetailsById?: Readonly<Record<string,AutomationRunDetail>>;
  catalog: AutomationNodeCatalogEntry[];
  processInstances?: readonly ProcessInstance[];
  relatedRuns?: AutomationExecutionRunSummary[];
  streamState?: ExecutionStreamState;
  busy: boolean;
  hasMoreRuns?: boolean;
  loadingMore?: boolean;
  complete?: boolean;
  unavailableSources?: readonly 'agent'[];
  retryingIngressEventIds?: readonly string[];
  ingressRetryErrors?: Readonly<Record<string,string>>;
  ingressTransitionLedger?: AutomationIngressTransitionLedger;
  onSelect: (runId: string) => void;
  onRefreshRun: (runId: string) => void | Promise<unknown>;
  onLoadMore?: () => void | Promise<unknown>;
  onStop: (run: AutomationRunControl) => void | Promise<unknown>;
  onRetryIngress?: (entryId: string) => void | Promise<unknown>;
  onLoadMoreIngressTransitions?: (entryId: string) => void | Promise<unknown>;
  onOpenRelatedRun?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
  onOpenRunById?: (runId: string) => void | Promise<unknown>;
};

export function AutomationExecutionHistory({
  resourceId,
  sourceLocation,
  entries,
  selectedEntry,
  selectedRun,
  detail,
  runDetailsById = {},
  catalog,
  processInstances = [],
  relatedRuns = [],
  streamState,
  busy,
  hasMoreRuns = false,
  loadingMore = false,
  complete = true,
  unavailableSources = [],
  retryingIngressEventIds = [],
  ingressRetryErrors = {},
  ingressTransitionLedger,
  onSelect,
  onRefreshRun,
  onLoadMore,
  onStop,
  onRetryIngress,
  onLoadMoreIngressTransitions,
  onOpenRelatedRun,
  onOpenRunById,
}: AutomationExecutionHistoryProps) {
  const t = useAutomationExecutionText();
  const routeVisible = useProductRouteVisible();
  const [statusFilter,setStatusFilter] = useState<ExecutionStatusFilter>('all');
  const [relationshipFilter,setRelationshipFilter] = useState<ExecutionRelationshipFilter>('all');
  const [selectedOccurrenceNodeId,setSelectedOccurrenceNodeId] = useState('');
  const [selectedOccurrenceInvocationId,setSelectedOccurrenceInvocationId] = useState('');
  const orderedEntries = useMemo(
    () => [...entries].sort(compareExecutionEntriesNewestFirst),
    [entries],
  );
  const visibleEntries = useMemo(
    () => orderedEntries.filter((entry) => executionEntryMatchesStatusFilter(entry, statusFilter)
      && executionEntryMatchesRelationshipFilter(entry, relationshipFilter)),
    [orderedEntries,relationshipFilter,statusFilter],
  );
  const inProgressRuns = visibleEntries.flatMap((entry) => (
    entry.run && automationRunSummaryIsActive(entry.run) ? [entry.run] : []
  ));
  const occurrenceAggregates = useMemo(
    () => automationNodeOccurrenceAggregates(detail?.invocations ?? []),
    [detail?.invocations],
  );

  useEffect(() => {
    setSelectedOccurrenceNodeId('');
    setSelectedOccurrenceInvocationId('');
  }, [selectedEntry?.id]);

  useEffect(() => {
    if (!sourceLocation?.runId || sourceLocation.runId !== selectedRun?.id) return;
    setStatusFilter('all');
    setRelationshipFilter('all');
    setSelectedOccurrenceNodeId(sourceLocation.nodeId ?? '');
    setSelectedOccurrenceInvocationId(sourceLocation.invocationId ?? '');
  }, [selectedRun?.id,sourceLocation]);

  function openOccurrenceNode(nodeId: string, invocationId = '') {
    setSelectedOccurrenceNodeId(nodeId);
    setSelectedOccurrenceInvocationId(invocationId);
  }

  function openOccurrenceInvocation(invocationId: string) {
    const invocation = detail?.invocations.find((candidate) => candidate.id === invocationId);
    if (invocation) openOccurrenceNode(invocation.nodeId, invocation.id);
  }

  const selectedNodeInvocations = (detail?.invocations ?? [])
    .filter((invocation) => invocation.nodeId === selectedOccurrenceNodeId);
  const selectedNodeDefinition = detail?.snapshot?.automationSpec.nodes
    .find((node) => node.id === selectedOccurrenceNodeId);
  const showHistoryList = orderedEntries.length > 0 || !complete;

  return (
    <section
      className="automation-executions-view"
      data-empty={orderedEntries.length === 0 ? 'true' : undefined}
      data-xgc-role="automation-executions-view"
      data-xgc-id={resourceId}
    >
      {showHistoryList && (
        <AutomationExecutionHistoryList
          resourceId={resourceId}
          orderedEntries={orderedEntries}
          visibleEntries={visibleEntries}
          selectedEntry={selectedEntry}
          runDetailsById={runDetailsById}
          statusFilter={statusFilter}
          relationshipFilter={relationshipFilter}
          streamState={streamState}
          complete={complete}
          unavailableSources={unavailableSources}
          hasMoreRuns={hasMoreRuns}
          loadingMore={loadingMore}
          onStatusFilterChange={setStatusFilter}
          onRelationshipFilterChange={setRelationshipFilter}
          onSelect={onSelect}
          onLoadMore={onLoadMore}
        />
      )}

      <div
        className="automation-execution-main"
        data-has-active-runs={inProgressRuns.length > 0 ? 'true' : undefined}
        data-xgc-role="automation-execution-main"
        data-xgc-id={resourceId}
      >
        <AutomationActiveRuns
          resourceId={resourceId}
          runs={inProgressRuns}
          runDetailsById={runDetailsById}
          busy={busy}
          onStop={onStop}
        />
        {entries.length === 0 && !complete ? (
          <EmptyState
            appearance="plain"
            fill
            title={t('Execution history unavailable')}
            description={t('Agent execution history is temporarily unavailable. Core ingress records shown below are partial.')}
            data-xgc-role="automation-execution-history-unavailable"
            data-xgc-id={resourceId}
          />
        ) : entries.length === 0 ? (
          <EmptyState
            appearance="plain"
            fill
            title={t('No execution history')}
            description={t('Run this Automation to create its first execution record.')}
            data-xgc-role="automation-execution-empty"
            data-xgc-id={resourceId}
          />
        ) : selectedEntry && !selectedEntry.run ? (
          <AutomationIngressExecutionDetail
            entry={selectedEntry}
            transitionLedger={ingressTransitionLedger}
            retrying={Boolean(selectedEntry.ingress && retryingIngressEventIds.includes(selectedEntry.ingress.eventId))}
            retryError={selectedEntry.ingress ? ingressRetryErrors[selectedEntry.ingress.eventId] : undefined}
            onRetry={onRetryIngress}
            onLoadMoreTransitions={onLoadMoreIngressTransitions}
          />
        ) : selectedEntry?.run && !selectedRun ? (
          <AutomationRunSummaryLoading summary={selectedEntry.run} />
        ) : selectedRun ? (
          <AutomationExecutionRunDetail
            selectedEntry={selectedEntry}
            selectedRun={selectedRun}
            detail={detail}
            catalog={catalog}
            processInstances={processInstances}
            relatedRuns={relatedRuns}
            occurrenceAggregates={occurrenceAggregates}
            selectedOccurrenceNodeId={selectedOccurrenceNodeId}
            busy={busy}
            ingressTransitionLedger={ingressTransitionLedger}
            onRefreshRun={onRefreshRun}
            onOpenOccurrenceNode={openOccurrenceNode}
            onOpenOccurrenceInvocation={openOccurrenceInvocation}
            onOpenRelatedRun={onOpenRelatedRun}
            onOpenRunById={onOpenRunById}
            onLoadMoreIngressTransitions={onLoadMoreIngressTransitions}
          />
        ) : (
          <EmptyState
            appearance="plain"
            fill
            title={t('Select an execution')}
            description={t('Choose a run from the history to inspect its facts.')}
          />
        )}
      </div>

      {routeVisible && selectedRun && selectedOccurrenceNodeId && (
        <AutomationNodeOccurrencesDrawer
          runId={selectedRun.id}
          nodeId={selectedOccurrenceNodeId}
          displayName={selectedNodeDefinition?.displayName}
          invocations={selectedNodeInvocations}
          relations={detail?.relations}
          focusedInvocationId={selectedOccurrenceInvocationId}
          onOpenInvocation={openOccurrenceInvocation}
          onOpenRun={onOpenRunById}
          onClose={() => setSelectedOccurrenceNodeId('')}
        />
      )}
    </section>
  );
}
