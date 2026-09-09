import type { ComponentType,ReactNode } from 'react';
import type {
  AutomationDocument,
  AutomationExecutionHistoryEntry,
  AutomationNodeCatalogEntry,
  AutomationRun,
  AutomationRunControl,
  AutomationRunDetail,
  AutomationRunSummaryView,
  AutomationStopRunSetResponse,
} from '../domains/automation/automationPublic';
import type {
  PanelPortBinding,
  PanelInstance,
} from '../domains/experiment/experimentPublic';
import type { AutomationParameterSchema } from '../domains/automation/automationPublic';
import type { WorkflowActionControl,WorkflowActionKind } from '../shared/generatedWorkflowControlContract';
import type { ConfigRef } from '../shared/configResource';
import type { LocalizedProductText } from '../shared/productWebComposition';

export type PanelPluginCapability =
  | 'visualization'
  | 'experiment'
  | 'telemetry'
  | 'execution'
  | 'automation';

export type PanelActionPortDefinition = {
  id: string;
  label: string;
  localizedLabel?: LocalizedProductText;
  description?: string;
  localizedDescription?: LocalizedProductText;
  required?: boolean;
  actionKinds?: readonly WorkflowActionKind[];
};

export type PanelDynamicActionPortsDefinition = {
  source: 'panel-action-bindings';
};

export type PanelDataPortDefinition = { id: string;label: string;localizedLabel?:LocalizedProductText;contract: string;required?: boolean };
export type PanelAuthoringPortDefinition = {
  id: string;label: string;localizedLabel?:LocalizedProductText;target: 'experiment.robots' | 'experiment.localizationOffset' | 'action-preset';required?: boolean;
};
export type PanelInteractionPortDefinition = { id: string;label: string;localizedLabel?:LocalizedProductText;contract: string;required?: boolean };

export type PanelActionInvocation = {
  id: string;
  status: AutomationRunSummaryView['status'];
  revision: number;
};

export type PanelActionPortRuntime = {
  id: string;
  label: string;
  connected: boolean;
  disabledReason: string;
  action?: { id: string;label: string;kind: WorkflowActionKind;controls: readonly WorkflowActionControl[] };
  inputSchema?: AutomationParameterSchema;
  defaults: Record<string,unknown>;
  activeInvocation?: PanelActionInvocation;
  latestInvocation?: PanelActionInvocation;
  serviceStatus?: { state:'starting'|'running'|'degraded';ready:number;total:number };
  invoke: (overrides?: Record<string,unknown>,reason?: string) => Promise<PanelActionInvocation>;
  control: (invocation: PanelActionInvocation,control: WorkflowActionControl,reason?: string) => Promise<void>;
  trace: { workflowInstanceId?: string;presetId?: string;automationResourceId?: string;actionId?: string };
};

export type PanelDataPortRuntime = {
  id: string;
  label: string;
  contract: string;
  connected: boolean;
  value: unknown;
  trace: { projection?: string };
};

export type PanelAuthoringPortRuntime = {
  id: string;
  label: string;
  connected: boolean;
  disabledReason: string;
  value: unknown;
  commit: (value: unknown,expectedCommitId: string,reason?: string) => Promise<unknown>;
  trace: { target?: string;workflowInstanceId?: string;presetId?: string };
};

export type PanelInteractionPortRuntime = {
  id: string;label: string;contract: string;connected: boolean;disabledReason: string;
  signal: (value: unknown,reason?: string) => Promise<void>;
  trace: { channel?: string };
};

export type PanelPortsContext = {
  actions: Readonly<Record<string,PanelActionPortRuntime>>;
  data: Readonly<Record<string,PanelDataPortRuntime>>;
  authoring: Readonly<Record<string,PanelAuthoringPortRuntime>>;
  interactions: Readonly<Record<string,PanelInteractionPortRuntime>>;
};

export type PanelBaseContext = {
  executionTargetId?: string;
  disabledReason?: string;
  /** Dashboard layout Edit session is open and structure mutations are allowed. */
  editing?: boolean;
  /**
   * The plugin's own `sharedStateScope`, resolved from its manifest by the
   * render path. A panel keys its state through this rather than deciding for
   * itself, so the declaration is what actually routes the state.
   */
  sharedStateScope?: 'experiment';
};

export type AutomationPanelContext = {
  automation: {
    targetId: string;
    documents: AutomationDocument[];
    catalog: AutomationNodeCatalogEntry[];
    runSummaries: AutomationRunSummaryView[];
    runDetailsById: Record<string,AutomationRunDetail>;
    loading: boolean;
    error: string;
    runDocument: (
      document: AutomationDocument,
      parameters?: Record<string,unknown>,
      reason?: string,
      throughNodeId?: string,
      actionId?: string,
    ) => Promise<AutomationRun>;
    runBoundAutomation: (
      automationRef: ConfigRef,
      parameters?: Record<string,unknown>,reason?: string,throughNodeId?: string,actionId?: string,
      options?: { experimentRef?: ConfigRef },
    ) => Promise<AutomationRun>;
    stop: (run: AutomationRunControl, reason?: string) => Promise<AutomationRun>;
    stopRunSet: (
      anchor: AutomationRunControl,
      options: { includeAnchor: boolean;includeDetached: boolean;reason?: string },
    ) => Promise<AutomationStopRunSetResponse>;
    loadRunDetail: (runId: string,expectedRevision?:number) => Promise<AutomationRunDetail>;
    retainRunDetail: (runId:string) => () => void;
    refreshExecutionHistory: (automationResourceId: string) => Promise<AutomationExecutionHistoryEntry[]>;
  };
};

