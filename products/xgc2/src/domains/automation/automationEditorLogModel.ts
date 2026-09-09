import type { ProcessInstance } from '../execution/executionPublic';
import type {
  AutomationNode,
  AutomationSpec,
} from './automationDefinitionContracts';
import type { AutomationRun } from './automationRunContracts';
import type {
  AutomationNodeExecutionSummary,
  AutomationRunDetail,
} from './automationExecutionContracts';
import type { AutomationExecutionRunSummary } from './automationHistoryTypes';

export type AutomationRunView = AutomationRun | AutomationExecutionRunSummary;

export type AutomationLogSource = {
  key: string;
  entityType: 'orchestration' | 'process-instance';
  entityId: string;
  targetId: string;
  label: string;
  status: string;
  nodeId?: string;
  process?: ProcessInstance;
};

export type AutomationNodeResult = {
  node: Pick<AutomationNode,'id' | 'displayName' | 'kind'>;
  run?: AutomationNodeExecutionSummary;
};

export type AutomationSourceIssue = {
  key: string;
  label: string;
  message: string;
};

export type AutomationDetailView = 'data' | 'logs' | 'errors';

export function automationEditorNodeResults(definition: AutomationSpec, nodeSummaries: AutomationNodeExecutionSummary[]): AutomationNodeResult[] {
  const runsByNode = new Map(nodeSummaries.map((run) => [run.nodeId,run]));
  const result: AutomationNodeResult[] = definition.nodes.map((node) => ({ node,run: runsByNode.get(node.id) }));
  const known = new Set(definition.nodes.map((node) => node.id));
  for (const nodeSummary of nodeSummaries) {
    if (known.has(nodeSummary.nodeId)) continue;
    result.push({ node: { id: nodeSummary.nodeId,displayName: nodeSummary.nodeId,kind: nodeSummary.kind },run: nodeSummary });
  }
  return result;
}

export function automationEditorLogSources(run: AutomationRunView, definition: AutomationSpec, processes: ProcessInstance[], executionTargetId: string): AutomationLogSource[] {
  return [
    {
      key: `orchestration:${run.id}`,entityType: 'orchestration',entityId: run.id,targetId: executionTargetId,
      label: 'Automation run',status: run.status,
    },
    ...processes
      .map((instance): AutomationLogSource => ({
        key: `process-instance:${instance.id}`,entityType: 'process-instance',entityId: instance.id,
        targetId: instance.targetId || executionTargetId,label: processLabel(instance, definition),status: instance.observedState,
        nodeId: processNodeID(instance),process: instance,
      }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.entityId.localeCompare(right.entityId)),
  ];
}

export function automationEditorContextIssues(
  run: AutomationRunView,
  detail: AutomationRunDetail | undefined,
  definition: AutomationSpec,
  processes: ProcessInstance[],
  nodeID?: string,
): AutomationSourceIssue[] {
  const nodeSummaries = nodeID ? (detail?.nodeSummaries ?? []).filter((node) => node.nodeId === nodeID) : detail?.nodeSummaries ?? [];
  const scopedProcesses = nodeID ? processes.filter((process) => processNodeID(process) === nodeID) : processes;
  return compactIssues([
    !nodeID && detail?.error ? { key: 'detail',label: 'Execution data unavailable',message: detail.error } : undefined,
    !nodeID && run.status === 'failed' && 'reason' in run && run.reason
      ? { key: 'run',label: 'Automation run',message: run.reason }
      : undefined,
    ...nodeSummaries.map((node) => node.status === 'failed' || node.error
      ? { key: `node:${node.nodeId}`,label: displayNameForNode(node.nodeId, definition),message: node.error || 'Node failed without an error message.' }
      : undefined),
    ...scopedProcesses.flatMap((process) => [
      process.lastError ? { key: `process:${process.id}`,label: processLabel(process, definition),message: process.lastError } : undefined,
      process.readiness.status === 'failing' && process.readiness.message
        ? { key: `readiness:${process.id}`,label: `${processLabel(process, definition)} readiness`,message: process.readiness.message }
        : undefined,
      process.liveness.status === 'failing' && process.liveness.message
        ? { key: `liveness:${process.id}`,label: `${processLabel(process, definition)} liveness`,message: process.liveness.message }
        : undefined,
    ]),
  ]);
}

export function automationEditorStatusSummary(status: string, nodeSummary?: AutomationNodeExecutionSummary) {
  const duration = durationBetween(nodeSummary?.startedAt, nodeSummary?.finishedAt ?? nodeSummary?.updatedAt);
  return `${readableStatus(status)}${duration ? ` in ${duration}` : ''}`;
}

export function automationEditorExecutionSummary(status: string, startedAt?: string, stoppedAt?: string) {
  const duration = durationBetween(startedAt, stoppedAt);
  return `${readableStatus(status)}${duration ? ` in ${duration}` : ''}`;
}

export function shortAutomationEditorRunId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-3)}` : value;
}

export function formatAutomationEditorTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatAutomationEditorTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit',minute: '2-digit',second: '2-digit' });
}

export function automationEditorPanelID(resourceId: string) {
  return `automation-editor-logs-panel-${resourceId.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

function compactIssues(issues: Array<AutomationSourceIssue | undefined>): AutomationSourceIssue[] {
  return issues.filter((issue): issue is AutomationSourceIssue => Boolean(issue));
}

function processLabel(instance: ProcessInstance, definition: AutomationSpec) {
  const nodeID = processNodeID(instance);
  return definition.nodes.find((node) => node.id === nodeID)?.displayName || instance.definitionId || instance.id;
}

function processNodeID(instance: ProcessInstance) {
  return /\/node\/([^/]+)$/.exec(instance.scope)?.[1];
}

function displayNameForNode(nodeID: string, definition: AutomationSpec) {
  return definition.nodes.find((node) => node.id === nodeID)?.displayName || nodeID;
}

function durationBetween(start?: string, end?: string) {
  if (!start || !end) return '';
  const elapsed = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '';
  if (elapsed < 1_000) return `${elapsed}ms`;
  if (elapsed < 60_000) return `${(elapsed / 1_000).toFixed(elapsed < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(elapsed / 60_000);
  return `${minutes}m ${Math.floor((elapsed % 60_000) / 1_000)}s`;
}

function readableStatus(value: string) {
  return value.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase());
}
