import { normalizeExperimentPanel } from './experimentPanelModel';
import type { ConfigRef as ConfigurationRef,ConfigResourceBranch,ConfigResourceHead } from '../../shared/configResource';
import type { GridPos } from '../../types/common';
import {
  EXPERIMENT_SCHEMA_VERSION as GENERATED_EXPERIMENT_SCHEMA_VERSION,
  PANEL_SCHEMA_VERSION as GENERATED_PANEL_SCHEMA_VERSION,
} from '../../shared/generatedWorkflowControlContract';
import {
  normalizeExperimentRobotBindings,
  validateExperimentRobotBindings,
} from './experimentRobotBindings';
import type { RobotAssetKindComposition } from '../robot/robotAssetPublic';

export const EXPERIMENT_DOMAIN = 'experiment';
export const EXPERIMENT_SCHEMA_VERSION = GENERATED_EXPERIMENT_SCHEMA_VERSION;
export const PANEL_SCHEMA_VERSION = GENERATED_PANEL_SCHEMA_VERSION;
export const EXPERIMENT_MAIN_BRANCH = 'main';

/**
 * Run modes are ordinary, author-owned labels. The Experiment domain only
 * enforces their canonical spelling; workflow Conditions decide what a label
 * means at runtime.
 */
export type ExperimentRunMode = string;
export const EXPERIMENT_RUN_MODE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
export const EXPERIMENT_HYBRID_SOURCES = ['simulation','physical'] as const;
export type ExperimentHybridSource = typeof EXPERIMENT_HYBRID_SOURCES[number];
export type ConfigRef = ConfigurationRef<'robot' | 'automation'>;

export type WorkflowActionParameterBinding = {
  target: string;
  expression: string;
  language: 'xgc-expression-v2';
};

export type WorkflowActionPreset = {
  id: string;
  actionId: string;
  inputs: Record<string,unknown>;
  parameterBindings: WorkflowActionParameterBinding[];
};

export type ExperimentWorkflowInstance = {
  id: string;
  ref: ConfigRef;
  executionTargetId?:string;
  actionPresets: WorkflowActionPreset[];
};

export type RobotPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export type ExperimentLocalizationOffset = {
  x: number;
  y: number;
  z: number;
};

export const DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET: ExperimentLocalizationOffset = Object.freeze({
  x:0,y:0,z:0,
});

export type ExperimentRobotBinding = {
  /** Stable logical role used by workflows and runtime UI. */
  id: string;
  /** Physical Robot asset; replacing it does not change the logical role. */
  ref: ConfigRef;
  namespace: string;
  /** Used only by an explicit Hybrid Experiment Run; pure modes override every slot. */
  hybridSource: ExperimentHybridSource;
  runtimeParameters: Record<string,string>;
  initialPose: RobotPose;
  /**
   * Empty kind marker for PX4 slots. Transport identity (ports / MAV system ID)
   * lives exclusively on the Robot asset; this object must remain empty.
   */
  px4?: Record<string, never>;
  scout?: {
    lidarSimulationEnabled: boolean;
    imageSimulationEnabled: boolean;
  };
  /**
   * Empty kind marker for Mecanum slots. Physical UGV transport lives on the
   * Robot asset; this object must remain empty (parity with backend).
   */
  mecanum?: Record<string, never>;
  /** Opaque kind markers owned by composed Robot asset contributions. */
  [contributedKindSettings: string]: unknown;
};

export type PanelActionPortBinding = {
  portId: string;
  kind: 'action';
  presetId: string;
};

export const PANEL_WORKFLOW_RELATIONS = [
  'attached',
  'supervised',
  'detached-observed',
] as const;
export type PanelWorkflowRelation = typeof PANEL_WORKFLOW_RELATIONS[number];

export const PANEL_WORKFLOW_FAILURE_POLICIES = [
  'stop-experiment',
  'keep-experiment',
] as const;
export type PanelWorkflowFailurePolicy = typeof PANEL_WORKFLOW_FAILURE_POLICIES[number];

