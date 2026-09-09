import type { ExecutionStreamState } from '../execution/executionPublic';
import { isIngressStatusActive,isRunStatusActive } from '../../shared/executionStatusVocabulary';
import type { ExecutionRelationshipFilter,ExecutionStatusFilter } from './AutomationExecutionFilters';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionRunSummary,
  AutomationRunControl,
} from './automationHistoryTypes';

export function compareExecutionEntriesNewestFirst(
  left: AutomationExecutionHistoryEntry,
  right: AutomationExecutionHistoryEntry,
) {
  return right.acceptedAt.localeCompare(left.acceptedAt) || right.id.localeCompare(left.id);
}

export function executionEntryMatchesStatusFilter(
  entry: AutomationExecutionHistoryEntry,
  filter: ExecutionStatusFilter,
) {
  if (filter === 'all') return true;
  if (filter === 'in-progress') return executionEntryIsInProgress(entry);
  if (filter === 'terminal') return !executionEntryIsInProgress(entry);
  if (filter.startsWith('ingress:')) return entry.ingress?.status === filter.slice('ingress:'.length);
  return entry.run?.status === filter;
}

export function executionEntryMatchesRelationshipFilter(
  entry: AutomationExecutionHistoryEntry,
  filter: ExecutionRelationshipFilter,
) {
  if (filter === 'all') return true;
  return filter === 'child' ? Boolean(entry.run?.parentRunId) : !entry.run?.parentRunId;
}

export function executionEntryStatus(entry: AutomationExecutionHistoryEntry) {
  return entry.run?.status ?? entry.ingress!.status;
}

export function executionEntryIsInProgress(entry: AutomationExecutionHistoryEntry) {
  return entry.run
    ? automationRunSummaryIsActive(entry.run)
    : entry.ingress !== undefined && isIngressStatusActive(entry.ingress.status);
}

export function automationRunSummaryIsActive(run: AutomationRunControl) {
  return isRunStatusActive(run.status);
}

export function executionEntrySummary(entry: AutomationExecutionHistoryEntry) {
  if (entry.run) return automationRunEntrySummary(entry.run);
  const ingress = entry.ingress!;
  return `${ingress.sourceKind} · ${ingress.entrypointNodeId}`;
}

export function executionEntryListLabel(entry: AutomationExecutionHistoryEntry) {
  if (!entry.run) return triggerKindListLabel(entry.ingress!.triggerKind);
  if (entry.run.parentRunId || entry.run.callNodeId) return 'Called workflow';
  if (entry.run.triggerInvocation) return triggerKindListLabel(entry.run.triggerInvocation.kind);
  if (entry.run.throughNodeId) return 'Manual trigger';
  return 'Workflow run';
}

function triggerKindListLabel(kind: string) {
  const normalized = kind.replace(/^trigger\./, '').replaceAll(/[-_]/g, ' ').trim();
  if (normalized === 'manual') return 'Manual trigger';
  if (normalized === 'webhook') return 'Webhook trigger';
  if (normalized === 'schedule' || normalized === 'scheduled') return 'Scheduled trigger';
  if (normalized === 'form' || normalized === 'form submission') return 'Form trigger';
  if (normalized === 'chat' || normalized === 'chat message') return 'Chat trigger';
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)} trigger` : 'Workflow run';
}

export function automationRunEntrySummary(run: AutomationExecutionRunSummary) {
  if (run.throughNodeId) return `Through node ${run.throughNodeId}`;
  if (run.callNodeId) return `Called by ${run.callNodeId}`;
  if (run.triggerInvocation) return `${run.triggerInvocation.kind} · ${run.triggerInvocation.nodeId}`;
  return 'Workflow root';
}

export function automationRunVersionSummary(run: AutomationExecutionRunSummary) {
  return `Definition v${run.definitionVersion}`;
}

export function automationRunRelationshipSummary(run: AutomationExecutionRunSummary) {
  if (!run.parentRunId) return 'Root run';
  const root = run.rootRunId && run.rootRunId !== run.parentRunId
    ? ` · root ${shortAutomationExecutionId(run.rootRunId)}`
    : '';
  return `Child · depth ${run.depth ?? 1} · parent ${shortAutomationExecutionId(run.parentRunId)}${root}`;
}

export function automationRunAdmissionSummary(run: AutomationExecutionRunSummary) {
  if (run.admissionMode === 'parallel') return 'Parallel';
  const behavior = run.admissionOnConflict ?? 'queue';
  return `${behavior} on conflict · limit ${run.admissionLimit ?? '—'} · ${run.admissionScope}`;
}

export function formatAutomationExecutionTimestamp(value?: string) {
  if (!value) return '—';
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

export function formatAutomationExecutionListTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return timestamp.toLocaleString(undefined, {
    month: 'short',day: 'numeric',hour: '2-digit',minute: '2-digit',second: '2-digit',
  });
}

export function shortAutomationExecutionId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-3)}` : value;
}

export function executionStreamStateLabel(state: ExecutionStreamState) {
  if (state === 'connected') return 'Live';
  if (state === 'replaying') return 'Replaying';
  if (state === 'connecting') return 'Connecting';
  return 'Offline';
}

export function executionStreamStateDescription(state: ExecutionStreamState) {
  if (state === 'connected') return 'Execution updates are live and fenced by event sequence.';
  if (state === 'replaying') return 'Replaying durable execution events before returning live.';
  if (state === 'connecting') return 'Connecting to durable execution updates.';
  return 'Live execution updates are disconnected; cached Run facts remain available.';
}
