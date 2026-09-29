import { cloneExperimentDeployment, newExecutionHostRef, validateExperimentDeploymentBindings, type ExperimentDeployment, type ExecutionHostRef } from './experimentDeployment';
import { cloneExperimentWorldBoundary,validateExperimentWorldBoundary,type ExperimentWorldBoundary } from './experimentWorldBoundary';
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

export type { DeploymentPlacement, ExperimentDeployment, ExecutionHostRef } from './experimentDeployment';

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

/** Built-in radio-link profiles (Core's GET /link-profiles catalog). */
export const EXPERIMENT_LINK_PROFILES = ['ideal','lab-wifi','weak','severe','intermittent'] as const;

export type ExperimentRobotBinding = {
  /** This Experiment owns software placement; the Robot asset never does. */
  executionHost?: ExecutionHostRef;
  /** Stable logical role used by workflows and runtime UI. */
  id: string;
  /** Physical Robot asset; replacing it does not change the logical role. */
  ref: ConfigRef;
  namespace: string;
  /** Used only by an explicit Hybrid Experiment Run; pure modes override every slot. */
  hybridSource: ExperimentHybridSource;
  runtimeParameters: Record<string,string>;
  initialPose: RobotPose;
  /** Experiment-owned simulated sensors common to supported Robot kinds. */
  simulationSensors?: { simpleLidar: boolean };
  /**
   * Radio-link condition the network station imposes on this slot (D-116 M2).
   * Absent is Ideal. Only the radio network is degraded, never physics.
   */
  linkProfile?: string;
  /**
   * Experiment-owned PX4 camera switch. Transport identity lives on the Robot asset.
   */
  px4?: { imageSimulationEnabled?: boolean };
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

export const PANEL_ACTION_EXECUTION_MODES = ['session','standalone'] as const;
export type PanelActionExecutionMode = typeof PANEL_ACTION_EXECUTION_MODES[number];

export type PanelActionPortBinding = {
  portId: string;
  kind: 'action';
  presetId: string;
  /** Omission preserves the existing Experiment Session route. */
  executionMode?: PanelActionExecutionMode;
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
  'experiment.worldBoundary',
  'experiment.scene',
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

export type ExperimentScene = {
  asset: string;
  simulator: string;
  parameters?: Record<string,unknown>;
};

/** Product defaults apply only when an author supplies no labels. */
export const DEFAULT_EXPERIMENT_RUN_MODES = ['simulation','physical'] as const satisfies readonly ExperimentRunMode[];

export type ExperimentSpec = {
  /** Missing legacy provenance stays missing until explicit migration. */
  deployment?: ExperimentDeployment;
  scene?: ExperimentScene;
  worldBoundary:ExperimentWorldBoundary | null;
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
  deployment,
  scene,
  name,
  description = '',
  tags = [],
  runModes = [...DEFAULT_EXPERIMENT_RUN_MODES],
  worldBoundary = null,
  localizationOffset = DEFAULT_EXPERIMENT_LOCALIZATION_OFFSET,
  robots = [],
  workflowInstances,
}: {
  deployment?: ExperimentDeployment;
  scene?: ExperimentScene;
  name: string;
  description?: string;
  tags?: string[];
  runModes?: ExperimentRunMode[];
  worldBoundary?:ExperimentWorldBoundary | null;
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
    ...(deployment === undefined ? {} : { deployment: cloneExperimentDeployment(deployment) }),
    ...(scene === undefined ? {} : { scene: cloneExperimentScene(scene) }),
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    name: name.trim(),
    description: description.trim(),
    tags: normalizedStrings(tags),
    runModes: normalizeExperimentRunModes(runModes),
    worldBoundary: cloneExperimentWorldBoundary(worldBoundary),
    localizationOffset: normalizeExperimentLocalizationOffset(localizationOffset),
    robots: normalizeExperimentRobotBindings(robots, robotKindComposition).map((binding) => (
      deployment === undefined || binding.executionHost !== undefined ? binding : {
        ...binding, executionHost: newExecutionHostRef(deployment.placement, binding.id),
      }
    )),
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
    ...(spec.deployment === undefined ? {} : { deployment: cloneExperimentDeployment(spec.deployment) }),
    ...(spec.scene === undefined ? {} : { scene: cloneExperimentScene(spec.scene) }),
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    name: spec.name.trim(),
    description: spec.description.trim(),
    tags: normalizedStrings(spec.tags),
    runModes: normalizeExperimentRunModes(spec.runModes),
    worldBoundary: cloneExperimentWorldBoundary(spec.worldBoundary),
    localizationOffset: normalizeExperimentLocalizationOffset(spec.localizationOffset),
    robots: normalizeExperimentRobotBindings(spec.robots, robotKindComposition),
    workflowInstances: normalizeWorkflowInstances(spec.workflowInstances),
    dashboards,
  };
}

function cloneExperimentScene(scene: ExperimentScene): ExperimentScene {
  return {
    ...scene,
    ...(scene.parameters === undefined ? {} : { parameters: structuredClone(scene.parameters) }),
  };
}

/** One authored preset cannot acquire two execution owners through different ports. */
export function panelActionExecutionIssue(bindings: readonly PanelPortBinding[]): string {
  const primary = bindings.find((binding) => binding.kind === 'workflow')?.presetId;
  const modes = new Map<string,PanelActionExecutionMode>();
  for (const binding of bindings) {
    if (binding.kind !== 'action') continue;
    const mode = binding.executionMode === undefined ? 'session' : binding.executionMode;
    if (!(PANEL_ACTION_EXECUTION_MODES as readonly string[]).includes(mode)) return 'Select a valid Action execution mode.';
    if (mode === 'standalone' && binding.presetId === primary) return 'The primary workflow Action must run with the Experiment.';
    const previous = modes.get(binding.presetId);
    if (previous && previous !== mode) return 'Actions sharing a preset must use the same execution mode.';
    modes.set(binding.presetId,mode);
  }
  return '';
}

export function validateExperimentSpec(
  spec: ExperimentSpec,
  robotKindComposition?: RobotAssetKindComposition,
): string {
  if (spec.schemaVersion !== EXPERIMENT_SCHEMA_VERSION) return `Unsupported experiment schema version ${spec.schemaVersion}.`;
  if (!spec.name.trim()) return 'Experiment name is required.';
  const deploymentIssue = validateExperimentDeploymentBindings(spec.deployment, spec.robots);
  if (deploymentIssue) return deploymentIssue;
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
  const boundaryIssue = validateExperimentWorldBoundary(spec.worldBoundary);
  if (boundaryIssue) return boundaryIssue;
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
      const executionIssue = panelActionExecutionIssue(panel.portBindings);
      if (executionIssue) return executionIssue;
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

const RETIRED_VIDEO_DASHBOARD_ID = 'video';
const ANALYSIS_DASHBOARD_ID = 'algorithm';
const ANALYSIS_DASHBOARD_NAME = 'Analysis';
const LEGACY_ANALYSIS_DASHBOARD_NAMES = new Set(['Algorithm', 'Figures']);
const RETIRED_STANDALONE_VIDEO_PLUGIN_ID = 'experiment-video-production';
const RETIRED_STANDALONE_VIDEO_PANEL_ID = 'offline-video-production';

function operatorDashboardName(id: string, name: string): string {
  if (id === ANALYSIS_DASHBOARD_ID && LEGACY_ANALYSIS_DASHBOARD_NAMES.has(name)) return ANALYSIS_DASHBOARD_NAME;
  return name;
}

export function normalizeExperimentDashboards(dashboards?: ExperimentDashboard[]): ExperimentDashboard[] {
  const source = dashboards && dashboards.length > 0 ? dashboards : defaultDashboards;
  const seen = new Set<string>();
  const normalized = source.map((dashboard) => {
    const id = dashboard.id.trim();
    return {
      id,
      name: operatorDashboardName(id, dashboard.name.trim() || 'Dashboard'),
      description: dashboard.description?.trim() ?? '',
      panels: (dashboard.panels ?? [])
        .filter((panel) => panel.pluginId !== RETIRED_STANDALONE_VIDEO_PLUGIN_ID && panel.id !== RETIRED_STANDALONE_VIDEO_PANEL_ID)
        .map(normalizeExperimentPanel),
    };
  }).filter((dashboard) => {
    if (!dashboard.id || dashboard.id === RETIRED_VIDEO_DASHBOARD_ID || seen.has(dashboard.id)) return false;
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
        { portId: 'world-boundary-editor',kind: 'authoring',target: 'experiment.worldBoundary' },
        { portId: 'scene-editor',kind: 'authoring',target: 'experiment.scene' },
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