/** The one workflow whose Actions and lifecycle belong to this Panel. */
export type PanelWorkflowPortBinding = {
  portId: string;
  kind: 'workflow';
  workflowInstanceId: string;
  presetId: string;
  managed: boolean;
  relation: PanelWorkflowRelation;
  failurePolicy: PanelWorkflowFailurePolicy;
};

export type PanelDataPortBinding = {
  portId: string;
  kind: 'data';
  projection: string;
};

export const PANEL_AUTHORING_TARGETS = [
  'experiment.robots',
  'experiment.localizationOffset',
  'action-preset',
] as const;
export type PanelAuthoringTarget = (typeof PANEL_AUTHORING_TARGETS)[number];

export type PanelAuthoringPortBinding = {
  portId: string;
  kind: 'authoring';
  target: PanelAuthoringTarget;
  presetId?: string;
};

export type PanelInteractionPortBinding = {
  portId: string;
  kind: 'interaction';
  channel: string;
  contract: string;
};

export type PanelPortBinding =
  | PanelWorkflowPortBinding
  | PanelActionPortBinding
  | PanelDataPortBinding
  | PanelAuthoringPortBinding
  | PanelInteractionPortBinding;

export type PanelView = {
  query: Record<string, unknown>;
  options: Record<string, unknown>;
  fieldConfig: Record<string, unknown>;
};

/** The trusted, persisted panel envelope accepted by experimentconfig. */
export type ExperimentPanel = {
  schemaVersion: number;
  id: string;
  pluginId: string;
  title: string;
  executionTargetId?: string;
  grid: GridPos;
  view: PanelView;
  portBindings: PanelPortBinding[];
};

/**
 * Local dashboard-editor projection. It never crosses the API boundary; the
 * explicit conversion helpers below are the only way panels enter a commit.
 */
export type PanelInstance = {
  id: string;
  pluginId: string;
  title: string;
  targetCoreId?: string;
  gridPos: GridPos;
  query: Record<string, unknown>;
  options: Record<string, unknown>;
  fieldConfig: Record<string, unknown>;
  portBindings: PanelPortBinding[];
};

export type ExperimentDashboard = {
  id: string;
  name: string;
  description: string;
  panels: ExperimentPanel[];
};

/** Product defaults apply only when an author supplies no labels. */
export const DEFAULT_EXPERIMENT_RUN_MODES = ['simulation','physical'] as const satisfies readonly ExperimentRunMode[];

export type ExperimentSpec = {
  schemaVersion: number;
  name: string;
  description: string;
  tags: string[];
  /** Exact authored Experiment run modes (at least one after normalize). */
  runModes: ExperimentRunMode[];
  /** One Experiment-world translation applied after explicit source selection. */
  localizationOffset: ExperimentLocalizationOffset;
  robots: ExperimentRobotBinding[];
  workflowInstances: ExperimentWorkflowInstance[];
  dashboards: ExperimentDashboard[];
};

export type ExperimentDocument = {
  head: ConfigResourceHead;
  branch: ConfigResourceBranch;
  spec: ExperimentSpec;
};

