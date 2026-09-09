import {
  automationWorkflowNodeCount,
  compareAutomationExecutionRunsForControl,
  isAutomationTriggerKind,
  isAutomationExecutionRunActive,
  type AutomationDocument,
  type AutomationExecutionHistoryEntry,
  type AutomationNodeCatalogEntry,
  type AutomationRunDetail,
  type AutomationRunSummaryView,
} from '../../domains/automation/automationPublic';
import type { ProcessInstance } from '../../domains/execution/executionPublic';

export const automationWorkflowControlViews = ['controls','whiteboard','history','logs'] as const;
export type AutomationWorkflowControlView = (typeof automationWorkflowControlViews)[number];
export const automationWorkflowControlSwitcherViews = ['controls','whiteboard'] as const;
export type AutomationWorkflowControlSwitcherView = (typeof automationWorkflowControlSwitcherViews)[number];
export const automationWorkflowAuditViews = ['history','logs'] as const;
export type AutomationWorkflowAuditView = (typeof automationWorkflowAuditViews)[number];
export type AutomationWorkflowPanelView = AutomationWorkflowControlView | AutomationWorkflowAuditView;

export type AutomationWorkflowPanelRuntime = {
  targetId: string;
  documents: AutomationDocument[];
  catalog: AutomationNodeCatalogEntry[];
  runSummaries: AutomationRunSummaryView[];
  runDetailsById: Record<string,AutomationRunDetail>;
  loading: boolean;
  error: string;
  experimentResourceId?: string;
  historyEntries?: AutomationExecutionHistoryEntry[];
  processInstances?: ProcessInstance[];
  executionStreamState?: 'connecting' | 'connected' | 'replaying' | 'disconnected';
  loadRunDetail?: (runId: string,expectedRevision?: number) => Promise<AutomationRunDetail>;
  refreshExecutionHistory?: (automationResourceId: string) => Promise<AutomationExecutionHistoryEntry[]>;
};

export function configuredAutomationResourceIds(options: Record<string,unknown>) {
  if (!Array.isArray(options.automationResourceIds)) return [];
  return Array.from(new Set(options.automationResourceIds
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)));
}

const algorithmActionTileLabels: Record<string,string> = {
  build: 'Build',
  custom1: 'Algorithm',
  'replay-3d': 'Replay 3D',
  'replay-image': 'Replay image',
};

export function automationActionButtonLabel(port: {
  id: string;
  label?: string;
  action?: { label?: string };
}) {
  const tile = algorithmActionTileLabels[port.id];
  if (tile) return tile;
  const actionLabel = port.action?.label?.trim() || '';
  if (actionLabel) return actionLabel;
  return humanizeActionPortLabel(port.label || port.id);
}

function humanizeActionPortLabel(value: string) {
  const label = value.trim().replace(/[-_]+/g,' ').replace(/\s+/g,' ');
  return label ? `${label[0]!.toUpperCase()}${label.slice(1)}` : 'Action';
}

export function automationWorkflowControlView(value: unknown): AutomationWorkflowControlView {
  return typeof value === 'string' && automationWorkflowControlViews.includes(value as AutomationWorkflowControlView)
    ? value as AutomationWorkflowControlView
    : 'controls';
}

export function automationWorkflowControlSwitcherView(value: unknown): AutomationWorkflowControlSwitcherView {
  const view = automationWorkflowControlView(value);
  return view === 'controls' || view === 'whiteboard' ? view : 'controls';
}

export function automationWorkflowAuditView(value: unknown): AutomationWorkflowAuditView {
  return typeof value === 'string' && automationWorkflowAuditViews.includes(value as AutomationWorkflowAuditView)
    ? value as AutomationWorkflowAuditView
    : 'history';
}

export function automationWorkflowHistoryLimit(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(50, Math.trunc(value)))
    : 10;
}

export function automationWorkflowFollowLogs(value: unknown) {
  return value !== false;
}

