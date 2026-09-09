import type { ConfigResourceBranch,ConfigResourceHead } from '../../shared/configResource';
import {
  AUTOMATION_SCHEMA_VERSION as GENERATED_AUTOMATION_SCHEMA_VERSION,
  type WorkflowActionControl,
  type WorkflowActionKind,
} from '../../shared/generatedWorkflowControlContract';
import { isAutomationTriggerKind } from './automationTriggerContracts';

export const AUTOMATION_DOMAIN = 'automation';
export const AUTOMATION_SCHEMA_VERSION = GENERATED_AUTOMATION_SCHEMA_VERSION;
export const AUTOMATION_NODE_DISPLAY_NAME_MAX_LENGTH = 160;
export const AUTOMATION_CALL_KIND = 'automation.call';
export const AUTOMATION_RETURN_KIND = 'automation.return';
export const AUTOMATION_STICKY_NOTE_DEFAULT_WIDTH = 240;
export const AUTOMATION_STICKY_NOTE_DEFAULT_HEIGHT = 160;
export const AUTOMATION_STICKY_NOTE_MIN_WIDTH = 150;
export const AUTOMATION_STICKY_NOTE_MIN_HEIGHT = 80;
export const AUTOMATION_STICKY_NOTE_MAX_SIZE = 4_096;
export const AUTOMATION_STICKY_NOTE_MAX_CONTENT_BYTES = 16 * 1_024;

/** User-facing workflow counts exclude entrypoint triggers. */
export function automationWorkflowNodeCount(nodes: readonly { kind: string }[]) {
  return nodes.filter((node) => !isAutomationTriggerKind(node.kind)).length;
}

const occupyingWorkNodeStatuses = new Set([
  'running','waiting','succeeded','skipped','compensating','compensated','failed','rejected',
]);

export function isFailedWorkflowRunStatus(status: string) {
  return status === 'failed' || status === 'rejected';
}

type AutomationWorkGraph = {
  nodes: readonly { id: string;kind: string }[];
  edges?: readonly { from: string;to: string }[];
};

/**
 * Work-node set for one Experiment Action. Triggers are still returned so the
 * occupancy helper can ignore them; wait nodes stay in the set and keep a
 * resident workflow (Algorithm, roscore) occupied after start effects succeed.
 * If the Action has no reachable work nodes, fall back to the whole document
 * so a disconnected one-step graph still occupies 1/1.
 */
export function automationActionWorkNodes(
  spec: AutomationWorkGraph,
  action?: { entryNodeId: string },
) {
  const nodes = spec.nodes;
  if (!action?.entryNodeId) return [...nodes];
  const outgoing = new Map<string,string[]>();
  for (const edge of spec.edges ?? []) {
    outgoing.set(edge.from,[...(outgoing.get(edge.from) ?? []),edge.to]);
  }
  const seen = new Set<string>();
  const stack = [action.entryNodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }
  const reachable = nodes.filter((node) => seen.has(node.id));
  return reachable.some((node) => !isAutomationTriggerKind(node.kind)) ? reachable : [...nodes];
}

/**
 * Occupied work nodes for an Experiment Action tile. Triggers do not count.
 * Waiting work nodes occupy the same way running ones do, so a resident
 * workflow stays full while it waits. A running or failed one-step workflow
 * occupies its only slot (1/1).
 */
export function automationWorkNodeOccupancy(
  nodes: readonly { id: string;kind: string }[],
  summaries: readonly { nodeId: string;status: string }[] = [],
) {
  const work = nodes.filter((node) => !isAutomationTriggerKind(node.kind));
  const statusById = new Map(summaries.map((item) => [item.nodeId,item.status]));
  let ready = 0;
  let failed = false;
  for (const node of work) {
    const status = statusById.get(node.id);
    if (status && isFailedWorkflowRunStatus(status)) failed = true;
    if (status && occupyingWorkNodeStatuses.has(status)) ready += 1;
  }
  return { ready,total: work.length,failed };
}