export type ExperimentNamespace = {
  domain: typeof EXPERIMENT_DOMAIN;
  namespaceId: string;
  parentNamespaceId?: string;
  name: string;
  revision: number;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BindingResourceDocument = {
  head: ConfigResourceHead;
  branch: ConfigResourceBranch;
};

export const SYSTEM_PANEL_WORKFLOW_RESOURCE_ID = '9fe44326-8277-5e8e-97aa-bd9005fc287a';
export const PANEL_WORKFLOW_PORT_ID = 'panel-workflow';

export function newExperimentSpec({
  name,
  description = '',
  tags = [],
  runModes = [...DEFAULT_EXPERIMENT_RUN_MODES],
  localizationOffset = DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET,
  robots = [],
  workflowInstances,
}: {
  name: string;
  description?: string;
  tags?: string[];
  runModes?: ExperimentRunMode[];
  localizationOffset?: ExperimentLocalizationOffset;
  robots?: ExperimentRobotBinding[];
  workflowInstances?: ExperimentWorkflowInstance[];
}, robotKindComposition?: RobotAssetKindComposition): ExperimentSpec {
  const dashboards = defaultDashboards.map(cloneDashboard);
  const defaultWorkflowInstances = dashboards.flatMap((dashboard) => (
    dashboard.panels.map((panel) => newSystemPanelWorkflowInstance(panel.id))
  ));
  const authoredWorkflowIds = new Set((workflowInstances ?? []).map((instance) => instance.id));
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    name: name.trim(),
    description: description.trim(),
    tags: normalizedStrings(tags),
    runModes: normalizeExperimentRunModes(runModes),
    localizationOffset: normalizeExperimentLocalizationOffset(localizationOffset),
    robots: normalizeExperimentRobotBindings(robots, robotKindComposition),
    workflowInstances: normalizeWorkflowInstances(
      [
        ...(workflowInstances ?? []),
        ...defaultWorkflowInstances.filter((instance) => !authoredWorkflowIds.has(instance.id)),
      ],
    ),
    dashboards,
  };
}

/**
 * Keep exact authored bytes and order. Validation, not normalization, rejects
 * padding, aliases, unknown values and duplicates so durable identity cannot
 * be silently rewritten in the browser.
 */
export function normalizeExperimentRunModes(modes?: readonly string[]): ExperimentRunMode[] {
  const source = modes && modes.length > 0 ? modes : DEFAULT_EXPERIMENT_RUN_MODES;
  return [...source];
}

export function normalizeExperimentLocalizationOffset(
  offset: ExperimentLocalizationOffset,
): ExperimentLocalizationOffset {
  return { x:offset.x,y:offset.y,z:offset.z };
}

export function normalizeExperimentSpec(
  spec: ExperimentSpec,
  robotKindComposition?: RobotAssetKindComposition,
): ExperimentSpec {
  const dashboards = normalizeExperimentDashboards(spec.dashboards);
  return {
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    name: spec.name.trim(),
    description: spec.description.trim(),
    tags: normalizedStrings(spec.tags),
    runModes: normalizeExperimentRunModes(spec.runModes),
    localizationOffset: normalizeExperimentLocalizationOffset(spec.localizationOffset),
    robots: normalizeExperimentRobotBindings(spec.robots, robotKindComposition),
    workflowInstances: normalizeWorkflowInstances(spec.workflowInstances),
    dashboards,
  };
}