export function automationWorkflowPanelRuntime(value: unknown): AutomationWorkflowPanelRuntime | undefined {
  if (!isRecord(value)
    || !Array.isArray(value.documents)
    || !Array.isArray(value.catalog)
    || !Array.isArray(value.runSummaries)
    || !isRecord(value.runDetailsById)) return undefined;
  return {
    targetId: typeof value.targetId === 'string' ? value.targetId : 'local',
    documents: value.documents as AutomationDocument[],
    catalog: value.catalog as AutomationNodeCatalogEntry[],
    runSummaries: value.runSummaries as AutomationRunSummaryView[],
    runDetailsById: value.runDetailsById as Record<string,AutomationRunDetail>,
    loading: value.loading === true,
    error: typeof value.error === 'string' ? value.error : '',
    ...(typeof value.experimentResourceId === 'string' ? { experimentResourceId: value.experimentResourceId } : {}),
    ...(Array.isArray(value.historyEntries) ? { historyEntries: value.historyEntries as AutomationExecutionHistoryEntry[] } : {}),
    ...(Array.isArray(value.processInstances) ? { processInstances: value.processInstances as ProcessInstance[] } : {}),
    ...(isExecutionStreamState(value.executionStreamState) ? { executionStreamState: value.executionStreamState } : {}),
    ...(typeof value.loadRunDetail === 'function' ? { loadRunDetail: value.loadRunDetail as AutomationWorkflowPanelRuntime['loadRunDetail'] } : {}),
    ...(typeof value.refreshExecutionHistory === 'function' ? { refreshExecutionHistory: value.refreshExecutionHistory as AutomationWorkflowPanelRuntime['refreshExecutionHistory'] } : {}),
  };
}

export function automationWorkflowHistoryEntries(
  runtime: AutomationWorkflowPanelRuntime,
  resourceId: string,
  limit: number,
) {
  const entries = runtime.historyEntries?.filter((entry) => entry.automationResourceId === resourceId)
    ?? runtime.runSummaries
      .filter((run) => run.automationResourceId === resourceId)
      .map(automationHistoryEntryFromRun);
  return entries
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt) || right.id.localeCompare(left.id))
    .slice(0, limit);
}

export function automationRunsForDocument(
  document: AutomationDocument,
  runs: AutomationRunSummaryView[],
  limit = 50,
) {
  return runs
    .filter((run) => run.automationResourceId === document.head.resourceId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.revision - left.revision)
    .slice(0, limit);
}

/** Strict origin fence for panels mounted inside an Experiment dashboard. */
export function automationRunBelongsToExperiment(
  run: AutomationRunSummaryView,
  experimentResourceId: string,
) {
  return run.sourceKind === 'experiment'
    && run.sourceRef?.domain === 'experiment'
    && run.sourceRef.resourceId === experimentResourceId;
}

export function activeAutomationRunsForDocument(
  document: AutomationDocument,
  runs: AutomationRunSummaryView[],
) {
  return automationRunsForDocument(document, runs)
    .filter(isAutomationExecutionRunActive)
    .sort(compareAutomationExecutionRunsForControl);
}

type AutomationProgressDefinition = {
  id: string;
  kind: string;
};

export type AutomationRunProgressOptions = {
  /**
   * When true, trigger nodes contribute as a **single** progress unit (manual +
   * automation-call collapse to one slot). First accepted entry advances the bar once.
   * Default false excludes triggers (generic Automation panels).
   */
  includeTriggers?: boolean;
};

const readyStatuses = new Set(['succeeded','skipped','compensating','compensated']);
const completedStatuses = new Set(['succeeded','compensated','skipped']);
const activeStatuses = new Set(['running','waiting']);