/** Read-only workflow state exposed through the workflowruntime.run Data port. */
export type PanelWorkflowRuntimeProjection = Pick<
  AutomationPanelContext['automation'],
  'targetId' | 'documents' | 'catalog' | 'runSummaries' | 'runDetailsById' | 'loading' | 'error'
> & { experimentResourceId: string };

export type PanelPluginContext<_C extends readonly PanelPluginCapability[] = readonly PanelPluginCapability[]> =
  PanelBaseContext & { ports: PanelPortsContext };

export type PanelPluginProps<C extends readonly PanelPluginCapability[] = readonly PanelPluginCapability[]> = {
  panel: PanelInstance;
  context: PanelPluginContext<C>;
};

export type PanelValueSchema = Record<string, {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
}>;

export type PanelPluginOptionsEditorProps = {
  panel: PanelInstance;
  experimentId?: string;
  executionTargetId: string;
  dashboardPanels: PanelInstance[];
  options: Record<string,unknown>;
  /**
   * Values exposed through declared action-preset authoring ports. The
   * Experiment drawer owns persistence; plugin editors only present fields and
   * report edits through the port callback.
   */
  actionPresetAuthoring?: Readonly<Record<string,{
    values: Readonly<Record<string,unknown>>;
    onChange: (fieldName:string,value:unknown) => void;
  }>>;
  onChange: (options: Record<string,unknown>) => void;
};

export type PanelPluginActionDefaultsEditorProps = {
  panel: PanelInstance;
  port: PanelActionPortDefinition;
  values: Record<string,unknown>;
  options: Record<string,unknown>;
  onChange: (values: Record<string,unknown>) => void;
  onOptionsChange: (options: Record<string,unknown>) => void;
  executionTargetId?: string;
};

export type PanelSharedActionDefaults = {
  title: string;
  fieldNames: readonly string[];
};

export type PanelPluginFrameProviderProps = {
  panel: PanelInstance;
  children: ReactNode;
};

export type PanelPluginHeaderActionsProps = {
  panel: PanelInstance;
  editing: boolean;
};

export type PanelWorkflowRunInputContext = {
  panel: PanelInstance;
  experimentId?: string;
};

/** Whether a panel wants the layout to grow it, or to hold the size it asked for. */
export type PanelSizePolicy = 'expanding' | 'fixed';

/**
 * What a plugin knows about its own footprint that the dashboard cannot guess.
 *
 * Sizes are grid units, matching PanelInstance.gridPos, so the layout engine,
 * the create/snap path, and pre-commit validation all clamp against one set of
 * numbers instead of three hard-coded ones.
 */
export type PanelLayoutPolicy = {
  minSize?: { w: number;h: number };
  maxSize?: { w?: number;h?: number };
  /** Width-to-height ratio in grid units; resize recomputes h from w to hold it. */
  aspectRatio?: number;
  sizePolicy?: {
    horizontal?: PanelSizePolicy;
    vertical?: PanelSizePolicy;
  };
  /** Rendered height in px this panel wants at a given rendered width in px. */
  preferredHeightForWidth?: (widthPx: number, panel: PanelInstance) => number;
};

export type PanelConfigExposure = {
  /** No settings affordance when every user task is already owned by the panel surface. */
  drawer?: 'enabled' | 'hidden';
  /** Specialized panels may summarize their authored wiring without making lifecycle topology operator-editable. */
  connections?: 'editable' | 'summary' | 'workflow';
  /** Raw Action schemas are opt-out when a specialized panel has no safe task-level editor for them. */
  actionDefaults?: 'editable' | 'shared-only' | 'custom' | 'hidden';
};