export type AutomationNamespace = {
  domain: typeof AUTOMATION_DOMAIN;
  namespaceId: string;
  parentNamespaceId?: string;
  name: string;
  revision: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AutomationDocument = {
  head: ConfigResourceHead;
  branch: ConfigResourceBranch;
  spec: AutomationSpec;
};

export type AutomationMetadata = { name: string;description: string;tags: string[] };
export type AutomationTargetPolicy =
  | { mode: 'fixed';executionTargetId: string }
  | { mode: 'inherit';executionTargetId: '' };

export function automationTargetPolicyInheritsExperiment(policy: AutomationTargetPolicy) {
  return policy.mode === 'inherit' && policy.executionTargetId === '';
}

export function automationExecutionTargetId(policy: AutomationTargetPolicy, inheritedTargetId: string) {
  return automationTargetPolicyInheritsExperiment(policy) ? inheritedTargetId : policy.executionTargetId;
}

export type AutomationConcurrencyScope = 'target' | 'workflow' | 'family' | 'key';
export type AutomationConcurrencyConflict = 'queue' | 'reject' | 'replace';
export type AutomationConcurrencyAppliesTo = 'root' | 'all';
export type AutomationConcurrencyPolicy = {
  scope: AutomationConcurrencyScope;
  limit: number;
  keyExpression?: string;
  onConflict: AutomationConcurrencyConflict;
  appliesTo: AutomationConcurrencyAppliesTo;
};
export type AutomationAdmission = { concurrency?: AutomationConcurrencyPolicy };
export type AutomationParameterKind = 'string' | 'boolean' | 'integer' | 'number' | 'object' | 'array';
export type AutomationParameterSchema = { title?: string;description?: string;fields: AutomationParameterField[] };
export type AutomationParameterPathKind = 'file' | 'directory';
export type AutomationParameterValueSchema = {
  kind: AutomationParameterKind;
  sensitive?: boolean;
  string?: {
    default?: string;
    enum?: string[];
    /** Host path picker: file or directory. Authoring-only; not part of runtime validation schema. */
    pathKind?: AutomationParameterPathKind;
    /** When pathKind is file, only these suffixes appear in the picker (e.g. ['.world']). */
    fileExtensions?: string[];
  };
  boolean?: { default?: boolean };
  integer?: { default?: number;minimum?: number;maximum?: number };
  number?: { default?: number;minimum?: number;maximum?: number };
  object?: { fields: AutomationParameterField[] };
  array?: { items: AutomationParameterValueSchema;minItems?: number;maxItems?: number;default?: unknown[] };
};
export type AutomationParameterField = AutomationParameterValueSchema & {
  name: string;
  label?: string;
  description?: string;
  required?: boolean;
};
export type AutomationAction = {
  id: string;
  version: number;
  label: string;
  description?: string;
  entryNodeId: string;
  kind: WorkflowActionKind;
  inputSchema: AutomationParameterSchema;
  resultSchema: AutomationParameterSchema;
  controls: WorkflowActionControl[];
  admission: AutomationAdmission;
  requiredCapabilities: string[];
  projectionContracts: string[];
};
export type AutomationRetryPolicy = { maxAttempts: number;initialBackoff: number;maxBackoff: number };
export type AutomationParameterBinding = {
  target: string;
  expression: string;
  language: 'xgc-expression-v2';
};
export type AutomationNode = {
  id: string;
  displayName: string;
  kind: string;
  typeVersion: number;
  effectRole?: 'session-sensitive' | 'bootstrap-provider';
  parameters: Record<string,unknown>;
  parameterBindings?: AutomationParameterBinding[];
  retry: AutomationRetryPolicy;
  position?: { x: number;y: number };
};
export type AutomationEdge = {
  id: string;
  from: string;
  to: string;
  sourcePort?: string;
  condition: 'success' | 'failure' | 'always';
  route?: string;
};
export type AutomationStickyNote = {
  id: string;
  content: string;
  position: { x: number;y: number };
  width: number;
  height: number;
};
export type AutomationSpec = {
  schemaVersion: number;
  metadata: AutomationMetadata;
  targetPolicy: AutomationTargetPolicy;
  actions: AutomationAction[];
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  stickyNotes: AutomationStickyNote[];
};

export type AutomationJSONSchema = Record<string,unknown>;
export type AutomationNodeOutputPort = { id: string;label: string };
export const AUTOMATION_NODE_TRAITS = ['call','child-run-producer','control','effect','pure','resource','trigger','wait'] as const;
export type AutomationNodeTrait = typeof AUTOMATION_NODE_TRAITS[number];
export type AutomationNodeCatalogEntry = {
  kind: string;
  typeVersion: number;
  label: string;
  category: string;
  traits: AutomationNodeTrait[];
  parameterSchema: AutomationJSONSchema;
  outputSchema?: AutomationJSONSchema;
  outputPorts?: AutomationNodeOutputPort[] | null;
  canCompensate?: boolean;
};

export type AutomationNodeLibraryItem = {
  id: string;
  runtimeKind: string;
  runtimeTypeVersion: number;
  hiddenFromDefaultLibrary?: boolean;
  label: string;
  description?: string;
  category: string;
  keywords: string[];
  initialParameters: Record<string,unknown>;
  editableParameterSchema: AutomationJSONSchema;
  editableParameterPath: 'root' | 'parameters';
  outputSchema?: AutomationJSONSchema;
  outputPorts?: AutomationNodeOutputPort[];
  canCompensate?: boolean;
};

export type CreateAutomationInput = { namespaceId?: string;spec: AutomationSpec;reason: string;requestId?: string;idempotencyKey?: string };
export type CommitAutomationInput = {
  spec: AutomationSpec;
  baseCommitId: string;
  expectedBranchRevision: number;
  expectedResourceRevision: number;
  namespaceId?: string;
  reason: string;
  requestId?: string;
  idempotencyKey?: string;
};
export type AutomationResourceStateInput = { expectedRevision: number;reason: string;requestId?: string;idempotencyKey?: string };
export type CreateAutomationNamespaceInput = { parentNamespaceId?: string;name: string;requestId?: string;idempotencyKey?: string;reason?: string };
export type UpdateAutomationNamespaceInput = { name?: string;parentNamespaceId?: string;expectedRevision: number;requestId?: string;idempotencyKey?: string };
export type ArchiveAutomationNamespaceInput = { expectedRevision: number;requestId?: string;idempotencyKey?: string };