export function automationRunProgress(
  detail?: AutomationRunDetail,
  definitions: AutomationProgressDefinition[] = [],
  options: AutomationRunProgressOptions = {},
) {
  const nodes = detail?.nodeSummaries ?? [];
  const sourceDefinitions = definitions.length > 0
    ? definitions
    : nodes.map((node) => ({ id: node.nodeId,kind: node.kind }));
  const workDefinitions = sourceDefinitions.filter((node) => !isAutomationTriggerKind(node.kind));
  const triggerDefinitions = sourceDefinitions.filter((node) => isAutomationTriggerKind(node.kind));
  const workNodeIds = new Set(workDefinitions.map((node) => node.id));
  const workNodes = nodes.filter((node) => workNodeIds.has(node.nodeId));
  let completed = workNodes.filter((node) => completedStatuses.has(node.status)).length;
  let failed = workNodes.filter((node) => node.status === 'failed').length;
  let active = workNodes.filter((node) => activeStatuses.has(node.status)).length;
  let ready = workNodes.filter((node) => readyStatuses.has(node.status)).length;
  let total = workDefinitions.length;

  if (options.includeTriggers && triggerDefinitions.length > 0) {
    // All entry triggers → one slot (not one per trigger kind).
    total += 1;
    const triggerIds = new Set(triggerDefinitions.map((node) => node.id));
    const triggerNodes = nodes.filter((node) => triggerIds.has(node.nodeId));
    const triggerReady = triggerNodes.some((node) => readyStatuses.has(node.status));
    const triggerFailed = triggerNodes.some((node) => node.status === 'failed');
    const triggerActive = triggerNodes.some((node) => activeStatuses.has(node.status));
    if (triggerReady) {
      ready += 1;
      completed += 1;
    } else if (triggerFailed) {
      failed += 1;
    } else if (triggerActive || triggerNodes.length > 0) {
      active += 1;
    }
  }

  return {
    total,
    completed,
    failed,
    active,
    ready,
    percent: total > 0 ? Math.round((ready / total) * 100) : 0,
  };
}

export function automationWorkflowNodeLabel(nodes: readonly { kind: string }[]) {
  const count = automationWorkflowNodeCount(nodes);
  return `${count} ${count === 1 ? 'node' : 'nodes'}`;
}

export function validateAutomationWorkflowControlOptions(options: Record<string,unknown>) {
  return validateAutomationWorkflowPanelOptions(options, 'control');
}

export function validateAutomationWorkflowAuditOptions(options: Record<string,unknown>) {
  return validateAutomationWorkflowPanelOptions(options, 'audit');
}

function validateAutomationWorkflowPanelOptions(options: Record<string,unknown>, variant: 'control' | 'audit') {
  const rawIds = options.automationResourceIds;
  if (rawIds !== undefined && !Array.isArray(rawIds)) return 'Automation workflow IDs must be an array.';
  if (Array.isArray(rawIds) && rawIds.some((value) => typeof value !== 'string' || !value.trim())) {
    return 'Automation workflow IDs must be non-empty strings.';
  }
  if (options.defaultView !== undefined) {
    const normalized = variant === 'control'
      ? automationWorkflowControlView(options.defaultView)
      : automationWorkflowAuditView(options.defaultView);
    if (normalized !== options.defaultView) {
      return variant === 'control'
        ? 'Default view must be controls, whiteboard, history, or logs.'
        : 'Default view must be history or logs.';
    }
  }
  if (options.historyLimit !== undefined && (
    typeof options.historyLimit !== 'number'
    || !Number.isInteger(options.historyLimit)
    || options.historyLimit < 1
    || options.historyLimit > 50
  )) return 'History limit must be an integer from 1 to 50.';
  if (variant === 'control' && options.panelWorkflowControls !== undefined
    && options.panelWorkflowControls !== 'visible'
    && options.panelWorkflowControls !== 'hidden') {
    return 'Panel workflow controls must be visible or hidden.';
  }
  return '';
}

function automationHistoryEntryFromRun(run: AutomationRunSummaryView): AutomationExecutionHistoryEntry {
  return {
    id: `run:${run.id}`,
    runId: run.id,
    targetId: run.targetId,
    automationResourceId: run.automationResourceId,
    acceptedAt: run.createdAt,
    phase: 'run',
    run: {
      ...run,
      definitionId: run.automationResourceId,
      definitionVersion: 1,
      configDigest: '',
      executionPlanDigest: '',
      registryDigest: '',
      definitionDigest: '',
      executionModel: 'orchestration-occurrence-v1',
      admissionMode: 'limited',
      admissionScope: 'root',
      acceptedAt: run.createdAt,
      createdAt: run.createdAt,
    },
  };
}

function isRecord(value: unknown): value is Record<string,unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isExecutionStreamState(value: unknown): value is AutomationWorkflowPanelRuntime['executionStreamState'] {
  return value === 'connecting' || value === 'connected' || value === 'replaying' || value === 'disconnected';
}