export type PanelPluginDefinition<C extends readonly PanelPluginCapability[] = readonly PanelPluginCapability[]> = {
  id: string;
  name: string;
  /** Presentation-only built-in name. The canonical English `name` remains protocol/editor data. */
  localizedName?: LocalizedProductText;
  category: 'Telemetry' | 'Fleet' | 'Control' | 'Automation' | 'Operations' | 'Log' | 'Custom';
  description: string;
  /** Presentation-only built-in description; never rewrites persisted panel titles. */
  localizedDescription?: LocalizedProductText;
  capabilities: C;
  backendCapabilities?: string[];
  permissions?: string[];
  actionPorts?: readonly PanelActionPortDefinition[];
  dynamicActionPorts?: PanelDynamicActionPortsDefinition;
  dataPorts?: readonly PanelDataPortDefinition[];
  authoringPorts?: readonly PanelAuthoringPortDefinition[];
  interactionPorts?: readonly PanelInteractionPortDefinition[];
  defaultPortBindings?: PanelPortBinding[];
  defaultOptions?: Record<string, unknown>;
  optionSchema?: PanelValueSchema;
  querySchema?: PanelValueSchema;
  fieldConfigSchema?: PanelValueSchema;
  executionTargetPolicy?: 'configurable' | 'dashboard' | 'local';
  configExposure?: PanelConfigExposure;
  /** Use a page surface when this plugin occupies a dashboard by itself. */
  standalonePresentation?: 'page';
  layout?: PanelLayoutPolicy;
  /**
   * Declares that this plugin's selection-shaped state stays shared across every
   * instance in the experiment instead of being private per panel instance.
   * Absent means per-instance, which is the default for all panel state.
   *
   * The render path copies this onto `PanelBaseContext.sharedStateScope`, and
   * the panel state store keys on that, so this declaration is what routes the
   * state rather than a hard-coded choice inside a store.
   */
  sharedStateScope?: 'experiment';
  maxInstancesPerDashboard?: number;
  /**
   * When true, the shared panel config drawer opens immediately after the panel
   * is added from the library. Configure + delete chrome itself is always owned
   * by PanelFrame in edit mode — plugins never render their own settings gear.
   */
  configureOnCreate?: boolean;
  frameProvider?: ComponentType<PanelPluginFrameProviderProps>;
  /** View/perspective switchers. PanelFrame places this on the far left. */
  headerLeading?: ComponentType<PanelPluginHeaderActionsProps>;
  /** Quiet header status. PanelFrame places this in the center. */
  headerStatus?: ComponentType<PanelPluginHeaderActionsProps>;
  /**
   * Domain runtime tools on the far right. PanelFrame owns the single Panel
   * Workflow Run/Stop set and configure/delete chrome after these.
   */
  headerActions?: ComponentType<PanelPluginHeaderActionsProps>;
  /** Observer panels may bind a Workflow for runtime projection without owning a second Run/Stop control. */
  panelWorkflowControls?: 'visible' | 'hidden';
  /**
   * When true, Dashboard Edit keeps this panel body clickable instead of
   * marking it inert. Authoring surfaces that write the same Edit draft, and
   * operator boards that must stay live while the layout is rearranged, declare
   * this. Canvas reads the flag; do not special-case plugin ids.
   */
  interactiveWhileEditing?: boolean;
  /**
   * Value-only inputs supplied when the shared Panel Workflow Run control is
   * invoked. The plugin owns this mapping; the dashboard and System Runner
   * remain neutral to robot kinds and other panel-specific state.
   */
  workflowRunInputOverrides?: (context:PanelWorkflowRunInputContext) => Record<string,unknown>;
  /** Optional panel-specific form body for the shared PanelConfigDrawer. */
  optionsEditor?: ComponentType<PanelPluginOptionsEditorProps>;
  /** Typed task-level Action inputs; never a raw object/JSON fallback. */
  actionDefaultsEditor?: ComponentType<PanelPluginActionDefaultsEditorProps>;
  /**
   * Action inputs configured once for the panel and written to every preset in
   * its bound Workflow instance whose Action schema declares that field.
   */
  sharedActionDefaults?: PanelSharedActionDefaults;
  /**
   * Action inputs supplied by the Experiment Run through preset parameter
   * bindings. They remain part of the Action contract but are not editable as
   * fixed per-port defaults in the Panel drawer.
   */
  runtimeBoundActionDefaults?: readonly string[];
  validatePanel?: (panel: PanelInstance) => string;
  defaultPanel?: Partial<Pick<PanelInstance, 'title' | 'gridPos' | 'query' | 'options' | 'fieldConfig' | 'portBindings'>>;
  component: ComponentType<PanelPluginProps<C>>;
};

export type AnyPanelPluginDefinition = PanelPluginDefinition<readonly PanelPluginCapability[]>;

export function definePanelPlugin<const C extends readonly PanelPluginCapability[]>(plugin: PanelPluginDefinition<C>) {
  return plugin;
}

export function localizedPanelPluginName(plugin: PanelPluginDefinition, language: keyof LocalizedProductText) {
  return plugin.localizedName?.[language] ?? plugin.name;
}

export function localizedPanelPluginDescription(plugin: PanelPluginDefinition, language: keyof LocalizedProductText) {
  return plugin.localizedDescription?.[language] ?? plugin.description;
}

export function localizedPanelPortLabel(
  port:{ label:string;localizedLabel?:LocalizedProductText },
  language:keyof LocalizedProductText,
) {
  return port.localizedLabel?.[language] ?? port.label;
}

export function localizedPanelPortDescription(
  port:{ description?:string;localizedDescription?:LocalizedProductText },
  language:keyof LocalizedProductText,
) {
  return port.localizedDescription?.[language] ?? port.description;
}