export function validateExperimentSpec(
  spec: ExperimentSpec,
  robotKindComposition?: RobotAssetKindComposition,
): string {
  if (spec.schemaVersion !== EXPERIMENT_SCHEMA_VERSION) return `Unsupported experiment schema version ${spec.schemaVersion}.`;
  if (!spec.name.trim()) return 'Experiment name is required.';
  const runModes = normalizeExperimentRunModes(spec.runModes);
  if (runModes.length === 0) return 'At least one run mode is required.';
  const seenRunModes = new Set<string>();
  for (const mode of runModes) {
    if (!EXPERIMENT_RUN_MODE_PATTERN.test(mode)) {
      return `Run mode "${mode}" must start with a letter and contain only letters, digits, dot, underscore, or hyphen (64 characters maximum).`;
    }
    if (seenRunModes.has(mode)) return `Run mode "${mode}" must be unique.`;
    seenRunModes.add(mode);
  }
  if (![spec.localizationOffset.x,spec.localizationOffset.y,spec.localizationOffset.z].every(Number.isFinite)) {
    return 'Localization offset X, Y, and Z must be finite numbers.';
  }
  const robotIssue = validateExperimentRobotBindings(spec.robots, robotKindComposition);
  if (robotIssue) return robotIssue;
  const workflowIds = new Set<string>();
  const workflowPresets = new Map<string,Map<string,WorkflowActionPreset>>();
  for (const instance of spec.workflowInstances) {
    const id = instance.id.trim();
    if (!id) return 'Every workflow instance requires an ID.';
    if (workflowIds.has(id)) return `Workflow instance ID "${id}" must be unique.`;
    workflowIds.add(id);
    if (instance.ref.domain !== 'automation' || !instance.ref.resourceId.trim() || !instance.ref.branch.trim()) {
      return `Workflow instance "${id}" must reference a valid Automation resource.`;
    }
    if (instance.ref.componentId?.trim()) return `Workflow instance "${id}" cannot select a component.`;
    if (instance.executionTargetId !== undefined
      && (!instance.executionTargetId.trim()
        || instance.executionTargetId !== instance.executionTargetId.trim()
        || instance.executionTargetId.length > 128
        || instance.executionTargetId.includes('\0'))) {
      return `Workflow instance "${id}" has an invalid execution target.`;
    }
    const presetIds = new Set<string>();
    const presets = new Map<string,WorkflowActionPreset>();
    for (const preset of instance.actionPresets) {
      if (!preset.id.trim() || !preset.actionId.trim()) return `Workflow instance "${id}" has an invalid Action preset.`;
      if (presetIds.has(preset.id)) return `Workflow instance "${id}" Action preset "${preset.id}" must be unique.`;
      presetIds.add(preset.id);
      presets.set(preset.id,preset);
      if (!isPlainObject(preset.inputs)) return `Workflow instance "${id}" Action preset "${preset.id}" inputs must be an object.`;
      if (preset.parameterBindings.length > 256) {
        return `Workflow instance "${id}" Action preset "${preset.id}" has too many parameter bindings.`;
      }
      const bindingTargets = new Set<string>();
      for (const binding of preset.parameterBindings) {
        if (!binding.target.startsWith('/') || binding.target.length > 1024
          || !binding.expression.trim() || binding.expression.length > 64 * 1024
          || binding.language !== 'xgc-expression-v2') {
          return `Workflow instance "${id}" Action preset "${preset.id}" has an invalid parameter binding.`;
        }
        if (bindingTargets.has(binding.target)) {
          return `Workflow instance "${id}" Action preset "${preset.id}" parameter binding target "${binding.target}" must be unique.`;
        }
        bindingTargets.add(binding.target);
      }
    }
    workflowPresets.set(id,presets);
  }
  if (spec.dashboards.length === 0) return 'At least one dashboard is required.';
  const dashboardIds = new Set<string>();
  const panelIds = new Set<string>();
  for (const dashboard of spec.dashboards) {
    if (!dashboard.id.trim() || !dashboard.name.trim()) return 'Every dashboard requires an ID and name.';
    if (dashboardIds.has(dashboard.id)) return `Dashboard ID "${dashboard.id}" must be unique.`;
    dashboardIds.add(dashboard.id);
    for (const panel of dashboard.panels) {
      if (panel.schemaVersion !== PANEL_SCHEMA_VERSION) {
        return `Panel "${panel.id}" must use schema version ${PANEL_SCHEMA_VERSION}.`;
      }
      if (!panel.id.trim() || !panel.pluginId.trim() || !panel.title.trim()) return 'Every panel requires an ID, plugin and title.';
      if (panelIds.has(panel.id)) return `Panel ID "${panel.id}" must be unique.`;
      panelIds.add(panel.id);
      const panelWorkflows = panel.portBindings.filter(
        (binding): binding is PanelWorkflowPortBinding => binding.kind === 'workflow',
      );
      if (panelWorkflows.length !== 1) {
        return `Panel "${panel.id}" must bind exactly one Panel Workflow.`;
      }
      const panelWorkflow = panelWorkflows[0]!;
      const owningPresets = workflowPresets.get(panelWorkflow.workflowInstanceId);
      if (!owningPresets?.has(panelWorkflow.presetId)) {
        return `Panel "${panel.id}" Panel Workflow must bind an existing Run preset.`;
      }
      if (!(PANEL_WORKFLOW_RELATIONS as readonly string[]).includes(panelWorkflow.relation)) {
        return `Panel "${panel.id}" has an invalid Panel Workflow relation.`;
      }
      if (!(PANEL_WORKFLOW_FAILURE_POLICIES as readonly string[]).includes(panelWorkflow.failurePolicy)) {
        return `Panel "${panel.id}" has an invalid Panel Workflow failure policy.`;
      }
      if (panelWorkflow.relation === 'detached-observed'
        && panelWorkflow.failurePolicy !== 'keep-experiment') {
        return `Panel "${panel.id}" detached Panel Workflow cannot stop the Experiment.`;
      }
      const portIds = new Set<string>();
      for (const binding of panel.portBindings) {
        if (!binding.portId.trim()) return `Panel "${panel.id}" has a port binding without a port ID.`;
        if (portIds.has(binding.portId)) return `Panel "${panel.id}" port "${binding.portId}" is bound more than once.`;
        portIds.add(binding.portId);
        if (binding.kind === 'action' && !owningPresets.has(binding.presetId)) {
          return `Panel "${panel.id}" Action port "${binding.portId}" must bind a preset exported by its Panel Workflow.`;
        }
        if (binding.kind === 'authoring' && binding.target === 'action-preset'
            && (!binding.presetId || !owningPresets.has(binding.presetId))) {
          return `Panel "${panel.id}" authoring port "${binding.portId}" must bind a preset exported by its Panel Workflow.`;
        }
      }
    }
  }
  return '';
}

