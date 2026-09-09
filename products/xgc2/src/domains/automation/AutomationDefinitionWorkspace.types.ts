import type { ExecutionStreamState,ProcessDefinition,ProcessInstance } from '../execution/executionPublic';
import type {
  AutomationExecutionHistoryEntry,
  AutomationExecutionRunSummary,
  AutomationIngressTransitionLedger,
  AutomationRunControl,
} from './automationHistoryTypes';
import type {
  AutomationDocument,
  AutomationNodeCatalogEntry,
} from './automationDefinitionContracts';
import type {
  AutomationActivation,
  AutomationActivationCredentialSession,
  AutomationTestListenerSession,
  AutomationTriggerEventReceipt,
} from './automationTriggerContracts';
import type {
  MCPConnection,
  MCPCatalogSnapshot,
} from './automationMCPContracts';
import type { AutomationRun } from './automationRunContracts';
import type { AutomationRunDetail } from './automationExecutionContracts';
import type { AutomationNodeWebComposition } from './nodes/automationNodeWebComposition';
import type { AutomationSourceLocation } from './automationNavigation';

export type AutomationWorkspaceView = 'editor' | 'executions';

export type AutomationDefinitionAuthoringCapability = {
  catalog: AutomationNodeCatalogEntry[];
  processDefinitions?: ProcessDefinition[];
  automationDocuments?: readonly AutomationDocument[];
  mcpConnections?: readonly MCPConnection[];
  mcpCatalogs?: Readonly<Record<string,MCPCatalogSnapshot>>;
  /** Optional static Automation node leaf composition (default empty). */
  nodeComposition?: AutomationNodeWebComposition;
  onBack: () => void;
  onCommit: (base: AutomationDocument, draft: AutomationDocument['spec'], reason: string) => Promise<AutomationDocument>;
};

export type AutomationDefinitionExecutionCapability = {
  targetId?: string;
  processInstances?: ProcessInstance[];
  preferredRunId?: string;
  sourceLocation?: AutomationSourceLocation;
  historyEntries?: AutomationExecutionHistoryEntry[];
  historyComplete?: boolean;
  historyUnavailableSources?: readonly 'agent'[];
  retryingIngressEventIds?: readonly string[];
  ingressRetryErrors?: Readonly<Record<string,string>>;
  ingressTransitionLedgers?: Readonly<Record<string,AutomationIngressTransitionLedger>>;
  hasMoreRuns?: boolean;
  runsLoadingMore?: boolean;
  runDetailsById: Record<string,AutomationRunDetail>;
  streamState?: ExecutionStreamState;
  onRun: (document: AutomationDocument, parameters: Record<string,unknown>, throughNodeId?: string, entrypointNodeId?: string) => Promise<AutomationRun>;
  onStop: (run: AutomationRunControl) => Promise<AutomationRun>;
  onRefreshRun: (runId: string) => Promise<unknown>;
  onRetainRunDetail: (runId:string) => () => void;
  onLoadMoreRuns?: () => void | Promise<unknown>;
  onLoadRun?: (runId: string) => Promise<AutomationRun>;
  onOpenRelatedRun?: (run: AutomationExecutionRunSummary) => void | Promise<unknown>;
  onExecutionHistoryVisibilityChange?: (resourceId: string, visible: boolean) => void;
  onRetryExecutionIngress?: (entryId: string) => void | Promise<unknown>;
  onLoadIngressTransitions?: (entryId: string, signal?: AbortSignal) => void | Promise<unknown>;
  onLoadMoreIngressTransitions?: (entryId: string, signal?: AbortSignal) => void | Promise<unknown>;
};

export type AutomationDefinitionTriggerCapability = {
  activations?: readonly AutomationActivation[];
  activationCredentials?: readonly AutomationActivationCredentialSession[];
  testListenerSessions?: readonly AutomationTestListenerSession[];
  onActivate: (document: AutomationDocument, entrypointNodeId: string) => Promise<unknown>;
  onDeactivate: (document: AutomationDocument, entrypointNodeId: string) => Promise<unknown>;
  onDismissActivationCredential: (resourceId: string, entrypointNodeId: string) => void;
  onStartTestListener: (document: AutomationDocument, entrypointNodeId: string, ttlSeconds: number) => Promise<unknown>;
  onCancelTestListener: (resourceId: string, entrypointNodeId: string) => Promise<unknown>;
  onSubmitTestEvent: (resourceId: string, entrypointNodeId: string, payload: Record<string,unknown>) => Promise<AutomationTriggerEventReceipt>;
  onRunOnce: (document: AutomationDocument, entrypointNodeId: string) => Promise<AutomationTriggerEventReceipt>;
};

export type AutomationDefinitionWorkspaceProps = {
  document: AutomationDocument;
  authoring: AutomationDefinitionAuthoringCapability;
  execution: AutomationDefinitionExecutionCapability;
  triggers: AutomationDefinitionTriggerCapability;
};