export function normalizeExperimentDashboards(dashboards?: ExperimentDashboard[]): ExperimentDashboard[] {
  const source = dashboards && dashboards.length > 0 ? dashboards : defaultDashboards;
  const seen = new Set<string>();
  const normalized = source.map((dashboard) => ({
    id: dashboard.id.trim(),
    name: dashboard.name.trim() || 'Dashboard',
    description: dashboard.description?.trim() ?? '',
    panels: (dashboard.panels ?? []).map(normalizeExperimentPanel),
  })).filter((dashboard) => {
    if (!dashboard.id || seen.has(dashboard.id)) return false;
    seen.add(dashboard.id);
    return true;
  });
  return normalized.length > 0 ? normalized : defaultDashboards.map(cloneDashboard);
}

export const defaultDashboards: ExperimentDashboard[] = [
  {
    id: 'config',
    name: 'Config',
    description: 'Experiment assets and authored configuration.',
    panels: [{
      id: 'robot-assets',
      schemaVersion: PANEL_SCHEMA_VERSION,
      pluginId: 'experiment-robot-assets',
      title: 'Robot assets',
      grid: { x: 0,y: 0,w: 30,h: 16 },
      view: {
        query: {},
        options: { dashboard: 'config',gridColumns: 30 },
        fieldConfig: {},
      },
      portBindings: [
        newPanelWorkflowBinding('panel-robot-assets',false,'supervised','keep-experiment'),
        { portId: 'robots',kind: 'data',projection: 'experiment.robots.v1' },
        { portId: 'robot-assets',kind: 'data',projection: 'robot.assets.v1' },
        { portId: 'robot-runtime',kind: 'data',projection: 'experiment.runtime.v1' },
        { portId: 'robots-editor',kind: 'authoring',target: 'experiment.robots' },
        { portId: 'world-origin-offset-editor',kind: 'authoring',target: 'experiment.localizationOffset' },
      ],
    }],
  },
];

export const defaultDashboard = defaultDashboards[0]!;
export const CONFIG_DASHBOARD_ID = 'config';
export const GCS_DASHBOARD_ID = 'gcs';

/** Visible Experiment dashboard tab names. Equal tab width follows the longest name. */
export const EXPERIMENT_DASHBOARD_TAB_NAME_MAX_LENGTH = 12;

export function clipExperimentDashboardTabName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return Array.from(trimmed).slice(0, EXPERIMENT_DASHBOARD_TAB_NAME_MAX_LENGTH).join('');
}

export function uniqueDashboardId(dashboards: ExperimentDashboard[], preferred: string) {
  const ids = new Set(dashboards.map((dashboard) => dashboard.id));
  if (!ids.has(preferred)) return preferred;
  let index = dashboards.length + 1;
  while (ids.has(`dashboard-${index}`)) index += 1;
  return `dashboard-${index}`;
}

export {
  panelFromEditor,
  panelToEditor,
} from './experimentPanelModel';

export function panelWorkflowInstanceId(panelId: string) {
  return `panel-${panelId}`;
}

export function newPanelWorkflowBinding(
  workflowInstanceId: string,
  managed = true,
  relation: PanelWorkflowRelation = 'supervised',
  failurePolicy: PanelWorkflowFailurePolicy = 'keep-experiment',
): PanelWorkflowPortBinding {
  return {
    portId:PANEL_WORKFLOW_PORT_ID,
    kind:'workflow',
    workflowInstanceId,
    presetId:'run',
    managed,
    relation,
    failurePolicy: relation === 'detached-observed' ? 'keep-experiment' : failurePolicy,
  };
}

export function newSystemPanelWorkflowInstance(panelId: string): ExperimentWorkflowInstance {
  return {
    id:panelWorkflowInstanceId(panelId),
    ref:{ domain:'automation',resourceId:SYSTEM_PANEL_WORKFLOW_RESOURCE_ID,branch:EXPERIMENT_MAIN_BRANCH },
    actionPresets:[{
      id:'run',
      actionId:'run',
      inputs:{},
      parameterBindings:[{
        target:'/runMode',
        expression:'{{ $run.parameters.runMode }}',
        language:'xgc-expression-v2',
      }],
    }],
  };
}

export function managedExperimentWorkflowInstanceIds(spec: Pick<ExperimentSpec,'workflowInstances'|'dashboards'>) {
  const managedIds = new Set(spec.workflowInstances
    .filter((instance) => instance.ref.domain === 'automation'
      && instance.ref.resourceId === SYSTEM_PANEL_WORKFLOW_RESOURCE_ID)
    .map((instance) => instance.id));
  for (const dashboard of spec.dashboards) {
    for (const panel of dashboard.panels) {
      for (const binding of panel.portBindings) {
        if (binding.kind === 'workflow' && binding.managed) managedIds.add(binding.workflowInstanceId);
      }
    }
  }
  return managedIds;
}

function normalizeWorkflowInstances(instances: ExperimentWorkflowInstance[]) {
  if (!Array.isArray(instances)) return [];
  return instances.map((instance) => ({
    id: instance.id.trim(),
    ref: normalizeRef(instance.ref),
    executionTargetId:instance.executionTargetId?.trim() || undefined,
    actionPresets: (Array.isArray(instance.actionPresets) ? instance.actionPresets : []).map((preset) => ({
      id: preset.id.trim(),actionId: preset.actionId.trim(),inputs: structuredClone(preset.inputs),
      parameterBindings:(Array.isArray(preset.parameterBindings) ? preset.parameterBindings : []).map((binding) => ({
        target:binding.target.trim(),
        expression:binding.expression.trim(),
        language:binding.language,
      })).sort((left,right) => left.target.localeCompare(right.target)),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeRef(ref: ConfigRef): ConfigRef {
  return {
    domain: ref.domain.trim().toLowerCase() as ConfigRef['domain'],
    resourceId: ref.resourceId.trim(),
    branch: ref.branch.trim() || EXPERIMENT_MAIN_BRANCH,
    ...(ref.componentId?.trim() ? { componentId: ref.componentId.trim() } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string,unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneDashboard(dashboard: ExperimentDashboard): ExperimentDashboard {
  return structuredClone(dashboard);
}

function normalizedStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
